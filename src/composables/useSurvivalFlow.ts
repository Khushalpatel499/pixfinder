import { ref, watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useSurvivalStore } from "@/stores/survival";
import { useGameStore } from "@/stores/game";
import { useSoundStore } from "@/stores/sound";
import { statusIcons } from "@/data/statusIcons";
import { workerClearTimeout, workerSetTimeout } from "@/services/workerTimers";

/**
 * Composable for SurvivalView flow.
 * Handles: answer → feedback → next drawing, with game-over watch.
 */
export function useSurvivalFlow() {
  const router = useRouter();
  const survivalStore = useSurvivalStore();
  const gameStore = useGameStore();
  const soundStore = useSoundStore();

  const resolution = ref(16);
  const pixelData = ref<number[]>(Array(256).fill(0));
  const isRevealing = ref(true);

  let feedbackTimeoutId: number | null = null;
  let nextRoundTimeoutId: number | null = null;

  const clearTimers = () => {
    workerClearTimeout(feedbackTimeoutId);
    workerClearTimeout(nextRoundTimeoutId);
    feedbackTimeoutId = null;
    nextRoundTimeoutId = null;
  };

  const setupDrawing = () => {
    if (!survivalStore.currentDrawing) return;
    survivalStore.hasAnswered = false;
    isRevealing.value = true;
    pixelData.value = survivalStore.currentDrawing.data;
    resolution.value = Math.sqrt(pixelData.value.length);
  };

  const handleAnswer = (answer: { isCorrect: boolean } | null) => {
    if (
      gameStore.gameState !== "revealing" ||
      survivalStore.hasAnswered ||
      survivalStore.timeLeft <= 0
    ) return;

    survivalStore.hasAnswered = true;
    gameStore.setGameState("feedback");
    clearTimers();

    if (answer?.isCorrect) {
      survivalStore.handleCorrectAnswer();
      pixelData.value = statusIcons.success;
      soundStore.playSound("correct");
    } else {
      survivalStore.handleWrongAnswer();
      pixelData.value = statusIcons.failure;
    }

    feedbackTimeoutId = workerSetTimeout(() => {
      feedbackTimeoutId = null;
      if (survivalStore.isGameOver) return;

      isRevealing.value = false;
      pixelData.value = survivalStore.currentDrawing!.data;
      gameStore.setGameState("revealed");

      nextRoundTimeoutId = workerSetTimeout(() => {
        nextRoundTimeoutId = null;
        if (survivalStore.isGameOver) return;
        survivalStore.setNextDrawing();
        setupDrawing();
      }, 1000);
    }, 1000);
  };

  const start = () => {
    survivalStore.startSurvival();
    setupDrawing();
  };

  watch(
    () => survivalStore.isGameOver,
    (over) => {
      if (over) {
        gameStore.setGameState("gameover");
        router.push("/gameover");
      }
    },
  );

  onUnmounted(() => clearTimers());

  return {
    resolution,
    pixelData,
    isRevealing,
    handleAnswer,
    start,
    survivalStore,
    gameStore,
  };
}
