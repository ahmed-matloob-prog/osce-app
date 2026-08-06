import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db, isAlreadyCheckedIn, getCheckInsForCircuit } from '../db/schema';
import type { CheckIn } from '../types';
import { getDeviceId } from '../utils/pinUtils';

interface CheckInState {
  // Current data
  checkIns: CheckIn[];
  isLoading: boolean;

  // Actions
  loadCheckIns: (examId: string, circuitId: string) => Promise<void>;
  loadAllCheckInsForExam: (examId: string) => Promise<void>;
  checkInCandidate: (params: {
    examId: string;
    circuitId: string;
    candidateId: string;
    candidateNumber: string;
    candidateName: string;
    checkedInBy?: string;
  }) => Promise<{ success: boolean; error?: string; checkIn?: CheckIn }>;
  undoCheckIn: (checkInId: string) => Promise<void>;
  getCheckInForCandidate: (examId: string, candidateId: string) => Promise<CheckIn | undefined>;
  isCheckedIn: (examId: string, candidateId: string) => Promise<boolean>;
  getCircuitCheckInCount: (examId: string, circuitId: string) => number;
}

export const useCheckInStore = create<CheckInState>((set, get) => ({
  checkIns: [],
  isLoading: false,

  // Load check-ins for a specific circuit
  loadCheckIns: async (examId: string, circuitId: string) => {
    set({ isLoading: true });
    try {
      const checkIns = await getCheckInsForCircuit(examId, circuitId);
      set({ checkIns, isLoading: false });
    } catch (error) {
      console.error('Failed to load check-ins:', error);
      set({ isLoading: false });
    }
  },

  // Load all check-ins for an exam (across all circuits)
  loadAllCheckInsForExam: async (examId: string) => {
    set({ isLoading: true });
    try {
      const checkIns = await db.checkIns.where('examId').equals(examId).toArray();
      set({ checkIns, isLoading: false });
    } catch (error) {
      console.error('Failed to load check-ins:', error);
      set({ isLoading: false });
    }
  },

  // Check in a candidate to a circuit
  checkInCandidate: async ({
    examId,
    circuitId,
    candidateId,
    candidateNumber,
    candidateName,
    checkedInBy,
  }) => {
    try {
      // Check if candidate is already checked in to any circuit
      const existingCheckIn = await isAlreadyCheckedIn(examId, candidateId);
      if (existingCheckIn) {
        // Look up the circuit number — circuitId is a uuid, and printing that
        // at someone standing at a door is no help at all.
        const circuit = await db.circuits.get(existingCheckIn.circuitId);
        return {
          success: false,
          error: `Already checked in to Circuit ${circuit?.circuitNumber ?? '?'}`,
          checkIn: existingCheckIn,
        };
      }

      // Create new check-in
      const checkIn: CheckIn = {
        id: uuidv4(),
        examId,
        circuitId,
        candidateId,
        candidateNumber,
        candidateName,
        checkedInAt: new Date(),
        checkedInBy: checkedInBy || getDeviceId(),
        stationsCompleted: [],
        synced: false,
      };

      await db.checkIns.add(checkIn);

      // Update local state
      set((state) => ({
        checkIns: [...state.checkIns, checkIn],
      }));

      return { success: true, checkIn };
    } catch (error) {
      console.error('Failed to check in candidate:', error);
      return { success: false, error: 'Failed to check in' };
    }
  },

  // Undo a check-in (remove it)
  undoCheckIn: async (checkInId: string) => {
    try {
      await db.checkIns.delete(checkInId);
      set((state) => ({
        checkIns: state.checkIns.filter((c) => c.id !== checkInId),
      }));
    } catch (error) {
      console.error('Failed to undo check-in:', error);
    }
  },

  // Get check-in record for a specific candidate
  getCheckInForCandidate: async (examId: string, candidateId: string) => {
    return isAlreadyCheckedIn(examId, candidateId);
  },

  // Check if a candidate is checked in
  isCheckedIn: async (examId: string, candidateId: string) => {
    const checkIn = await isAlreadyCheckedIn(examId, candidateId);
    return !!checkIn;
  },

  // Get count of check-ins for a specific circuit
  getCircuitCheckInCount: (examId: string, circuitId: string) => {
    return get().checkIns.filter(
      (c) => c.examId === examId && c.circuitId === circuitId
    ).length;
  },
}));
