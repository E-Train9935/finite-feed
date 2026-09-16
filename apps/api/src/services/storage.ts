import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';
import type { Briefing, BriefingSummary } from '../types.js';
import { getAdminFirestore } from './firebase.js';

export interface StorageAdapter {
  kind: 'file' | 'firestore';
  list(userId: string, limit?: number): Promise<Briefing[]>;
  listSummaries(userId: string, limit?: number): Promise<BriefingSummary[]>;
  get(userId: string, id: string): Promise<Briefing | null>;
  save(briefing: Briefing): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  clear(userId: string): Promise<number>;
  health(): Promise<boolean>;
}

function userKey(userId: string) {
  return createHash('sha256').update(userId).digest('hex').slice(0, 40);
}

type FileShape = Record<string, Briefing[]>;

function toSummary(briefing: Briefing): BriefingSummary {
  return {
    id: briefing.id, createdAt: briefing.createdAt, timestamp: briefing.timestamp, subreddits: briefing.subreddits,
    targets: briefing.targets, focusQuery: briefing.focusQuery, mode: briefing.mode, models: briefing.models, sourceMode: briefing.sourceMode,
    timings: briefing.timings, retrieval: { chunkCount: briefing.retrieval.chunkCount, selectedCount: briefing.retrieval.selectedCount },
  };
}

class FileStorage implements StorageAdapter {
  kind = 'file' as const;
  private path = resolve(config.DATA_FILE);
  private queue: Promise<unknown> = Promise.resolve();

  private async read(): Promise<FileShape> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error: any) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  }

  private async write(data: FileShape) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await rename(temp, this.path);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(userId: string, limit = 50) {
    const data = await this.read();
    return [...(data[userKey(userId)] || [])]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async listSummaries(userId: string, limit = 50) {
    return (await this.list(userId, limit)).map(toSummary);
  }

  async get(userId: string, id: string) {
    const rows = await this.list(userId, 500);
    return rows.find((briefing) => briefing.id === id) || null;
  }

  async save(briefing: Briefing) {
    await this.serialize(async () => {
      const data = await this.read();
      const key = userKey(briefing.userId);
      const existing = (data[key] || []).filter((item) => item.id !== briefing.id);
      data[key] = [briefing, ...existing].slice(0, 200);
      await this.write(data);
    });
  }

  async delete(userId: string, id: string) {
    await this.serialize(async () => {
      const data = await this.read();
      const key = userKey(userId);
      data[key] = (data[key] || []).filter((item) => item.id !== id);
      await this.write(data);
    });
  }

  async clear(userId: string) {
    return this.serialize(async () => {
      const data = await this.read();
      const key = userKey(userId);
      const count = data[key]?.length || 0;
      data[key] = [];
      await this.write(data);
      return count;
    });
  }

  async health() {
    try {
      await mkdir(dirname(this.path), { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}

class FirestoreStorage implements StorageAdapter {
  kind = 'firestore' as const;

  private db() {
    const db = getAdminFirestore();
    if (!db) throw new Error('Firestore is not configured.');
    return db;
  }

  private collection(userId: string) {
    return this.db().collection('artifacts').doc(config.APP_ID).collection('users').doc(userKey(userId)).collection('briefings');
  }

  async list(userId: string, limit = 50) {
    const snapshot = await this.collection(userId).orderBy('timestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as Briefing);
  }

  async listSummaries(userId: string, limit = 50) {
    const snapshot = await this.collection(userId)
      .orderBy('timestamp', 'desc')
      .select('id', 'createdAt', 'timestamp', 'subreddits', 'targets', 'focusQuery', 'mode', 'models', 'sourceMode', 'timings', 'retrieval')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => toSummary(doc.data() as Briefing));
  }

  async get(userId: string, id: string) {
    const snapshot = await this.collection(userId).doc(id).get();
    return snapshot.exists ? snapshot.data() as Briefing : null;
  }

  async save(briefing: Briefing) {
    await this.collection(briefing.userId).doc(briefing.id).set(briefing);
  }

  async delete(userId: string, id: string) {
    await this.collection(userId).doc(id).delete();
  }

  async clear(userId: string) {
    let deleted = 0;
    while (true) {
      const snapshot = await this.collection(userId).limit(400).get();
      if (snapshot.empty) break;
      const batch = this.db().batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += snapshot.size;
      if (snapshot.size < 400) break;
    }
    return deleted;
  }

  async health() {
    try {
      await this.db().collection('_health').doc('finite-feed').set({ checkedAt: Date.now() }, { merge: true });
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageAdapter = config.STORAGE_DRIVER === 'firestore'
  ? new FirestoreStorage()
  : new FileStorage();
