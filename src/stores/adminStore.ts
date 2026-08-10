import { create } from 'zustand';
import { db } from '../db/schema';
import type { AdminCredential } from '../types';
import {
  hashPin,
  verifyPin,
  isValidPinFormat,
  generateBackupCodes,
  verifyBackupCode,
  markBackupCodeUsed,
  getDeviceId,
} from '../utils/pinUtils';

const CREDENTIAL_ID = 'admin';

export type AdminCheck =
  | { status: 'ok' }
  | { status: 'wrong' }
  /** No credential on this device yet — it has never synced. See below. */
  | { status: 'unknown' };

interface AdminState {
  credential: AdminCredential | null;
  loaded: boolean;

  load: () => Promise<void>;
  /** True once somebody, on some device, has set the PIN. */
  hasPin: () => boolean;
  setPin: (pin: string) => Promise<{ ok: boolean; backupCodes?: string[]; error?: string }>;
  checkPin: (pin: string) => Promise<AdminCheck>;
  /** Spend a one-time recovery code. Consumed whether or not a new PIN follows. */
  redeemBackupCode: (code: string) => Promise<boolean>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  credential: null,
  loaded: false,

  load: async () => {
    const credential = (await db.appConfig.get(CREDENTIAL_ID)) ?? null;
    set({ credential, loaded: true });
  },

  hasPin: () => Boolean(get().credential?.pinHash),

  /**
   * Set or change the PIN, and mint a fresh set of backup codes.
   *
   * Returns the codes in plain text exactly once. They are stored hashed, so
   * this is the only moment they can be written down.
   */
  setPin: async (pin) => {
    if (!isValidPinFormat(pin)) return { ok: false, error: 'format' };

    const { plainCodes, hashedCodes } = await generateBackupCodes();
    const credential: AdminCredential = {
      id: CREDENTIAL_ID,
      pinHash: await hashPin(pin),
      backupCodes: hashedCodes,
      updatedAt: new Date(),
      setBy: getDeviceId(),
    };
    await db.appConfig.put(credential);
    set({ credential });
    return { ok: true, backupCodes: plainCodes };
  },

  /**
   * Three answers, not two.
   *
   * A tablet that has never synced holds no credential, and in an exam hall
   * with no internet it has no way to get one. Reporting that as "wrong PIN"
   * would strand whoever is holding it. It is reported as `unknown` instead,
   * and the caller lets them through while saying plainly that it could not
   * check — which gives away nothing, because a tablet that has never synced
   * has no exams and no roster on it either.
   */
  checkPin: async (pin) => {
    if (!get().loaded) await get().load();
    const credential = get().credential;
    if (!credential?.pinHash) return { status: 'unknown' };
    return (await verifyPin(pin, credential.pinHash)) ? { status: 'ok' } : { status: 'wrong' };
  },

  redeemBackupCode: async (code) => {
    if (!get().loaded) await get().load();
    const credential = get().credential;
    if (!credential) return false;

    const index = await verifyBackupCode(code, credential.backupCodes ?? []);
    if (index < 0) return false;

    const updated: AdminCredential = {
      ...credential,
      backupCodes: markBackupCodeUsed(credential.backupCodes, index),
      updatedAt: new Date(),
    };
    await db.appConfig.put(updated);
    set({ credential: updated });
    return true;
  },
}));
