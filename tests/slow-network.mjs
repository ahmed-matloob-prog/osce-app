// A station phone on a slow or stalling connection.
//
// On exam-day trial a phone on 3G sat on "Sending…" for good with one mark
// unsent: every sync uploaded the whole roster and every check-in before the
// marks, and no step had a time limit, so one stalled upload held everything.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:slow
//
// Wipes the emulator database on each run.
import { chromium } from 'playwright-core';
import * as F from './sync-fixture.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const FS = 'http://127.0.0.1:8080/v1/projects/osce-emulator/databases/(default)/documents';
const ROSTER = 300;
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

// ── The organiser: a 300-student exam in two circuits, synced ──────────────
const actx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const A = await actx.newPage();
A.on('dialog', (d) => d.accept());
await A.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2500);
await A.evaluate(F.asAdminDevice);
await A.reload({ waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2500);
const roster = Array.from({ length: ROSTER }, (_, i) =>
  F.candidate(`aaaaaaaa-0000-0000-0000-${String(i + 1).padStart(12, '0')}`, String(3000 + i), `Student ${i + 1}`));
await A.evaluate(F.seed, { exam: F.exam, candidates: roster });
await A.goto(`${BASE}/checkin/${F.EXAM_ID}`, { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2500);
const split = A.getByRole('button', { name: /^Split them$/ });
await A.locator('div').filter({ has: split }).last().locator('input[type=number]').fill('2');
await split.click();
await A.waitForTimeout(4000);
await A.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2000);
await A.getByRole('button', { name: /Sync Now/i }).click();
await A.waitForTimeout(12000);

// ── The phone: set up from its card, then watch what it uploads ────────────
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const P = await pctx.newPage();
P.on('dialog', (d) => d.accept());
P.on('pageerror', (e) => console.log(`   !! ${e.message.slice(0, 150)}`));
await P.goto(BASE + (await F.cardPathFor(1)), { waitUntil: 'domcontentloaded' });
await P.waitForTimeout(8000);
await P.getByLabel('Examiner Name').fill('Dr Slow');
await P.getByRole('button', { name: /Start at this station/ }).click();
await P.waitForTimeout(8000); // let the startup sync settle

/** Every document path the phone writes, in the order its write requests go out. */
const written = [];
P.on('request', (req) => {
  if (process.env.DEBUG_SLOW && /8080/.test(req.url())) console.log(`   [req] ${req.method()} ${req.url().slice(0, 110)}`);
  if (!/Firestore\/Write\//.test(req.url()) || req.method() !== 'POST') return;
  let body = req.postData() ?? '';
  try { body = decodeURIComponent(body.replace(/\+/g, ' ')); } catch { /* keep raw */ }
  for (const m of body.matchAll(/documents\/(candidates|checkIns|circuits|evaluations|exams|config)\/([\w-]+)/g)) {
    written.push(`${m[1]}/${m[2]}`);
  }
});

const putMark = (id) => P.evaluate(({ id, examId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction(['evaluations', 'circuits'], 'readwrite');
    const c = tx.objectStore('circuits').getAll();
    c.onsuccess = () => {
      const circuit = c.result.find((x) => x.examId === examId && !x.deleted && x.circuitNumber === 1);
      tx.objectStore('evaluations').put({
        id, examId, circuitId: circuit.id, candidateId: 'aaaaaaaa-0000-0000-0000-000000000001',
        stationId: 'st-1', examinerName: 'Dr Slow', scores: [], totalScore: 4, maxPossibleScore: 4,
        startTime: new Date(), endTime: new Date(), synced: false, identifiedBy: 'manual',
      });
    };
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { id, examId: F.EXAM_ID });

const inCloud = async (id) =>
  (await fetch(`${FS}/evaluations/${id}`, { headers: { Authorization: 'Bearer owner' } })).status === 200;

const showStation = async () => {
  await P.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(2500);
};

console.log(`\n1. One new mark, one student edited on the phone: what goes up, and in what order`);
const MARK1 = 'eeeeeeee-0000-0000-0000-0000000510a1';
await putMark(MARK1);
// One genuine local change to the roster, so there is something to upload.
await P.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('candidates', 'readwrite');
    const s = tx.objectStore('candidates');
    const g = s.get('aaaaaaaa-0000-0000-0000-000000000007');
    g.onsuccess = () => s.put({ ...g.result, name: 'Student Seven (corrected)', updatedAt: new Date() });
    tx.oncomplete = () => r(true);
  };
}));
// Opening the app syncs by itself, so watch from before the page loads.
written.length = 0;
await showStation();
await P.getByRole('button', { name: /^Send now$/ }).click({ timeout: 2000 }).catch(() => {});
await P.waitForTimeout(12000);
const kinds = (k) => [...new Set(written.filter((w) => w.startsWith(k + '/')))];
console.log(`   written: ${kinds('evaluations').length} mark(s), ${kinds('candidates').length} student(s), ` +
  `${kinds('checkIns').length} check-in(s), ${kinds('circuits').length} circuit(s)`);
