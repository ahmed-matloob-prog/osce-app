import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db, getCandidateByNumber, normalizeCandidateNumber } from '../db/schema';
import type { Candidate } from '../types';

export interface ImportResult {
  added: number;
  /** Already on file, and now enrolled in this exam rather than duplicated. */
  enrolled: number;
  /** College IDs already enrolled in this exam, or missing from the row. */
  skipped: string[];
}

export interface ProvisionalInput {
  examId: string;
  candidateNumber: string;
  name: string;
  nameAr?: string;
  group?: string;
  registeredBy: string;
  registeredWhere: 'station' | 'check-in';
}

/**
 * Either a new provisional record, or the student who already holds that
 * college ID — so the UI can offer them instead of creating a second record.
 */
export type ProvisionalResult =
  | { status: 'created'; candidate: Candidate }
  | { status: 'already-exists'; candidate: Candidate };

interface CandidateState {
  candidates: Candidate[];
  /** Soft-deleted students, so "delete all" is not a one-way door. */
  deletedCandidates: Candidate[];
  isLoading: boolean;

  // Actions
  loadCandidates: () => Promise<void>;
  addCandidate: (candidate: Omit<Candidate, 'id'>) => Promise<Candidate>;
  updateCandidate: (id: string, updates: Partial<Candidate>) => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  importCandidates: (examId: string, candidates: Omit<Candidate, 'id'>[]) => Promise<ImportResult>;
  registerProvisional: (input: ProvisionalInput) => Promise<ProvisionalResult>;
  confirmProvisional: (id: string) => Promise<void>;
  findByNumber: (candidateNumber: string) => Promise<Candidate | undefined>;
  clearAll: () => Promise<void>;
  loadDeletedCandidates: () => Promise<void>;
  restoreDeletedCandidates: () => Promise<{ restored: number; blocked: string[] }>;
}

