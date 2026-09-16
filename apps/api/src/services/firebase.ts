import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config } from '../config.js';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let firestore: Firestore | null = null;

function initializeFirebaseAdmin() {
  if (adminApp) return;

  try {
    if (getApps().length) {
      adminApp = getApps()[0] ?? null;
    } else if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: config.FIREBASE_PROJECT_ID || serviceAccount.project_id,
      });
    } else if (config.FIREBASE_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: config.FIREBASE_PROJECT_ID,
      });
    }

    if (adminApp) {
      adminAuth = getAuth(adminApp);
      firestore = getFirestore(adminApp);
    }
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
    if (config.STORAGE_DRIVER === 'firestore') throw error;
  }
}

initializeFirebaseAdmin();

export function getAdminAuth() {
  return adminAuth;
}

export function getAdminFirestore() {
  return firestore;
}

export function firebaseAdminAvailable() {
  return Boolean(adminApp && adminAuth);
}
