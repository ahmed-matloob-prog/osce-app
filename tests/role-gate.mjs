// The front door — what a tablet says it is, and what that costs.
//
//   npm run build:emulator
//   npm run emulator          # terminal 2
//   npm run serve:dist        # terminal 3
//   npm run test:gate
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

async function device(label, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (offline) {
    await ctx.route('**/*', (route) => {
      const { port } = new URL(route.request().url());
      return port === '8080' || port === '9099' ? route.abort() : route.continue();
    });
  }
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`   !! [${label}] ${e.message.slice(0, 150)}`));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  return {
    ctx,
    page,
    label,
    role: () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('osce.deviceAssignment');
        return raw ? JSON.parse(raw).role : 'unset';
      }),
    async sync() {
      await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: /Sync Now/i }).click();
      await page.waitForTimeout(4000);
    },
  };
}

console.log('\n1. A brand-new tablet does nothing until it is told what it is');
const A = await device('A');
check('it starts with no role', await A.role(), 'unset');
check('the chooser is shown', await A.page.getByText('What is this tablet for?').isVisible(), true);
check('and admin says no PIN is set yet', await A.page.getByText(/No PIN set yet/i).isVisible(), true);
for (const path of ['/exams', '/candidates', '/settings']) {
  await A.page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await A.page.waitForTimeout(700);
  check(
    `${path} is behind the gate too`,
    await A.page.getByText('What is this tablet for?').isVisible(),
    true
  );
}

console.log('\n2. The first admin sets the PIN and gets backup codes');
await A.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(1500);
await A.page.getByRole('button', { name: /Admin/ }).click();
await A.page.waitForTimeout(800);
await A.page.getByLabel('PIN (4-6 digits)').fill('4321');
await A.page.getByLabel('Enter it again').fill('4321');
await A.page.getByRole('button', { name: /^Set PIN$/ }).click();
await A.page.waitForTimeout(1500);

const shown = (await A.page.locator('body').innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g) ?? [];
console.log(`   backup codes shown: ${shown.length}`);
check('five backup codes are shown, once', shown.length, 5);

// The modal will not let you past until you tick that you have written them
// down, which is the right behaviour and has to be honoured here too.
await A.page.locator('input[type=checkbox]').first().check();
await A.page.getByRole('button', { name: /Saved Them/i }).click();
await A.page.waitForTimeout(2000);
check('this device is now an admin', await A.role(), 'admin');
check(
  'and the admin navigation is back',
  (await A.page.locator('aside nav a').allInnerTexts()).length,
  5
);

console.log('\n3. Set up an exam, then let the PIN reach a second tablet');
await A.page.evaluate(F.seed, {
  exam: F.exam,
  candidates: [
    F.candidate('aaaaaaaa-0000-0000-0000-000000000001', '2001', 'Student One'),
    F.candidate('aaaaaaaa-0000-0000-0000-000000000002', '2002', 'Student Two'),
  ],
});
await A.page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await A.page.waitForTimeout(2000);
await A.page.getByRole('button', { name: /Sync Test Exam/ }).first().click();
await A.page.waitForTimeout(1500);
const splitBtn = A.page.getByRole('button', { name: /^Split them$/ });
await A.page.locator('div').filter({ has: splitBtn }).last().locator('input[type=number]').fill('2');
await splitBtn.click();
await A.page.waitForTimeout(2500);
await A.sync();

const B = await device('B');
check('the second tablet also starts with no role', await B.role(), 'unset');
await B.page.reload({ waitUntil: 'domcontentloaded' });
await B.page.waitForTimeout(3000);
check(
  'it learned the PIN by syncing, so it no longer offers to set one',
  await B.page.getByText(/No PIN set yet/i).count(),
  0
);

console.log('\n4. Examiner is one tap; a wrong PIN gets nobody into admin');
await B.page.getByRole('button', { name: /Admin/ }).click();
await B.page.waitForTimeout(800);
await B.page.getByLabel('PIN (4-6 digits)').fill('1111');
await B.page.getByRole('button', { name: /^Unlock$/ }).click();
await B.page.waitForTimeout(1500);
check('a wrong PIN is refused', await B.page.getByText(/not right/i).isVisible(), true);
check('and the tablet still has no role', await B.role(), 'unset');

await B.page.getByRole('button', { name: /^Back$/ }).click();
await B.page.waitForTimeout(600);
await B.page.getByRole('button', { name: /Station/ }).first().click();
await B.page.waitForTimeout(1200);
await B.page.getByLabel('Select Exam').selectOption({ label: 'Sync Test Exam' });
await B.page.waitForTimeout(1500);
await B.page.getByLabel('Circuit Number').selectOption({ index: 1 });
await B.page.getByLabel('Your Station').selectOption({ index: 1 });
await B.page.getByLabel('Examiner Name').fill('Dr Gate');
await B.page.getByRole('button', { name: /Use this tablet here/i }).click();
await B.page.waitForTimeout(2000);
check('the examiner is in, having typed no PIN', await B.role(), 'examiner');
check('on its own screen', new URL(B.page.url()).pathname, '/session/setup');
check(
  'with one navigation entry',
  (await B.page.locator('aside nav a').allInnerTexts()).length,
  1
);

console.log('\n5. An examiner cannot climb back up to admin');
await B.page.getByRole('button', { name: /^Release$/ }).click();
await B.page.waitForTimeout(1500);
check('release drops it back to the chooser', await B.role(), 'unset');
await B.page.getByRole('button', { name: /Admin/ }).click();
await B.page.waitForTimeout(800);
check('admin still demands the PIN', await B.page.getByLabel('PIN (4-6 digits)').isVisible(), true);
await B.page.getByLabel('PIN (4-6 digits)').fill('4321');
await B.page.getByRole('button', { name: /^Unlock$/ }).click();
await B.page.waitForTimeout(2000);
check('and the right PIN does let them in', await B.role(), 'admin');

console.log('\n6. A tablet that has never synced has no PIN to check against');
const C = await device('C', { offline: true });
await C.page.getByRole('button', { name: /Admin/ }).click();
await C.page.waitForTimeout(1000);
check(
  'it offers to create one rather than stranding whoever holds it',
  await C.page.getByText(/Set the admin PIN/i).isVisible(),
  true
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
await browser.close();
process.exit(failures ? 1 : 0);
