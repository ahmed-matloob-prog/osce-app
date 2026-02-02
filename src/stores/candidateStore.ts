import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db, getCandidateByNumber } from '../db/schema';
import type { Candidate } from '../types';

interface CandidateState {
  candidates: Candidate[];
  isLoading: boolean;

  // Actions
  loadCandidates: () => Promise<void>;
  addCandidate: (candidate: Omit<Candidate, 'id'>) => Promise<Candidate>;
  updateCandidate: (id: string, updates: Partial<Candidate>) => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  importCandidates: (candidates: Omit<Candidate, 'id'>[]) => Promise<number>;
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
      id: uuidv4(),
    };
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
  importCandidates: async (candidatesData) => {
    const newCandidates: Candidate[] = candidatesData.map((c) => ({
      ...c,
      id: uuidv4(),
    }));

    await db.candidates.bulkAdd(newCandidates);
    set((state) => ({
      candidates: [...state.candidates, ...newCandidates],
    }));

    return newCandidates.length;
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
