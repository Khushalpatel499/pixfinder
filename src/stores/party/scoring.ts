import { ref } from "vue";
import type { PartyPlayer } from "@/types/party";
import type { Player } from "@/types/channel";

/**
 * Party player scoring logic.
 * Decoupled from game state — receives round info as params.
 */
export function createScoring() {
  const players = ref<PartyPlayer[]>([]);
  const emojiStatistics = ref<string[]>([]);

  const initPlayers = (onlinePlayers: Player[]) => {
    players.value = onlinePlayers
      .filter((p) => !p.isHost && p.isOnline)
      .map((p) => ({
        playerId: p.playerId,
        username: p.username,
        avatarIndex: p.avatarIndex,
        points: 0,
        wrongAnswers: 0,
        correctAnswers: 0,
        quickestAnswer: null,
        powerupsUsed: 0,
        emojisSent: 0,
        isDecrypter: false,
      }));
  };

  const applyResult = (
    playerId: string | null,
    isCorrect: boolean,
    elapsedMs: number | null,
    opts: {
      currentRoundIndex: number;
      maxRounds: number;
      isXlzActive: boolean;
    },
  ) => {
    if (!playerId) return;
    const player = players.value.find((p) => p.playerId === playerId);
    if (!player) return;

    const { currentRoundIndex, maxRounds } = opts;
    const isFinalRound = currentRoundIndex === maxRounds - 1;
    const isBonusRound =
      (maxRounds >= 10 && currentRoundIndex === 4) ||
      (maxRounds >= 15 && currentRoundIndex === 9) ||
      (maxRounds >= 20 && currentRoundIndex === 14);
    const multiplier = isFinalRound || isBonusRound ? 2 : 1;

    player.points += isCorrect ? 1 * multiplier : -2 * multiplier;

    if (isCorrect) {
      player.correctAnswers += 1;
      if (opts.isXlzActive) player.isDecrypter = true;
    } else {
      player.wrongAnswers += 1;
    }

    if (typeof elapsedMs === "number") {
      if (player.quickestAnswer === null || elapsedMs < player.quickestAnswer) {
        player.quickestAnswer = elapsedMs;
      }
    }
  };

  const incrementPowerupsUsed = (playerId: string) => {
    const player = players.value.find((p) => p.playerId === playerId);
    if (player) player.powerupsUsed += 1;
  };

  const incrementEmojisSent = (playerId: string) => {
    const player = players.value.find((p) => p.playerId === playerId);
    if (player) player.emojisSent += 1;
  };

  const addEmojiStat = (emoji: string) => {
    emojiStatistics.value.push(emoji);
  };

  const reset = () => {
    players.value = [];
    emojiStatistics.value = [];
  };

  return {
    players,
    emojiStatistics,
    initPlayers,
    applyResult,
    incrementPowerupsUsed,
    incrementEmojisSent,
    addEmojiStat,
    reset,
  };
}

export type Scoring = ReturnType<typeof createScoring>;
