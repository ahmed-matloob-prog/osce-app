// Scoring the same student twice at one station.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:duplicate
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

const CIRCUIT = '00000000-circ-0000-0000-000000000001';
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
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
  candidates: [F.candidate('aaaaaaaa-0000-0000-0000-000000000001', '2001', 'Twice Scored')],
});
await page.evaluate(({ examId, circuitId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('circuits', 'readwrite');
    tx.objectStore('circuits').put({
      id: circuitId, examId, circuitNumber: 1, examiners: [], candidateIds: [],
      updatedAt: new Date(),
    });
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { examId: F.EXAM_ID, circuitId: CIRCUIT });

// Take a station.
await page.evaluate(({ examId, circuitId }) => {
  localStorage.setItem('osce.deviceAssignment', JSON.stringify({
    role: 'examiner', examId, examName: 'Sync Test Exam',
    circuitId, circuitNumber: 1, stationId: 'st-1', stationName: 'Station 1',
    examinerName: 'Dr Twice',
  }));
}, { examId: F.EXAM_ID, circuitId: CIRCUIT });

/** Identify the student off the roster and read the confirmation panel. */
const proposeStudent = async () => {
  await page.getByRole('button', { name: /Twice Scored|2001/ }).first().click();
  await page.waitForTimeout(1200);
  return page.locator('body').innerText();
};

/** Score every item and submit. */
const scoreAndSubmit = async () => {
  // Give every checklist item its top score.
  for (const label of ['Done', 'Done']) {
    const b = page.getByRole('button', { name: new RegExp(`^${label}$`) });
    const n = await b.count();
    for (let i = 0; i < n; i++) await b.nth(i).click().catch(() => {});
  }
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Submit Evaluation/i }).click();
  await page.waitForTimeout(3000);
};

const startStation = async () => {
  await page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Start Session/i }).click();
  await page.waitForTimeout(2500);
};

console.log('\n1. The first time, nothing is in the way');
await startStation();
let body = await proposeStudent();
check('no duplicate warning', /Already scored at this station/.test(body), false);
check('the button invites scoring', /Start scoring/.test(body), true);
await page.getByRole('button', { name: /Start scoring/i }).click();
await page.waitForTimeout(1500);
await scoreAndSubmit();

const afterFirst = await page.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const a = q.result.transaction('evaluations', 'readonly').objectStore('evaluations').getAll();
    a.onsuccess = () => r(a.result.map((e) => ({ score: e.totalScore, supersedes: e.supersedes ?? null })));
  };
}));
console.log('   marks: ' + JSON.stringify(afterFirst));
check('one mark exists', afterFirst.length, 1);
check('and it supersedes nothing', afterFirst[0]?.supersedes, null);

console.log('\n2. The second time, the examiner is shown what already exists');
body = await proposeStudent();
console.log('   panel says: ' + (body.match(/Already scored at this station[^\n]*\n[^\n]*/) || ['nothing'])[0].split('\n').join(' | '));
check('the existing mark is shown', /Already scored at this station/.test(body), true);
check('with its score and examiner', /Dr Twice/.test(body), true);
check('the button changes to Score again', /Score again/.test(body), true);
check('and it is still possible to proceed',
  await page.getByRole('button', { name: /Score again/i }).isEnabled(), true);
check('backing out is still offered', /Not this student/.test(body), true);

console.log('\n3. Scoring again records which mark it replaces');
await page.getByRole('button', { name: /Score again/i }).click();
await page.waitForTimeout(1500);
await scoreAndSubmit();

const afterSecond = await page.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const a = q.result.transaction('evaluations', 'readonly').objectStore('evaluations').getAll();
    a.onsuccess = () => r(a.result.map((e) => ({ id: e.id, supersedes: e.supersedes ?? null })));
  };
}));
check('there are now two marks', afterSecond.length, 2);
const later = afterSecond.find((e) => e.supersedes);
check('the later one names the earlier', Boolean(later), true);
check('and it names the right one',
  afterSecond.some((e) => e.id === later?.supersedes), true);

console.log('\n4. The report calls it a correction, not an accident');
await page.evaluate(F.asAdminDevice);
await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const opts = await page.locator('select').first().locator('option').allInnerTexts();
await page.locator('select').first().selectOption({
  index: opts.findIndex((o) => o.startsWith('Sync Test Exam')),
});
await page.waitForTimeout(4000);
body = await page.locator('body').innerText();
check('it is reported as a deliberate re-score',
  /re-scored deliberately/.test(body), true);
check('and NOT as a duplicate nobody noticed',
  /scored more than once at the same station/.test(body), false);
check('the later mark is named as the intended result',
  /the later one is the intended result/.test(body), true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
