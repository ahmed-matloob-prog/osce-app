// Sync across devices — the exam-morning scenario, end to end.
//
// Circuits, assignments and the roster all have to reach every tablet, and
// three devices that never met have to agree on which record is which. Run it
// against the local Firestore emulator, never a real project:
//
//   npm run build:emulator
//   npm run emulator            # terminal 2
//   node tests/serve.mjs        # terminal 3
//   npm run test:sync
//
// It wipes the emulator's database on each run.

import { chromium } from 'playwright-core';
import * as F from './sync-fixture.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5199';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`}`);
};

// Start from an empty cloud, or a previous run's circuits make this one lie.
const wiped = await fetch(
  'http://127.0.0.1:8080/emulator/v1/projects/osce-emulator/databases/(default)/documents',
  { method: 'DELETE' }
);
if (!wiped.ok) throw new Error(`could not clear emulator: ${wiped.status}`);
console.log('   emulator cleared');

const browser = await chromium.launch({ executablePath: CHROME });

// `offline: true` cuts the device off from the emulator while it boots, so it
// can build up local records the way a tablet does when the roster is imported
// on it before it has ever reached the network.
async function device(label, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const blocked = (route) => {
    const { port } = new URL(route.request().url());
    return port === '8080' || port === '9099' ? route.abort() : route.continue();
  };
  if (offline) await ctx.route('**/*', blocked);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`   !! [${label}] ${e.message.slice(0, 140)}`));
  page.on('console', (m) => {
    // NETWORK_IO_SUSPENDED is this test tearing a context down, not the app.
    if (m.type() === 'error' && !/favicon|manifest|NETWORK_IO_SUSPENDED|ERR_FAILED|Could not reach/i.test(m.text()))
      console.log(`   !! [${label}] console: ${m.text().slice(0, 140)}`);
  });
  // Open the app once so Dexie creates the schema before the fixture is written.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // Past the front door — this suite is about what syncs, not about who is
  // allowed to ask.
  await page.evaluate(F.asAdminDevice);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return {
    ctx,
    page,
    label,
    async goOnline() {
      await ctx.unroute('**/*');
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    },
  };
}

const seed = (d, candidates) =>
  d.page.evaluate(F.seed, { exam: F.exam, candidates });
const state = (d) => d.page.evaluate(F.readState);

async function sync(d) {
  await d.page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await d.page.waitForTimeout(2500);
  const btn = d.page.getByRole('button', { name: /Sync Now/i });
  await btn.click();
  await d.page.waitForTimeout(5000);
}

// ===========================================================================
console.log('\n1. Admin sets up the exam and splits the cohort into circuits');
// ===========================================================================
const A = await device('A');
await seed(A, [
  F.candidate(F.A_UUID_FOR_2001, F.SHARED_NUMBER, 'Shared Student'),
  F.candidate('aaaaaaaa-0000-0000-0000-000000000002', '2002', 'Student Two'),
  F.candidate('aaaaaaaa-0000-0000-0000-000000000003', '2003', 'Student Three'),
  F.candidate('aaaaaaaa-0000-0000-0000-000000000004', '2004', 'Student Four'),
]);

await A.page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await A.page.getByRole('button', { name: /Sync Test Exam/ }).first().click();
await A.page.waitForTimeout(1500);

const splitBtn = A.page.getByRole('button', { name: /^Split them$/ });
const panel = A.page.locator('div').filter({ has: splitBtn }).last();
await panel.locator('input[type=number]').fill('2');
await splitBtn.click();
await A.page.waitForTimeout(2500);

const afterSplit = await state(A);
console.log(`   device A: ${afterSplit.circuits.length} circuits, ${afterSplit.assignments} assignments`);
check('A split 4 students into 2 circuits', 
  { circuits: afterSplit.circuits, assignments: afterSplit.assignments },
  { circuits: [1, 2], assignments: 4 });

await sync(A);

// ===========================================================================
console.log('\n2. A fresh examiner tablet syncs — does it get the exam day?');
// ===========================================================================
// No seeding, no manual sync: just open the app, the way an examiner does.
const B = await device('B');
const bAfter = await state(B);
console.log(`   device B: ${JSON.stringify(bAfter)}`);
check('B provisioned itself on open, unprompted', bAfter.candidateCount > 0, true);
check('B received the exam',            bAfter.exams,            ['Sync Test Exam']);
check('B received the roster',          bAfter.numbers,          ['2001', '2002', '2003', '2004']);
check('B received the circuits',        bAfter.circuits,         [1, 2]);
check('B received the assignments',     bAfter.assignments,      4);
check('B assignments point at real students', bAfter.danglingAssignments, 0);
check('B assignments point at real circuits', bAfter.orphanCircuitRefs,   0);

