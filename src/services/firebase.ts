import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore';

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

/**
 * Check if Firebase is configured
 */
export function isFirebaseConfigured(): boolean {
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

    console.log('Firebase initialized successfully');
    return { app, firestore };
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    return null;
  }
}

/**
 * Get Firestore instance
 */
export function getFirestoreInstance(): Firestore | null {
  return firestore;
}

/**
 * Get Firebase app instance
 */
export function getFirebaseApp(): FirebaseApp | null {
  return app;
}
