import { ref } from "vue";

/**
 * Manages inactivity detection (tab hidden, page unload).
 * Decoupled from connection — calls provided callbacks.
 */
export function createInactivityHandler() {
  const inactivityNotified = ref(false);
  let inactivityGraceTimeoutId: number | null = null;
  let unloadHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;

  const clearGrace = () => {
    if (!inactivityGraceTimeoutId) return;
    window.clearTimeout(inactivityGraceTimeoutId);
    inactivityGraceTimeoutId = null;
  };

  const setup = (opts: {
    onInactive: (skipNavigation?: boolean) => void;
    gracePeriodMs?: number;
  }) => {
    const gracePeriodMs = opts.gracePeriodMs ?? 30000;

    visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        clearGrace();
        return;
      }
      clearGrace();
      inactivityGraceTimeoutId = window.setTimeout(() => {
        inactivityGraceTimeoutId = null;
        opts.onInactive(false);
      }, gracePeriodMs);
    };

    unloadHandler = () => opts.onInactive(true);

    window.addEventListener("beforeunload", unloadHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
  };

  const teardown = () => {
    clearGrace();
    if (unloadHandler) {
      window.removeEventListener("beforeunload", unloadHandler);
      unloadHandler = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
  };

  const markNotified = () => {
    inactivityNotified.value = true;
  };

  const reset = () => {
    teardown();
    inactivityNotified.value = false;
  };

  return {
    inactivityNotified,
    clearGrace,
    setup,
    teardown,
    markNotified,
    reset,
  };
}

export type InactivityHandler = ReturnType<typeof createInactivityHandler>;
