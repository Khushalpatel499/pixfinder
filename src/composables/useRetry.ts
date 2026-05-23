import { ref } from "vue";
import { workerClearTimeout, workerSetTimeout } from "@/services/workerTimers";
import { backoffDelay } from "@/utils/realtime";

export type RetryOptions = {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
};

/**
 * Generic retry-with-backoff composable.
 * Sends a message, retries with exponential backoff until ack or max attempts.
 */
export function useRetry(opts: RetryOptions) {
  const pending = ref<{ seq: number; attempts: number; payload?: any } | null>(null);
  let retryTimeoutId: number | null = null;
  let nextSeq = 1;

  const clear = () => {
    workerClearTimeout(retryTimeoutId);
    retryTimeoutId = null;
    pending.value = null;
  };

  const start = (sendFn: () => void, payload?: any) => {
    const seq = nextSeq++;
    pending.value = { seq, attempts: 0, payload };
    sendFn();

    const retry = () => {
      if (!pending.value || pending.value.seq !== seq) return;
      if (pending.value.attempts >= opts.maxAttempts) return;
      pending.value.attempts++;
      sendFn();
      const delay = backoffDelay(opts.baseMs, pending.value.attempts, opts.maxMs);
      retryTimeoutId = workerSetTimeout(retry, delay);
    };

    workerClearTimeout(retryTimeoutId);
    retryTimeoutId = workerSetTimeout(retry, opts.baseMs);
    return seq;
  };

  const ack = (seq: number) => {
    if (!pending.value || pending.value.seq !== seq) return false;
    clear();
    return true;
  };

  const reset = () => clear();

  return { pending, start, ack, reset, clear };
}