export const useCandidateStore = create<CandidateState>((set) => ({
  candidates: [],
  deletedCandidates: [],
  isLoading: false,

  // Load all candidates
  loadCandidates: async () => {
    set({ isLoading: true });
    try {
      const candidates = (await db.candidates.toArray()).filter((c) => !c.deleted);
      set({ candidates, isLoading: false });
    } catch (error) {
      console.error('Failed to load candidates:', error);
      set({ isLoading: false });
    }
  },

  // Add a single candidate
  addCandidate: async (candidateData) => {
    const candidate: Candidate = {
      ...candidateData,
      candidateNumber: normalizeCandidateNumber(candidateData.candidateNumber),
      id: uuidv4(),
      updatedAt: new Date(),
    };
    // The unique index on candidateNumber makes this throw on a collision
    // rather than quietly creating a second record for the same student.
    await db.candidates.add(candidate);
    set((state) => ({ candidates: [...state.candidates, candidate] }));
    return candidate;
  },

  // Update a candidate
  updateCandidate: async (id, updates) => {
    const stamped = { ...updates, updatedAt: new Date() };
    await db.candidates.update(id, stamped);
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, ...stamped } : c
      ),
    }));
  },

  // Delete a candidate
  // Soft delete, so the removal syncs up instead of the record being pushed
  // back the next time this device syncs. See the note on ExamTemplate.
  deleteCandidate: async (id) => {
    const now = new Date();
    await db.candidates.update(id, { deleted: true, deletedAt: now, updatedAt: now });
    set((state) => ({
      candidates: state.candidates.filter((c) => c.id !== id),
    }));
  },

  // Import multiple candidates (from CSV)
  // Import a roster into one exam.
  //
  // A student already on file is enrolled in this exam rather than duplicated,
  // so a returning cohort keeps its existing records — and any names corrected
  // in the app survive into the next term. Only someone already enrolled in
  // *this* exam is skipped, which keeps re-running the same file harmless
  // while still letting the same person appear in a second exam.
  //
  // Nothing is overwritten. An import must never silently replace a record
  // that was corrected by hand, and "47 of 47 skipped" is how you notice you
  // loaded last year's list.
  importCandidates: async (examId, candidatesData) => {
    const existing = await db.candidates.toArray();
    const byNumber = new Map(
      existing.map((c) => [normalizeCandidateNumber(c.candidateNumber), c])
    );

    const toAdd: Candidate[] = [];
    const toEnrol: Candidate[] = [];
    const skipped: string[] = [];
    const seenInFile = new Set<string>();

    for (const data of candidatesData) {
      const candidateNumber = normalizeCandidateNumber(data.candidateNumber);

      if (!candidateNumber || seenInFile.has(candidateNumber)) {
        skipped.push(data.candidateNumber || '(no college ID)');
        continue;
      }
      seenInFile.add(candidateNumber);

      const already = byNumber.get(candidateNumber);
      if (!already) {
        toAdd.push({
          ...data,
          candidateNumber,
          examIds: [examId],
          id: uuidv4(),
          updatedAt: new Date(),
        });
        continue;
      }

      // A soft-deleted record still holds the college ID, so importing that
      // student again has to bring them back rather than quietly do nothing.
      if (already.deleted) {
        toEnrol.push({
          ...already,
          ...data,
          candidateNumber,
          deleted: false,
          deletedAt: undefined,
          updatedAt: new Date(),
          examIds: [...new Set([...(already.examIds ?? []), examId])],
        });
        continue;
      }

      if (already.examIds?.includes(examId)) {
        skipped.push(data.candidateNumber);
        continue;
      }

      toEnrol.push({
        ...already,
        examIds: [...(already.examIds ?? []), examId],
        updatedAt: new Date(),
      });
    }

    if (toAdd.length > 0) await db.candidates.bulkAdd(toAdd);
    if (toEnrol.length > 0) await db.candidates.bulkPut(toEnrol);

    if (toAdd.length || toEnrol.length) {
      const enrolledById = new Map(toEnrol.map((c) => [c.id, c]));
      set((state) => ({
        candidates: [
          ...state.candidates.map((c) => enrolledById.get(c.id) ?? c),
          ...toAdd,
        ],
      }));
    }

    return { added: toAdd.length, enrolled: toEnrol.length, skipped };
  },

  // Register a student who is not on the roster — late registration on exam
  // day. Never blocks: the student is real and needs a mark. The record is
  // flagged provisional so an admin verifies the typed college ID afterwards.
  registerProvisional: async (input) => {
    const candidateNumber = normalizeCandidateNumber(input.candidateNumber);

    // If the ID is already taken, hand back that student rather than creating
    // a second record for them — the unique index would reject it anyway.
    // Enrol them in this exam first if they are not already, so choosing
    // "use this student" produces someone the roster can actually see.
    const existing = await getCandidateByNumber(candidateNumber);
    if (existing) {
      if (existing.deleted || !existing.examIds?.includes(input.examId)) {
        const enrolled = {
          ...existing,
          deleted: false,
          deletedAt: undefined,
          updatedAt: new Date(),
          examIds: [...new Set([...(existing.examIds ?? []), input.examId])],
        };
        await db.candidates.put(enrolled);
        set((state) => ({
          candidates: state.candidates.map((c) => (c.id === enrolled.id ? enrolled : c)),
        }));
        return { status: 'already-exists', candidate: enrolled };
      }
      return { status: 'already-exists', candidate: existing };
    }

    const candidate: Candidate = {
      id: uuidv4(),
      candidateNumber,
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || undefined,
      group: input.group?.trim() || undefined,
      examIds: [input.examId],
      provisional: true,
      registeredAt: new Date(),
      registeredBy: input.registeredBy,
      registeredWhere: input.registeredWhere,
      updatedAt: new Date(),
    };

    await db.candidates.add(candidate);
    set((state) => ({ candidates: [...state.candidates, candidate] }));
    return { status: 'created', candidate };
  },

  // Admin has checked the college ID against the college's records
  confirmProvisional: async (id) => {
    const updatedAt = new Date();
    await db.candidates.update(id, { provisional: false, updatedAt });
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, provisional: false, updatedAt } : c
      ),
    }));
  },

  loadDeletedCandidates: async () => {
    const deletedCandidates = (await db.candidates.toArray()).filter((c) => c.deleted);
    set({ deletedCandidates });
  },

  // Put every deleted student back.
  //
  // A restore can be blocked: if the college ID has since been taken by a live
  // record, putting this one back would break the unique index. Those are
  // reported by number rather than failing the whole operation.
  restoreDeletedCandidates: async () => {
    const all = await db.candidates.toArray();
    const liveNumbers = new Set(
      all.filter((c) => !c.deleted).map((c) => normalizeCandidateNumber(c.candidateNumber))
    );

    const restored: Candidate[] = [];
    const blocked: string[] = [];

    for (const candidate of all.filter((c) => c.deleted)) {
      const number = normalizeCandidateNumber(candidate.candidateNumber);
      if (liveNumbers.has(number)) {
        blocked.push(candidate.candidateNumber);
        continue;
      }
      liveNumbers.add(number);
      restored.push({
        ...candidate,
        deleted: false,
        deletedAt: undefined,
        updatedAt: new Date(),
      });
    }

    if (restored.length > 0) await db.candidates.bulkPut(restored);

    set((state) => ({
      candidates: [...state.candidates, ...restored],
      deletedCandidates: state.deletedCandidates.filter((c) =>
        blocked.includes(c.candidateNumber)
      ),
    }));

    return { restored: restored.length, blocked };
  },

  // Find candidate by number (for QR scanning)
  findByNumber: async (candidateNumber) => {
    return getCandidateByNumber(candidateNumber);
  },

  // Clear all candidates
  // Soft delete rather than clear, so the removal syncs up instead of every
  // record being pushed back on the next run.
  clearAll: async () => {
    const all = await db.candidates.toArray();
    await db.candidates.bulkPut(
      all.map((c) => ({ ...c, deleted: true, deletedAt: new Date(), updatedAt: new Date() }))
    );
    set({ candidates: [] });
  },
}));

// CSV Parser helper
export function parseCSV(csvText: string): Omit<Candidate, 'id'>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const candidates: Omit<Candidate, 'id'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const candidate: Omit<Candidate, 'id'> = {
      name: '',
      candidateNumber: '',
    };

    headers.forEach((header, index) => {
      const value = values[index] || '';
      switch (header) {
        case 'name':
        case 'fullname':
        case 'full_name':
          candidate.name = value;
          break;
        case 'namear':
        case 'name_ar':
        case 'arabic_name':
          candidate.nameAr = value;
          break;
        case 'number':
        case 'candidatenumber':
        case 'candidate_number':
        case 'id':
        case 'studentid':
        case 'student_id':
          candidate.candidateNumber = value;
          break;
        case 'email':
          candidate.email = value;
          break;
        case 'group':
          candidate.group = value;
          break;
        case 'stage':
          candidate.stage = value;
          break;
        case 'semester':
          candidate.semester = value;
          break;
      }
    });

    // Only add if we have required fields
    if (candidate.name && candidate.candidateNumber) {
      candidates.push(candidate);
    }
  }

  return candidates;
}
