import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db, getCandidateByNumber, normalizeCandidateNumber } from '../db/schema';
import type { Candidate } from '../types';

export interface ImportResult {
  added: number;
  /** College IDs that were already on the roster, or missing from the row. */
  skipped: string[];
}

export interface ProvisionalInput {
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
  isLoading: boolean;

  // Actions
  loadCandidates: () => Promise<void>;
  addCandidate: (candidate: Omit<Candidate, 'id'>) => Promise<Candidate>;
  updateCandidate: (id: string, updates: Partial<Candidate>) => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  importCandidates: (candidates: Omit<Candidate, 'id'>[]) => Promise<ImportResult>;
  registerProvisional: (input: ProvisionalInput) => Promise<ProvisionalResult>;
  confirmProvisional: (id: string) => Promise<void>;
  findByNumber: (candidateNumber: string) => Promise<Candidate | undefined>;
  clearAll: () => Promise<void>;
}

export const useCandidateStore = create<CandidateState>((set) => ({
  candidates: [],
  isLoading: false,

  // Load all candidates
  loadCandidates: async () => {
    set({ isLoading: true });
    try {
      const candidates = await db.candidates.toArray();
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
    };
    // The unique index on candidateNumber makes this throw on a collision
    // rather than quietly creating a second record for the same student.
    await db.candidates.add(candidate);
    set((state) => ({ candidates: [...state.candidates, candidate] }));
    return candidate;
  },

  // Update a candidate
  updateCandidate: async (id, updates) => {
    await db.candidates.update(id, updates);
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  // Delete a candidate
  deleteCandidate: async (id) => {
    await db.candidates.delete(id);
    set((state) => ({
      candidates: state.candidates.filter((c) => c.id !== id),
    }));
  },

  // Import multiple candidates (from CSV)
  // Import policy: add students who are new, skip ones already on the roster,
  // and report exactly what was skipped.
  //
  // Skipping rather than overwriting is the non-destructive choice — an import
  // must never silently replace a record that was corrected inside the app,
  // and re-running the same file must be harmless. The trade-off is that
  // corrections in a re-exported roster are not picked up; those have to be
  // edited directly. A "47 of 47 skipped" report is also how you notice you
  // just loaded last year's list.
  importCandidates: async (candidatesData) => {
    const existing = await db.candidates.toArray();
    const seen = new Set(existing.map((c) => normalizeCandidateNumber(c.candidateNumber)));

    const toAdd: Candidate[] = [];
    const skipped: string[] = [];

    for (const data of candidatesData) {
      const candidateNumber = normalizeCandidateNumber(data.candidateNumber);

      // `seen` grows as we go, so duplicates inside the file itself are
      // caught too, not just collisions with the existing roster.
      if (!candidateNumber || seen.has(candidateNumber)) {
        skipped.push(data.candidateNumber || '(no college ID)');
        continue;
      }

      seen.add(candidateNumber);
      toAdd.push({ ...data, candidateNumber, id: uuidv4() });
    }

    if (toAdd.length > 0) {
      await db.candidates.bulkAdd(toAdd);
      set((state) => ({ candidates: [...state.candidates, ...toAdd] }));
    }

    return { added: toAdd.length, skipped };
  },

  // Register a student who is not on the roster — late registration on exam
  // day. Never blocks: the student is real and needs a mark. The record is
  // flagged provisional so an admin verifies the typed college ID afterwards.
  registerProvisional: async (input) => {
    const candidateNumber = normalizeCandidateNumber(input.candidateNumber);

    // If the ID is already taken, hand back that student rather than creating
    // a second record for them — the unique index would reject it anyway.
    const existing = await getCandidateByNumber(candidateNumber);
    if (existing) {
      return { status: 'already-exists', candidate: existing };
    }

    const candidate: Candidate = {
      id: uuidv4(),
      candidateNumber,
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || undefined,
      group: input.group?.trim() || undefined,
      provisional: true,
      registeredAt: new Date(),
      registeredBy: input.registeredBy,
      registeredWhere: input.registeredWhere,
    };

    await db.candidates.add(candidate);
    set((state) => ({ candidates: [...state.candidates, candidate] }));
    return { status: 'created', candidate };
  },

  // Admin has checked the college ID against the college's records
  confirmProvisional: async (id) => {
    await db.candidates.update(id, { provisional: false });
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, provisional: false } : c
      ),
    }));
  },

  // Find candidate by number (for QR scanning)
  findByNumber: async (candidateNumber) => {
    return getCandidateByNumber(candidateNumber);
  },

  // Clear all candidates
  clearAll: async () => {
    await db.candidates.clear();
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
