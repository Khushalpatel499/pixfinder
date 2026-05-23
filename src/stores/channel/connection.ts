import { ref, shallowRef } from "vue";
import { createApinatorClient } from "@/services/apinator";
import { workerClearInterval, workerSetInterval } from "@/services/workerTimers";
import type { UserData } from "@/types/channel";

/**
 * Manages the Apinator client connection lifecycle.
 * Decoupled from lobby/game logic.
 */
export function createConnection() {
  const client = shallowRef<any>(null);
  const activeChannel = shallowRef<any>(null);
  const connectionState = ref<string>("unknown");
  const currentRoomId = ref<string | null>(null);
  const isLoading = ref(false);
  const loadingText = ref("LOADING...");

  let stateChangeHandler: ((data: any) => void) | null = null;
  let connectWatchdogTimeoutId: number | null = null;
  let connectionLossTimeoutId: number | null = null;
  let heartbeatIntervalId: number | null = null;
  let lastForceReconnectAt = 0;

  const clearConnectWatchdog = () => {
    if (!connectWatchdogTimeoutId) return;
    window.clearTimeout(connectWatchdogTimeoutId);
    connectWatchdogTimeoutId = null;
  };

  const clearConnectionLossTimeout = () => {
    if (!connectionLossTimeoutId) return;
    window.clearTimeout(connectionLossTimeoutId);
    connectionLossTimeoutId = null;
  };

  const scheduleConnectWatchdog = (onStuck: () => void) => {
    clearConnectWatchdog();
    connectWatchdogTimeoutId = window.setTimeout(() => {
      connectWatchdogTimeoutId = null;
      if (connectionState.value !== "connecting") return;
      const now = Date.now();
      if (now - lastForceReconnectAt < 8000) return;
      lastForceReconnectAt = now;
      onStuck();
    }, 3000);
  };

  const createStateChangeHandler = (opts: {
    onConnected: () => void;
    onDisconnected: () => void;
    onConnecting: () => void;
  }) => {
    stateChangeHandler = ({ current }: { previous: string; current: string }) => {
      connectionState.value = current ?? "unknown";

      if (current === "connected") {
        clearConnectWatchdog();
        clearConnectionLossTimeout();
        opts.onConnected();
        return;
      }

      if (current === "disconnected" || current === "unavailable") {
        clearConnectWatchdog();
        if (!isLoading.value) {
          isLoading.value = true;
          loadingText.value = "RECONNECTING...";
        }
        clearConnectionLossTimeout();
        connectionLossTimeoutId = window.setTimeout(() => {
          connectionLossTimeoutId = null;
          opts.onDisconnected();
        }, 60000);
      }

      if (current === "connecting") {
        opts.onConnecting();
      }
    };
    return stateChangeHandler;
  };

  const connect = (userData: UserData, roomId: string, handlers: {
    onConnected: () => void;
    onDisconnected: () => void;
    onForceReconnect: () => void;
  }) => {
    const clientInstance = createApinatorClient(userData);
    client.value = clientInstance;

    const handler = createStateChangeHandler({
      onConnected: handlers.onConnected,
      onDisconnected: handlers.onDisconnected,
      onConnecting: () => scheduleConnectWatchdog(handlers.onForceReconnect),
    });
    clientInstance.bind("state_change", handler as any);
    clientInstance.connect();

    const channelInstance = clientInstance.subscribe(`presence-pixreveal-${roomId}`);
    activeChannel.value = channelInstance;
    currentRoomId.value = roomId;

    return channelInstance;
  };

  const startHeartbeat = (channel: any) => {
    if (heartbeatIntervalId) return;
    heartbeatIntervalId = workerSetInterval(() => {
      if (!channel) return;
      channel.trigger("client-heartbeat", { timestamp: Date.now() });
    }, 20000);
  };

  const stopHeartbeat = () => {
    if (!heartbeatIntervalId) return;
    workerClearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  };

  const disconnect = () => {
    stopHeartbeat();
    clearConnectWatchdog();
    clearConnectionLossTimeout();

    if (activeChannel.value?.unbind) activeChannel.value.unbind();
    if (client.value && currentRoomId.value) {
      client.value.unsubscribe(`presence-pixreveal-${currentRoomId.value}`);
    }
    if (client.value?.disconnect) client.value.disconnect();
    if (client.value?.unbind && stateChangeHandler) {
      client.value.unbind("state_change", stateChangeHandler);
      stateChangeHandler = null;
    }

    activeChannel.value = null;
    client.value = null;
    connectionState.value = "unknown";
    currentRoomId.value = null;
    isLoading.value = false;
  };

  return {
    client,
    activeChannel,
    connectionState,
    currentRoomId,
    isLoading,
    loadingText,
    connect,
    disconnect,
    startHeartbeat,
    stopHeartbeat,
    clearConnectionLossTimeout,
  };
}

export type Connection = ReturnType<typeof createConnection>;
