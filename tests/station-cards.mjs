// Station cards, open/closed exams, the PIN on setting up by hand and on
// Release, and clearing an examiner's own phone at the end of the day.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:cards
//
// Wipes the emulator database on each run.
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import * as F from './sync-fixture.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const FS = 'http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents';
const PIN = '4321';
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

const browser = await chromium.launch({ executablePath: CHROME });

/** A device. Phones get a phone-sized screen. */
async function device(label, { phone = false, start = '/' } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 1000 },
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`   !! [${label}] ${e.message.slice(0, 150)}`));
  await page.goto(BASE + start, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  return {
    ctx,
    page,
    assignment: async () =>
      JSON.parse((await page.evaluate(() => localStorage.getItem('osce.deviceAssignment'))) ?? 'null'),
    text: () => page.locator('body').innerText(),
    async sync() {
      await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: /Sync Now/i }).click();
      await page.waitForTimeout(4000);
    },
  };
}

const readExam = (page, id) =>
  page.evaluate((examId) => new Promise((r) => {
    const q = indexedDB.open('OSCEDatabase');
    q.onsuccess = () => {
      const g = q.result.transaction('examTemplates', 'readonly').objectStore('examTemplates').get(examId);
      g.onsuccess = () => r(g.result ?? null);
    };
  }), id);

const code = (secret, examId, n, stationId) =>
  createHash('sha256').update(`${secret}|${examId}|${n}|${stationId}`).digest('hex').slice(0, 10).toUpperCase();
const cardPath = (examId, n, stationId, k) =>
  `/station?${new URLSearchParams({ e: examId, c: String(n), s: stationId, k })}`;

const OTHER = { ...F.exam, id: '00000000-exam-0000-0000-000000000002', name: 'Other Exam' };

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. The organiser sets the PIN, an exam, a roster and two circuits');
const A = await device('A');
await A.page.getByRole('button', { name: /Admin/ }).click();
await A.page.waitForTimeout(800);
await A.page.getByLabel('PIN (4-6 digits)').fill(PIN);
await A.page.getByLabel('Enter it again').fill(PIN);
await A.page.getByRole('button', { name: /^Set PIN$/ }).click();
await A.page.waitForTimeout(1500);
await A.page.locator('input[type=checkbox]').first().check();
await A.page.getByRole('button', { name: /Saved Them/i }).click();
await A.page.waitForTimeout(2000);

// Both exams arrive closed, as every exam written before this change does.
const { openForExamining: _o, cardSecret: _c, ...closedExam } = F.exam;
await A.page.evaluate(F.seed, {
  exam: closedExam,
  candidates: [
    F.candidate('aaaaaaaa-0000-0000-0000-000000000001', '2001', 'Student One'),
    F.candidate('aaaaaaaa-0000-0000-0000-000000000002', '2002', 'Student Two'),
  ],
});
const { openForExamining: _o2, cardSecret: _c2, ...closedOther } = OTHER;
await A.page.evaluate(F.seed, { exam: closedOther, candidates: [] });
await A.page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await A.page.getByRole('button', { name: /Sync Test Exam/ }).first().click();
await A.page.waitForTimeout(1500);
const splitBtn = A.page.getByRole('button', { name: /^Split them$/ });
await A.page.locator('div').filter({ has: splitBtn }).last().locator('input[type=number]').fill('2');
await splitBtn.click();
await A.page.waitForTimeout(2500);
check('the exam starts closed', Boolean((await readExam(A.page, F.EXAM_ID)).openForExamining), false);

