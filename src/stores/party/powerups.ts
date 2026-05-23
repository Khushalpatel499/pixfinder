import { ref, computed } from "vue";
import { useTimedEffect } from "@/composables/useTimedEffect";

/**
 * All powerup state and logic for the party game.
 * Decoupled from channel/realtime — just manages state.
 */
export function createPowerups(getMyPlayerId: () => string) {
  // --- Lights Out ---
  const lightsOut = useTimedEffect();

  const lightsOutUsedByMe = computed(() => {
    const me = getMyPlayerId();
    return me ? lightsOut.hasUsed(me) : false;
  });

  // --- XLZ (extra letter zone / decrypter) ---
  const xlzActiveForRoundIndex = ref<number | null>(null);
  const xlzByPlayerId = ref<string | null>(null);
  const xlzUsedBy = ref<Record<string, boolean>>({});

  const xlzUsedByMe = computed(() => {
    const me = getMyPlayerId();
    return me ? Boolean(xlzUsedBy.value?.[me]) : false;
  });

  const isXlzActiveForRound = (roundIndex: number) =>
    xlzActiveForRoundIndex.value === roundIndex;

  const activateXlz = (roundIndex: number, byPlayerId: string) => {
    xlzActiveForRoundIndex.value = roundIndex;
    xlzByPlayerId.value = byPlayerId;
    xlzUsedBy.value = { ...xlzUsedBy.value, [byPlayerId]: true };
  };

  // --- Freeze ---
  const freeze = useTimedEffect();
  const isFrozen = ref(false);

  const freezeUsedByMe = computed(() => {
    const me = getMyPlayerId();
    return me ? freeze.hasUsed(me) : false;
  });

  const activateFreeze = (untilAt: number, byPlayerId: string | null, myId: string) => {
    freeze.activate(untilAt, byPlayerId);
    // Initiator is NOT frozen
    isFrozen.value = Boolean(myId && byPlayerId && myId !== byPlayerId);

    // Auto-unfreeze when effect ends
    const delay = Math.max(0, untilAt - Date.now());
    setTimeout(() => {
      if (freeze.untilAt.value === untilAt) {
        isFrozen.value = false;
      }
    }, delay);
  };

  const deactivateFreeze = () => {
    freeze.deactivate();
    isFrozen.value = false;
  };

  // --- Reset all ---
  const resetAll = () => {
    lightsOut.reset();
    xlzActiveForRoundIndex.value = null;
    xlzByPlayerId.value = null;
    xlzUsedBy.value = {};
    freeze.reset();
    isFrozen.value = false;
  };

  return {
    lightsOut,
    lightsOutUsedByMe,
    xlzActiveForRoundIndex,
    xlzByPlayerId,
    xlzUsedBy,
    xlzUsedByMe,
    isXlzActiveForRound,
    activateXlz,
    freeze,
    isFrozen,
    freezeUsedByMe,
    activateFreeze,
    deactivateFreeze,
    resetAll,
  };
}

export type Powerups = ReturnType<typeof createPowerups>;