// ===========================================================================
console.log('\n3. Two devices independently hold the same student (college ID 2001)');
// ===========================================================================
const C = await device('C', { offline: true });
// C imported the roster locally before ever syncing, so its uuid for 2001
// differs from A's. Both are valid; only one can survive.
await seed(C, [
  F.candidate(F.B_UUID_FOR_2001, F.SHARED_NUMBER, 'Shared Student'),
  F.candidate('cccccccc-0000-0000-0000-000000000009', '2009', 'Late Student'),
]);
const cBefore = await state(C);
check('C holds its own uuid for 2001', cBefore.numbers, ['2001', '2009']);
check('C has not seen the cloud yet',  cBefore.circuits, []);

await C.goOnline();
await sync(C);
const cAfter = await state(C);
console.log(`   device C: ${JSON.stringify(cAfter)}`);
check('C ends with one record per college ID', cAfter.numbers, ['2001', '2002', '2003', '2004', '2009']);
check('C has no duplicate 2001',
  cAfter.numbers.filter((n) => n === '2001').length, 1);
check('C assignments still resolve', cAfter.danglingAssignments, 0);

// The lowest uuid wins, so A's record for 2001 is the survivor everywhere.
const cWinner = await C.page.evaluate((num) => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const a = q.result.transaction('candidates', 'readonly').objectStore('candidates').getAll();
    a.onsuccess = () => r(a.result.filter((c) => !c.deleted && c.candidateNumber === num).map((c) => c.id));
  };
}), F.SHARED_NUMBER);
check('survivor is the lowest uuid', cWinner, [F.A_UUID_FOR_2001]);

// ===========================================================================
console.log('\n4. Everyone converges — A and B sync again');
// ===========================================================================
await sync(A);
await sync(B);
const aFinal = await state(A);
const bFinal = await state(B);
const cFinal = await state(C);

for (const [name, s] of [['A', aFinal], ['B', bFinal], ['C', cFinal]]) {
  console.log(`   device ${name}: ${JSON.stringify(s)}`);
}
check('A, B and C agree on the roster',
  [aFinal.numbers, bFinal.numbers], [cFinal.numbers, cFinal.numbers]);
check('A, B and C agree on circuits',
  [aFinal.circuits, bFinal.circuits, cFinal.circuits], [[1, 2], [1, 2], [1, 2]]);
check('no device grew a duplicate circuit row',
  [aFinal.circuitRowCount, bFinal.circuitRowCount, cFinal.circuitRowCount], [2, 2, 2]);
check('assignments are stable at 4 everywhere',
  [aFinal.assignments, bFinal.assignments, cFinal.assignments], [4, 4, 4]);
check('nothing dangles anywhere',
  [aFinal.danglingAssignments, bFinal.danglingAssignments, cFinal.danglingAssignments], [0, 0, 0]);

// ===========================================================================
console.log('\n5. A tablet that built its own circuits offline, and already scored a mark');
// ===========================================================================
// Device D never saw the cloud. It has its own uuid for student 2001, its own
// "Circuit 1", and a mark already recorded against both. Every id it holds is
// about to lose to a lower one.
const D = await device('D', { offline: true });
const D_CAND = 'dddddddd-0000-0000-0000-000000000001';
const D_CIRCUIT = 'dddddddd-circ-0000-0000-000000000001';
await D.page.evaluate(F.seedScored, {
  exam: F.exam,
  candidate: F.candidate(D_CAND, F.SHARED_NUMBER, 'Shared Student'),
  circuits: [{
    id: D_CIRCUIT, examId: F.EXAM_ID, circuitNumber: 1,
    examiners: [], candidateIds: [], updatedAt: new Date(),
  }],
  checkIn: {
    id: 'dddddddd-chk-0000-0000-000000000001',
    examId: F.EXAM_ID, circuitId: D_CIRCUIT, candidateId: D_CAND,
    candidateNumber: F.SHARED_NUMBER, candidateName: 'Shared Student',
    checkedInAt: new Date(), checkedInBy: 'device-D', stationsCompleted: [],
    synced: false, updatedAt: new Date(),
  },
  evaluation: {
    id: 'dddddddd-eval-0000-0000-000000000001',
    examId: F.EXAM_ID, circuitId: D_CIRCUIT, candidateId: D_CAND,
    stationId: 'st-1', examinerName: 'Dr Offline', identifiedBy: 'typed-id',
    scores: [{ itemId: 'it-1', score: 2 }, { itemId: 'it-2', score: 1 }],
    notes: '', startTime: new Date(), endTime: new Date(),
    totalScore: 3, maxPossibleScore: 4, synced: false,
  },
});

