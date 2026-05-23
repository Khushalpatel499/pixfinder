import { ref } from "vue";
import type { Player } from "@/types/channel";

/**
 * Manages the player list in a lobby/game session.
 * Decoupled from connection and game logic.
 */
export function createLobby() {
  const MAX_PLAYERS_REGULAR = 8;
  const MAX_PLAYERS_PARTY_NON_HOST = 8;

  const playersOnline = ref<Player[]>([]);
  const messages = ref<any[]>([]);

  const addPlayer = (player: Player) => {
    if (!playersOnline.value.some((p) => p.playerId === player.playerId)) {
      playersOnline.value.push(player);
    }
  };

  const removePlayer = (id: string) => {
    playersOnline.value = playersOnline.value.filter((p) => p.playerId !== id);
  };

  const addSystemMessage = (text: string) => {
    messages.value.push({
      id: `sys-${Date.now()}`,
      username: "System",
      text,
      isSystem: true,
    });
  };

  const addChatMessage = (data: any) => {
    messages.value.push({
      ...data,
      isSystem: false,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  };

  const isLobbyFull = (mode: "regular" | "party", isHost: boolean) => {
    if (mode === "party") {
      const nonHostCount = playersOnline.value.filter((p) => !p.isHost).length;
      return nonHostCount > MAX_PLAYERS_PARTY_NON_HOST;
    }
    return playersOnline.value.length > MAX_PLAYERS_REGULAR;
  };

  const reset = () => {
    playersOnline.value = [];
    messages.value = [];
  };

  return {
    playersOnline,
    messages,
    addPlayer,
    removePlayer,
    addSystemMessage,
    addChatMessage,
    isLobbyFull,
    reset,
    MAX_PLAYERS_REGULAR,
    MAX_PLAYERS_PARTY_NON_HOST,
  };
}

export type Lobby = ReturnType<typeof createLobby>;
