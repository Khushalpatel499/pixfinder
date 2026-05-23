import { ref } from "vue";
import { workerClearTimeout, workerSetTimeout } from "@/services/workerTimers";

/**
 * Generic timed effect composable.
 * Handles a boolean state that auto-resets after a deadline.
 * Used for: lightsOut, freeze, or any future timed powerup.
 */
export function useTimedEffect() {
  const isActive = ref(false);
  const untilAt = ref<number | null>(null);
  const byPlayerId = ref<string | null>(null);
  const usedBy = ref<Record<string, boolean>>({});
  let timeoutId: number | null = null;

  const clear = () => {
    if (timeoutId) {
      workerClearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const activate = (deadline: number, initiator: string | null) => {
    const normalizedDeadline = Math.max(Date.now(), deadline);
    isActive.value = true;
    untilAt.value = normalizedDeadline;
    byPlayerId.value = initiator ?? null;

    clear();
    const delay = Math.max(0, normalizedDeadline - Date.now());
    timeoutId = workerSetTimeout(() => {
      timeoutId = null;
      if (untilAt.value !== normalizedDeadline) return;
      isActive.value = false;
      untilAt.value = null;
      byPlayerId.value = null;
    }, delay);
  };

  const deactivate = () => {
    clear();
    isActive.value = false;
    untilAt.value = null;
    byPlayerId.value = null;
  };

  const markUsed = (playerId: string) => {
    usedBy.value = { ...usedBy.value, [playerId]: true };
  };

  const hasUsed = (playerId: string) => Boolean(usedBy.value?.[playerId]);

  const reset = () => {
    deactivate();
    usedBy.value = {};
  };

  return {
    isActive,
    untilAt,
    byPlayerId,
    usedBy,
    activate,
    deactivate,
    markUsed,
    hasUsed,
    reset,
    clear,
  };
}