check('the mark reached the cloud', await inCloud(MARK1), true);
check('only the one edited student was uploaded, not the roster',
  kinds('candidates'), ['candidates/aaaaaaaa-0000-0000-0000-000000000007']);
check('no unchanged check-in was uploaded', kinds('checkIns').length, 0);
check('no unchanged circuit was uploaded', kinds('circuits').length, 0);
const firstMark = written.findIndex((w) => w.startsWith('evaluations/'));
const firstStudent = written.findIndex((w) => w.startsWith('candidates/'));
check('the mark went up before the roster', firstMark >= 0 && firstMark < firstStudent, true);
const cloudName = await (await fetch(`${FS}/candidates/aaaaaaaa-0000-0000-0000-000000000007`, {
  headers: { Authorization: 'Bearer owner' },
})).json();
check('and the edit itself arrived', cloudName.fields?.name?.stringValue, 'Student Seven (corrected)');

console.log('\n2. The connection stalls: the phone must not sit on "Sending…" for ever');
await P.evaluate(() => localStorage.setItem('osce.test.syncTimeoutMs', '4000'));
const MARK2 = 'eeeeeeee-0000-0000-0000-0000000510a2';
await putMark(MARK2);
// Hold every write request open without ever answering it: a stalled link.
const held = [];
const WRITES = /Firestore\/Write\/channel/;
await pctx.route(WRITES, (route) => { held.push(route); });
await P.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
// The app syncs on opening; with writes held, that sync stalls.
await P.waitForTimeout(3000);
const sendingNow = await P.getByRole('button', { name: /Sending/ }).count();
if (!sendingNow) await P.getByRole('button', { name: /^Send now$/ }).click({ timeout: 2000 }).catch(() => {});
await P.waitForTimeout(1000);
if (process.env.DEBUG_SLOW) {
  console.log(`   [debug] held=${held.length} inCloud=${await inCloud(MARK2)} :: ` +
    (await P.locator('body').innerText()).slice(0, 400).split('\n').join(' | '));
}
check('it is trying to send', await P.getByRole('button', { name: /Sending/ }).count(), 1);
await P.waitForTimeout(25000);
check('within the time limit it stops trying, instead of hanging',
  await P.getByRole('button', { name: /^Send now$/ }).isEnabled(), true);
check('and still says the mark has not reached the cloud',
  /1 mark\(s\) have not reached the cloud yet/.test(await P.locator('body').innerText()), true);
check('the mark is not in the cloud', await inCloud(MARK2), false);

console.log('\n3. The connection comes back: the same mark goes up');
await pctx.unroute(WRITES);
for (const r of held) await r.abort().catch(() => {});
let arrived = false;
for (let i = 0; i < 12 && !arrived; i++) {
  await P.getByRole('button', { name: /^Send now$/ }).click().catch(() => {});
  await P.waitForTimeout(8000);
  arrived = await inCloud(MARK2);
}
check('the mark reaches the cloud', arrived, true);
await P.waitForTimeout(3000);
check('and the phone agrees, so it can be cleared',
  /All marks from this device have reached the cloud/.test(await P.locator('body').innerText()), true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
