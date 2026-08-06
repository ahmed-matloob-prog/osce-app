import { db } from '../db/schema';
import { getDeviceId } from '../utils/pinUtils';

/**
 * Local backup of everything this device holds.
 *
 * The app is offline-first, which means a day's marks live in exactly one
 * place — this tablet's IndexedDB — until something syncs them. If the device
 * is lost, wiped, or has its browser storage evicted, that circuit's results
 * are gone with no recovery path. This writes a file the invigilator can copy
 * off the device, which is the cheapest way to get a second copy that does not
 * depend on the network or on Firestore rules.
 *
 * The whole database is included rather than one exam's worth. It is a few
 * hundred kilobytes at exam scale, and a backup that quietly omits something
 * is worse than no backup.
 */

export const BACKUP_FORMAT = 'osce-backup';
export const BACKUP_VERSION = 1;

export interface BackupCounts {
  exams: number;
  circuits: number;
  candidates: number;
  checkIns: number;
  evaluations: number;
  unsyncedEvaluations: number;
}

export interface BackupFile extends Record<string, unknown> {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  deviceId: string;
  counts: BackupCounts;
}

/** Read everything out of IndexedDB into a plain object. */
export async function buildBackup(): Promise<BackupFile> {
  const [exams, circuits, candidates, checkIns, evaluations] = await Promise.all([
    db.examTemplates.toArray(),
    db.circuits.toArray(),
    db.candidates.toArray(),
    db.checkIns.toArray(),
    db.evaluations.toArray(),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    counts: {
      exams: exams.length,
      circuits: circuits.length,
      candidates: candidates.length,
      checkIns: checkIns.length,
      evaluations: evaluations.length,
      unsyncedEvaluations: evaluations.filter((e) => !e.synced).length,
    },
    exams,
    circuits,
    candidates,
    checkIns,
    evaluations,
  };
}

/** Counts only, for showing what a backup would contain before making one. */
export async function getBackupCounts(): Promise<BackupCounts> {
  const [exams, circuits, candidates, checkIns, evaluations] = await Promise.all([
    db.examTemplates.count(),
    db.circuits.count(),
    db.candidates.count(),
    db.checkIns.count(),
    db.evaluations.toArray(),
  ]);

  return {
    exams,
    circuits,
    candidates,
    checkIns,
    evaluations: evaluations.length,
    unsyncedEvaluations: evaluations.filter((e) => !e.synced).length,
  };
}

/**
 * Filename carries the date and device so files collected from several
 * tablets onto one laptop do not overwrite each other.
 */
export function backupFilename(exportedAt: string, deviceId: string): string {
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  // Device ids look like `device-<random>-<time>`. The literal prefix is the
  // same on every tablet, so drop it and keep the part that actually differs —
  // otherwise every file collected onto one laptop ends in "-device".
  const suffix = deviceId.replace(/^device-/, '').slice(0, 8) || 'unknown';
  return `osce-backup-${stamp}-${suffix}.json`;
}

/** Build a backup and hand it to the browser as a download. */
export async function downloadBackup(): Promise<BackupCounts> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename(backup.exportedAt, backup.deviceId);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoking immediately can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return backup.counts;
}