const dBefore = await D.page.evaluate(F.readMark);
check('D scored a mark against its own ids',
  { marks: dBefore.marks, score: dBefore.totalScore, circuit: dBefore.circuitNumber },
  { marks: 1, score: 3, circuit: 1 });

await D.goOnline();
await sync(D);

const dAfter = await D.page.evaluate(F.readMark);
const dState = await state(D);
console.log(`   device D mark:  ${JSON.stringify(dAfter)}`);
console.log(`   device D state: ${JSON.stringify(dState)}`);
check('D still has exactly one mark, unchanged in value',
  { marks: dAfter.marks, score: dAfter.totalScore }, { marks: 1, score: 3 });
check('the mark now names a live student',
  { number: dAfter.candidateNumber, retired: dAfter.candidateRetired },
  { number: F.SHARED_NUMBER, retired: false });
check('the mark now names a live Circuit 1',
  { circuit: dAfter.circuitNumber, retired: dAfter.circuitRetired },
  { circuit: 1, retired: false });
check('D collapsed its circuit into the shared pair', dState.circuits, [1, 2]);
check('D grew no duplicate circuit rows', dState.circuitRowCount, 2);
check('D has one record per college ID',
  dState.numbers, ['2001', '2002', '2003', '2004', '2009']);
check('nothing dangles on D', dState.danglingAssignments + dState.danglingEvaluations, 0);

// The mark has to survive the trip to the cloud, under the agreed ids.
// Read past the rules, the way an administrator would — an unauthenticated
// REST read is denied with a 403 that looks exactly like an empty collection.
const cloud = await (await fetch(
  'http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents/evaluations',
  { headers: { Authorization: 'Bearer owner' } }
)).json();
const cloudMarks = (cloud.documents ?? []).map((d) => ({
  score: Number(d.fields.totalScore.integerValue ?? d.fields.totalScore.doubleValue),
  candidateId: d.fields.candidateId.stringValue,
  circuitId: d.fields.circuitId.stringValue,
}));
console.log(`   cloud marks:    ${JSON.stringify(cloudMarks)}`);
check('the mark reached the cloud', cloudMarks.length, 1);
check('and it went up under the surviving student id',
  cloudMarks[0]?.candidateId, F.A_UUID_FOR_2001);
// Which of the two "Circuit 1" uuids survives depends on which sorts lower,
// and they are random per run — so asserting *which* one wins asserts nothing.
// What must hold is that the mark points at a circuit that is still live, that
// it is Circuit 1, and that every device names the same one.
const cloudCircuits = (await (await fetch(
  'http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents/circuits',
  { headers: { Authorization: 'Bearer owner' } }
)).json()).documents ?? [];
const markCircuit = cloudCircuits.find(
  (d) => d.fields.id.stringValue === cloudMarks[0]?.circuitId
);
check('the mark points at a circuit that still exists', Boolean(markCircuit), true);
check('it is Circuit 1, and it is live', {
  number: Number(markCircuit?.fields.circuitNumber.integerValue),
  retired: Boolean(markCircuit?.fields.deleted?.booleanValue),
}, { number: 1, retired: false });

// And the admin's own device must end up naming that same circuit.
await sync(A);
const aCircuitIds = await A.page.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const a = q.result.transaction('circuits', 'readonly').objectStore('circuits').getAll();
    a.onsuccess = () => r(a.result.filter((c) => !c.deleted).map((c) => c.id));
  };
}));
check('the admin device agrees on that circuit id',
  aCircuitIds.includes(cloudMarks[0]?.circuitId), true);

// Tombstones are the mechanism, so they should be present and not multiplying:
// two retired candidate uuids (C's and D's for 2001) and one retired circuit.
const counts = {};
for (const c of ['candidates', 'circuits', 'checkIns']) {
  const j = await (await fetch(
    `http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents/${c}`,
    { headers: { Authorization: 'Bearer owner' } }
  )).json();
  const docs = j.documents ?? [];
  counts[c] = {
    total: docs.length,
    retired: docs.filter((d) => d.fields.deleted?.booleanValue).length,
  };
}
console.log(`   cloud rows:     ${JSON.stringify(counts)}`);
check('cloud holds 5 live students plus the retired duplicates',
  counts.candidates.total - counts.candidates.retired, 5);
check('cloud holds 2 live circuits', counts.circuits.total - counts.circuits.retired, 2);
check('cloud holds 4 live assignments', counts.checkIns.total - counts.checkIns.retired, 4);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