console.log('\n2. Opening the exam on the Exams page');
await A.page.goto(`${BASE}/exams`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
const examRow = (name) => A.page.locator('div.rounded-xl.p-4').filter({ hasText: name });
check('it shows as Closed', await examRow('Sync Test Exam').getByRole('button', { name: /^Closed$/ }).isVisible(), true);
await examRow('Sync Test Exam').getByRole('button', { name: /^Closed$/ }).click();
await A.page.waitForTimeout(1500);
check('and now shows as open',
  await examRow('Sync Test Exam').getByRole('button', { name: /Open for examining/ }).isVisible(), true);
let stored = await readExam(A.page, F.EXAM_ID);
check('it is stored as open', stored.openForExamining, true);
check('and has a card secret', typeof stored.cardSecret === 'string' && stored.cardSecret.length >= 16, true);
check('the other exam stays closed', Boolean((await readExam(A.page, OTHER.id)).openForExamining), false);
const SECRET = stored.cardSecret;

console.log('\n3. Printing the station cards');
await A.page.goto(`${BASE}/checkin/${F.EXAM_ID}`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await A.page.getByRole('button', { name: /Circuit lists/ }).first().click();
await A.page.waitForTimeout(800);
await A.page.getByRole('button', { name: /^Station cards$/ }).click();
await A.page.waitForTimeout(2500);
const printed = await A.page.locator('.station-card').allInnerTexts();
check('one card per station per circuit (2 × 1)', printed.length, 2);
const circuits = await A.page.evaluate((examId) => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const g = q.result.transaction('circuits', 'readonly').objectStore('circuits').getAll();
    g.onsuccess = () => r(g.result.filter((c) => c.examId === examId && !c.deleted)
      .map((c) => ({ id: c.id, n: c.circuitNumber })));
  };
}), F.EXAM_ID);
const K1 = code(SECRET, F.EXAM_ID, 1, 'st-1');
const K2 = code(SECRET, F.EXAM_ID, 2, 'st-1');
check('each card carries the right check code',
  [printed.some((t) => t.includes(K1)), printed.some((t) => t.includes(K2))], [true, true]);
check('and has a QR image', await A.page.locator('.station-card img[src^="data:image/png"]').count(), 2);
await A.sync();

console.log('\n4. A brand-new phone scans the Circuit 2 card');
const B = await device('B-phone', { phone: true, start: cardPath(F.EXAM_ID, 2, 'st-1', K2) });
await B.page.waitForTimeout(4000);
let body = await B.text();
check('it is shown Circuit 2', /Circuit 2/.test(body), true);
check('and Station 1', /Station 1/.test(body), true);
check('and never sees the other exam', /Other Exam/.test(body), false);
await B.page.getByLabel('Examiner Name').fill('Dr Phone');
await B.page.getByRole('button', { name: /Start at this station/ }).click();
await B.page.waitForTimeout(2500);
let pinned = await B.assignment();
check('the phone is now an examiner station', pinned?.role, 'examiner');
check('on Circuit 2', pinned?.circuitNumber, 2);
check('at Station 1', pinned?.stationId, 'st-1');
check('under the examiner name', pinned?.examinerName, 'Dr Phone');
check('and it is on the station screen', new URL(B.page.url()).pathname, '/session/setup');

console.log('\n5. Cards that have been tampered with are refused');
const C = await device('C', { phone: true, start: cardPath(F.EXAM_ID, 2, 'st-1', 'ABCDEF1234') });
await C.page.waitForTimeout(4000);
check('a wrong code is not recognised', /Card not recognised/.test(await C.text()), true);
await C.page.goto(BASE + cardPath(F.EXAM_ID, 1, 'st-1', K2), { waitUntil: 'domcontentloaded' });
await C.page.waitForTimeout(4000);
check('nor is a Circuit 2 card edited to say Circuit 1', /Card not recognised/.test(await C.text()), true);
check('and the device is still not set up', await C.assignment(), null);

