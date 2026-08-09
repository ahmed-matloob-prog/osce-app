import Dexie, { type EntityTable } from 'dexie';
import type {
  ExamTemplate,
  Candidate,
  Circuit,
  Evaluation,
  ExamSession,
  AppSettings,
  CheckIn,
} from '../types';
import { normalizeCandidateNumber } from '../utils/qrUtils';

export { normalizeCandidateNumber };

// Database schema for OSCE App
class OSCEDatabase extends Dexie {
  // Tables
  examTemplates!: EntityTable<ExamTemplate, 'id'>;
  candidates!: EntityTable<Candidate, 'id'>;
  circuits!: EntityTable<Circuit, 'id'>;
  evaluations!: EntityTable<Evaluation, 'id'>;
  examSessions!: EntityTable<ExamSession, 'id'>;
  checkIns!: EntityTable<CheckIn, 'id'>;
  settings!: EntityTable<AppSettings & { id: string }, 'id'>;

  constructor() {
    super('OSCEDatabase');

    this.version(2).stores({
      // ExamTemplate: indexed by id, searchable by name, filterable by lock status
      examTemplates: 'id, name, createdAt, updatedAt, isLocked, pinEnabled',

      // Candidate: indexed by id and candidateNumber (for QR scanning)
      candidates: 'id, candidateNumber, name, group, stage',

      // Circuit: indexed by id and examId
      circuits: 'id, examId, circuitNumber',

      // Evaluation: indexed for queries by exam, candidate, station, sync status
      evaluations: 'id, examId, circuitId, candidateId, stationId, synced, startTime',

      // ExamSession: active session tracking
      examSessions: 'id, examId, isActive',

      // CheckIn: track student check-ins per circuit
      checkIns: 'id, examId, circuitId, candidateId, candidateNumber, synced, checkedInAt',

      // Settings: single settings object
      settings: 'id',
    });

    // Version 3
    // -------------------------------------------------------------------
    // Declares the compound indexes the query helpers below had always been
    // asking for. Without them every `where('[examId+candidateId]')` call
    // threw a SchemaError, which is why check-in could never store a row.
    //
    // Also normalises candidate numbers and collapses duplicates, so that
    // version 4 can safely make the number unique.
    this.version(3)
      .stores({
        evaluations:
          'id, examId, circuitId, candidateId, stationId, synced, startTime, [examId+circuitId]',
        checkIns:
          'id, examId, circuitId, candidateId, candidateNumber, synced, checkedInAt, ' +
          '[examId+circuitId], [examId+candidateId], [examId+candidateNumber]',
      })
      .upgrade(async (tx) => {
        const candidates = await tx.table('candidates').toArray();

        const survivorByNumber = new Map<string, Candidate>();
        const remap = new Map<string, string>(); // duplicate id -> surviving id

        for (const candidate of candidates) {
          // A candidate with no number cannot take part in a unique index and
          // must not be merged with another numberless student, so give it a
          // placeholder the admin can spot and correct.
          const number =
            normalizeCandidateNumber(candidate.candidateNumber) ||
            `UNKNOWN-${candidate.id.slice(0, 8)}`;

          const survivor = survivorByNumber.get(number);
          if (!survivor) {
            survivorByNumber.set(number, candidate);
            if (number !== candidate.candidateNumber) {
              await tx.table('candidates').update(candidate.id, { candidateNumber: number });
            }
            continue;
          }
          remap.set(candidate.id, survivor.id);
        }

        if (remap.size === 0) return;

        // Evaluations and check-ins point at candidates by id. Deleting a
        // duplicate without repointing them would orphan real exam results.
        for (const tableName of ['evaluations', 'checkIns'] as const) {
          const rows = await tx.table(tableName).toArray();
          for (const row of rows) {
            const survivingId = remap.get(row.candidateId);
            if (survivingId) {
              await tx.table(tableName).update(row.id, { candidateId: survivingId });
            }
          }
        }

        await tx.table('candidates').bulkDelete([...remap.keys()]);
        console.warn(
          `[db] merged ${remap.size} duplicate candidate record(s) by candidate number`
        );
      });

    // Version 4
    // -------------------------------------------------------------------
    // The candidate number is the college ID: externally assigned, unique by
    // institutional policy, and the thing printed on the badge. Enforce it
    // here so no import, manual entry or sync can introduce a collision.
    // Split from version 3 so the de-duplication above has already run.
    this.version(4).stores({
      candidates: 'id, &candidateNumber, name, group, stage',
    });

    // Version 5
    // -------------------------------------------------------------------
    // Candidates used to be a single global pool: every exam saw every
    // student. Printing badges for one exam printed the whole database, and an
    // examiner could pick anybody from any cohort.
    //
    // A candidate is now enrolled in exams. Not owned by one — students resit,
    // and sit different exams in later terms, and they must stay one person
    // with one college ID so their identity and their history hold together.
    // `*examIds` is a multiEntry index, so `where('examIds').equals(examId)`
    // is a real indexed lookup rather than a scan.
    this.version(5)
      .stores({
        candidates: 'id, &candidateNumber, *examIds, name, group, stage',
      })
      .upgrade(async (tx) => {
        // Anyone already on file predates enrolment, so there is no way to
        // know which exam they belong to. Enrol them everywhere: that keeps
        // behaviour identical to before the upgrade, and nobody vanishes from
        // a list they were in yesterday. Re-importing per exam tidies it up.
        const examIds = (await tx.table('examTemplates').toArray()).map((e) => e.id);
        const candidates = await tx.table('candidates').toArray();

        for (const candidate of candidates) {
          if (candidate.examIds?.length) continue;
          await tx.table('candidates').update(candidate.id, { examIds });
        }

        if (candidates.length) {
          console.warn(
            `[db] enrolled ${candidates.length} existing candidate(s) into all ${examIds.length} exam(s)`
          );
        }
      });
  }
}


