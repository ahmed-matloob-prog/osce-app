export const EXAM_ID = '00000000-exam-0000-0000-000000000001';

// Two devices, one roster. Device A and device B independently created a record
// for college ID 2001 with different uuids — exactly what happens when the same
// file is imported on two machines.
export const SHARED_NUMBER = '2001';
export const A_UUID_FOR_2001 = 'aaaaaaaa-0000-0000-0000-000000000001';
export const B_UUID_FOR_2001 = 'ffffffff-0000-0000-0000-000000000001';

export const exam = {
  id: EXAM_ID, name: 'Sync Test Exam', description: 'emulator',
  stations: [{
    id: 'st-1', name: 'Station 1', nameAr: '', description: '', descriptionAr: '',
    timeLimit: 300, order: 1,
    checklistItems: [
      { id: 'it-1', text: 'Greets patient', textAr: '', maxScore: 2, order: 1 },
      { id: 'it-2', text: 'Washes hands',  textAr: '', maxScore: 2, order: 2 },
    ],
  }],
  pinEnabled: false, isLocked: false,
  createdAt: new Date(), updatedAt: new Date(),
};

export const candidate = (id, number, name) => ({
  id, candidateNumber: number, name, examIds: [EXAM_ID], updatedAt: new Date(),
});

/** Runs inside the page: writes fixture rows straight into the app's IndexedDB. */
export function seed({ exam, candidates }) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['examTemplates', 'candidates'], 'readwrite');
      tx.objectStore('examTemplates').put(exam);
      for (const c of candidates) tx.objectStore('candidates').put(c);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Runs inside the page: what this device believes, after tombstones are filtered. */
export function readState() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const names = ['examTemplates', 'candidates', 'circuits', 'checkIns', 'evaluations'];
      const tx = db.transaction(names, 'readonly');
      const out = {};
      let left = names.length;
      for (const n of names) {
        const req = tx.objectStore(n).getAll();
        req.onsuccess = () => {
          out[n] = req.result;
          if (--left === 0) {
            const live = (rows) => rows.filter((r) => !r.deleted);
            const candidates = live(out.candidates);
            const circuits = live(out.circuits);
            const checkIns = live(out.checkIns);
            resolve({
              exams: live(out.examTemplates).map((e) => e.name).sort(),
              candidateCount: candidates.length,
              numbers: candidates.map((c) => c.candidateNumber).sort(),
              circuits: circuits.map((c) => c.circuitNumber).sort((a, b) => a - b),
              circuitRowCount: circuits.length,
              assignments: checkIns.length,
              // assignment -> which candidate row it points at, and does that row exist
              danglingAssignments: checkIns.filter(
                (ci) => !candidates.some((c) => c.id === ci.candidateId)
              ).length,
              orphanCircuitRefs: checkIns.filter(
                (ci) => !circuits.some((c) => c.id === ci.circuitId)
              ).length,
              evaluations: out.evaluations.length,
              danglingEvaluations: out.evaluations.filter(
                (e) => !candidates.some((c) => c.id === e.candidateId)
              ).length,
            });
          }
        };
      }
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Runs inside the page: a circuit, an assignment and a scored mark, all local. */
export function seedScored({ exam, candidate, circuits, checkIn, evaluation }) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(
        ['examTemplates', 'candidates', 'circuits', 'checkIns', 'evaluations'],
        'readwrite'
      );
      tx.objectStore('examTemplates').put(exam);
      tx.objectStore('candidates').put(candidate);
      for (const c of circuits) tx.objectStore('circuits').put(c);
      tx.objectStore('checkIns').put(checkIn);
      tx.objectStore('evaluations').put(evaluation);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error?.message ?? 'tx failed');
    };
  });
}

/** Runs inside the page: where the one mark on this device now points. */
export function readMark() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['evaluations', 'candidates', 'circuits'], 'readonly');
      const out = {};
      let left = 3;
      const done = () => {
        if (--left) return;
        const e = out.evaluations[0];
        const cand = out.candidates.find((c) => c.id === e.candidateId);
        const circ = out.circuits.find((c) => c.id === e.circuitId);
        resolve({
          marks: out.evaluations.length,
          totalScore: e.totalScore,
          candidateNumber: cand ? cand.candidateNumber : null,
          candidateRetired: cand ? Boolean(cand.deleted) : null,
          circuitNumber: circ ? circ.circuitNumber : null,
          circuitRetired: circ ? Boolean(circ.deleted) : null,
        });
      };
      for (const n of ['evaluations', 'candidates', 'circuits']) {
        const r = tx.objectStore(n).getAll();
        r.onsuccess = () => { out[n] = r.result; done(); };
      }
      tx.onerror = () => reject(tx.error);
    };
  });
}
