import Dexie, { type EntityTable } from 'dexie';
import type {
  ExamTemplate,
  Candidate,
  Circuit,
  Evaluation,
  ExamSession,
  AppSettings,
} from '../types';

// Database schema for OSCE App
class OSCEDatabase extends Dexie {
  // Tables
  examTemplates!: EntityTable<ExamTemplate, 'id'>;
  candidates!: EntityTable<Candidate, 'id'>;
  circuits!: EntityTable<Circuit, 'id'>;
  evaluations!: EntityTable<Evaluation, 'id'>;
  examSessions!: EntityTable<ExamSession, 'id'>;
  settings!: EntityTable<AppSettings & { id: string }, 'id'>;

  constructor() {
    super('OSCEDatabase');

    this.version(1).stores({
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

      // Settings: single settings object
      settings: 'id',
    });
  }
}

// Create database instance
export const db = new OSCEDatabase();

// Helper functions for common operations

// Get all unsynced evaluations
export async function getUnsyncedEvaluations(): Promise<Evaluation[]> {
  return db.evaluations.where('synced').equals(0).toArray();
}

// Mark evaluation as synced
export async function markEvaluationSynced(id: string): Promise<void> {
  await db.evaluations.update(id, { synced: true, syncedAt: new Date() });
}

// Get active exam session
export async function getActiveSession(): Promise<ExamSession | undefined> {
  return db.examSessions.where('isActive').equals(1).first();
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

// Get candidate by QR code (candidate number)
export async function getCandidateByNumber(
  candidateNumber: string
): Promise<Candidate | undefined> {
  return db.candidates.where('candidateNumber').equals(candidateNumber).first();
}

// Get or create default settings
export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('default');
  if (settings) {
    const { id, ...rest } = settings;
    return rest;
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
  ], async () => {
    await db.examTemplates.clear();
    await db.candidates.clear();
    await db.circuits.clear();
    await db.evaluations.clear();
    await db.examSessions.clear();
  });
}

export default db;
