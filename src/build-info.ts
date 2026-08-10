/**
 * Which build this device is running, and against which Firebase project.
 *
 * Both are baked in when the bundle is built — see vite.config.ts. The project
 * id is here too because it answers the other question that has caused trouble:
 * a build carrying `test-project` or `osce-emulator` must never be the one on a
 * tablet, and a glance at the footer says so.
 */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_COMMIT = __BUILD_COMMIT__;
export const BUILD_TIME = __BUILD_TIME__;
export const FIREBASE_PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'none';

/** Short, for a footer: `a1b2c3d · 10 Aug 14:32`. */
export function buildLabel(): string {
  const when = new Date(BUILD_TIME);
  const date = Number.isNaN(when.getTime())
    ? BUILD_TIME
    : when.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
  return `${BUILD_COMMIT} · ${date}`;
}

/**
 * True when this build points at somewhere that is not the real project — a
 * test or emulator build that has escaped onto a device.
 */
export function isNonProductionBuild(): boolean {
  return FIREBASE_PROJECT === 'test-project' || FIREBASE_PROJECT === 'osce-emulator';
}