console.log('\n6. A card for a closed exam is refused');
await A.page.goto(`${BASE}/exams`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await examRow('Sync Test Exam').getByRole('button', { name: /Open for examining/ }).click();
await A.page.waitForTimeout(1500);
await A.sync();
const D = await device('D', { phone: true, start: cardPath(F.EXAM_ID, 1, 'st-1', K1) });
await D.page.waitForTimeout(4000);
check('closed says closed', /This exam is not open/.test(await D.text()), true);
check('and sets nothing up', await D.assignment(), null);
// Open it again for the rest of the run.
await A.page.goto(`${BASE}/exams`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await examRow('Sync Test Exam').getByRole('button', { name: /^Closed$/ }).click();
await A.page.waitForTimeout(1500);
await A.sync();
await D.page.getByRole('button', { name: /Try again/ }).click();
await D.page.waitForTimeout(5000);
check('once reopened, the same card works', /Start at this station/.test(await D.text()), true);

console.log('\n7. Setting a station up by hand costs the PIN and shows only open exams');
const E = await device('E');
await E.page.getByRole('button', { name: /Station/ }).first().click();
await E.page.waitForTimeout(1000);
check('it asks for the admin PIN', await E.page.getByLabel('PIN (4-6 digits)').isVisible(), true);
check('with no way to recover it from here', await E.page.getByText(/Forgotten it/).count(), 0);
await E.page.getByLabel('PIN (4-6 digits)').fill('1111');
await E.page.getByRole('button', { name: /^Unlock$/ }).click();
await E.page.waitForTimeout(1000);
check('a wrong PIN is refused', await E.page.getByText(/not right/i).isVisible(), true);
check('and no exam list appears', await E.page.getByLabel('Select Exam').count(), 0);
await E.page.getByLabel('PIN (4-6 digits)').fill(PIN);
await E.page.getByRole('button', { name: /^Unlock$/ }).click();
await E.page.waitForTimeout(1500);
const options = await E.page.getByLabel('Select Exam').locator('option').allInnerTexts();
console.log(`   offered: ${JSON.stringify(options)}`);
check('the open exam is offered', options.some((o) => o.includes('Sync Test Exam')), true);
check('the closed one is not', options.some((o) => o.includes('Other Exam')), false);
check('and with one open exam it is already chosen',
  await E.page.getByLabel('Select Exam').inputValue(), F.EXAM_ID);

console.log('\n8. Release costs the PIN');
await B.page.getByRole('button', { name: /^Release$/ }).click();
await B.page.waitForTimeout(800);
check('it asks for the PIN', await B.page.getByText('Release this device').isVisible(), true);
for (const d of '1111') await B.page.getByRole('button', { name: new RegExp(`^${d}$`) }).click();
await B.page.getByRole('button', { name: /^Unlock$/ }).click();
await B.page.waitForTimeout(1000);
check('a wrong PIN is refused', await B.page.getByText(/Incorrect PIN/i).isVisible(), true);
check('and the phone stays a station', (await B.assignment())?.role, 'examiner');
await B.page.getByRole('button', { name: /^Cancel$/ }).click();
await B.page.waitForTimeout(500);

console.log('\n9. Wrong card? Scan the right one. Not mid-session, though');
await B.page.goto(BASE + cardPath(F.EXAM_ID, 1, 'st-1', K1), { waitUntil: 'domcontentloaded' });
await B.page.waitForTimeout(3500);
await B.page.getByRole('button', { name: /Start at this station/ }).click();
await B.page.waitForTimeout(2500);
check('with no session running, it moves to Circuit 1', (await B.assignment())?.circuitNumber, 1);
await B.page.getByRole('button', { name: /Start Session/i }).click();
await B.page.waitForTimeout(2500);
await B.page.goto(BASE + cardPath(F.EXAM_ID, 2, 'st-1', K2), { waitUntil: 'domcontentloaded' });
await B.page.waitForTimeout(3500);
check('mid-session, the card is refused', /A session is still running here/.test(await B.text()), true);
await B.page.getByRole('button', { name: /^Back$/ }).click();
await B.page.waitForTimeout(2000);
check('and the phone is still Circuit 1', (await B.assignment())?.circuitNumber, 1);
// The card was a full page load, so the session survives only in the
// database. The phone must pick it back up, not claim there is none.
check('after the reload it is back on the scoring screen, session resumed',
  new URL(B.page.url()).pathname, '/exam/active');
check('with the student list showing',
  await B.page.locator('div.fixed').filter({ hasText: 'Select Candidate' }).last().isVisible(), true);
// End the session from the student list.
await B.page.locator('div.fixed').filter({ hasText: 'Select Candidate' }).last()
  .getByRole('button', { name: /End Session/i }).click();
await B.page.waitForTimeout(3000);

console.log('\n10. Clearing the phone waits for every mark to reach the cloud');
// A mark the server will refuse (no examiner name), so it stays unsent.
const MARK = 'eeeeeeee-0000-0000-0000-00000000c1ea';
const putMark = (examinerName) => B.page.evaluate(({ id, examId, circuitId, examinerName }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('evaluations', 'readwrite');
    const row = {
      id, examId, circuitId, candidateId: 'aaaaaaaa-0000-0000-0000-000000000001',
      stationId: 'st-1', scores: [], totalScore: 4, maxPossibleScore: 4,
      startTime: new Date(), endTime: new Date(), synced: false, identifiedBy: 'manual',
    };
    if (examinerName) row.examinerName = examinerName;
    tx.objectStore('evaluations').put(row);
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { id: MARK, examId: F.EXAM_ID, circuitId: circuits.find((c) => c.n === 1).id, examinerName });
await putMark(null);
await B.page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await B.page.waitForTimeout(3000);
await B.page.getByRole('button', { name: /^Send now$/ }).click().catch(() => {});
await B.page.waitForTimeout(4000);
body = await B.text();
check('it says a mark has not reached the cloud', /have not reached the cloud yet/.test(body), true);
check('and Clear is not allowed',
  await B.page.getByRole('button', { name: /^Clear this device$/ }).isDisabled(), true);

await putMark('Dr Phone');
await B.page.getByRole('button', { name: /^Send now$/ }).click();
await B.page.waitForTimeout(5000);
check('once sent, it says so', /All marks from this device have reached the cloud/.test(await B.text()), true);
const inCloud = (await fetch(`${FS}/evaluations/${MARK}`, {
  headers: { Authorization: 'Bearer owner' },
})).status;
check('and the mark really is in the cloud', inCloud, 200);

await B.page.getByRole('button', { name: /^Clear this device$/ }).click();
await B.page.waitForTimeout(5000);
check('the phone says it has been cleared',
  await B.page.getByText('This device has been cleared').isVisible(), true);
const left = async () => B.page.evaluate(async () =>
  (await indexedDB.databases()).map((d) => d.name).filter((n) => n === 'OSCEDatabase' || n.startsWith('firestore/')));
check('the app database and Firestore\'s copy are gone', await left(), []);
check('nothing is pinned', await B.assignment(), null);
check('and the examiner name is forgotten',
  await B.page.evaluate(() => localStorage.getItem('examinerName')), null);

await B.page.reload({ waitUntil: 'domcontentloaded' });
await B.page.waitForTimeout(6000);
check('reopened later, it is still cleared',
  await B.page.getByText('This device has been cleared').isVisible(), true);
check('and nothing has been downloaded again', await left(), []);

console.log('\n11. Closed after a device downloaded it open: the cloud has the last word');
// G is set up while the exam is open, so its own copy says "open".
const G = await device('G', { phone: true, start: cardPath(F.EXAM_ID, 1, 'st-1', K1) });
await G.page.waitForTimeout(4000);
await G.page.getByLabel('Examiner Name').fill('Dr Late');
await G.page.getByRole('button', { name: /Start at this station/ }).click();
await G.page.waitForTimeout(2500);
check('G is a station on the open exam', (await G.assignment())?.circuitNumber, 1);
check('and can start a session', await G.page.getByRole('button', { name: /Start Session/i }).isVisible(), true);

// The organiser closes it. G has not heard yet.
await A.page.goto(`${BASE}/exams`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await examRow('Sync Test Exam').getByRole('button', { name: /Open for examining/ }).click();
await A.page.waitForTimeout(1500);
await A.sync();
check('G\'s own copy still says open',
  Boolean((await readExam(G.page, F.EXAM_ID)).openForExamining), true);

await G.page.goto(BASE + cardPath(F.EXAM_ID, 2, 'st-1', K2), { waitUntil: 'domcontentloaded' });
await G.page.waitForTimeout(6000);
check('online, a card is checked with the cloud and refused', /This exam is not open/.test(await G.text()), true);
check('and G is not moved', (await G.assignment())?.circuitNumber, 1);

await G.page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await G.page.waitForTimeout(5000);
check('the station screen says the exam is closed',
  /This exam is closed for examining/.test(await G.text()), true);
check('and offers no Start Session', await G.page.getByRole('button', { name: /Start Session/i }).count(), 0);

// Reopened: G picks that up as well.
await A.page.goto(`${BASE}/exams`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await examRow('Sync Test Exam').getByRole('button', { name: /^Closed$/ }).click();
await A.page.waitForTimeout(1500);
await A.sync();
await G.page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await G.page.waitForTimeout(5000);
check('reopened, the station can start again',
  await G.page.getByRole('button', { name: /Start Session/i }).isVisible(), true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
