import { db } from '../db/schema';
import type { Circuit, ExamTemplate, Station } from '../types';

/**
 * Printed station cards.
 *
 * One card per station per circuit. Scanning it — with the phone's own camera,
 * or the scanner inside the app — opens a link that sets the device up for
 * exactly that exam, circuit and station. The examiner never sees a list of
 * exams, so they can neither read another exam nor pick the wrong one, and
 * they need no PIN.
 *
 * The link carries the circuit by *number*, not by id: circuits can be merged
 * by sync, and the number is what is written on the door.
 *
 *   https://<app>/station?e=<examId>&c=<circuitNumber>&s=<stationId>&k=<code>
 */
export interface StationCard {
  examId: string;
  circuitNumber: number;
  stationId: string;
  code: string;
}

export const CARD_PATH = '/station';

/** A fresh per-exam secret for deriving card codes. */
export function newCardSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The check code printed into a card. Ten characters of SHA-256. */
export async function cardCode(
  secret: string,
  examId: string,
  circuitNumber: number,
  stationId: string
): Promise<string> {
  const data = new TextEncoder().encode(`${secret}|${examId}|${circuitNumber}|${stationId}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash.slice(0, 5), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function cardUrl(origin: string, card: StationCard): string {
  const q = new URLSearchParams({
    e: card.examId,
    c: String(card.circuitNumber),
    s: card.stationId,
    k: card.code,
  });
  return `${origin}${CARD_PATH}?${q.toString()}`;
}

/**
 * Read a card from a scanned string or a location. Accepts a full URL from any
 * origin — a card printed from a preview build still names the right station —
 * and returns null for anything that is not a complete card.
 */
export function parseCard(text: string): StationCard | null {
  let url: URL;
  try {
    url = new URL(text.trim(), 'http://placeholder.invalid');
  } catch {
    return null;
  }
  if (url.pathname.replace(/\/+$/, '') !== CARD_PATH) return null;

  const examId = url.searchParams.get('e')?.trim();
  const stationId = url.searchParams.get('s')?.trim();
  const code = url.searchParams.get('k')?.trim().toUpperCase();
  const circuitNumber = Number(url.searchParams.get('c'));
  if (!examId || !stationId || !code || !Number.isInteger(circuitNumber) || circuitNumber < 1) {
    return null;
  }
  return { examId, circuitNumber, stationId, code };
}

export type CardCheck =
  | { status: 'ok'; exam: ExamTemplate; circuit: Circuit; station: Station }
  /** Not on this device — usually it has not synced yet. */
  | { status: 'unknown-exam' }
  | { status: 'closed'; exam: ExamTemplate }
  /** The code does not match: an edited link, or a card from an old printing. */
  | { status: 'bad-code'; exam: ExamTemplate }
  | { status: 'no-station'; exam: ExamTemplate }
  | { status: 'no-circuit'; exam: ExamTemplate };

/** Check a card against what this device holds. */
export async function checkCard(card: StationCard): Promise<CardCheck> {
  const exam = await db.examTemplates.get(card.examId);
  if (!exam || exam.deleted) return { status: 'unknown-exam' };
  if (!exam.openForExamining) return { status: 'closed', exam };

  if (!exam.cardSecret) return { status: 'bad-code', exam };
  const expected = await cardCode(exam.cardSecret, exam.id, card.circuitNumber, card.stationId);
  if (expected !== card.code) return { status: 'bad-code', exam };

  const station = exam.stations.find((s) => s.id === card.stationId);
  if (!station) return { status: 'no-station', exam };

  const circuit = (await db.circuits.where('examId').equals(exam.id).toArray()).find(
    (c) => !c.deleted && c.circuitNumber === card.circuitNumber
  );
  if (!circuit) return { status: 'no-circuit', exam };

  return { status: 'ok', exam, circuit, station };
}

// ── Clearing a device ────────────────────────────────────────────────────────

const CLEARED_KEY = 'osce.cleared';

export function isDeviceCleared(): boolean {
  try {
    return localStorage.getItem(CLEARED_KEY) === '1';
  } catch {
    return false;
  }
}

export function forgetDeviceCleared(): void {
  try {
    localStorage.removeItem(CLEARED_KEY);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Mark the device for clearing and drop what it was pinned to.
 *
 * The wipe itself happens on the next load, before anything opens the
 * databases: deleting an IndexedDB database that a live Firestore or Dexie
 * connection holds open is blocked until that connection closes, and on a
 * page that is about to reload that can mean never. The caller reloads.
 */
export function markDeviceForClearing(): void {
  localStorage.setItem(CLEARED_KEY, '1');
  localStorage.removeItem('osce.deviceAssignment');
  localStorage.removeItem('examinerName');
}

/**
 * Delete every local database: the app's own and Firestore's offline copy.
 * Run only from the cleared screen, where nothing has opened them.
 */
export async function wipeLocalDatabases(): Promise<void> {
  const names = new Set<string>(['OSCEDatabase', 'firebaseLocalStorageDb']);
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId) names.add(`firestore/[DEFAULT]/${projectId}/main`);
  try {
    for (const info of (await indexedDB.databases?.()) ?? []) {
      if (info.name) names.add(info.name);
    }
  } catch {
    /* older browsers: the known names above */
  }

  db.close();
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          // Something still holds it open. Nothing should on this screen;
          // carry on rather than hang, and the next load tries again.
          request.onblocked = () => resolve();
        })
    )
  );
}
