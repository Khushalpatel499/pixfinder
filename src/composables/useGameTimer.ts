import { ref } from "vue";
import { workerClearInterval, workerSetInterval } from "@/services/workerTimers";

/**
 * Countdown timer composable using Web Worker timers.
 * Reusable across GameView, BuzzerView, InspectView, etc.
 */
export function useGameTimer(options: {
  onTick?: (remaining: number) => void;
  onExpired?: () => void;
} = {}) {
  const timeLeft = ref(0);
  const isRunning = ref(false);
  let intervalId: number | null = null;

  const start = (durationSeconds: number) => {
    stop();
    timeLeft.value = durationSeconds;
    isRunning.value = true;

    intervalId = workerSetInterval(() => {
      timeLeft.value--;
      options.onTick?.(timeLeft.value);
      if (timeLeft.value <= 0) {
        stop();
        options.onExpired?.();
      }
    }, 1000);
  };

  const stop = () => {
    if (intervalId) {
      workerClearInterval(intervalId);
      intervalId = null;
    }
    isRunning.value = false;
  };

  const reset = (durationSeconds: number) => {
    stop();
    timeLeft.value = durationSeconds;
  };

  return { timeLeft, isRunning, start, stop, reset };
}
