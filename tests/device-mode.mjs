// Device mode — pinning a tablet to one job for the day.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:device
//
// Wipes the emulator database on each run.

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

await fetch('http://127.0.0.1:8080/emulator/v1/projects/osce-emulator/databases/(default)/documents', { method: 'DELETE' });

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log(`   !! ${e.message.slice(0, 160)}`));

// Admin sets up an exam, a roster and two circuits.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
// Start as an admin device. Getting *through* the front door is the subject of
// tests/role-gate.mjs; this suite is about what a pinned tablet can do.
await page.evaluate(F.asAdminDevice);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(F.seed, {
  exam: F.exam,
  candidates: [
    F.candidate('aaaaaaaa-0000-0000-0000-000000000001', '2001', 'Student One'),
    F.candidate('aaaaaaaa-0000-0000-0000-000000000002', '2002', 'Student Two'),
    F.candidate('aaaaaaaa-0000-0000-0000-000000000003', '2003', 'Student Three'),
    F.candidate('aaaaaaaa-0000-0000-0000-000000000004', '2004', 'Student Four'),
  ],
});
await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Sync Test Exam/ }).first().click();
await page.waitForTimeout(1500);
const splitBtn = page.getByRole('button', { name: /^Split them$/ });
await page.locator('div').filter({ has: splitBtn }).last().locator('input[type=number]').fill('2');
await splitBtn.click();
await page.waitForTimeout(2500);

console.log('\n1. An admin device sees everything');
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const navFor = () => page.locator('aside nav a').allInnerTexts();
check('admin sees the full navigation', (await navFor()).length, 5);
check('the device card offers to reassign it',
  await page.getByRole('button', { name: /Change what this tablet is for/i }).isVisible(), true);

console.log('\n2. Hand it to Station 1, Circuit 2');
// Settings hands the tablet back to the chooser; the chooser is where its
// job is picked.
const handToStation = async (circuitIndex) => {
  await page.getByRole('button', { name: /Change what this tablet is for/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Station/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByLabel('Select Exam').selectOption({ label: 'Sync Test Exam' });
  await page.waitForTimeout(1500);
  await page.getByLabel('Circuit Number').selectOption({ index: circuitIndex });
  await page.getByLabel('Your Station').selectOption({ index: 1 });
  await page.getByLabel('Examiner Name').fill('Dr Pinned');
  await page.getByRole('button', { name: /Use this tablet here/i }).click();
  await page.waitForTimeout(2000);
};
await handToStation(2);

check('it lands on its own screen', new URL(page.url()).pathname, '/session/setup');
check('navigation collapses to one destination', (await navFor()).length, 1);
const bar = await page.locator('.bg-blue-900').innerText();
console.log('   header: ' + bar.split(String.fromCharCode(10)).join(' | '));
check('the header names the circuit', /Circuit 2/.test(bar), true);
check('the header names the station',  /Station 1/.test(bar), true);
check('the header names the examiner', /Dr Pinned/.test(bar), true);

console.log('\n3. Admin screens are out of reach');
for (const [path, expected] of [
  ['/candidates', '/session/setup'],
  ['/exams', '/session/setup'],
  ['/settings', '/session/setup'],
  ['/reports', '/session/setup'],
  ['/checkin', '/session/setup'],
]) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  check(`${path} redirects to the station`, new URL(page.url()).pathname, expected);
}

console.log('\n4. The station starts its own session, no pickers');
await page.waitForTimeout(800);
check('no exam picker is shown', await page.getByLabel('Select Exam').count(), 0);
await page.getByRole('button', { name: /Start Session|بدء/i }).click();
await page.waitForTimeout(2500);
check('it lands on the scoring screen', new URL(page.url()).pathname, '/exam/active');

const session = await page.evaluate(() => new Promise((r) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction(['examSessions', 'circuits'], 'readonly');
    const s = tx.objectStore('examSessions').getAll();
    const c = tx.objectStore('circuits').getAll();
    let n = 2, out = {};
    s.onsuccess = () => { out.s = s.result.filter((x) => x.isActive); if (!--n) done(); };
    c.onsuccess = () => { out.c = c.result; if (!--n) done(); };
    function done() {
      const active = out.s[0];
      r({
        sessions: out.s.length,
        examinerName: active?.examinerName,
        circuitNumber: out.c.find((x) => x.id === active?.circuitId)?.circuitNumber,
      });
    }
  };
}));
console.log(`   session: ${JSON.stringify(session)}`);
check('exactly one active session', session.sessions, 1);
check('started on the pinned circuit', session.circuitNumber, 2);
check('under the pinned examiner name', session.examinerName, 'Dr Pinned');

console.log('\n5. Release hands the tablet back to the chooser');
await page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Release$/ }).click();
await page.waitForTimeout(1500);
check('the role is given up',
  await page.evaluate(() => localStorage.getItem('osce.deviceAssignment')), null);
check('and the chooser is what is left',
  await page.getByText('What is this tablet for?').isVisible(), true);
// Whether admin then costs a PIN is role-gate.mjs's business. Put this device
// back to admin so the merge case below can re-pin it.
await page.evaluate(F.asAdminDevice);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

console.log('\n6. The pinned circuit loses a merge while the tablet is closed');
// Re-pin, then stage what sync would have done: this device's Circuit 2 is
// retired in favour of another device's copy of the same circuit. The tablet
// must follow it by circuit *number* — the thing written on the door — rather
// than keep scoring against a circuit that no longer exists.
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await handToStation(2);

const pinnedBefore = JSON.parse(
  await page.evaluate(() => localStorage.getItem('osce.deviceAssignment'))
);
const SURVIVOR = '00000000-circ-survivor-0000-00000002';
await page.evaluate(({ loserId, survivorId }) => new Promise((r, j) => {
  const q = indexedDB.open('OSCEDatabase');
  q.onsuccess = () => {
    const tx = q.result.transaction('circuits', 'readwrite');
    const store = tx.objectStore('circuits');
    const get = store.get(loserId);
    get.onsuccess = () => {
      const loser = get.result;
      store.put({ ...loser, deleted: true, deletedAt: new Date(), updatedAt: new Date() });
      store.put({ ...loser, id: survivorId, deleted: false, updatedAt: new Date() });
    };
    tx.oncomplete = () => r(true);
    tx.onerror = () => j(tx.error);
  };
}), { loserId: pinnedBefore.circuitId, survivorId: SURVIVOR });

await page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const pinnedAfter = JSON.parse(
  await page.evaluate(() => localStorage.getItem('osce.deviceAssignment'))
);
check('the tablet followed the surviving circuit', pinnedAfter.circuitId, SURVIVOR);
check('and it is still Circuit 2', pinnedAfter.circuitNumber, 2);
check('the station can still start',
  await page.getByRole('button', { name: /Start Session/i }).isEnabled(), true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
