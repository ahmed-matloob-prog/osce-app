import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreInstance, isFirebaseConfigured, initializeFirebase } from '../services/firebase';
import { db, getUnsyncedEvaluations, markEvaluationSynced } from './schema';
import type { Evaluation, ExamTemplate, Candidate } from '../types';

// Collection names in Firestore
const COLLECTIONS = {
  evaluations: 'evaluations',
  exams: 'exams',
  candidates: 'candidates',
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
        batch.set(docRef, {
          ...evaluation,
          startTime: toTimestamp(evaluation.startTime),
          endTime: toTimestamp(evaluation.endTime),
          syncedAt: serverTimestamp(),
          synced: true,
        });
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
      batch.set(docRef, {
        ...exam,
        createdAt: toTimestamp(exam.createdAt),
        updatedAt: serverTimestamp(),
      });
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
      batch.set(docRef, candidate);
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
    const evaluationsRef = collection(firestore, COLLECTIONS.evaluations);
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
    const examsRef = collection(firestore, COLLECTIONS.exams);
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
 * Full bidirectional sync
 * 1. Push local changes to cloud
 * 2. Pull cloud changes to local
 */
export async function fullSync(): Promise<{
  success: boolean;
  evaluationsSynced: number;
  examsAdded: number;
  examsUpdated: number;
  error?: string;
}> {
  try {
    // Push evaluations to cloud
    const evalResult = await syncEvaluationsToCloud();

    if (!evalResult.success && !evalResult.error?.includes('not configured')) {
      return {
        success: false,
        evaluationsSynced: 0,
        examsAdded: 0,
        examsUpdated: 0,
        error: evalResult.error,
      };
    }

    // Pull exams from cloud
    const mergeResult = await mergeCloudExamsWithLocal();

    // Push local exams to cloud
    const localExams = await db.examTemplates.toArray();
    await syncExamsToCloud(localExams);

    // Push candidates to cloud
    const localCandidates = await db.candidates.toArray();
    await syncCandidatesToCloud(localCandidates);

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
