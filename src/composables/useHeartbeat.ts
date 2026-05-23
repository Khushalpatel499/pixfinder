import { ref } from "vue";
import {
  workerClearInterval,
  workerClearTimeout,
  workerSetInterval,
  workerSetTimeout,
} from "@/services/workerTimers";
import { hashStringToRange } from "@/utils/realtime";

export type HeartbeatOptions = {
  heartbeatPeriodMs: number;
  heartbeatJitterMs: number;
  hostHeartbeatPeriodMs: number;
  staleAfterMs: number;
  staleConfirmAfterMs: number;
  maxResyncAttempts: number;
};

const DEFAULTS: HeartbeatOptions = {
  heartbeatPeriodMs: 15000,
  heartbeatJitterMs: 6000,
  hostHeartbeatPeriodMs: 8000,
  staleAfterMs: 20000,
  staleConfirmAfterMs: 7000,
  maxResyncAttempts: 4,
};

/**
 * Manages heartbeat sending (player→host, host→players) and stale detection.
 */
export function useHeartbeat(opts: Partial<HeartbeatOptions> = {}) {
  const config = { ...DEFAULTS, ...opts };

  const lastHostActivityAt = ref<number>(Date.now());
  const connectionStale = ref(false);
  const playerLastSeen = ref<Record<string, number>>({});
  const staleSuspectedAt = ref<number | null>(null);
  const resyncAttempts = ref(0);
  const nextResyncAt = ref(0);
  const resyncBackoffMs = ref(0);

  let heartbeatIntervalId: number | null = null;
  let heartbeatStartTimeoutId: number | null = null;
  let hostHeartbeatIntervalId: number | null = null;
  let staleCheckIntervalId: number | null = null;
  let resyncIntervalId: number | null = null;

  const markHostActivity = () => {
    lastHostActivityAt.value = Date.now();
    connectionStale.value = false;
    staleSuspectedAt.value = null;
    resyncAttempts.value = 0;
    nextResyncAt.value = 0;
    resyncBackoffMs.value = 0;
  };

  const markPlayerSeen = (playerId: string, ts?: number) => {
    playerLastSeen.value[playerId] = ts ?? Date.now();
  };

  const startPlayerHeartbeat = (
    playerId: string,
    sendFn: () => void,
    isGameRunning: () => boolean,
  ) => {
    if (heartbeatIntervalId) return;
    const jitter = hashStringToRange(playerId, config.heartbeatJitterMs);

    heartbeatStartTimeoutId = workerSetTimeout(() => {
      heartbeatStartTimeoutId = null;
      heartbeatIntervalId = workerSetInterval(() => {
        if (!isGameRunning()) return;
        sendFn();
      }, config.heartbeatPeriodMs);
    }, jitter);
  };

  const startHostHeartbeat = (sendFn: () => void, isGameRunning: () => boolean) => {
    if (hostHeartbeatIntervalId) return;
    hostHeartbeatIntervalId = workerSetInterval(() => {
      if (!isGameRunning()) return;
      sendFn();
    }, config.hostHeartbeatPeriodMs);
  };

  const startStaleDetection = (requestResyncFn: () => void) => {
    if (staleCheckIntervalId) return;

    staleCheckIntervalId = workerSetInterval(() => {
      const age = Date.now() - lastHostActivityAt.value;
      if (age <= config.staleAfterMs) {
        connectionStale.value = false;
        staleSuspectedAt.value = null;
        resyncAttempts.value = 0;
        return;
      }
      if (!staleSuspectedAt.value) {
        staleSuspectedAt.value = Date.now();
        resyncAttempts.value = 0;
      }
    }, 1000);

    resyncIntervalId = workerSetInterval(() => {
      if (!staleSuspectedAt.value) return;
      const now = Date.now();
      const age = now - lastHostActivityAt.value;
      if (age <= config.staleAfterMs) return;

      if (resyncAttempts.value < config.maxResyncAttempts && now >= nextResyncAt.value) {
        if (!resyncBackoffMs.value) resyncBackoffMs.value = 2000;
        resyncAttempts.value++;
        requestResyncFn();
        const next = Math.min(resyncBackoffMs.value * 2, 20000);
        resyncBackoffMs.value = next;
        nextResyncAt.value = now + next;
      }

      if (
        staleSuspectedAt.value &&
        now - staleSuspectedAt.value >= config.staleConfirmAfterMs &&
        age > config.staleAfterMs
      ) {
        connectionStale.value = true;
      }
    }, 1000);
  };

  const stop = () => {
    if (heartbeatStartTimeoutId) {
      workerClearTimeout(heartbeatStartTimeoutId);
      heartbeatStartTimeoutId = null;
    }
    if (heartbeatIntervalId) {
      workerClearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    if (hostHeartbeatIntervalId) {
      workerClearInterval(hostHeartbeatIntervalId);
      hostHeartbeatIntervalId = null;
    }
    if (staleCheckIntervalId) {
      workerClearInterval(staleCheckIntervalId);
      staleCheckIntervalId = null;
    }
    if (resyncIntervalId) {
      workerClearInterval(resyncIntervalId);
      resyncIntervalId = null;
    }
  };

  const reset = () => {
    stop();
    markHostActivity();
    playerLastSeen.value = {};
  };

  return {
    lastHostActivityAt,
    connectionStale,
    playerLastSeen,
    markHostActivity,
    markPlayerSeen,
    startPlayerHeartbeat,
    startHostHeartbeat,
    startStaleDetection,
    stop,
    reset,
  };
}
