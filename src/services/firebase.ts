import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, connectAuthEmulator, type Auth } from 'firebase/auth';

// Firebase configuration
// Replace these values with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

/**
 * The project id used by .env.test. A build carrying it must never reach the
 * network — that file exists so browser-driven tests and local demos cannot
 * write into the real project, which is exactly what happens if you build
 * with the live .env and then drive the result.
 */
const TEST_PROJECT_ID = 'test-project';

/**
 * Check if Firebase is configured
 */
export function isFirebaseConfigured(): boolean {
  if (firebaseConfig.projectId === TEST_PROJECT_ID) return false;
  return Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
}

/**
 * Initialize Firebase app and Firestore
 */
export async function initializeFirebase(): Promise<{
  app: FirebaseApp;
  firestore: Firestore;
} | null> {
  // Check if already initialized
  if (app && firestore) {
    return { app, firestore };
  }

  // Check if configuration is available
  if (!isFirebaseConfigured()) {
    console.warn(
      'Firebase not configured. Add VITE_FIREBASE_* environment variables to enable cloud sync.'
    );
    return null;
  }

  try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    firestore = getFirestore(app);

    // Local Firestore emulator, for exercising sync without touching a real
    // project. Sync is the one area that cannot be tested offline, and testing
    // it against production is how test data reached the live database before.
    if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      console.info('Firestore: using local emulator on 127.0.0.1:8080');
    }

    // Enable offline persistence for Firestore
    try {
      await enableIndexedDbPersistence(firestore);
      console.log('Firestore offline persistence enabled');
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time
        console.warn(
          'Firestore persistence unavailable: multiple tabs open'
        );
      } else if (error.code === 'unimplemented') {
        // The current browser doesn't support persistence
        console.warn(
          'Firestore persistence not supported in this browser'
        );
      }
    }

    auth = getAuth(app);
    if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    await ensureSignedIn();

    console.log('Firebase initialized successfully');
    return { app, firestore };
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    return null;
  }
}

/**
 * Sign this device in anonymously.
 *
 * The app has no user accounts, so there is nothing to log in with — but the
 * security rules need *something* to distinguish a request made by the app
 * from an arbitrary request made against the project. An anonymous session
 * gives every device a uid and lets the rules require `request.auth != null`.
 *
 * This is a bar, not a wall: anyone can obtain an anonymous session too. It
 * stops casual access to a wide-open database, and it is what makes the
 * hardened rules deployable at all. Real access control needs real accounts.
 *
 * Deliberately tolerant of failure. If Anonymous sign-in has not been enabled
 * in the Firebase console yet, this logs and carries on rather than taking
 * sync down with it — so the app keeps working both before and after the
 * console setting is turned on.
 */
export async function ensureSignedIn(): Promise<boolean> {
  if (!auth) return false;
  if (auth.currentUser) return true;

  try {
    await signInAnonymously(auth);
    return true;
  } catch (error) {
    console.warn(
      'Anonymous sign-in failed. Enable Authentication → Sign-in method → ' +
        'Anonymous in the Firebase console. Sync will still work while the ' +
        'permissive rules are in place.',
      error
    );
    return false;
  }
}

/**
 * Get Firestore instance
 */
export function getFirestoreInstance(): Firestore | null {
  return firestore;
}

/**
 * Get the current anonymous user id, if signed in
 */
export function getCurrentUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

/**
 * Get Firebase app instance
 */
export function getFirebaseApp(): FirebaseApp | null {
  return app;
}
