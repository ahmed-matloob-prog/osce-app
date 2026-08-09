import { v4 as uuidv4 } from 'uuid';
import { db, normalizeCandidateNumber } from '../db/schema';
import type { Circuit, CheckIn } from '../types';

/**
 * Assign students to circuits from an imported roster.
 *
 * At 450 students across 15 circuits, scanning each badge on exam morning is
 * forty minutes of data entry with a queue forming. The roster already knows
 * the answer, so this does the whole thing at a desk, days earlier: circuits
 * that do not exist are created, and every student named in the file is
 * assigned to theirs.
 *
 * Assignment is stored as a check-in record because that is what the
 * wrong-circuit warning at a station reads. The record means "this student
 * belongs to this circuit", which is the useful sense — actual attendance is
 * proven by the evaluation itself.
 */

export interface CircuitAssignmentInput {
  candidateNumber: string;
  circuit: number;
}

export interface CircuitAssignmentResult {
  assigned: number;
  circuitsCreated: number[];
  /** Already assigned, and left where they are rather than moved. */
  alreadyAssigned: string[];
  /** In the file but not on the roster — nothing to assign. */
  unknown: string[];
}

export async function assignCircuitsFromRoster(
  examId: string,
  rows: CircuitAssignmentInput[],
  assignedBy: string
): Promise<CircuitAssignmentResult> {
  const result: CircuitAssignmentResult = {
    assigned: 0,
    circuitsCreated: [],
    alreadyAssigned: [],
    unknown: [],
  };

  if (rows.length === 0) return result;

  // Everything is read once up front. Doing lookups per student turns 450
  // imports into 1,350 round trips to IndexedDB.
  const candidates = await db.candidates.toArray();
  const byNumber = new Map(
    candidates
      .filter((c) => !c.deleted)
      .map((c) => [normalizeCandidateNumber(c.candidateNumber), c])
  );

  const circuits = await db.circuits.where('examId').equals(examId).toArray();
  const circuitByNumber = new Map(circuits.map((c) => [c.circuitNumber, c]));

  const existingCheckIns = await db.checkIns.where('examId').equals(examId).toArray();
  const assignedCandidateIds = new Set(existingCheckIns.map((c) => c.candidateId));

  // Create any circuit the file refers to but the exam does not have yet, so
  // importing a roster is the only setup step needed.
  const newCircuits: Circuit[] = [];
  for (const number of new Set(rows.map((r) => r.circuit))) {
    if (circuitByNumber.has(number)) continue;
    const circuit: Circuit = {
      id: uuidv4(),
      examId,
      circuitNumber: number,
      name: '',
      examiners: [],
      candidateIds: [],
    };
    newCircuits.push(circuit);
    circuitByNumber.set(number, circuit);
    result.circuitsCreated.push(number);
  }
  if (newCircuits.length > 0) await db.circuits.bulkAdd(newCircuits);
  result.circuitsCreated.sort((a, b) => a - b);

  const checkIns: CheckIn[] = [];
  for (const row of rows) {
    const candidate = byNumber.get(normalizeCandidateNumber(row.candidateNumber));
    if (!candidate) {
      result.unknown.push(row.candidateNumber);
      continue;
    }

    // Never move somebody who is already assigned. A re-import must not
    // silently relocate students an admin placed by hand.
    if (assignedCandidateIds.has(candidate.id)) {
      result.alreadyAssigned.push(row.candidateNumber);
      continue;
    }

    const circuit = circuitByNumber.get(row.circuit)!;
    assignedCandidateIds.add(candidate.id);
    checkIns.push({
      id: uuidv4(),
      examId,
      circuitId: circuit.id,
      candidateId: candidate.id,
      candidateNumber: candidate.candidateNumber,
      candidateName: candidate.name,
      checkedInAt: new Date(),
      checkedInBy: assignedBy,
      stationsCompleted: [],
      synced: false,
    });
  }

  if (checkIns.length > 0) await db.checkIns.bulkAdd(checkIns);
  result.assigned = checkIns.length;

  return result;
}
