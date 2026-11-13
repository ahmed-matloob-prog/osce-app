// Sync hazards — six ways sync used to lose work without saying so.
//
// Each section is a scenario that once failed silently: a mark stuck on a
// tablet for good, an exam edit quietly reverted, a device that stopped
// uploading after an unrelated event. The checks say what must hold now.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:hazards
//
// Wipes the emulator database on each run.

import { chromium } from 'playwright-core';
import * as F from './sync-fixture.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const DOCS = 'http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`}`);
};

const wiped = await fetch(DOCS.replace('/v1/', '/emulator/v1/'), { method: 'DELETE' });
if (!wiped.ok) throw new Error(`could not clear emulator: ${wiped.status}`);
console.log('   emulator cleared');

const browser = await chromium.launch({ executablePath: CHROME });

const cloudBlocked = (route) => {
  const { port } = new URL(route.request().url());
  return port === '8080' || port === '9099' ? route.abort() : route.continue();
};

async function device(label, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (offline) await ctx.route('**/*', cloudBlocked);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`   !! [${label}] ${e.message.slice(0, 140)}`));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
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
    async goOffline() {
      await ctx.route('**/*', cloudBlocked);
    },
  };
}

/** Runs inside the page: put rows straight into the app's IndexedDB. */
function putRows(tables) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(Object.keys(tables), 'readwrite');
      for (const [name, rows] of Object.entries(tables)) {
        for (const row of rows) tx.objectStore(name).put(row);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error?.message ?? 'tx failed');
    };
  });
}

