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

export type RemoveCircuitResult =
  | { status: 'removed'; unassigned: number }
  | { status: 'has-marks'; evaluations: number };

/**
 * Delete a circuit, unassigning anyone in it.
 *
 * Refuses if marks have been recorded against it. An evaluation stores the
 * circuit it was taken in, so removing one that has been examined would leave
 * those marks pointing at nothing — the same reason the Firestore rules will
 * not let a device delete an exam template.
 *
 * Soft, because circuits sync between devices now: removing the row would
 * leave every other device free to push its copy back, exactly as deleting an
 * exam used to.
 */
export async function removeCircuit(circuitId: string): Promise<RemoveCircuitResult> {
  const evaluations = await db.evaluations.filter((e) => e.circuitId === circuitId).count();
  if (evaluations > 0) {
    return { status: 'has-marks', evaluations };
  }

  const now = new Date();
  const checkIns = await db.checkIns
    .filter((c) => c.circuitId === circuitId && !c.deleted)
    .toArray();
  if (checkIns.length > 0) {
    await db.checkIns.bulkPut(
      checkIns.map((c) => ({ ...c, deleted: true, deletedAt: now, updatedAt: now, synced: false }))
    );
  }
  await db.circuits.update(circuitId, {
    deleted: true,
    deletedAt: now,
    updatedAt: now,
  });

  return { status: 'removed', unassigned: checkIns.length };
}

export interface DistributionResult {
  assigned: number;
  circuitsCreated: number[];
  perCircuit: Record<number, number>;
  /** Already placed, and left alone. */
  skipped: number;
}

/**
 * Split this exam's students evenly across a number of circuits.
 *
 * For when the split is yours to decide rather than something the registry
 * already recorded in the roster.
 *
 * Students are ordered by college ID and dealt out in blocks, so circuit 1
 * takes the first block of IDs rather than every fifteenth student.
 * Consecutive IDs in one circuit make the door easier to run and a printed
 * circuit list easier to read.
 *
 * Anyone already assigned is left where they are — this must not undo a
 * placement somebody made on purpose.
 */
export async function distributeIntoCircuits(
  examId: string,
  circuitCount: number,
  assignedBy: string
): Promise<DistributionResult> {
  const result: DistributionResult = {
    assigned: 0,
    circuitsCreated: [],
    perCircuit: {},
    skipped: 0,
  };

  if (circuitCount < 1) return result;

  const enrolled = (await db.candidates.toArray()).filter(
    (c) => !c.deleted && c.examIds?.includes(examId)
  );

  const existingCheckIns = (await db.checkIns.where('examId').equals(examId).toArray()).filter((c) => !c.deleted);
  const alreadyPlaced = new Set(existingCheckIns.map((c) => c.candidateId));

  const toPlace = enrolled
    .filter((c) => !alreadyPlaced.has(c.id))
    .sort((a, b) =>
      a.candidateNumber.localeCompare(b.candidateNumber, undefined, { numeric: true })
    );
  result.skipped = enrolled.length - toPlace.length;

  if (toPlace.length === 0) return result;

  // Create circuits 1..N that do not exist yet
  const circuits = (await db.circuits.where('examId').equals(examId).toArray()).filter((c) => !c.deleted);
  const circuitByNumber = new Map(circuits.map((c) => [c.circuitNumber, c]));
  const newCircuits: Circuit[] = [];
  for (let n = 1; n <= circuitCount; n++) {
    if (circuitByNumber.has(n)) continue;
    const circuit: Circuit = {
      id: uuidv4(),
      examId,
      circuitNumber: n,
      name: '',
      examiners: [],
      candidateIds: [],
    };
    newCircuits.push(circuit);
    circuitByNumber.set(n, circuit);
    result.circuitsCreated.push(n);
  }
  if (newCircuits.length > 0) await db.circuits.bulkAdd(newCircuits);

  // Deal out in blocks. The remainder is spread one per circuit across the
  // earliest circuits rather than dumped on the last one.
  const base = Math.floor(toPlace.length / circuitCount);
  const remainder = toPlace.length % circuitCount;

  const checkIns: CheckIn[] = [];
  let index = 0;
  for (let n = 1; n <= circuitCount; n++) {
    const size = base + (n <= remainder ? 1 : 0);
    const circuit = circuitByNumber.get(n)!;
    for (let i = 0; i < size && index < toPlace.length; i++, index++) {
      const candidate = toPlace[index];
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
    result.perCircuit[n] = size;
  }

  if (checkIns.length > 0) await db.checkIns.bulkAdd(checkIns);
  result.assigned = checkIns.length;

  return result;
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

  const circuits = (await db.circuits.where('examId').equals(examId).toArray()).filter((c) => !c.deleted);
  const circuitByNumber = new Map(circuits.map((c) => [c.circuitNumber, c]));

  const existingCheckIns = (await db.checkIns.where('examId').equals(examId).toArray()).filter((c) => !c.deleted);
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
