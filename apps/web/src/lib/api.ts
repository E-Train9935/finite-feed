import type { Briefing, BriefingSummary, SessionInfo } from '../types';
import { getBearerToken } from './firebase';

const BASE = '/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getBearerToken();
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed with HTTP ${response.status}`);
  return payload as T;
}

export const api = {
  session: () => request<SessionInfo>('/session'),
  listBriefings: () => request<{ briefings: BriefingSummary[] }>('/briefings'),
  getBriefing: (id: string) => request<{ briefing: Briefing }>(`/briefings/${encodeURIComponent(id)}`),
  synthesize: (body: { subreddits: string[]; focusQuery: string; mode: 'single' | 'compare'; models: string[] }) =>
    request<{ briefing: Briefing; warnings: string[] }>('/briefings/synthesize', { method: 'POST', body: JSON.stringify(body) }),
  deleteBriefing: (id: string) => request<void>(`/briefings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearBriefings: () => request<{ deleted: number }>('/briefings', { method: 'DELETE' }),
  chat: (body: { briefingId: string; model: string; message: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }) =>
    request<{ reply: string }>('/chat', { method: 'POST', body: JSON.stringify(body) }),
};
