// Reports — the screen that produces the results document.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:reports
import { chromium } from 'playwright-core';
import * as F from './sync-fixture.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5199';
let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `   ${ok ? 'PASS' : 'FAIL'}  ${label}${
      ok
        ? ''
        : `\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`
    }`
  );
};

await fetch(
  'http://127.0.0.1:8080/emulator/v1/projects/osce-emulator/databases/(default)/documents',
  { method: 'DELETE' }
);

const CAND = 'aaaaaaaa-0000-0000-0000-000000000001';
const CIRCUIT = '00000000-circ-0000-0000-000000000001';

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log(`   !! ${e.message.slice(0, 160)}`));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(F.asAdminDevice);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(F.seed, {
  exam: F.exam,
  candidates: [F.candidate(CAND, '2001', 'Scored Student')],
});

const openReports = async () => {
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  // The label now carries a mark count, so match on the name only.
  const opts = await page.locator('select').first().locator('option').allInnerTexts();
  await page.locator('select').first().selectOption({
    index: opts.findIndex((o) => o.startsWith('Sync Test Exam')),
  });
  await page.waitForTimeout(1800);
  return page.locator('body').innerText();
};

console.log('\n1. An exam nobody has scored yet says so');
let body = await openReports();
check('the empty state explains itself',
  /No marks recorded for this exam yet/.test(body), true);
check('and it does not claim a report is available',
  /Cohort Summary/.test(body), false);

console.log('\n2. One scored candidate produces a report');
// A mark exactly as the scoring screen writes one.
await page.evaluate(({ candidateId, circuitId, examId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction(['evaluations', 'circuits'], 'readwrite');
    tx.objectStore('circuits').put({
      id: circuitId, examId, circuitNumber: 1, examiners: [], candidateIds: [],
      updatedAt: new Date(),
    });
    tx.objectStore('evaluations').put({
      id: 'eval-0001', examId, circuitId, candidateId,
      stationId: 'st-1', examinerName: 'Dr Reports', identifiedBy: 'scanned',
      scores: [{ itemId: 'it-1', score: 2 }, { itemId: 'it-2', score: 1 }],
      notes: '', startTime: new Date(), endTime: new Date(),
      totalScore: 3, maxPossibleScore: 4, synced: false,
    });
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { candidateId: CAND, circuitId: CIRCUIT, examId: F.EXAM_ID });

body = await openReports();
check('the mark is counted', /1 evaluations found/.test(body), true);
check('and so is the candidate', /1 candidates/.test(body), true);
check('report types are offered', /Cohort Summary/.test(body), true);

console.log('\n3. A student removed from the roster keeps their marks');
// The bug: reports resolved candidates from the live roster, which excludes
// anyone soft-deleted. Their marks stayed in the database but vanished from
// the results, and nothing said so.
await page.evaluate((id) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('candidates', 'readwrite');
    const store = tx.objectStore('candidates');
    const get = store.get(id);
    get.onsuccess = () => store.put({
      ...get.result, deleted: true, deletedAt: new Date(), updatedAt: new Date(),
    });
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), CAND);

body = await openReports();
check('the mark is still counted', /1 evaluations found/.test(body), true);
check('and the student is still in the results', /1 candidates/.test(body), true);
check('no false orphan warning', /belong to students not on this device/.test(body), false);

console.log('\n4. A mark with no student record at all is flagged, not hidden');
// Deleting the student locally does not produce this: the next sync pulls them
// back from the cloud, which is the sync working. The real case is a mark that
// arrived from another tablet whose student this device has never received.
await page.evaluate(({ examId, circuitId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('evaluations', 'readwrite');
    tx.objectStore('evaluations').put({
      id: 'eval-0002', examId, circuitId, candidateId: 'never-seen-here',
      stationId: 'st-1', examinerName: 'Dr Elsewhere', identifiedBy: 'scanned',
      scores: [{ itemId: 'it-1', score: 2 }], notes: '',
      startTime: new Date(), endTime: new Date(),
      totalScore: 2, maxPossibleScore: 4, synced: true,
    });
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { examId: F.EXAM_ID, circuitId: CIRCUIT });

body = await openReports();
check('both marks are counted', /2 evaluations found/.test(body), true);
check('but only one student is known', /1 candidates/.test(body), true);
check('the incomplete report is called out',
  /belong to students not on this device/.test(body), true);
check('and it says what to do about it',
  /Sync this device before publishing/.test(body), true);

console.log('\n5. Two marks for one student at one station are called out');
await page.evaluate(({ examId, circuitId, candidateId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('evaluations', 'readwrite');
    tx.objectStore('evaluations').put({
      id: 'eval-0003', examId, circuitId, candidateId,
      stationId: 'st-1', examinerName: 'Dr Reports', identifiedBy: 'scanned',
      scores: [{ itemId: 'it-1', score: 1 }], notes: '',
      startTime: new Date(), endTime: new Date(),
      totalScore: 1, maxPossibleScore: 4, synced: false,
    });
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { examId: F.EXAM_ID, circuitId: CIRCUIT, candidateId: CAND });

body = await openReports();
check('the double-scored student is flagged',
  /scored more than once at the same station/.test(body), true);
check('both marks are shown so somebody can choose',
  body.includes('3/4') && body.includes('1/4'), true);
check('and it says the totals include both',
  /both are counted in the totals/.test(body), true);

console.log('\n6. A second device sees marks it never recorded');
// The exam-day case: fifteen tablets score, the admin reads the results on a
// sixteenth. Marks used to be push-only, so that device saw nothing and said
// nothing about it.
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Sync Now/i }).click();
await page.waitForTimeout(6000);

const admin = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const adminPage = await admin.newPage();
adminPage.on('dialog', (d) => d.accept());
await adminPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await adminPage.waitForTimeout(3000);
await adminPage.evaluate(F.asAdminDevice);
await adminPage.reload({ waitUntil: 'domcontentloaded' });
await adminPage.waitForTimeout(4000);

const localMarks = await adminPage.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const a = q.result.transaction('evaluations', 'readonly').objectStore('evaluations').getAll();
    a.onsuccess = () => r(a.result.length);
  };
}));
check('the admin device recorded no marks of its own', localMarks, 0);

await adminPage.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
await adminPage.waitForTimeout(2000);
const adminOpts = await adminPage.locator('select').first().locator('option').allInnerTexts();
await adminPage.locator('select').first().selectOption({
  index: adminOpts.findIndex((o) => o.startsWith('Sync Test Exam')),
});
await adminPage.waitForTimeout(6000);
const adminBody = await adminPage.locator('body').innerText();
console.log('   admin device sees: ' + (adminBody.match(/[0-9]+ evaluations found[^\n]*/) || ['nothing'])[0]);
// Two, not three: the fixture wrote one mark with synced:true to stand in for
// a foreign mark, so it was never offered to the cloud. The two real ones are
// exactly what should arrive.
check('it pulled the marks down from the cloud',
  /2 evaluations found/.test(adminBody), true);
check('and the student came down with them',
  /1 candidates/.test(adminBody), true);
check('so nothing is reported as missing',
  /belong to students not on this device/.test(adminBody), false);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
