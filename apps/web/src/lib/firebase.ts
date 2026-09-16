import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from 'firebase/auth';

const buildConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let auth: Auth | null = null;
let currentUser: User | null = null;
let initialized = false;
let configured = false;
let initPromise: Promise<void> | null = null;

function isComplete(config: FirebaseOptions | null | undefined) {
  return Boolean(config?.apiKey && config?.projectId && config?.appId);
}

async function resolveConfig(): Promise<FirebaseOptions | null> {
  if (isComplete(buildConfig)) return buildConfig;
  try {
    const response = await fetch('/api/v1/public-config', { credentials: 'include' });
    if (!response.ok) return null;
    const payload = await response.json();
    return isComplete(payload?.firebase) ? payload.firebase : null;
  } catch {
    return null;
  }
}

export function firebaseConfigured() { return configured; }

export async function initializeClientAuth() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const config = await resolveConfig();
    if (!config) { initialized = true; configured = false; return; }
    configured = true;
    const app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; initialized = true; resolve(); } };
      const unsubscribe = onAuthStateChanged(auth!, async (user) => {
        currentUser = user;
        if (!user) {
          try {
            await signInAnonymously(auth!);
            return;
          } catch (error) {
            console.warn('Firebase anonymous sign-in failed; signed guest API session will be used.', error);
          }
        }
        unsubscribe();
        finish();
      });
      window.setTimeout(() => { unsubscribe(); finish(); }, 8000);
    });
  })();
  return initPromise;
}

export async function getBearerToken() {
  if (!initialized) await initializeClientAuth();
  if (!auth) return null;
  currentUser = auth.currentUser || currentUser;
  if (!currentUser) return null;
  try { return await currentUser.getIdToken(); } catch { return null; }
}
