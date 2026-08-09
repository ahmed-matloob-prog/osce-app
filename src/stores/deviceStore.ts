import { create } from 'zustand';
import { db } from '../db/schema';
import { hashPin, verifyPin } from '../utils/pinUtils';

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
 * ── This is not access control ──────────────────────────────────────────────
 *
 * It is stored on the device, in storage the user can clear, and enforced by
 * JavaScript running on that same device. Clearing site data resets it to
 * admin. It stops accidents and wrong turns; it does not keep a determined
 * person out of anything, and nobody should plan as though it does. Real
 * separation needs accounts and server-side rules — see MULTI-ADMIN-DESIGN.md.
 *
 * ── Why localStorage and not the database ───────────────────────────────────
 *
 * Because it must never sync. Everything in the exam tables is designed to
 * reach every other device; this is the one fact that has to stay put. A
 * tablet's identity travelling to the other fourteen would pin them all to
 * station 3.
 */
export type DeviceRole = 'admin' | 'examiner' | 'checkin';

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

  /** Hashed. Absent means releasing the device only takes a confirmation. */
  pinHash?: string;
  setAt?: string;
}

const STORAGE_KEY = 'osce.deviceAssignment';
const ADMIN: DeviceAssignment = { role: 'admin' };

/**
 * Read synchronously at module load. An effect would render one frame of the
 * full admin navigation on a pinned tablet before taking it away again, which
 * is both ugly and an invitation to tap it.
 */
function readAssignment(): DeviceAssignment {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ADMIN;
    const parsed = JSON.parse(raw) as DeviceAssignment;
    if (parsed.role !== 'examiner' && parsed.role !== 'checkin') return ADMIN;
    return parsed;
  } catch {
    return ADMIN;
  }
}

function writeAssignment(assignment: DeviceAssignment): void {
  if (assignment.role === 'admin') localStorage.removeItem(STORAGE_KEY);
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
  /** Optional 4–6 digits. Without one, releasing the device just asks. */
  pin?: string;
}

interface DeviceState {
  assignment: DeviceAssignment;
  isPinned: () => boolean;
  assign: (input: AssignInput) => Promise<void>;
  release: (pin?: string) => Promise<boolean>;
  reconcile: () => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  assignment: readAssignment(),

  isPinned: () => get().assignment.role !== 'admin',

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
      pinHash: input.pin ? await hashPin(input.pin) : undefined,
      setAt: new Date().toISOString(),
    };
    writeAssignment(assignment);
    set({ assignment });
  },

  /** Hand the device back to an admin. Returns false if the PIN was wrong. */
  release: async (pin) => {
    const { pinHash } = get().assignment;
    if (pinHash) {
      if (!pin || !(await verifyPin(pin, pinHash))) return false;
    }
    writeAssignment(ADMIN);
    set({ assignment: ADMIN });
    return true;
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
  if (assignment.role === 'examiner') {
    return pathname.startsWith('/session/setup') || pathname.startsWith('/exam/active');
  }
  return pathname.startsWith('/checkin');
}
