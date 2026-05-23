import { ref } from "vue";
import { workerClearTimeout, workerSetTimeout } from "@/services/workerTimers";
import type { BuzzerState, PartyPlayer } from "@/types/party";

export type RoundResultCallback = (
  playerId: string | null,
  isCorrect: boolean,
  elapsedMs: number | null,
) => void;

/**
 * Buzzer + answer timer logic for party mode.
 * Decoupled from channel — emits results via callback.
 */
export function createBuzzer() {
  const buzzerState = ref<BuzzerState>("locked");
  const activePlayerId = ref<string | null>(null);
  const answerStartedAt = ref<number | null>(null);
  const answerDeadlineAt = ref<number | null>(null);
  const hasAnswered = ref(false);
  const roundResult = ref<"correct" | "incorrect" | null>(null);
  const roundTimeLimit = ref(15);
  const buzzerTimeLimit = ref(15);

  let buzzerTimer: number | null = null;
  let answerTimer: number | null = null;

  const clearBuzzerTimer = () => {
    workerClearTimeout(buzzerTimer);
    buzzerTimer = null;
  };

  const clearAnswerTimer = () => {
    workerClearTimeout(answerTimer);
    answerTimer = null;
  };

  const open = (onTimeout: () => void) => {
    buzzerState.value = "open";
    activePlayerId.value = null;
    answerStartedAt.value = null;
    roundResult.value = null;
    hasAnswered.value = false;
    answerDeadlineAt.value = null;

    clearBuzzerTimer();
    buzzerTimer = workerSetTimeout(() => {
      if (buzzerState.value === "open") onTimeout();
    }, buzzerTimeLimit.value * 1000);
  };

  const lock = (playerId: string) => {
    clearBuzzerTimer();
    buzzerState.value = "answering";
    activePlayerId.value = playerId;
    answerStartedAt.value = Date.now();
    answerDeadlineAt.value = Date.now() + roundTimeLimit.value * 1000;
  };

  const startAnswerTimer = (onExpired: () => void) => {
    if (buzzerState.value !== "answering" || !activePlayerId.value) return;
    if (answerTimer) return;

    const now = Date.now();
    const deadline = answerDeadlineAt.value ?? now + roundTimeLimit.value * 1000;
    answerDeadlineAt.value = deadline;

    const delay = Math.max(0, deadline - now);
    answerTimer = workerSetTimeout(() => {
      answerTimer = null;
      if (buzzerState.value === "answering" && activePlayerId.value) {
        onExpired();
      }
    }, delay);
  };

  const resolve = (
    playerId: string | null,
    isCorrect: boolean,
  ): { elapsedMs: number | null } => {
    clearAnswerTimer();
    answerDeadlineAt.value = null;

    const elapsedMs =
      playerId && typeof answerStartedAt.value === "number"
        ? Math.max(0, Date.now() - answerStartedAt.value)
        : null;
    answerStartedAt.value = null;
    roundResult.value = isCorrect ? "correct" : "incorrect";

    if (!playerId) {
      activePlayerId.value = null;
      hasAnswered.value = false;
    }

    return { elapsedMs };
  };

  const resetForNextRound = () => {
    buzzerState.value = "locked";
    activePlayerId.value = null;
    answerStartedAt.value = null;
    answerDeadlineAt.value = null;
    hasAnswered.value = false;
    roundResult.value = null;
    clearBuzzerTimer();
    clearAnswerTimer();
  };

  const reset = () => {
    resetForNextRound();
  };

  return {
    buzzerState,
    activePlayerId,
    answerStartedAt,
    answerDeadlineAt,
    hasAnswered,
    roundResult,
    roundTimeLimit,
    buzzerTimeLimit,
    open,
    lock,
    startAnswerTimer,
    resolve,
    resetForNextRound,
    reset,
    clearBuzzerTimer,
    clearAnswerTimer,
  };
}

export type Buzzer = ReturnType<typeof createBuzzer>;
