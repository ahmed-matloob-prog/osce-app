import {
  collection as collection_,
  doc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  setDoc,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { getFirestoreInstance, isFirebaseConfigured, initializeFirebase } from '../services/firebase';
import {
  db,
  getUnsyncedEvaluations,
  markEvaluationSynced,
  getCandidateByNumber,
  normalizeCandidateNumber,
} from './schema';
import type {
  Evaluation,
  ExamTemplate,
  Candidate,
  Circuit,
  CheckIn,
  AdminCredential,
  BackupCode,
} from '../types';

// Collection names in Firestore
const COLLECTIONS = {
  evaluations: 'evaluations',
  exams: 'exams',
  candidates: 'candidates',
  circuits: 'circuits',
  checkIns: 'checkIns',
  config: 'config',
} as const;

/**
 * Anything that has been a date at some point, back as a Date.
 *
 * A Firestore Timestamp that reaches IndexedDB without being converted comes
 * back out as a plain `{ seconds, nanoseconds }` object — the class does not
 * survive storage. Pushing one of those used to throw inside
 * `Timestamp.fromDate`, and because it happened mid-sync it took the rest of
 * the sync down with it: a single pulled deletion date stopped a device
 * uploading exams, and a single spent backup code stopped it uploading marks.
 * Devices already holding such values heal on their next sync.
 */
function asDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
    const { seconds, nanoseconds = 0 } = value as { seconds: number; nanoseconds?: number };
    return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

/** Convert anything date-like to a Firestore Timestamp, for upload. */
function toTimestamp(value: unknown): Timestamp | null {
  const date = asDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

/** Convert a downloaded Firestore value back to a Date, for IndexedDB. */
function fromTimestamp(value: unknown): Date | undefined {
  return asDate(value);
}

// ── Time limits ──────────────────────────────────────────────────────────────
//
// A Firestore write never fails for being slow: it waits for the server for as
// long as it takes. On a phone on 3G that can be for ever, and because nothing
// starts a new sync while one is running, a single stalled upload used to hold
// every later mark on the device behind it — the screen said "Sending…" and
// meant it indefinitely. Every network step now has a limit. A write that runs
// out of time is not lost: Firestore keeps it queued and delivers it when it
// can, and the next sync sends the same marks again.

export class SyncTimeout extends Error {}

/** Shorter limits for the emulator tests, which cannot wait a minute a step. */
function limitMs(normal: number): number {
  if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
    const override = Number(localStorage.getItem('osce.test.syncTimeoutMs'));
    if (override > 0) return override;
  }
  return normal;
}
const STEP_LIMIT_MS = 45_000;
const MARKS_LIMIT_MS = 30_000;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new SyncTimeout(`${what} took longer than ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// ── Upload only what changed ─────────────────────────────────────────────────
//
// Every sync used to upload every student, circuit and check-in on the device,
// changed or not — about 800 writes per minute from each station tablet for a
// 389-student exam, ahead of the marks. What each sync has just read from the
// cloud is kept here, and a row identical to its cloud copy is not sent.

const cloudCopy = new Map<string, Map<string, Record<string, unknown>>>();

/** Comparable form: timestamps as milliseconds, keys sorted, undefined dropped. */
function canonical(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof Timestamp) return { $t: asDate(value)?.getTime() ?? null };
  if (typeof (value as { seconds?: unknown }).seconds === 'number' &&
      typeof (value as { nanoseconds?: unknown }).nanoseconds === 'number') {
    return { $t: asDate(value)?.getTime() ?? null };
  }
  if (Array.isArray(value)) return value.map(canonical);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = canonical((value as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** True when uploading `payload` would leave the cloud copy as it is. */
function sameAsCloud(payload: Record<string, unknown>, cloud: Record<string, unknown>): boolean {
  // A server-filled field (serverTimestamp) never equals what is stored, so
  // leave it out of the comparison rather than re-send every row for it.
  const local: Record<string, unknown> = {};
  const remote: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value instanceof FieldValue) continue;
    local[key] = value;
    if (key in cloud) remote[key] = cloud[key];
  }
  for (const key of Object.keys(cloud)) if (!(key in payload)) remote[key] = cloud[key];
  return JSON.stringify(canonical(local)) === JSON.stringify(canonical(remote));
}

/** A spent backup code keeps its usedAt as a real date, whichever side it came from. */
function normalizeBackupCodes(codes: BackupCode[] = []): BackupCode[] {
  return codes.map((code) => ({ ...code, usedAt: asDate(code.usedAt) }));
}

/** What a mark upload says when the connection, not the cloud, is the problem. */
function slowConnection(syncedCount: number) {
  return {
    success: false,
    syncedCount,
    error:
      'The connection is too slow to send marks right now. They are safe on this device and will be sent on the next try.',
  };
}

/**
 * Sync all unsynced evaluations to Firestore
 */
export async function syncEvaluationsToCloud(): Promise<{
  success: boolean;
  syncedCount: number;
  error?: string;
}> {
  // Check if Firebase is configured
  if (!isFirebaseConfigured()) {
    return {
      success: true,
      syncedCount: 0,
      error: 'Firebase not configured',
    };
  }

  // Ensure Firebase is initialized
  await initializeFirebase();
  const firestore = getFirestoreInstance();

  if (!firestore) {
    return {
      success: false,
      syncedCount: 0,
      error: 'Firestore not available',
    };
  }

  const toCloud = (evaluation: Evaluation) =>
    stripUndefined({
      ...evaluation,
      startTime: toTimestamp(evaluation.startTime),
      endTime: toTimestamp(evaluation.endTime),
      syncedAt: serverTimestamp(),
      synced: true,
    });

  try {
    const unsynced = await getUnsyncedEvaluations();

    if (unsynced.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Use batch writes for efficiency (max 500 per batch)
    const batchSize = 500;
    let syncedCount = 0;
    const refused: string[] = [];

    for (let i = 0; i < unsynced.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = unsynced.slice(i, i + batchSize);

      for (const evaluation of chunk) {
        batch.set(doc(firestore, COLLECTIONS.evaluations, evaluation.id), toCloud(evaluation));
      }

      try {
        await withTimeout(batch.commit(), limitMs(MARKS_LIMIT_MS), 'Sending marks');
        for (const evaluation of chunk) await markEvaluationSynced(evaluation.id);
        syncedCount += chunk.length;
        continue;
      } catch (error) {
        // Slow is not refused. Stop here: trying each mark on its own down
        // the same stalled connection would only multiply the wait.
        if (error instanceof SyncTimeout) return slowConnection(syncedCount);
        // A batch is all-or-nothing, so one mark the rules refuse used to hold
        // back every other mark in it, on every sync, for good. Retry one at a
        // time so a single refusal costs only itself.
        console.warn('Mark batch refused; retrying marks one at a time:', error);
      }

      for (const evaluation of chunk) {
        const ref = doc(firestore, COLLECTIONS.evaluations, evaluation.id);
        try {
          await withTimeout(setDoc(ref, toCloud(evaluation)), limitMs(MARKS_LIMIT_MS), 'Sending a mark');
          await markEvaluationSynced(evaluation.id);
          syncedCount++;
        } catch (error) {
          if (error instanceof SyncTimeout) return slowConnection(syncedCount);
          // A mark already in the cloud is write-once there. If this device
          // has since filed it under a merged student or circuit, the upload is
          // refused — but the cloud already holds the mark, under the id it
          // was scored against, and readers resolve that id to the survivor.
          // Nothing is lost by treating it as sent.
          const exists = await withTimeout(getDocFromServer(ref), limitMs(MARKS_LIMIT_MS), 'Checking a mark')
            .then((d) => d.exists(), () => false);
          if (exists) {
            await markEvaluationSynced(evaluation.id);
            syncedCount++;
          } else {
            console.error(`Mark ${evaluation.id} could not be uploaded:`, error);
            refused.push(evaluation.id);
          }
        }
      }
    }

    if (refused.length > 0) {
      return {
        success: false,
        syncedCount,
        error: `${refused.length} mark(s) could not be uploaded and are still on this device`,
      };
    }
    return { success: true, syncedCount };
  } catch (error) {
    console.error('Sync to cloud failed:', error);
    return {
      success: false,
      syncedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync exams to cloud (for backup/sharing)
 */
export async function syncExamsToCloud(exams: ExamTemplate[]): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isFirebaseConfigured()) {
    return { success: true, error: 'Firebase not configured' };
  }

  await initializeFirebase();
  const firestore = getFirestoreInstance();

  if (!firestore) {
    return { success: false, error: 'Firestore not available' };
  }

  try {
    // The exam carries its own updatedAt — the moment it was last edited — not
    // the moment it happened to be uploaded. Stamping the upload time made
    // every routine sync from every tablet look like a fresh edit, so an
    // admin's real change lost to whichever tablet synced before the admin did.
    await pushCollection(COLLECTIONS.exams, exams, (exam) => ({
      ...exam,
      createdAt: toTimestamp(exam.createdAt),
      deletedAt: toTimestamp(exam.deletedAt),
      updatedAt: toTimestamp(exam.updatedAt),
    }));
    return { success: true };
  } catch (error) {
    console.error('Sync exams to cloud failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync candidates to cloud
 */
export async function syncCandidatesToCloud(candidates: Candidate[]): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isFirebaseConfigured()) {
    return { success: true, error: 'Firebase not configured' };
  }

  await initializeFirebase();
  const firestore = getFirestoreInstance();

  if (!firestore) {
    return { success: false, error: 'Firestore not available' };
  }

  try {
    // In batches of 500, like every other upload: a roster is institution-wide,
    // and two cohorts plus retired duplicates pass 500 easily.
    await pushCollection(COLLECTIONS.candidates, candidates, (candidate) => ({
      ...candidate,
      registeredAt: toTimestamp(candidate.registeredAt),
      updatedAt: toTimestamp(candidate.updatedAt),
      deletedAt: toTimestamp(candidate.deletedAt),
    }));
    return { success: true };
  } catch (error) {
    console.error('Sync candidates to cloud failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch evaluations from cloud for a specific exam
 */
export async function fetchEvaluationsFromCloud(
  examId: string
): Promise<Evaluation[]> {
  if (!isFirebaseConfigured()) {
    return [];
  }

  await initializeFirebase();
  const firestore = getFirestoreInstance();

  if (!firestore) {
    return [];
  }

  // From the server, and allowed to fail. With offline persistence on, a plain
  // getDocs answers from the local cache when the cloud is out of reach, and
  // the error that was caught here turned "could not ask" into "nobody else
  // has scored anything" — so Reports never showed its offline warning.
  const evaluationsRef = collection_(firestore, COLLECTIONS.evaluations);
  const q = query(evaluationsRef, where('examId', '==', examId));
  const snapshot = await getDocsFromServer(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      startTime: fromTimestamp(data.startTime),
      endTime: fromTimestamp(data.endTime),
      syncedAt: fromTimestamp(data.syncedAt),
    } as Evaluation;
  });
}

/**
 * Fetch all exams from cloud
 */
export async function fetchExamsFromCloud(): Promise<ExamTemplate[]> {
  if (!isFirebaseConfigured()) {
    return [];
  }

  await initializeFirebase();
  const firestore = getFirestoreInstance();

  if (!firestore) {
    return [];
  }

  try {
    const examsRef = collection_(firestore, COLLECTIONS.exams);
    const snapshot = await getDocs(examsRef);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: fromTimestamp(data.createdAt),
        updatedAt: fromTimestamp(data.updatedAt),
        deletedAt: fromTimestamp(data.deletedAt),
      } as ExamTemplate;
    });
  } catch (error) {
    console.error('Fetch exams from cloud failed:', error);
    return [];
  }
}

/**
 * Merge cloud data with local data
 * Uses "last write wins" strategy based on updatedAt timestamp
 */
export async function mergeCloudExamsWithLocal(): Promise<{
  added: number;
  updated: number;
  /** What the cloud holds, by exam id, as of updatedAt — so the push can skip what it already has. */
  cloudVersions: Map<string, number>;
}> {
  const cloudExams = await fetchExamsFromCloud();
  const cloudVersions = new Map<string, number>();
  let added = 0;
  let updated = 0;

  for (const cloudExam of cloudExams) {
    const cloudTime = cloudExam.updatedAt?.getTime() || 0;
    cloudVersions.set(cloudExam.id, cloudTime);
    const localExam = await db.examTemplates.get(cloudExam.id);

    if (!localExam) {
      // New exam from cloud
      await db.examTemplates.put(cloudExam);
      added++;
    } else if (cloudTime > (asDate(localExam.updatedAt)?.getTime() || 0)) {
      await db.examTemplates.put(cloudExam);
      updated++;
    } else if (localExam.deletedAt && !(localExam.deletedAt instanceof Date)) {
      // Written by an earlier version that stored the cloud's Timestamp as-is.
      await db.examTemplates.update(localExam.id, { deletedAt: asDate(localExam.deletedAt) });
    }
  }

  return { added, updated, cloudVersions };
}

/**
 * Full bidirectional sync.
 *
 * Order matters, and it is not the obvious one. Marks are pushed **last**,
 * after every identity question has been settled.
 *
 * A mark points at a candidate id and a circuit id. Both of those can be
 * revised by the merges below, when it turns out that two devices had built
 * their own record for the same student or the same circuit. And a mark is
 * write-once in the security rules: once it is in the cloud, only its sync
 * fields may change. So pushing a mark before reconciling would send it up
 * pointing at a uuid that is about to be retired, and the correction would then
 * be refused by the very rule that protects it.
 *
 * Reconciling first means each mark is only ever pushed under the ids everyone
 * has already agreed on.
 */
export async function fullSync(): Promise<{
  success: boolean;
  evaluationsSynced: number;
  examsAdded: number;
  examsUpdated: number;
  error?: string;
}> {
  // Every step below used to be awaited without looking at its result, so an
  // exam or roster upload could fail on every sync and the screen still said
  // "synced". And a step that threw ended the whole run before the marks were
  // sent. Now each failure is recorded and reported, and the run carries on.
  // Each step also has a time limit, so a stalled one cannot hold the device
  // in "Sending…" for good.
  const problems: string[] = [];
  // Nothing read by an earlier sync may stand in for the cloud now.
  cloudCopy.clear();
  const step = async <T,>(name: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await withTimeout(run(), limitMs(STEP_LIMIT_MS), name);
    } catch (error) {
      console.error(`Sync step failed: ${name}`, error);
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const mustSucceed = (result: { success: boolean; error?: string }) => {
    if (!result.success) throw new Error(result.error ?? 'failed');
    return result;
  };

  try {
    // Three phases: everything down and merged, then the marks, then
    // everything up.
    //
    // Down first, so that a student or circuit created twice has been merged
    // and the marks re-filed under the survivor before they leave: marks are
    // write-once in the cloud and cannot be corrected afterwards.
    //
    // Marks before any upload. They are the one thing that exists only on this
    // device, and they used to wait behind the whole roster and every check-in
    // going up — on a slow connection, for ever.

    // The admin PIN first: a tablet being set up needs it before anything
    // else on this list is of any use to whoever is holding it.
    await step('admin PIN', syncAdminCredential);

    // ── down ──
    const mergeResult = await step('exams down', mergeCloudExamsWithLocal);
    // Pull candidates before pushing, so a tablet that has never seen the
    // roster gets one — and so college IDs are reconciled before this device's
    // own uuids are broadcast.
    const rosterDown = await step('roster down', mergeCloudCandidates);
    // Circuits and their assignments, so an examiner's tablet knows which
    // students belong at its station. This also collapses circuits two
    // devices created independently.
    const circuitsDown = await step('circuits down', pullCircuitsAndCheckIns);

    // ── marks ──
    const evalResult = await syncEvaluationsToCloud();
    if (!evalResult.success && !evalResult.error?.includes('not configured')) {
      problems.push(`marks: ${evalResult.error ?? 'failed'}`);
    }

    // ── up ── only what differs from what was just read
    await step('exams up', async () => {
      if (!mergeResult) throw new Error('skipped: could not read the cloud copy first');
      const changed = (await db.examTemplates.toArray()).filter(
        (exam) =>
          (asDate(exam.updatedAt)?.getTime() || 0) > (mergeResult.cloudVersions.get(exam.id) ?? -1)
      );
      if (changed.length > 0) mustSucceed(await syncExamsToCloud(changed));
    });

    await step('roster up', async () => {
      // A pull that failed or ran out of time may still be merging: what is
      // here now is half old, half new, and must not be pushed over the
      // cloud's copy.
      if (!rosterDown) throw new Error('skipped: could not read the cloud copy first');
      mustSucceed(await syncCandidatesToCloud(await db.candidates.toArray()));
    });
    await step('circuits up', async () => {
      if (!circuitsDown) throw new Error('skipped: could not read the cloud copy first');
      await pushCircuitsAndCheckIns();
    });

    return {
      success: problems.length === 0,
      evaluationsSynced: evalResult.syncedCount,
      examsAdded: mergeResult?.added ?? 0,
      examsUpdated: mergeResult?.updated ?? 0,
      error: problems.length > 0 ? problems.join('; ') : undefined,
    };
  } catch (error) {
    console.error('Full sync failed:', error);
    return {
      success: false,
      evaluationsSynced: 0,
      examsAdded: 0,
      examsUpdated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Circuits and check-ins
// ---------------------------------------------------------------------------
// These used to be local-only, which quietly undid the whole circuit feature on
// a multi-device exam: an admin assigned 450 students to 15 circuits on one
// machine, and every examiner tablet started the day with no circuits and no
// assignments. `examUsesCheckIn` was false there, so the wrong-circuit warning
// never fired and the picker offered all 450 students.
//
// Syncing them introduces a problem candidates never had. Two devices can each
// create "Circuit 1" for the same exam, with different ids, and both are valid
// locally. The merge therefore de-duplicates by (examId, circuitNumber),
// keeping the lowest id so every device independently picks the same survivor,
// and repoints check-ins and evaluations at it.

/**
 * Firestore rejects `undefined` as a field value outright — one such field
 * fails the whole batch. Restoring a deleted exam, student or check-in sets
 * `deletedAt: undefined`, so without this a restore quietly broke sync for
 * everything that shared its batch.
 */
function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

async function pushCollection<T extends { id: string }>(
  collection: string,
  rows: T[],
  toCloud: (row: T) => Record<string, unknown>
): Promise<void> {
  if (!isFirebaseConfigured() || rows.length === 0) return;
  await initializeFirebase();
  const firestore = getFirestoreInstance();
  if (!firestore) return;

  // Only rows the cloud does not already hold exactly as they are here.
  // Without a fresh read of this collection, send everything, as before.
  const known = cloudCopy.get(collection);
  const changed = rows
    .map((row) => ({ id: row.id, payload: stripUndefined(toCloud(row)) }))
    .filter(({ id, payload }) => {
      const cloud = known?.get(id);
      return !cloud || !sameAsCloud(payload, cloud);
    });
  lastPushCounts.set(collection, changed.length);

  for (let i = 0; i < changed.length; i += 500) {
    const batch = writeBatch(firestore);
    for (const { id, payload } of changed.slice(i, i + 500)) {
      batch.set(doc(firestore, collection, id), payload);
    }
    await batch.commit();
  }
}

/** How many rows each collection's last upload actually sent. For diagnosis and tests. */
export const lastPushCounts = new Map<string, number>();

async function fetchCollection(collection: string): Promise<Record<string, unknown>[]> {
  if (!isFirebaseConfigured()) return [];
  await initializeFirebase();
  const firestore = getFirestoreInstance();
  if (!firestore) return [];

  const snapshot = await getDocs(collection_(firestore, collection));
  cloudCopy.set(
    collection,
    new Map(snapshot.docs.map((d) => [d.id, d.data() as Record<string, unknown>]))
  );
  return snapshot.docs.map((d) => d.data() as Record<string, unknown>);
}

/** Newest wins, using updatedAt. A record with no timestamp is treated as oldest. */
function isNewer(a?: Date, b?: Date): boolean {
  return (a?.getTime() ?? 0) > (b?.getTime() ?? 0);
}

/** Bring circuits and check-ins down and merge them, collapsing duplicate circuits. */
export async function pullCircuitsAndCheckIns(): Promise<{
  circuitsMerged: number;
  checkInsMerged: number;
  duplicateCircuitsResolved: number;
}> {
  if (!isFirebaseConfigured()) {
    return { circuitsMerged: 0, checkInsMerged: 0, duplicateCircuitsResolved: 0 };
  }

  // --- pull ---------------------------------------------------------------
  const cloudCircuits = (await fetchCollection(COLLECTIONS.circuits)).map((d) => ({
    ...(d as unknown as Circuit),
    updatedAt: fromTimestamp(d.updatedAt as Timestamp | null),
    deletedAt: fromTimestamp(d.deletedAt as Timestamp | null),
  }));
  const cloudCheckIns = (await fetchCollection(COLLECTIONS.checkIns)).map((d) => ({
    ...(d as unknown as CheckIn),
    checkedInAt: fromTimestamp(d.checkedInAt as Timestamp | null) ?? new Date(),
    updatedAt: fromTimestamp(d.updatedAt as Timestamp | null),
    deletedAt: fromTimestamp(d.deletedAt as Timestamp | null),
  }));

  let circuitsMerged = 0;
  for (const cloud of cloudCircuits) {
    const local = await db.circuits.get(cloud.id);
    if (!local) {
      await db.circuits.add(cloud);
      circuitsMerged++;
    } else if (isNewer(cloud.updatedAt, local.updatedAt)) {
      await db.circuits.put(cloud);
      circuitsMerged++;
    }
  }

  let checkInsMerged = 0;
  for (const cloud of cloudCheckIns) {
    const local = await db.checkIns.get(cloud.id);
    if (!local) {
      await db.checkIns.add({ ...cloud, synced: true });
      checkInsMerged++;
    } else if (isNewer(cloud.updatedAt, local.updatedAt)) {
      await db.checkIns.put({ ...cloud, synced: true });
      checkInsMerged++;
    }
  }

  // --- de-duplicate circuits ----------------------------------------------
  const duplicateCircuitsResolved = await dedupeCircuits();
  await settleMarks();

  return { circuitsMerged, checkInsMerged, duplicateCircuitsResolved };
}

/** Circuits and check-ins, both ways, in one go. */
export async function syncCircuitsAndCheckIns(): Promise<{
  circuitsMerged: number;
  checkInsMerged: number;
  duplicateCircuitsResolved: number;
}> {
  const pulled = await pullCircuitsAndCheckIns();
  await pushCircuitsAndCheckIns();
  return pulled;
}

/**
 * Send this device's circuits and check-ins — only those that differ from what
 * the pull just read. Run after the pull, never instead of it.
 */
export async function pushCircuitsAndCheckIns(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await pushCollection(COLLECTIONS.circuits, await db.circuits.toArray(), (c) => ({
    ...c,
    updatedAt: toTimestamp(c.updatedAt),
    deletedAt: toTimestamp(c.deletedAt),
  }));

  const checkIns = await db.checkIns.toArray();
  await pushCollection(COLLECTIONS.checkIns, checkIns, (c) => ({
    ...c,
    checkedInAt: toTimestamp(c.checkedInAt),
    updatedAt: toTimestamp(c.updatedAt),
    deletedAt: toTimestamp(c.deletedAt),
    synced: true,
  }));
  if (checkIns.length > 0) {
    await db.checkIns.bulkPut(checkIns.map((c) => ({ ...c, synced: true })));
  }
}


/**
 * Bring marks down from the cloud for one exam.
 *
 * Marks were push-only. `fetchEvaluationsFromCloud` was written and then never
 * called by anything, so a mark left the tablet that recorded it and never came
 * back to any other device. On a fifteen-circuit exam that means the admin's
 * reporting device shows only what was scored on the admin's own device — and
 * shows it without complaint, which is the dangerous part. The results document
 * looks finished and is missing fourteen circuits.
 *
 * Scoped to one exam, and called from the Reports screen rather than from the
 * background sync, because it is the only place other devices' marks are
 * needed. A cohort of 450 across several stations is thousands of documents;
 * pulling all of them on every background sync on every tablet would be a great
 * deal of reading for data nobody at a station looks at.
 *
 * A mark is immutable once written, so anything already held locally is left
 * alone: a local copy is either the same mark or one that has not been pushed
 * yet, and neither should be overwritten by the cloud.
 */
export async function mergeCloudEvaluations(examId: string): Promise<{
  added: number;
  offline: boolean;
}> {
  if (!isFirebaseConfigured() || !examId) return { added: 0, offline: false };

  let cloud: Evaluation[];
  try {
    cloud = await fetchEvaluationsFromCloud(examId);
  } catch {
    return { added: 0, offline: true };
  }
  if (cloud.length === 0) return { added: 0, offline: false };

  const localIds = new Set(
    (await db.evaluations.where('examId').equals(examId).toArray()).map((e) => e.id)
  );

  const missing = cloud
    .filter((e) => !localIds.has(e.id))
    .map((e) => ({ ...e, synced: true, startTime: e.startTime ?? new Date() }));

  if (missing.length > 0) {
    await db.evaluations.bulkPut(missing);
    // A pulled mark carries the ids it was scored against, which may since have
    // been merged away.
    await settleMarks();
  }
  return { added: missing.length, offline: false };
}

// The admin PIN
// ---------------------------------------------------------------------------
// The one piece of configuration that has to reach every device. Set it on one
// tablet and the rest learn it when they sync, rather than somebody typing it
// into fifteen of them at seven in the morning.

/**
 * Newest PIN wins, but a spent backup code stays spent everywhere.
 *
 * Those two rules pull in different directions and both matter. Last-write-wins
 * on the whole record would let a device that still held an old copy resurrect
 * a recovery code somebody had already used to get in.
 */
function mergeBackupCodes(a: BackupCode[] = [], b: BackupCode[] = []): BackupCode[] {
  const spent = new Map<string, BackupCode>();
  for (const code of [...a, ...b]) {
    if (!code.used) continue;
    spent.set(code.code, code);
  }
  const newest = a.length >= b.length ? a : b;
  return normalizeBackupCodes(newest.map((code) => spent.get(code.code) ?? code));
}

export async function syncAdminCredential(): Promise<{ pulled: boolean; pushed: boolean }> {
  if (!isFirebaseConfigured()) return { pulled: false, pushed: false };

  const cloudRows = (await fetchCollection(COLLECTIONS.config)).map((d) => ({
    ...(d as unknown as AdminCredential),
    updatedAt: fromTimestamp(d.updatedAt as Timestamp | null) ?? new Date(0),
    backupCodes: normalizeBackupCodes((d as unknown as AdminCredential).backupCodes),
  }));
  const cloud = cloudRows.find((row) => row.id === 'admin');
  const local = await db.appConfig.get('admin');

  let pulled = false;
  if (cloud && (!local || isNewer(cloud.updatedAt, local.updatedAt))) {
    await db.appConfig.put({
      ...cloud,
      backupCodes: mergeBackupCodes(cloud.backupCodes, local?.backupCodes),
    });
    pulled = true;
  } else if (cloud && local) {
    // Same PIN on both sides, but this device may have spent a code the cloud
    // has not heard about, or the other way round.
    const merged = mergeBackupCodes(local.backupCodes, cloud.backupCodes);
    await db.appConfig.put({ ...local, backupCodes: merged });
  }

  const toPush = await db.appConfig.get('admin');
  let pushed = false;
  if (toPush) {
    await pushCollection(COLLECTIONS.config, [toPush], (c) => ({
      ...c,
      updatedAt: toTimestamp(c.updatedAt),
      backupCodes: (c.backupCodes ?? []).map((code) => ({
        ...code,
        usedAt: toTimestamp(code.usedAt),
      })),
    }));
    pushed = true;
  }

  return { pulled, pushed };
}

// Candidates
// ---------------------------------------------------------------------------
// Candidates used to be push-only, which meant a tablet that had never had the
// roster imported on it started exam day with an empty student list — and once
// circuits sync, it would receive assignments pointing at students it had never
// heard of.
//
// Pulling them down is harder than pulling exams down, because a candidate has
// two identities. The uuid is local and accidental: import the same roster on
// two devices and every student gets two of them. The college ID is the real
// one — externally assigned, unique, printed on the badge, and carrying a
// unique index in IndexedDB.
//
// So the merge reconciles on college ID, not uuid. When both exist, the lowest
// uuid wins (every device reaches that answer alone, without coordinating) and
// everything pointing at the loser is repointed before it is retired. The
// retired record keeps its row but gives up its college ID — the unique index
// allows exactly one holder, and the survivor needs it.

/** Move check-ins and marks from a discarded candidate record onto the kept one. */
async function repointCandidate(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  const now = new Date();

  const checkIns = await db.checkIns.filter((c) => c.candidateId === fromId).toArray();
  for (const checkIn of checkIns) {
    // The same student may already be checked in under the surviving id, from
    // the device that created it. Two assignments for one person would break
    // the "already checked in" guard, so the later one is retired.
    const clash = await db.checkIns
      .filter(
        (c) =>
          c.candidateId === toId &&
          c.examId === checkIn.examId &&
          !c.deleted &&
          c.id !== checkIn.id
      )
      .first();
    await db.checkIns.put({
      ...checkIn,
      candidateId: toId,
      deleted: checkIn.deleted || Boolean(clash),
      deletedAt: clash ? now : checkIn.deletedAt,
      updatedAt: now,
      synced: false,
    });
  }

  // Marks are refiled here, on this device, and nothing more. One that has not
  // been sent yet goes up under the survivor's id. One that has been sent stays
  // as the cloud has it — the rules make a sent mark write-once, and asking to
  // change it used to be refused on every sync, holding back every other mark
  // in the same batch with it. The retired record names its survivor, so any
  // device that pulls the mark files it correctly too (see settleMarks).
  const evaluations = await db.evaluations.filter((e) => e.candidateId === fromId).toArray();
  for (const evaluation of evaluations) {
    await db.evaluations.update(evaluation.id, { candidateId: toId });
  }
}

/**
 * Follow retired records to the record that replaced them. Chains are followed
 * to the end — a record retired into one that was itself later retired.
 */
function survivorMap(
  rows: { id: string; deleted?: boolean; mergedInto?: string }[]
): Map<string, string> {
  const next = new Map<string, string>();
  for (const row of rows) {
    if (row.deleted && row.mergedInto) next.set(row.id, row.mergedInto);
  }
  const resolved = new Map<string, string>();
  for (const start of next.keys()) {
    let id = start;
    const seen = new Set<string>();
    while (next.has(id) && !seen.has(id)) {
      seen.add(id);
      id = next.get(id)!;
    }
    if (id !== start) resolved.set(start, id);
  }
  return resolved;
}

/**
 * File every mark on this device under the live student and circuit records.
 *
 * A mark in the cloud keeps the ids it was scored against, forever. When two
 * devices' records for one student or one circuit are merged, the retired one
 * records `mergedInto`, and this resolves marks against it — whether they were
 * scored here, refiled by a merge here, or pulled down from another device.
 * Without it, a mark pulled for a report could sit on a retired record and show
 * the student as "MERGED-…", or as missing.
 *
 * The local copy of a sent mark may therefore name a different id from the
 * cloud copy. That is intended; the cloud copy is what was recorded, and the
 * local copy is what it means now.
 */
async function settleMarks(): Promise<number> {
  const candidateSurvivor = survivorMap(await db.candidates.toArray());
  const circuitSurvivor = survivorMap(await db.circuits.toArray());
  if (candidateSurvivor.size === 0 && circuitSurvivor.size === 0) return 0;

  const moved: Evaluation[] = [];
  for (const mark of await db.evaluations.toArray()) {
    const candidateId = candidateSurvivor.get(mark.candidateId) ?? mark.candidateId;
    const circuitId = circuitSurvivor.get(mark.circuitId) ?? mark.circuitId;
    if (candidateId !== mark.candidateId || circuitId !== mark.circuitId) {
      moved.push({ ...mark, candidateId, circuitId });
    }
  }
  if (moved.length > 0) await db.evaluations.bulkPut(moved);
  return moved.length;
}

/**
 * Retire a duplicate record, releasing the college ID for the survivor to hold.
 *
 * Written as a tombstone rather than deleted outright, and pushed up like any
 * other change, so every other device learns that this uuid is dead instead of
 * rediscovering the duplicate on every sync forever.
 */
async function retireDuplicateCandidate(
  duplicate: Candidate,
  survivorId: string
): Promise<void> {
  const now = new Date();
  await repointCandidate(duplicate.id, survivorId);
  await db.candidates.put({
    ...duplicate,
    candidateNumber: `MERGED-${duplicate.id.slice(0, 8)}`,
    mergedInto: survivorId,
    deleted: true,
    deletedAt: now,
    updatedAt: now,
  });
}

/** Union of enrolments, because two devices enrolling into two exams are both right. */
function mergeExamIds(a?: string[], b?: string[]): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

export async function mergeCloudCandidates(): Promise<{
  added: number;
  updated: number;
  duplicatesResolved: number;
}> {
  if (!isFirebaseConfigured()) {
    return { added: 0, updated: 0, duplicatesResolved: 0 };
  }

  const cloudCandidates = (await fetchCollection(COLLECTIONS.candidates)).map((d) => ({
    ...(d as unknown as Candidate),
    registeredAt: fromTimestamp(d.registeredAt as Timestamp | null),
    updatedAt: fromTimestamp(d.updatedAt as Timestamp | null),
    deletedAt: fromTimestamp(d.deletedAt as Timestamp | null),
  }));

  let added = 0;
  let updated = 0;
  let duplicatesResolved = 0;

  for (const cloud of cloudCandidates) {
    const number = normalizeCandidateNumber(cloud.candidateNumber);
    const sameId = await db.candidates.get(cloud.id);

    if (sameId) {
      // Same record on both sides. Enrolment merges; everything else is
      // last-write-wins.
      const examIds = mergeExamIds(sameId.examIds, cloud.examIds);
      const winner = isNewer(cloud.updatedAt, sameId.updatedAt) ? cloud : sameId;
      const gainedEnrolment = examIds.length > (sameId.examIds?.length ?? 0);
      if (winner === cloud || gainedEnrolment) {
        await db.candidates.put({ ...winner, examIds });
        updated++;
      }
      continue;
    }

    const sameNumber = number ? await getCandidateByNumber(number) : undefined;

    if (!sameNumber) {
      await db.candidates.add(cloud);
      added++;
      continue;
    }

    // One student, two uuids. Lowest wins, everywhere, without a vote.
    const examIds = mergeExamIds(sameNumber.examIds, cloud.examIds);
    duplicatesResolved++;

    const survivor = sameNumber.id < cloud.id ? sameNumber : cloud;
    const loser = sameNumber.id < cloud.id ? cloud : sameNumber;

    if (survivor === sameNumber) {
      await db.candidates.put({
        ...sameNumber,
        examIds,
        deleted: sameNumber.deleted && cloud.deleted,
        updatedAt: new Date(),
      });
      await retireDuplicateCandidate(loser, survivor.id);
      continue;
    }

    // The cloud's uuid wins: the local record steps aside, handing over its
    // college ID along with its check-ins and marks. Retire first — the unique
    // index allows only one holder of the number at a time.
    await retireDuplicateCandidate(loser, survivor.id);
    await db.candidates.put({
      ...cloud,
      examIds,
      deleted: sameNumber.deleted && cloud.deleted,
      updatedAt: new Date(),
    });
  }

  // A retirement can also arrive ready-made from the cloud, replacing a record
  // this device still had marks on, without passing through the merge above.
  await settleMarks();

  return { added, updated, duplicatesResolved };
}

/**
 * Collapse circuits that two devices created independently for the same exam
 * and number. The lowest id wins so every device reaches the same answer
 * without coordinating, and everything pointing at a loser is repointed before
 * it is tombstoned.
 */
export async function dedupeCircuits(): Promise<number> {
  const circuits = (await db.circuits.toArray()).filter((c) => !c.deleted);
  const byKey = new Map<string, Circuit[]>();
  for (const circuit of circuits) {
    const key = `${circuit.examId}::${circuit.circuitNumber}`;
    byKey.set(key, [...(byKey.get(key) ?? []), circuit]);
  }

  let resolved = 0;
  const now = new Date();

  for (const group of byKey.values()) {
    if (group.length < 2) continue;

    const [winner, ...losers] = [...group].sort((a, b) => a.id.localeCompare(b.id));

    for (const loser of losers) {
      const checkIns = await db.checkIns.filter((c) => c.circuitId === loser.id).toArray();
      // A student may already be in the winning circuit from the other device;
      // repointing both would leave two assignments for one person.
      const winnerCandidates = new Set(
        (await db.checkIns.filter((c) => c.circuitId === winner.id && !c.deleted).toArray())
          .map((c) => c.candidateId)
      );
      for (const checkIn of checkIns) {
        const duplicate = winnerCandidates.has(checkIn.candidateId);
        await db.checkIns.put({
          ...checkIn,
          circuitId: winner.id,
          deleted: checkIn.deleted || duplicate,
          deletedAt: duplicate ? now : checkIn.deletedAt,
          updatedAt: now,
          synced: false,
        });
        if (!duplicate) winnerCandidates.add(checkIn.candidateId);
      }

      // Refiled locally only — a sent mark is write-once. See repointCandidate.
      const evaluations = await db.evaluations.filter((e) => e.circuitId === loser.id).toArray();
      for (const evaluation of evaluations) {
        await db.evaluations.update(evaluation.id, { circuitId: winner.id });
      }

      await db.circuits.update(loser.id, {
        deleted: true,
        deletedAt: now,
        updatedAt: now,
        mergedInto: winner.id,
      });
      resolved++;
    }
  }

  return resolved;
}
