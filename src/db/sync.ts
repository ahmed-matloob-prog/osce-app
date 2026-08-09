import {
  collection as collection_,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreInstance, isFirebaseConfigured, initializeFirebase } from '../services/firebase';
import {
  db,
  getUnsyncedEvaluations,
  markEvaluationSynced,
  getCandidateByNumber,
  normalizeCandidateNumber,
} from './schema';
import type { Evaluation, ExamTemplate, Candidate, Circuit, CheckIn } from '../types';

// Collection names in Firestore
const COLLECTIONS = {
  evaluations: 'evaluations',
  exams: 'exams',
  candidates: 'candidates',
  circuits: 'circuits',
  checkIns: 'checkIns',
} as const;

/**
 * Convert Date to Firestore Timestamp
 */
function toTimestamp(date: Date | undefined): Timestamp | null {
  return date ? Timestamp.fromDate(date) : null;
}

/**
 * Convert Firestore Timestamp to Date
 */
function fromTimestamp(timestamp: Timestamp | null | undefined): Date | undefined {
  return timestamp ? timestamp.toDate() : undefined;
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

  try {
    const unsynced = await getUnsyncedEvaluations();

    if (unsynced.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Use batch writes for efficiency (max 500 per batch)
    const batchSize = 500;
    let syncedCount = 0;

    for (let i = 0; i < unsynced.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = unsynced.slice(i, i + batchSize);

      for (const evaluation of chunk) {
        const docRef = doc(firestore, COLLECTIONS.evaluations, evaluation.id);
        batch.set(
          docRef,
          stripUndefined({
            ...evaluation,
            startTime: toTimestamp(evaluation.startTime),
            endTime: toTimestamp(evaluation.endTime),
            syncedAt: serverTimestamp(),
            synced: true,
          })
        );
      }

      await batch.commit();

      // Mark as synced in local DB
      for (const evaluation of chunk) {
        await markEvaluationSynced(evaluation.id);
      }

      syncedCount += chunk.length;
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
    const batch = writeBatch(firestore);

    for (const exam of exams) {
      const docRef = doc(firestore, COLLECTIONS.exams, exam.id);
      batch.set(
        docRef,
        stripUndefined({
          ...exam,
          createdAt: toTimestamp(exam.createdAt),
          deletedAt: toTimestamp(exam.deletedAt),
          updatedAt: serverTimestamp(),
        })
      );
    }

    await batch.commit();
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
    const batch = writeBatch(firestore);

    for (const candidate of candidates) {
      const docRef = doc(firestore, COLLECTIONS.candidates, candidate.id);
      batch.set(
        docRef,
        stripUndefined({
          ...candidate,
          registeredAt: toTimestamp(candidate.registeredAt),
          updatedAt: toTimestamp(candidate.updatedAt),
          deletedAt: toTimestamp(candidate.deletedAt),
        })
      );
    }

    await batch.commit();
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

  try {
    const evaluationsRef = collection_(firestore, COLLECTIONS.evaluations);
    const q = query(evaluationsRef, where('examId', '==', examId));
    const snapshot = await getDocs(q);

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
  } catch (error) {
    console.error('Fetch evaluations from cloud failed:', error);
    return [];
  }
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
}> {
  const cloudExams = await fetchExamsFromCloud();
  let added = 0;
  let updated = 0;

  for (const cloudExam of cloudExams) {
    const localExam = await db.examTemplates.get(cloudExam.id);

    if (!localExam) {
      // New exam from cloud
      await db.examTemplates.put(cloudExam);
      added++;
    } else {
      // Check which is newer
      const cloudTime = cloudExam.updatedAt?.getTime() || 0;
      const localTime = localExam.updatedAt?.getTime() || 0;

      if (cloudTime > localTime) {
        await db.examTemplates.put(cloudExam);
        updated++;
      }
    }
  }

  return { added, updated };
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
  try {
    // Pull exams from cloud
    const mergeResult = await mergeCloudExamsWithLocal();

    // Push local exams to cloud
    const localExams = await db.examTemplates.toArray();
    await syncExamsToCloud(localExams);

    // Pull candidates down before pushing, so a tablet that has never seen the
    // roster gets one — and so college IDs are reconciled before this device's
    // own uuids are broadcast.
    await mergeCloudCandidates();

    // Push candidates to cloud
    const localCandidates = await db.candidates.toArray();
    await syncCandidatesToCloud(localCandidates);

    // Circuits and their assignments, so an examiner's tablet knows which
    // students belong at its station rather than offering the whole cohort.
    // This also collapses circuits two devices created independently.
    await syncCircuitsAndCheckIns();

    // Marks last — see the note above.
    const evalResult = await syncEvaluationsToCloud();

    if (!evalResult.success && !evalResult.error?.includes('not configured')) {
      return {
        success: false,
        evaluationsSynced: 0,
        examsAdded: mergeResult.added,
        examsUpdated: mergeResult.updated,
        error: evalResult.error,
      };
    }

    return {
      success: true,
      evaluationsSynced: evalResult.syncedCount,
      examsAdded: mergeResult.added,
      examsUpdated: mergeResult.updated,
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

  for (let i = 0; i < rows.length; i += 500) {
    const batch = writeBatch(firestore);
    for (const row of rows.slice(i, i + 500)) {
      batch.set(doc(firestore, collection, row.id), stripUndefined(toCloud(row)));
    }
    await batch.commit();
  }
}

async function fetchCollection(collection: string): Promise<Record<string, unknown>[]> {
  if (!isFirebaseConfigured()) return [];
  await initializeFirebase();
  const firestore = getFirestoreInstance();
  if (!firestore) return [];

  const snapshot = await getDocs(collection_(firestore, collection));
  return snapshot.docs.map((d) => d.data() as Record<string, unknown>);
}

/** Newest wins, using updatedAt. A record with no timestamp is treated as oldest. */
function isNewer(a?: Date, b?: Date): boolean {
  return (a?.getTime() ?? 0) > (b?.getTime() ?? 0);
}

export async function syncCircuitsAndCheckIns(): Promise<{
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

  // --- push ---------------------------------------------------------------
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

  return { circuitsMerged, checkInsMerged, duplicateCircuitsResolved };
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

  const evaluations = await db.evaluations.filter((e) => e.candidateId === fromId).toArray();
  for (const evaluation of evaluations) {
    await db.evaluations.update(evaluation.id, { candidateId: toId, synced: false });
  }
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

      const evaluations = await db.evaluations.filter((e) => e.circuitId === loser.id).toArray();
      for (const evaluation of evaluations) {
        await db.evaluations.update(evaluation.id, { circuitId: winner.id, synced: false });
      }

      await db.circuits.update(loser.id, { deleted: true, deletedAt: now, updatedAt: now });
      resolved++;
    }
  }

  return resolved;
}
