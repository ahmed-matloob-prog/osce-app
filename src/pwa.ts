import { registerSW } from 'virtual:pwa-register';

/**
 * Keeping tablets on the current build, without pulling the screen out from
 * under an examiner.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 *
 * The registration Vite injects by default only registers the worker. It never
 * polls for a new one, and it never reloads when a new one becomes ready — so a
 * tablet keeps running the build it started with until somebody happens to
 * reload *after* the new worker has finished downloading its precache. Reload
 * too early and you get the old code again, which is why updating felt like it
 * took an unpredictable number of reloads. You were racing a download you could
 * not see.
 *
 * That matters here more than in most apps. On device day fifteen tablets have
 * to be brought to the same build, and a tablet that quietly stayed behind is a
 * tablet running whatever bug was fixed last week.
 *
 * ── Why it does not simply reload ───────────────────────────────────────────
 *
 * Because a reload in the middle of a station destroys a part-scored candidate.
 * The examiner has ticked eight items, the page reloads, and the marks are gone
 * — worse than being a build behind, and impossible to explain to a student.
 *
 * So a waiting update is applied only when the device is somewhere safe, and a
 * tablet in the middle of scoring keeps the update waiting until the examiner
 * finishes and leaves that screen.
 */

/** The one screen where a reload would cost somebody their marks. */
function isScoring(): boolean {
  return window.location.pathname.startsWith('/exam/active');
}

export function initPwaUpdates(): void {
  let updateWaiting = false;

  const applyUpdate = registerSW({
    immediate: true,

    onNeedRefresh() {
      updateWaiting = true;
      applyIfSafe();
    },

    onRegisteredSW(_url, registration) {
      // A tablet left open all morning should still pick up a fix made at
      // eleven, rather than only noticing when somebody closes the app.
      if (registration) {
        setInterval(() => void registration.update(), 5 * 60 * 1000);
      }
    },
  });

  function applyIfSafe() {
    if (!updateWaiting || isScoring()) return;
    updateWaiting = false;
    // `true` activates the waiting worker and reloads once it has control, so
    // the reload happens when the new build is genuinely ready rather than
    // whenever somebody guesses.
    void applyUpdate(true);
  }

  // Check again on the way out of a station, and periodically for the case
  // where the examiner simply stops without navigating.
  window.addEventListener('popstate', applyIfSafe);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyIfSafe();
  });
  setInterval(applyIfSafe, 15 * 1000);
}
