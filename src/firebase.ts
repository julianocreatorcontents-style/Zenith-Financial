import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, 
  addDoc, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  getDocFromServer, 
  getDocs, 
  writeBatch, 
  limit 
} from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent local cache & multi-tab coordination (Spark Plan optimization)
function createFirestoreInstance() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (err) {
    console.warn('[Firestore] Falling back to standard getFirestore:', err);
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handling for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const FIRESTORE_ERROR_EVENT = 'firestore_error';

export interface FirestoreErrorDetail {
  code: string;
  operationType: OperationType;
  path: string | null;
  timestamp: string;
}

function sanitizePath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length > 1 ? `${parts[0]}/{id}` : parts[0];
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length <= 80) return code;
  }
  return 'unknown';
}

/**
 * Central Firestore error reporter. Never throws, so it is safe inside
 * onSnapshot callbacks (React ErrorBoundary does not catch async errors).
 * Only non-sensitive metadata is logged/emitted: no UID, e-mail or document id.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const safePath = sanitizePath(path);
  const code = getErrorCode(error);

  console.error(`[Firestore] ${operationType} ${safePath ?? 'unknown-path'} failed (${code})`);

  if (typeof window !== 'undefined') {
    const detail: FirestoreErrorDetail = {
      code,
      operationType,
      path: safePath,
      timestamp: new Date().toISOString()
    };
    window.dispatchEvent(new CustomEvent<FirestoreErrorDetail>(FIRESTORE_ERROR_EVENT, { detail }));
  }
}

export { 
  signInWithPopup, 
  signOut, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  collection, 
  addDoc,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs,
  getDocFromServer,
  writeBatch,
  limit
};
