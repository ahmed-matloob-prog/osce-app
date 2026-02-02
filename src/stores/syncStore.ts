import { create } from 'zustand';
import { getUnsyncedEvaluations } from '../db/schema';
import { fullSync } from '../db/sync';
import { isFirebaseConfigured, initializeFirebase } from '../services/firebase';
import type { SyncStatus } from '../types';

interface SyncState extends SyncStatus {
  // Additional state
  firebaseConfigured: boolean;
  lastSyncResult: {
    evaluationsSynced: number;
    examsAdded: number;
    examsUpdated: number;
  } | null;
  syncError: string | null;

  // Actions
  checkOnlineStatus: () => void;
  updatePendingCount: () => Promise<void>;
  syncNow: () => Promise<void>;
  setLastSync: (date: Date) => void;
  initializeSync: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: navigator.onLine,
  lastSyncAt: undefined,
  pendingCount: 0,
  isSyncing: false,
  firebaseConfigured: false,
  lastSyncResult: null,
  syncError: null,

  // Initialize Firebase and check configuration
  initializeSync: async () => {
    const configured = isFirebaseConfigured();
    set({ firebaseConfigured: configured });

    if (configured) {
      await initializeFirebase();
    }
  },

  // Check and update online status
  checkOnlineStatus: () => {
    set({ isOnline: navigator.onLine });
  },

  // Count pending (unsynced) evaluations
  updatePendingCount: async () => {
    const unsynced = await getUnsyncedEvaluations();
    set({ pendingCount: unsynced.length });
  },

  // Sync with Firebase (bidirectional)
  syncNow: async () => {
    const { isOnline, isSyncing, firebaseConfigured } = get();

    if (!isOnline || isSyncing) return;

    set({ isSyncing: true, syncError: null });

    try {
      if (firebaseConfigured) {
        // Full bidirectional sync with Firebase
        const result = await fullSync();

        if (result.success) {
          set({
            isSyncing: false,
            lastSyncAt: new Date(),
            pendingCount: 0,
            lastSyncResult: {
              evaluationsSynced: result.evaluationsSynced,
              examsAdded: result.examsAdded,
              examsUpdated: result.examsUpdated,
            },
          });
        } else {
          set({
            isSyncing: false,
            syncError: result.error || 'Sync failed',
          });
        }
      } else {
        // No Firebase - just update pending count
        await get().updatePendingCount();
        set({
          isSyncing: false,
          lastSyncAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Sync failed:', error);
      set({
        isSyncing: false,
        syncError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  setLastSync: (date) => {
    set({ lastSyncAt: date });
  },
}));

// Set up online/offline listeners
export async function initSyncListeners() {
  const store = useSyncStore.getState();

  // Initialize Firebase
  await store.initializeSync();

  window.addEventListener('online', () => {
    useSyncStore.setState({ isOnline: true });
    // Auto-sync when coming online
    store.syncNow();
  });

  window.addEventListener('offline', () => {
    useSyncStore.setState({ isOnline: false });
  });

  // Initial check
  store.checkOnlineStatus();
  store.updatePendingCount();

  // Auto-sync on startup if online and configured
  if (store.isOnline && isFirebaseConfigured()) {
    store.syncNow();
  }
}
