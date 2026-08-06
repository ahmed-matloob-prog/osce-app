import { db, normalizeCandidateNumber } from '../db/schema';
import { getDeviceId } from '../utils/pinUtils';
import type { Candidate, Circuit, CheckIn, Evaluation, ExamTemplate } from '../types';

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

// Restore
// ---------------------------------------------------------------------------

export interface RestoreSummary {
  exams: { restored: number; skipped: number };
  circuits: { restored: number; skipped: number };
  candidates: { restored: number; skipped: number };
  checkIns: { restored: number; skipped: number };
  evaluations: { restored: number; skipped: number };
}

export class BackupParseError extends Error {}

/**
 * Read and validate a backup file without touching the database, so the UI can
 * show what is in it before anything is applied.
 */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupParseError('That file is not readable as a backup.');
  }

  const backup = parsed as Partial<BackupFile>;
  if (backup?.format !== BACKUP_FORMAT) {
    throw new BackupParseError('That file is not an OSCE backup.');
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new BackupParseError(
      'That backup was made by a newer version of the app. Update before restoring.'
    );
  }

  return backup as BackupFile;
}

/**
 * Merge a backup into this device.
 *
 * Additive only — a record whose id already exists is left alone rather than
 * overwritten. Restoring is something you reach for when a device has died, so
 * it must never be capable of destroying data on the device doing the
 * restoring. The trade-off is that it cannot repair a corrupted record; for
 * that, clear the data first and then restore.
 *
 * Dates come back from JSON as strings and are revived, otherwise anything
 * that formats or sorts by them breaks.
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    exams: { restored: 0, skipped: 0 },
    circuits: { restored: 0, skipped: 0 },
    candidates: { restored: 0, skipped: 0 },
    checkIns: { restored: 0, skipped: 0 },
    evaluations: { restored: 0, skipped: 0 },
  };

  const date = (v: unknown) => (v ? new Date(v as string) : undefined);

  const exams = (backup.exams ?? []) as ExamTemplate[];
  const circuits = (backup.circuits ?? []) as Circuit[];
  const candidates = (backup.candidates ?? []) as Candidate[];
  const checkIns = (backup.checkIns ?? []) as CheckIn[];
  const evaluations = (backup.evaluations ?? []) as Evaluation[];

  for (const exam of exams) {
    if (await db.examTemplates.get(exam.id)) { summary.exams.skipped++; continue; }
    await db.examTemplates.add({
      ...exam,
      createdAt: date(exam.createdAt) ?? new Date(),
      updatedAt: date(exam.updatedAt) ?? new Date(),
      lockedAt: date(exam.lockedAt),
    });
    summary.exams.restored++;
  }

  for (const circuit of circuits) {
    if (await db.circuits.get(circuit.id)) { summary.circuits.skipped++; continue; }
    await db.circuits.add(circuit);
    summary.circuits.restored++;
  }

  for (const candidate of candidates) {
    // Skip on either key: the id may be new while the college ID is already
    // taken, and candidateNumber is a unique index that would throw.
    const number = normalizeCandidateNumber(candidate.candidateNumber);
    const clash =
      (await db.candidates.get(candidate.id)) ||
      (await db.candidates.where('candidateNumber').equals(number).first());
    if (clash) { summary.candidates.skipped++; continue; }

    await db.candidates.add({
      ...candidate,
      candidateNumber: number,
      registeredAt: date(candidate.registeredAt),
    });
    summary.candidates.restored++;
  }

  for (const checkIn of checkIns) {
    if (await db.checkIns.get(checkIn.id)) { summary.checkIns.skipped++; continue; }
    await db.checkIns.add({
      ...checkIn,
      checkedInAt: date(checkIn.checkedInAt) ?? new Date(),
      syncedAt: date(checkIn.syncedAt),
    });
    summary.checkIns.restored++;
  }

  for (const evaluation of evaluations) {
    if (await db.evaluations.get(evaluation.id)) { summary.evaluations.skipped++; continue; }
    await db.evaluations.add({
      ...evaluation,
      startTime: date(evaluation.startTime) ?? new Date(),
      endTime: date(evaluation.endTime),
      syncedAt: date(evaluation.syncedAt),
    });
    summary.evaluations.restored++;
  }

  return summary;
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