/** Runs inside the page: every row of one table. */
function allRows(name) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('OSCEDatabase');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = open.result.transaction(name, 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

const put = (d, tables) => d.page.evaluate(putRows, tables);
const rows = (d, name) => d.page.evaluate(allRows, name);

/** Sync Now, from the settings screen, the way an admin does it by hand. */
async function sync(d, wait = 5000) {
  await d.page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await d.page.waitForTimeout(2500);
  await d.page.getByRole('button', { name: /Sync Now/i }).click();
  await d.page.waitForTimeout(wait);
}

/** Open the Reports screen on the shared test exam, which pulls its marks. */
async function openReport(d) {
  await d.page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
  await d.page.waitForTimeout(2500);
  const select = d.page.locator('select').first();
  const opts = await select.locator('option').allInnerTexts();
  await select.selectOption({ label: opts.find((o) => o.includes('Sync Test Exam')) });
}

/** Every document in a cloud collection, read past the rules. */
async function cloud(collection) {
  const out = [];
  let token = '';
  do {
    const url = `${DOCS}/${collection}?pageSize=300${token ? `&pageToken=${token}` : ''}`;
    const j = await (await fetch(url, { headers: { Authorization: 'Bearer owner' } })).json();
    out.push(...(j.documents ?? []));
    token = j.nextPageToken ?? '';
  } while (token);
  return out;
}
const str = (doc, field) => doc.fields?.[field]?.stringValue;

const mark = (id, candidateId, score, extra = {}) => ({
  id, examId: F.EXAM_ID, candidateId, stationId: 'st-1',
  examinerName: 'Dr Test', identifiedBy: 'typed-id',
  scores: [{ itemId: 'it-1', score }], notes: '',
  startTime: new Date(), endTime: new Date(),
  totalScore: score, maxPossibleScore: 4, synced: false,
  ...extra,
});

// ===========================================================================
console.log('\n1. A mark already in the cloud, then a late device brings a lower uuid');
// ===========================================================================
// Tablet A scores student 3001 and uploads it. Later somebody imports the same
// roster on another machine, which gives 3001 a uuid that sorts lower, so it
// wins. A's uploaded mark must not be rewritten (marks are write-once), and it
// must not wedge A's uploads from then on.
const A_3001 = '88888888-0000-0000-0000-000000003001';
const LATE_3001 = '11111111-0000-0000-0000-000000003001';

const A = await device('A');
await put(A, {
  examTemplates: [F.exam],
  candidates: [F.candidate(A_3001, '3001', 'Late Merge Student')],
  evaluations: [mark('eval-a-0001', A_3001, 2)],
});
await sync(A);
check('first mark reached the cloud',
  (await cloud('evaluations')).map((d) => str(d, 'candidateId')), [A_3001]);

const L = await device('L', { offline: true });
await put(L, {
  examTemplates: [F.exam],
  candidates: [F.candidate(LATE_3001, '3001', 'Late Merge Student')],
});
await L.goOnline();
await sync(L);

// A carries on scoring, then syncs.
await put(A, { evaluations: [mark('eval-a-0002', A_3001, 1)] });
await sync(A);

const cloudMarks = await cloud('evaluations');
check('A\'s later mark still reaches the cloud',
  cloudMarks.map((d) => d.name.split('/').pop()).sort(), ['eval-a-0001', 'eval-a-0002']);
check('the first mark was not rewritten in the cloud',
  str(cloudMarks.find((d) => d.name.endsWith('eval-a-0001')), 'candidateId'), A_3001);
const aMarks = await rows(A, 'evaluations');
check('nothing left waiting on A', aMarks.filter((e) => !e.synced).length, 0);
const aLive = (await rows(A, 'candidates')).filter((c) => !c.deleted);
check('on A, both marks belong to the live 3001 record',
  aMarks.map((e) => aLive.find((c) => c.id === e.candidateId)?.candidateNumber ?? null),
  ['3001', '3001']);

// A reporting device that has never seen any of this pulls the marks.
const R = await device('R');
await openReport(R);
await R.page.waitForTimeout(4000);
const rMarks = await rows(R, 'evaluations');
const rLive = (await rows(R, 'candidates')).filter((c) => !c.deleted);
check('the reporting device pulled both marks', rMarks.length, 2);
check('and files both under the live 3001 record, not the retired one',
  rMarks.map((e) => rLive.find((c) => c.id === e.candidateId)?.candidateNumber ?? null),
  ['3001', '3001']);

// ===========================================================================
console.log('\n2. An admin edits an exam; a busy tablet syncs before the admin does');
// ===========================================================================
const EDIT_ID = '00000000-exam-0000-0000-000000000002';
const editExam = { ...F.exam, id: EDIT_ID, name: 'Edit Test', updatedAt: new Date() };
await put(A, { examTemplates: [editExam] });
await sync(A);

const T = await device('T'); // pulls the exam on startup
check('tablet T has the exam',
  (await rows(T, 'examTemplates')).some((e) => e.id === EDIT_ID), true);

await put(A, {
  examTemplates: [{ ...editExam, name: 'Edit Test (fixed)', updatedAt: new Date() }],
});
await sync(T); // the tablet gets in first
await sync(A);

check('the admin\'s edit survives on the admin device',
  (await rows(A, 'examTemplates')).find((e) => e.id === EDIT_ID)?.name, 'Edit Test (fixed)');
check('and in the cloud',
  str((await cloud('exams')).find((d) => d.name.endsWith(EDIT_ID)), 'name'), 'Edit Test (fixed)');
await sync(T);
check('and reaches the tablet',
  (await rows(T, 'examTemplates')).find((e) => e.id === EDIT_ID)?.name, 'Edit Test (fixed)');

// ===========================================================================
console.log('\n3. One exam is deleted; can other devices still upload exams?');
// ===========================================================================
const NEW_ID = '00000000-exam-0000-0000-000000000003';
const now = new Date();
const editedNow = (await rows(A, 'examTemplates')).find((e) => e.id === EDIT_ID);
await put(A, {
  examTemplates: [{ ...editedNow, deleted: true, deletedAt: now, updatedAt: now }],
});
await sync(A);
await sync(T); // T pulls the deletion

await put(T, {
  examTemplates: [{ ...F.exam, id: NEW_ID, name: 'Made On T', updatedAt: new Date() }],
});
await sync(T);
check('an exam created on T after the deletion reaches the cloud',
  (await cloud('exams')).some((d) => d.name.endsWith(NEW_ID)), true);
const tDeleted = (await rows(T, 'examTemplates')).find((e) => e.id === EDIT_ID);
check('T holds the deletion date as a real date', tDeleted?.deletedAt instanceof Date, true);

// ===========================================================================
console.log('\n4. A roster of more than 500 students');
// ===========================================================================
// Caveat: the emulator does not enforce Firestore's 500-writes-per-batch
// limit, so this passed even when the roster went up in one batch. It guards
// the round trip at this size; it cannot prove the batching.
const big = Array.from({ length: 520 }, (_, i) =>
  F.candidate(`99999999-0000-0000-0000-${String(i).padStart(12, '0')}`, String(90000 + i), `Bulk ${i}`));
await put(T, { candidates: big });
await sync(T, 12000);
check('all 520 reach the cloud',
  (await cloud('candidates')).filter((d) => str(d, 'candidateNumber')?.startsWith('9')).length, 520);

// ===========================================================================
console.log('\n5. Reports on a device that cannot reach the cloud');
// ===========================================================================
await R.goOffline();
await openReport(R);
const warned = await R.page.getByText(/Could not reach the cloud/)
  .waitFor({ timeout: 25000 }).then(() => true, () => false);
check('it says the results may be incomplete', warned, true);

// ===========================================================================
console.log('\n6. Somebody uses a backup code to get into the admin role');
// ===========================================================================
// Startup sync only from here on: once a PIN exists the settings screen sits
// behind it, and the subject here is sync, not the gate.
await put(A, {
  appConfig: [{
    id: 'admin', pinHash: 'test-hash', updatedAt: new Date(), setBy: 'A',
    backupCodes: [
      { code: 'spent-code', used: true, usedAt: new Date() },
      { code: 'fresh-code', used: false },
    ],
  }],
});
await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(6000);
await T.page.reload({ waitUntil: 'domcontentloaded' }); // T pulls the spent code
await T.page.waitForTimeout(6000);

await put(T, { evaluations: [mark('eval-t-0001', LATE_3001, 2)] });
await T.page.reload({ waitUntil: 'domcontentloaded' });
await T.page.waitForTimeout(6000);
check('T still uploads marks after pulling a spent backup code',
  (await cloud('evaluations')).some((d) => d.name.endsWith('eval-t-0001')), true);

await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(6000);
await put(A, { evaluations: [mark('eval-a-0003', A_3001, 2)] });
await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(6000);
check('and so does the device that used it',
  (await cloud('evaluations')).some((d) => d.name.endsWith('eval-a-0003')), true);
const spent = (await cloud('config')).find((d) => d.name.endsWith('/admin'))
  ?.fields.backupCodes.arrayValue.values
  .find((v) => v.mapValue.fields.code.stringValue === 'spent-code');
check('the spent code is still spent in the cloud',
  spent?.mapValue.fields.used.booleanValue, true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
