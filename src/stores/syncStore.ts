import { create } from 'zustand';
import { getUnsyncedEvaluations, getSettings, updateSettings } from '../db/schema';
import { fullSync } from '../db/sync';
import { isFirebaseConfigured, initializeFirebase } from '../services/firebase';
import type { SyncStatus } from '../types';

interface SyncState extends SyncStatus {
  // Additional state
  /**
   * Whether sync may happen on its own — after a submit, on a timer, on
   * startup, and when connectivity returns.
   *
   * Turning it off does not disable syncing; the manual button and the
   * end-of-session backup still work. It exists because an exam hall with no
   * signal gains nothing from automatic attempts, and some deployments would
   * rather nothing touched the network until the exam is over.
   */
  autoSync: boolean;
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
  syncInBackground: () => void;
  setAutoSync: (enabled: boolean) => Promise<void>;
  setLastSync: (date: Date) => void;
  initializeSync: () => Promise<void>;
}

/** How often to retry while marks are outstanding. */
const BACKGROUND_SYNC_INTERVAL_MS = 60_000;

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: navigator.onLine,
  lastSyncAt: undefined,
  pendingCount: 0,
  isSyncing: false,
  autoSync: true,
  firebaseConfigured: false,
  lastSyncResult: null,
  syncError: null,

  // Initialize Firebase and check configuration
  initializeSync: async () => {
    const configured = isFirebaseConfigured();

    // getSettings() writes the defaults row if it is missing, so the later
    // updateSettings() in setAutoSync always has something to update.
    const settings = await getSettings();
    set({ firebaseConfigured: configured, autoSync: settings.autoSync });

    if (configured) {
      await initializeFirebase();
    }
  },

  setAutoSync: async (enabled) => {
    set({ autoSync: enabled });
    await updateSettings({ autoSync: enabled });
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
            lastSyncResult: {
              evaluationsSynced: result.evaluationsSynced,
              examsAdded: result.examsAdded,
              examsUpdated: result.examsUpdated,
            },
          });
          // Recount rather than assuming zero: an examiner can submit while a
          // sync is in flight, and those marks are genuinely still pending.
          await get().updatePendingCount();
        } else {
          set({
            isSyncing: false,
            syncError: result.error || 'Sync failed',
          });
          await get().updatePendingCount();
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

  // Fire-and-forget sync.
  //
  // Called after each submitted evaluation and on a timer. Nothing awaits it
  // and failure is silent by design: the examiner has already got their mark
  // safely into IndexedDB, and making them wait on a flaky exam-hall network
  // is exactly what offline-first exists to avoid. If it fails, the next
  // attempt picks the same records up again.
  syncInBackground: () => {
    const { isOnline, isSyncing, firebaseConfigured, autoSync } = get();
    if (!autoSync || !isOnline || isSyncing || !firebaseConfigured) {
      // Still worth refreshing the count so the UI tells the truth about
      // how much is waiting.
      get().updatePendingCount().catch(() => {});
      return;
    }
    get().syncNow().catch((error) => console.warn('Background sync failed:', error));
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

  // Every automatic path below goes through syncInBackground, which is the
  // one place that honours the autoSync setting. The manual button in
  // Settings calls syncNow directly and always works.
  window.addEventListener('online', () => {
    useSyncStore.setState({ isOnline: true });
    useSyncStore.getState().syncInBackground();
  });

  window.addEventListener('offline', () => {
    useSyncStore.setState({ isOnline: false });
  });

  // Initial check
  store.checkOnlineStatus();
  await store.updatePendingCount();

  // Auto-sync on startup if online and configured
  useSyncStore.getState().syncInBackground();

  // Keep trying while anything is outstanding. Without this, a tablet that is
  // switched on at 8am and stays open all day never sends a thing until
  // somebody reloads it — a whole circuit's marks sitting in one place.
  setInterval(() => {
    const current = useSyncStore.getState();
    if (current.pendingCount > 0) current.syncInBackground();
    else current.updatePendingCount().catch(() => {});
  }, BACKGROUND_SYNC_INTERVAL_MS);
}
