import { ref, computed, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import { usePlayerStore } from "@/stores/player";
import { useConfigStore } from "@/stores/config";
import { useOnlineStore } from "@/stores/online";
import { useSoundStore } from "@/stores/sound";
import { statusIcons } from "@/data/statusIcons";
import {
  workerClearInterval,
  workerClearTimeout,
  workerSetInterval,
  workerSetTimeout,
} from "@/services/workerTimers";

export type RoundFlowOptions = {
  /** Override timer when buzzer is pressed (BuzzerView uses 5s answer window) */
  onBuzzerPress?: () => number | void;
  /** Called before feedback phase — return custom pixelData or undefined */
  beforeFeedback?: () => number[] | undefined;
  /** Feedback duration in ms (default 1500) */
  feedbackMs?: number;
  /** Solution display duration in ms (default 1500) */
  solutionMs?: number;
};

/**
 * Shared round flow composable for all singleplayer/online game views.
 * Handles: timer countdown → answer → feedback icon → reveal solution → next round/gameover
 */
export function useRoundFlow(options: RoundFlowOptions = {}) {
  const router = useRouter();
  const gameStore = useGameStore();
  const playerStore = usePlayerStore();
  const configStore = useConfigStore();
  const onlineStore = useOnlineStore();
  const soundStore = useSoundStore();

  const feedbackMs = options.feedbackMs ?? 1500;
  const solutionMs = options.solutionMs ?? 1500;

  const resolution = ref(16);
  const pixelData = ref<number[]>(Array(256).fill(0));
  const hasAnswered = ref(false);
  const hasAnsweredCorrectly = ref(false);
  const isRevealing = ref(true);
  const timer = ref(configStore.revealTime);
  const timerDuration = configStore.revealTime;

  let timerId: number | null = null;
  let feedbackTimeoutId: number | null = null;
  let solutionTimeoutId: number | null = null;

  const currentRound = computed(() => gameStore.currentRound);
  const maxRounds = computed(() => configStore.maxRounds);

  const clearAllTimers = () => {
    workerClearInterval(timerId);
    workerClearTimeout(feedbackTimeoutId);
    workerClearTimeout(solutionTimeoutId);
    timerId = null;
    feedbackTimeoutId = null;
    solutionTimeoutId = null;
  };

  const startTimer = (duration?: number) => {
    workerClearInterval(timerId);
    timer.value = duration ?? timerDuration;

    timerId = workerSetInterval(() => {
      timer.value--;
      if (timer.value <= 3 && timer.value > 0) soundStore.playSound("timer");
      if (timer.value <= 0) {
        workerClearInterval(timerId);
        timerId = null;
        handleAnswer(null);
      }
    }, 1000);
  };

  const setupDrawing = () => {
    if (!currentRound.value) return;

    clearAllTimers();
    hasAnswered.value = false;
    hasAnsweredCorrectly.value = false;
    isRevealing.value = true;

    pixelData.value = currentRound.value.data;
    resolution.value = Math.sqrt(pixelData.value.length);

    startTimer();
  };

  const handleAnswer = (selectedOption: { isCorrect: boolean } | null) => {
    if (hasAnswered.value) return;
    if (gameStore.gameState !== "revealing" && gameStore.gameState !== "answering") return;

    hasAnswered.value = true;
    gameStore.setGameState("feedback");
    clearAllTimers();

    if (playerStore.isCreatorMode) {
      pixelData.value = statusIcons.question;
    } else if (selectedOption?.isCorrect) {
      pixelData.value = statusIcons.success;
      hasAnsweredCorrectly.value = true;
      playerStore.addPoints(timer.value);
      soundStore.playSound("correct");
    } else {
      pixelData.value = statusIcons.failure;
      hasAnsweredCorrectly.value = false;
      soundStore.playSound("incorrect");
    }

    feedbackTimeoutId = workerSetTimeout(() => {
      feedbackTimeoutId = null;
      isRevealing.value = false;
      if (currentRound.value) {
        pixelData.value = currentRound.value.data;
      }
      gameStore.setGameState("revealed");

      solutionTimeoutId = workerSetTimeout(() => {
        solutionTimeoutId = null;
        if (gameStore.currentRoundIndex >= maxRounds.value - 1) {
          onlineStore.broadcastScore();
          gameStore.setGameState("gameover");
          router.push("/gameover");
        } else {
          gameStore.nextRound();
        }
      }, solutionMs);
    }, feedbackMs);
  };

  // Auto-setup when game state changes to "revealing"
  watch(
    () => gameStore.gameState,
    (newState) => {
      if (newState === "revealing") setupDrawing();
    },
    { immediate: true },
  );

  onUnmounted(() => clearAllTimers());

  return {
    // State
    resolution,
    pixelData,
    hasAnswered,
    hasAnsweredCorrectly,
    isRevealing,
    timer,
    timerDuration,
    currentRound,
    maxRounds,
    // Actions
    handleAnswer,
    setupDrawing,
    startTimer,
    clearAllTimers,
    // Stores (so views don't need to import them separately)
    gameStore,
    playerStore,
    configStore,
    soundStore,
  };
}
