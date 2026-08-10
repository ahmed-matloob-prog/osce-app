import { create } from 'zustand';
import { db } from '../db/schema';

/**
 * What this device is for.
 *
 * Every tablet currently shows every screen. An examiner standing at station 3
 * can reach the roster import, the delete controls, the marks for every other
 * circuit, and the sync settings — and on a shared exam they can start a
 * session for somebody else's circuit. Nothing there is malicious; it is a
 * screen full of things nobody at a station needs, on a device being handled at
 * speed by someone whose attention is on a student.
 *
 * Pinning the device to a job puts the right screen in front of them and takes
 * the rest away.
 *
 * ── The default is 'unset', on purpose ──────────────────────────────────────
 *
 * This used to default to admin, so a tablet nobody had configured could
 * delete an exam. On exam morning that means fifteen tablets each start with
 * every power there is, and safety depends on somebody remembering to walk
 * round and pin all of them. Safety that depends on remembering is a to-do
 * list, not safety.
 *
 * So a fresh device has no role at all and is asked what it is for before it
 * will do anything. Examiner and check-in are one tap. Admin costs a PIN.
 *
 * ── This is not access control ──────────────────────────────────────────────
 *
 * It is stored on the device, in storage the user can clear, and enforced by
 * JavaScript running on that same device. Clearing site data returns the tablet
 * to the chooser, where anyone can pick admin if they also know the PIN — and
 * the PIN is four to six digits whose hash any signed-in device can read, so
 * recovering it is a matter of seconds for anyone who tries.
 *
 * It stops accidents and wrong turns. It does not keep a determined person out
 * of anything, and nobody should plan as though it does. Real separation needs
 * accounts and server-side rules — see MULTI-ADMIN-DESIGN.md.
 *
 * ── Why localStorage and not the database ───────────────────────────────────
 *
 * Because it must never sync. Everything in the exam tables is designed to
 * reach every other device; this is the one fact that has to stay put. A
 * tablet's identity travelling to the other fourteen would pin them all to
 * station 3.
 */
export type DeviceRole = 'unset' | 'admin' | 'examiner' | 'checkin';

export interface DeviceAssignment {
  role: DeviceRole;
  examId?: string;
  circuitId?: string;
  stationId?: string;
  examinerName?: string;

  /**
   * Labels captured when the device was pinned, so the header can name the
   * station without every screen loading the exam to find out. Denormalised on
   * purpose: if the exam is renamed the tablet is being re-pinned anyway.
   */
  examName?: string;
  circuitNumber?: number;
  stationName?: string;

  setAt?: string;
}

const STORAGE_KEY = 'osce.deviceAssignment';
const UNSET: DeviceAssignment = { role: 'unset' };
const ROLES: DeviceRole[] = ['admin', 'examiner', 'checkin'];

/**
 * Read synchronously at module load. An effect would render one frame of the
 * full admin navigation on a pinned tablet before taking it away again, which
 * is both ugly and an invitation to tap it.
 */
function readAssignment(): DeviceAssignment {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return UNSET;
    const parsed = JSON.parse(raw) as DeviceAssignment;
    if (!ROLES.includes(parsed.role)) return UNSET;
    return parsed;
  } catch {
    return UNSET;
  }
}

function writeAssignment(assignment: DeviceAssignment): void {
  if (assignment.role === 'unset') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(assignment));
}

export interface AssignInput {
  role: DeviceRole;
  examId: string;
  examName: string;
  circuitId?: string;
  circuitNumber?: number;
  stationId?: string;
  stationName?: string;
  examinerName?: string;
}

interface DeviceState {
  assignment: DeviceAssignment;
  /** Pinned to a single job — an examiner station or a check-in desk. */
  isPinned: () => boolean;
  /** Nobody has said what this device is for yet. */
  needsRole: () => boolean;
  assign: (input: AssignInput) => Promise<void>;
  becomeAdmin: () => void;
  /** Hand the device back to the chooser. Free — going *up* to admin is what
   *  costs a PIN, and an examiner who lands back on the gate has gained
   *  nothing they did not already have. */
  release: () => void;
  reconcile: () => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  assignment: readAssignment(),

  isPinned: () => {
    const { role } = get().assignment;
    return role === 'examiner' || role === 'checkin';
  },

  needsRole: () => get().assignment.role === 'unset',

  assign: async (input) => {
    const assignment: DeviceAssignment = {
      role: input.role,
      examId: input.examId,
      examName: input.examName,
      circuitId: input.circuitId,
      circuitNumber: input.circuitNumber,
      stationId: input.stationId,
      stationName: input.stationName,
      examinerName: input.examinerName?.trim() || undefined,
      setAt: new Date().toISOString(),
    };
    writeAssignment(assignment);
    set({ assignment });
  },

  /**
   * Become an admin device. The PIN is checked by the caller — the gate — so
   * that this store stays about *what this device is* and the credential store
   * stays about *who is allowed*.
   */
  becomeAdmin: () => {
    const assignment: DeviceAssignment = { role: 'admin', setAt: new Date().toISOString() };
    writeAssignment(assignment);
    set({ assignment });
  },

  release: () => {
    writeAssignment(UNSET);
    set({ assignment: UNSET });
  },

  /**
   * Follow the pinned circuit if it lost a merge.
   *
   * Two devices can each create their own "Circuit 2" for one exam, and sync
   * collapses them onto whichever id sorts lower. A tablet pinned to the loser
   * would be pinned to a circuit that no longer exists — it would still take
   * marks, but they would be filed against a retired circuit and the
   * wrong-circuit warning would misfire for everyone. Re-point it by circuit
   * *number*, which is the thing written on the door.
   */
  reconcile: async () => {
    const { assignment } = get();
    if (assignment.role !== 'examiner' || !assignment.examId || !assignment.circuitId) return;

    const pinned = await db.circuits.get(assignment.circuitId);
    if (pinned && !pinned.deleted) return;

    const number = pinned?.circuitNumber ?? assignment.circuitNumber;
    if (number === undefined) return;

    const survivor = (await db.circuits.where('examId').equals(assignment.examId).toArray()).find(
      (c) => !c.deleted && c.circuitNumber === number
    );
    if (!survivor || survivor.id === assignment.circuitId) return;

    const updated = {
      ...assignment,
      circuitId: survivor.id,
      circuitNumber: survivor.circuitNumber,
    };
    writeAssignment(updated);
    set({ assignment: updated });
    console.warn(
      `[device] circuit ${number} was merged; this station now follows ${survivor.id}`
    );
  },
}));

/** Which routes a pinned device may reach. Everything else redirects home. */
export function homeRouteFor(assignment: DeviceAssignment): string {
  if (assignment.role === 'checkin') {
    return assignment.examId ? `/checkin/${assignment.examId}` : '/checkin';
  }
  if (assignment.role === 'examiner') return '/session/setup';
  return '/';
}

export function isRouteAllowed(assignment: DeviceAssignment, pathname: string): boolean {
  if (assignment.role === 'admin') return true;
  // 'unset' never reaches here — the gate replaces the whole app until a role
  // is chosen — but be explicit rather than fall through to the examiner rule.
  if (assignment.role === 'unset') return false;
  if (assignment.role === 'examiner') {
    return pathname.startsWith('/session/setup') || pathname.startsWith('/exam/active');
  }
  return pathname.startsWith('/checkin');
}