// Create database instance
export const db = new OSCEDatabase();

// Helper functions for common operations

// Get all unsynced evaluations
//
// Filtered in memory rather than by index on purpose. IndexedDB has no boolean
// key type, so a record with `synced: false` is left out of the `synced` index
// entirely — the old `where('synced').equals(0)` matched nothing, ever, which
// meant no evaluation was ever offered to the cloud and the pending count was
// permanently zero.
export async function getUnsyncedEvaluations(): Promise<Evaluation[]> {
  return db.evaluations.filter((evaluation) => !evaluation.synced).toArray();
}

// Mark evaluation as synced
export async function markEvaluationSynced(id: string): Promise<void> {
  await db.evaluations.update(id, { synced: true, syncedAt: new Date() });
}

// Get active exam session (see the note on getUnsyncedEvaluations — booleans
// are not indexable, so this has to be a scan)
export async function getActiveSession(): Promise<ExamSession | undefined> {
  return db.examSessions.filter((session) => session.isActive).first();
}

// Get evaluations for a specific exam and circuit
export async function getEvaluationsForCircuit(
  examId: string,
  circuitId: string
): Promise<Evaluation[]> {
  return db.evaluations
    .where('[examId+circuitId]')
    .equals([examId, circuitId])
    .toArray();
}

// Get candidate by QR code / college ID
export async function getCandidateByNumber(
  candidateNumber: string
): Promise<Candidate | undefined> {
  // Includes soft-deleted records on purpose: they still hold the unique
  // college ID, so callers need to see them in order to revive rather than
  // fail on the index. Callers that want live students filter on `deleted`.
  return db.candidates
    .where('candidateNumber')
    .equals(normalizeCandidateNumber(candidateNumber))
    .first();
}

// Get or create default settings
export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('default');
  if (settings) {
    const { language, autoSync, soundAlerts, timerWarningSeconds } = settings;
    return { language, autoSync, soundAlerts, timerWarningSeconds };
  }

  // Default settings
  const defaultSettings: AppSettings = {
    language: 'en',
    autoSync: true,
    soundAlerts: true,
    timerWarningSeconds: 60,
  };

  await db.settings.put({ id: 'default', ...defaultSettings });
  return defaultSettings;
}

// Update settings
export async function updateSettings(
  updates: Partial<AppSettings>
): Promise<void> {
  await db.settings.update('default', updates);
}

// Clear all data (for testing/reset)
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [
    db.examTemplates,
    db.candidates,
    db.circuits,
    db.evaluations,
    db.examSessions,
    db.checkIns,
  ], async () => {
    await db.examTemplates.clear();
    await db.candidates.clear();
    await db.circuits.clear();
    await db.evaluations.clear();
    await db.examSessions.clear();
    await db.checkIns.clear();
  });
}

// Check-in helper functions

// Get all check-ins for a circuit
export async function getCheckInsForCircuit(
  examId: string,
  circuitId: string
): Promise<CheckIn[]> {
  return (await db.checkIns
    .where('[examId+circuitId]')
    .equals([examId, circuitId])
    .toArray()).filter((c) => !c.deleted);
}

// Get check-in by candidate number for an exam
export async function getCheckInByCandidate(
  examId: string,
  candidateNumber: string
): Promise<CheckIn | undefined> {
  return (await db.checkIns
    .where('[examId+candidateNumber]')
    .equals([examId, candidateNumber])
    .toArray()).find((c) => !c.deleted);
}

// Check if candidate is already checked in to any circuit
export async function isAlreadyCheckedIn(
  examId: string,
  candidateId: string
): Promise<CheckIn | undefined> {
  return (await db.checkIns
    .where('[examId+candidateId]')
    .equals([examId, candidateId])
    .toArray()).find((c) => !c.deleted);
}

// Get unsynced check-ins (same boolean-index caveat as above)
export async function getUnsyncedCheckIns(): Promise<CheckIn[]> {
  return db.checkIns.filter((checkIn) => !checkIn.synced).toArray();
}

// Mark check-in as synced
export async function markCheckInSynced(id: string): Promise<void> {
  await db.checkIns.update(id, { synced: true, syncedAt: new Date() });
}

// Update stations completed for a check-in
export async function updateStationsCompleted(
  checkInId: string,
  stationId: string
): Promise<void> {
  const checkIn = await db.checkIns.get(checkInId);
  if (checkIn) {
    const stationsCompleted = checkIn.stationsCompleted || [];
    if (!stationsCompleted.includes(stationId)) {
      stationsCompleted.push(stationId);
      await db.checkIns.update(checkInId, { stationsCompleted });
    }
  }
}

export default db;
