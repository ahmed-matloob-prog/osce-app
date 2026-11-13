import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/schema';
import { useSyncStore } from './syncStore';
import type {
  ExamTemplate,
  Station,
  Circuit,
  Evaluation,
  ExamSession,
  ItemScore,
  IdentificationMethod,
} from '../types';

interface ExamState {
  // Current data
  exams: ExamTemplate[];
  /** Soft-deleted exams, so a deletion can be looked at and undone. */
  deletedExams: ExamTemplate[];
  circuits: Circuit[];
  currentSession: ExamSession | null;
  currentEvaluation: Evaluation | null;

  // Loading states
  isLoading: boolean;

  // Actions - Exams
  loadExams: () => Promise<void>;
  addExam: (exam: Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ExamTemplate>;
  updateExam: (id: string, updates: Partial<ExamTemplate>) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;
  loadDeletedExams: () => Promise<void>;
  restoreExam: (id: string) => Promise<void>;

  // Actions - Circuits
  loadCircuits: (examId: string) => Promise<void>;
  addCircuit: (circuit: Omit<Circuit, 'id'>) => Promise<Circuit>;
  updateCircuit: (id: string, updates: Partial<Circuit>) => Promise<void>;
  deleteCircuit: (id: string) => Promise<void>;

  // Actions - Session
  startSession: (session: Omit<ExamSession, 'id' | 'startedAt' | 'isActive'>) => Promise<void>;
  endSession: () => Promise<void>;
  /** Restore the active session from the database after a reload. */
  resumeSession: () => Promise<ExamSession | null>;

  // Actions - Evaluation
  startEvaluation: (
    candidateId: string,
    station: Station,
    identifiedBy: IdentificationMethod,
    scoredOutsideCircuit?: boolean,
    supersedes?: string
  ) => void;
  updateScore: (itemId: string, score: number) => void;
  setGlobalRating: (rating: number) => void;
  setNotes: (notes: string) => void;
  submitEvaluation: () => Promise<void>;
  clearCurrentEvaluation: () => void;
}

export const useExamStore = create<ExamState>((set, get) => ({
  exams: [],
  deletedExams: [],
  circuits: [],
  currentSession: null,
  currentEvaluation: null,
  isLoading: false,

  // Load all exams from database
  loadExams: async () => {
    set({ isLoading: true });
    try {
      const exams = (await db.examTemplates.toArray()).filter((e) => !e.deleted);
      set({ exams, isLoading: false });
    } catch (error) {
      console.error('Failed to load exams:', error);
      set({ isLoading: false });
    }
  },

  // Add a new exam
  addExam: async (examData) => {
    const exam: ExamTemplate = {
      ...examData,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.examTemplates.add(exam);
    set((state) => ({ exams: [...state.exams, exam] }));
    useSyncStore.getState().syncInBackground();
    return exam;
  },

  // Update an exam
  updateExam: async (id, updates) => {
    const updatedData = { ...updates, updatedAt: new Date() };
    await db.examTemplates.update(id, updatedData);
    set((state) => ({
      exams: state.exams.map((e) =>
        e.id === id ? { ...e, ...updatedData } : e
      ),
    }));
    // Send the change now. An admin device rarely has marks waiting, so the
    // timed retry never fires there, and an edit made mid-exam would otherwise
    // wait for somebody to reload the page before any tablet saw it.
    useSyncStore.getState().syncInBackground();
  },

  // Delete an exam
  // Soft delete. Removing the row achieved nothing: sync pushes every local
  // exam up on each run, so any device that still held a copy re-created it.
  // Marking it deleted lets the deletion travel, and bumping updatedAt makes
  // the merge treat it as the newer version on every other device.
  deleteExam: async (id) => {
    await db.examTemplates.update(id, {
      deleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
    set((state) => ({
      exams: state.exams.filter((e) => e.id !== id),
    }));
    useSyncStore.getState().syncInBackground();
  },

  // What has been deleted, so it can be reviewed and undone. Deleting an exam
  // template is not something anyone should have to be brave about.
  loadDeletedExams: async () => {
    const deletedExams = (await db.examTemplates.toArray()).filter((e) => e.deleted);
    set({ deletedExams });
  },

  restoreExam: async (id) => {
    // Bumping updatedAt is what carries the restore to other devices, the
    // same way the deletion travelled.
    await db.examTemplates.update(id, {
      deleted: false,
      deletedAt: undefined,
      updatedAt: new Date(),
    });
    const restored = await db.examTemplates.get(id);
    set((state) => ({
      exams: restored ? [...state.exams, restored] : state.exams,
      deletedExams: state.deletedExams.filter((e) => e.id !== id),
    }));
    useSyncStore.getState().syncInBackground();
  },

  // Load circuits for an exam
  loadCircuits: async (examId) => {
    const circuits = (await db.circuits.where('examId').equals(examId).toArray()).filter((c) => !c.deleted);
    set({ circuits });
  },

  // Add a circuit
  addCircuit: async (circuitData) => {
    const circuit: Circuit = {
      ...circuitData,
      id: uuidv4(),
      updatedAt: new Date(),
    };
    await db.circuits.add(circuit);
    set((state) => ({ circuits: [...state.circuits, circuit] }));
    return circuit;
  },

  // Update a circuit
  updateCircuit: async (id, updates) => {
    await db.circuits.update(id, { ...updates, updatedAt: new Date() });
    set((state) => ({
      circuits: state.circuits.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  // Delete a circuit
  deleteCircuit: async (id) => {
    const now = new Date();
    await db.circuits.update(id, { deleted: true, deletedAt: now, updatedAt: now });
    set((state) => ({
      circuits: state.circuits.filter((c) => c.id !== id),
    }));
  },

  // Start an exam session
  startSession: async (sessionData) => {
    // End any session still marked active.
    //
    // Filtered rather than indexed: IndexedDB has no boolean key type, so
    // `where('isActive').equals(1)` matched nothing and no session was ever
    // closed. They accumulated, every one of them still flagged active — so a
    // device that moved between exams left a trail of sessions claiming to be
    // running. Plural, because there is very likely a backlog to clear.
    const stale = await db.examSessions.filter((s) => s.isActive).toArray();
    for (const session of stale) {
      await db.examSessions.update(session.id, { isActive: false });
    }

    const session: ExamSession = {
      ...sessionData,
      id: uuidv4(),
      startedAt: new Date(),
      isActive: true,
    };
    await db.examSessions.add(session);
    set({ currentSession: session });
  },

  // Pick up a session the page lost by reloading.
  //
  // The session used to live only in memory, while its row stayed flagged
  // active. A phone browser reloads a background tab whenever it likes, and a
  // scanned card is itself a page load — after either, the examiner was told
  // "No Active Session" while the device still believed one was running, which
  // then blocked scanning a card and clearing the device. The unscored student
  // in progress is not recovered; every submitted mark already is.
  resumeSession: async () => {
    const existing = get().currentSession;
    if (existing) return existing;
    const active = await db.examSessions.filter((s) => s.isActive).first();
    if (active) set({ currentSession: active });
    return active ?? null;
  },

  // End current session — and any other row still flagged active, so a session
  // this page never knew about cannot outlive the End Session button.
  endSession: async () => {
    const stale = await db.examSessions.filter((s) => s.isActive).toArray();
    for (const session of stale) {
      await db.examSessions.update(session.id, { isActive: false });
    }
    set({ currentSession: null, currentEvaluation: null });
  },

  // Start evaluating a candidate
  startEvaluation: (candidateId, station, identifiedBy, scoredOutsideCircuit, supersedes) => {
    const { currentSession } = get();
    if (!currentSession) return;

    // Initialize scores with null (unanswered)
    const scores: ItemScore[] = station.checklistItems.map((item) => ({
      itemId: item.id,
      score: -1, // -1 means not scored yet
    }));

    const maxPossibleScore = station.checklistItems.reduce(
      (sum, item) => sum + item.maxScore,
      0
    );

    const evaluation: Evaluation = {
      id: uuidv4(),
      examId: currentSession.examId,
      circuitId: currentSession.circuitId,
      candidateId,
      stationId: station.id,
      examinerName: currentSession.examinerName,
      identifiedBy,
      scoredOutsideCircuit: scoredOutsideCircuit || undefined,
      supersedes,
      scores,
      notes: '',
      startTime: new Date(),
      totalScore: 0,
      maxPossibleScore,
      synced: false,
    };

    set({ currentEvaluation: evaluation });
  },

  // Update a score for an item
  updateScore: (itemId, score) => {
    set((state) => {
      if (!state.currentEvaluation) return state;

      const newScores = state.currentEvaluation.scores.map((s) =>
        s.itemId === itemId ? { ...s, score } : s
      );

      // Calculate total (only count scored items)
      const totalScore = newScores.reduce(
        (sum, s) => sum + (s.score >= 0 ? s.score : 0),
        0
      );

      return {
        currentEvaluation: {
          ...state.currentEvaluation,
          scores: newScores,
          totalScore,
        },
      };
    });
  },

  // Set global rating
  setGlobalRating: (rating) => {
    set((state) => {
      if (!state.currentEvaluation) return state;
      return {
        currentEvaluation: {
          ...state.currentEvaluation,
          globalRating: rating,
        },
      };
    });
  },

  // Set notes
  setNotes: (notes) => {
    set((state) => {
      if (!state.currentEvaluation) return state;
      return {
        currentEvaluation: {
          ...state.currentEvaluation,
          notes,
        },
      };
    });
  },

  // Submit the current evaluation
  submitEvaluation: async () => {
    const { currentEvaluation } = get();
    if (!currentEvaluation) return;

    const finalEvaluation: Evaluation = {
      ...currentEvaluation,
      endTime: new Date(),
    };

    await db.evaluations.add(finalEvaluation);
    set({ currentEvaluation: null });

    // Get a second copy off this device as soon as possible, without making
    // the examiner wait for it. Not awaited: the mark is already durable in
    // IndexedDB, and the next candidate should not be held up by the network.
    useSyncStore.getState().syncInBackground();
  },

  // Clear current evaluation without saving
  clearCurrentEvaluation: () => {
    set({ currentEvaluation: null });
  },
}));
