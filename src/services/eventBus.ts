type Handler = (...args: any[]) => void;

/**
 * Minimal typed event bus for decoupling stores.
 * Stores emit events, other stores listen — no direct imports needed.
 */
class EventBus {
  private listeners = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (e) {
        console.error(`[eventBus] Error in handler for "${event}":`, e);
      }
    });
  }

  reset() {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();

// Event name constants to avoid typos
export const Events = {
  GAME_STARTED: "game:started",
  GAME_OVER: "game:over",
  ROUND_NEXT: "round:next",
  ROUND_RESULT: "round:result",
  PLAYER_JOINED: "player:joined",
  PLAYER_LEFT: "player:left",
  BUZZER_PRESSED: "buzzer:pressed",
  SCORE_UPDATED: "score:updated",
  CONNECTION_STALE: "connection:stale",
  CONNECTION_RESTORED: "connection:restored",
} as const;
