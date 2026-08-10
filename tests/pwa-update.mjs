// Updating a tablet to a new build — the thing that used to take an
// unpredictable number of reloads.
//
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:pwa
//
// This one builds the app itself, twice, so do not run it against a dist you
// still need.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
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

const rebuild = () => {
  execSync('npm run build:emulator', { stdio: 'ignore' });
};

/**
 * Which build the page is actually running.
 *
 * The visible stamp is no good for this: it shows minutes, so two builds a
 * minute apart look identical, and it is only drawn on the chooser and
 * Settings. The hashed asset filename changes on every build and is present
 * wherever the app is.
 */
const buildIdOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src'))
      .find((src) => src && src.includes('/assets/')) ?? null
  );

/** Ask the browser to look for a new service worker right now. */
const checkForUpdate = (page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (r) await r.update();
  });

console.log('\nBuilding the first version...');
rebuild();

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
// Wait until the worker is actually in charge — until then there is nothing to
// update from.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const first = await buildIdOf(page);
console.log(`   running build: ${first}`);
check('the tablet reports which build it is running', Boolean(first), true);

console.log('\n1. A new build is picked up without anyone reloading');
console.log('   building the second version...');
rebuild();
await checkForUpdate(page);
// The page reloads itself once the new worker has control.
await page.waitForTimeout(12000);
const second = await buildIdOf(page);
console.log(`   running build: ${second}`);
check('the tablet moved to the new build on its own', second !== first, true);
check('and it is still a real build', Boolean(second), true);

console.log('\n2. It refuses to do that while somebody is scoring');
// Get this device onto the scoring screen, mid-candidate.
await page.evaluate(F.seed, {
  exam: F.exam,
  candidates: [F.candidate('aaaaaaaa-0000-0000-0000-000000000001', '2001', 'Mid Station')],
});
await page.evaluate(({ examId, circuitId }) => {
  localStorage.setItem(
    'osce.deviceAssignment',
    JSON.stringify({
      role: 'examiner',
      examId,
      examName: 'Sync Test Exam',
      circuitId,
      circuitNumber: 1,
      stationId: 'st-1',
      stationName: 'Station 1',
      examinerName: 'Dr Mid',
    })
  );
  return new Promise((r, j) => {
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
  });
}, { examId: F.EXAM_ID, circuitId: '00000000-circ-0000-0000-000000000001' });

await page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /Start Session/i }).click();
await page.waitForTimeout(3000);
check('the examiner is on the scoring screen',
  new URL(page.url()).pathname, '/exam/active');

const beforeScoring = await buildIdOf(page);
console.log('   building a third version while the station is in use...');
rebuild();
await checkForUpdate(page);
await page.waitForTimeout(15000);
check('the tablet did NOT reload out from under the examiner',
  new URL(page.url()).pathname, '/exam/active');
const duringScoring = await buildIdOf(page);
check('and it is still on the build the examiner started with',
  duringScoring, beforeScoring);

console.log('\n3. And it updates as soon as the station is left');
await page.goto(`${BASE}/session/setup`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(18000);
const afterLeaving = await buildIdOf(page);
console.log(`   running build: ${afterLeaving}`);
check('the waiting update was applied once it was safe',
  afterLeaving !== beforeScoring, true);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
