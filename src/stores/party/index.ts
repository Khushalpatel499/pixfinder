import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useChannelStore } from "../channel";
import { useGameStore } from "../game";
import { useConfigStore } from "../config";
import { useRouter } from "vue-router";
import { workerClearInterval, workerSetInterval, workerSetTimeout } from "@/services/workerTimers";
import { useRetry } from "@/composables/useRetry";
import { useHeartbeat } from "@/composables/useHeartbeat";
import { useChannelEvents } from "@/composables/useChannelEvents";
import { createPowerups } from "./powerups";
import { createBuzzer } from "./buzzer";
import { createScoring } from "./scoring";
import type { PartyPlayer, PartyStatePayload } from "@/types/party";

export const usePartyStore = defineStore("party", () => {
  const channelStore = useChannelStore();
  const gameStore = useGameStore();
  const configStore = useConfigStore();
  const router = useRouter();

  // --- Composed modules ---
  const getMyId = () => channelStore.playerId || "";
  const powerups = createPowerups(getMyId);
  const buzzer = createBuzzer();
  const scoring = createScoring();
  const heartbeat = useHeartbeat();
  const channelEvents = useChannelEvents();
  const buzzRetry = useRetry({ baseMs: 350, maxMs: 2500, maxAttempts: 6 });
  const answerRetry = useRetry({ baseMs: 350, maxMs: 2500, maxAttempts: 6 });

  const isRevealing = ref(true);
  const isHost = computed(() => channelStore.isHost);
  const channel = computed(() => channelStore.activeChannel);
  const eventsBound = ref(false);
  let stateBroadcastInterval: number | null = null;

  const activePlayer = computed(() =>
    scoring.players.value.find((p) => p.playerId === buzzer.activePlayerId.value),
  );

  // --- State broadcast (host only) ---
  const buildPartyState = (): PartyStatePayload => ({
    sentAt: Date.now(),
    roundIndex: gameStore.currentRoundIndex,
    buzzerState: buzzer.buzzerState.value,
    activePlayerId: buzzer.activePlayerId.value,
    answerDeadlineAt: buzzer.answerDeadlineAt.value,
    lightsOutUntilAt: powerups.lightsOut.untilAt.value,
    lightsOutByPlayerId: powerups.lightsOut.byPlayerId.value,
    lightsOutUsedBy: powerups.lightsOut.usedBy.value,
    xlzActiveForRoundIndex: powerups.xlzActiveForRoundIndex.value,
    xlzByPlayerId: powerups.xlzByPlayerId.value,
    xlzUsedBy: powerups.xlzUsedBy.value,
    freezeUntilAt: powerups.freeze.untilAt.value,
    freezeByPlayerId: powerups.freeze.byPlayerId.value,
    freezeUsedBy: powerups.freeze.usedBy.value,
    playerLastSeen: isHost.value ? heartbeat.playerLastSeen.value : undefined,
    players: scoring.players.value,
    roundTimeLimit: buzzer.roundTimeLimit.value,
    buzzerTimeLimit: buzzer.buzzerTimeLimit.value,
  });

  const broadcastPartyState = (reason: string) => {
    if (!isHost.value) return;
    buzzer.startAnswerTimer(() => resolveAnswer(buzzer.activePlayerId.value, false));
    channel.value?.trigger("client-party-state", { reason, state: buildPartyState() });
  };

  const broadcastPlayerScores = () => {
    if (!isHost.value) return;
    channel.value?.trigger("client-party-player-scores", {
      players: scoring.players.value.map((p) => ({
        playerId: p.playerId,
        username: p.username,
        avatarIndex: p.avatarIndex,
        points: p.points,
        wrongAnswers: p.wrongAnswers,
        correctAnswers: p.correctAnswers,
        quickestAnswer: p.quickestAnswer,
        powerupsUsed: p.powerupsUsed,
        emojisSent: p.emojisSent,
        isDecrypter: p.isDecrypter,
      })),
    });
  };

  // --- Game flow ---
  const startGame = () => {
    scoring.initPlayers(channelStore.playersOnline);
    powerups.resetAll();
    gameStore.prepareGame(configStore.revealTime);
    channelStore.setGameRunning(true);

    channel.value?.trigger("client-party-game-started", {
      rounds: gameStore.rounds,
      revealTime: configStore.revealTime,
    });

    router.push("/party-host");
    broadcastPlayerScores();
    broadcastPartyState("game-started");
  };

  const resolveAnswer = (playerId: string | null, isCorrect: boolean) => {
    const { elapsedMs } = buzzer.resolve(playerId, isCorrect);

    scoring.applyResult(playerId, isCorrect, elapsedMs, {
      currentRoundIndex: gameStore.currentRoundIndex,
      maxRounds: configStore.maxRounds,
      isXlzActive: powerups.isXlzActiveForRound(gameStore.currentRoundIndex),
    });

    if (isHost.value) {
      isRevealing.value = false;
      channel.value?.trigger("client-party-round-result", {
        playerId,
        isCorrect,
        correctAnswer: gameStore.currentRound?.answer,
      });

      workerSetTimeout(() => {
        buzzer.buzzerState.value = "locked";
        broadcastPlayerScores();
        broadcastPartyState("round-result-finalized");
      }, 1000);
    }
  };

  const openBuzzer = () => {
    gameStore.setGameState("revealing");
    buzzer.open(() => skipRound());
    channel.value?.trigger("client-party-buzzer-open", {});
    broadcastPartyState("buzzer-open");
  };

  const handleBuzz = (playerId: string) => {
    if (buzzer.buzzerState.value !== "open") return;
    buzzer.lock(playerId);
    if (playerId === channelStore.playerId) buzzer.hasAnswered.value = false;

    channel.value?.trigger("client-party-buzzer-locked", {
      playerId,
      options: gameStore.currentRound?.options,
    });
    broadcastPartyState("buzzer-locked");
    buzzer.startAnswerTimer(() => resolveAnswer(buzzer.activePlayerId.value, false));
  };

  const handleRoundTimeout = () => {
    if (!isHost.value) return;
    buzzer.clearBuzzerTimer();
    resolveAnswer(null, false);
  };

  const nextRound = () => {
    isRevealing.value = true;
    gameStore.nextRound();
    if (gameStore.isGameOver) {
      endGame();
      return;
    }
    buzzer.answerDeadlineAt.value = null;
    channel.value?.trigger("client-party-next-round", {
      roundIndex: gameStore.currentRoundIndex,
    });
    broadcastPartyState("next-round");
    openBuzzer();
  };

  const skipRound = () => {
    if (!isHost.value) return;
    channel.value?.trigger("client-party-round-result", {
      playerId: null,
      isCorrect: false,
      correctAnswer: gameStore.currentRound?.answer,
    });
    isRevealing.value = false;
    buzzer.buzzerState.value = "locked";
    buzzer.roundResult.value = "incorrect";
    buzzer.activePlayerId.value = null;
    buzzer.hasAnswered.value = false;
    buzzer.answerDeadlineAt.value = null;
    broadcastPlayerScores();
    broadcastPartyState("skip-round");
  };

  const endGame = () => {
    gameStore.isGameOver = true;
    channelStore.setGameRunning(false);
    if (stateBroadcastInterval) {
      workerClearInterval(stateBroadcastInterval);
      stateBroadcastInterval = null;
    }
    channel.value?.trigger("client-party-game-over", { players: scoring.players.value });
    broadcastPartyState("game-over");
    router.push("/gameover-party");
  };

  // --- Powerup triggers ---
  const triggerLightsOut = () => {
    if (!channel.value || powerups.lightsOut.isActive.value || powerups.lightsOutUsedByMe.value) return;
    if (!isHost.value) {
      channel.value.trigger("client-party-lightsout-request", { playerId: channelStore.playerId, ts: Date.now() });
      return;
    }
    const hostId = String(channelStore.playerId || "host");
    const untilAt = Date.now() + 4000;
    powerups.lightsOut.activate(untilAt, hostId);
    channel.value.trigger("client-party-lightsout", { untilAt, byPlayerId: hostId });
  };

  const triggerXlz = () => {
    if (!channel.value || powerups.xlzUsedByMe.value || powerups.isXlzActiveForRound(gameStore.currentRoundIndex)) return;
    if (!isHost.value) {
      channel.value.trigger("client-party-xlz-request", { playerId: channelStore.playerId, ts: Date.now() });
      return;
    }
    const hostId = String(channelStore.playerId || "host");
    powerups.activateXlz(gameStore.currentRoundIndex, hostId);
    channel.value.trigger("client-party-xlz", { roundIndex: gameStore.currentRoundIndex, byPlayerId: hostId });
    broadcastPartyState("xlz");
  };

  const triggerFreeze = () => {
    if (!channel.value || powerups.freezeUsedByMe.value) return;
    if (!isHost.value) {
      channel.value.trigger("client-party-freeze-request", { playerId: channelStore.playerId, ts: Date.now() });
      return;
    }
    const hostId = String(channelStore.playerId || "host");
    powerups.freeze.markUsed(hostId);
    scoring.incrementPowerupsUsed(hostId);
    const untilAt = Date.now() + 4000;
    powerups.activateFreeze(untilAt, hostId, getMyId());
    channel.value.trigger("client-party-freeze", { untilAt, byPlayerId: hostId });
    broadcastPartyState("freeze");
  };

  // --- Player actions ---
  const pressBuzzer = () => {
    if (buzzer.buzzerState.value !== "open") return;
    const payload = { playerId: channelStore.playerId };
    buzzRetry.start(() => channel.value?.trigger("client-party-buzz", { ...payload, seq: buzzRetry.pending.value?.seq }));
  };

  const submitAnswer = (option: { name: string; isCorrect: boolean } | undefined) => {
    const payload = {
      playerId: channelStore.playerId,
      answer: option ? option.name : "Time up",
      isCorrect: option ? option.isCorrect : false,
    };
    answerRetry.start(() => channel.value?.trigger("client-party-answer", { ...payload, seq: answerRetry.pending.value?.seq }));
    if (isHost.value) resolveAnswer(channelStore.playerId, payload.isCorrect);
  };

  const sendEmoji = (emoji: string) => {
    if (!emoji) return;
    channel.value?.trigger("client-party-emoji", { emoji, playerId: channelStore.playerId });
  };

  // --- Event setup ---
  const setupEvents = () => {
    const c = channel.value;
    if (!c || channelStore.mode !== "party") return;
    if (eventsBound.value) return;

    channelEvents.setChannel(c);
    eventsBound.value = true;
    heartbeat.markHostActivity();

    const bind = (name: string, handler: (...args: any[]) => void) =>
      channelEvents.bind(c, name, handler);

    // Common events
    bind("client-join-blocked", (data: { targetId?: string }) => {
      heartbeat.markHostActivity();
      if (data?.targetId && data.targetId !== channelStore.playerId) return;
      channelStore.reset();
      router.push("/");
    });

    bind("client-player-inactive", (data: { playerId: string }) => {
      heartbeat.markHostActivity();
      if (!isHost.value) return;
      scoring.players.value = scoring.players.value.filter((p) => p.playerId !== data.playerId);
      channelStore.removePlayer(data.playerId);
    });

    bind("client-party-game-started", (data: any) => {
      heartbeat.markHostActivity();
      channelStore.setGameRunning(true);
      gameStore.prepareGame(data.revealTime, data.rounds);
      router.push("/party-player");
    });

    bind("client-party-buzzer-open", () => {
      heartbeat.markHostActivity();
      buzzer.buzzerState.value = "open";
      buzzer.roundResult.value = null;
      buzzer.activePlayerId.value = null;
      buzzer.hasAnswered.value = false;
      buzzer.answerDeadlineAt.value = null;
      buzzRetry.reset();
    });

    bind("client-party-buzzer-locked", (data: { playerId: string }) => {
      heartbeat.markHostActivity();
      buzzRetry.reset();
      buzzer.activePlayerId.value = data.playerId;
      buzzer.buzzerState.value = data.playerId === channelStore.playerId ? "answering" : "locked";
      if (data.playerId === channelStore.playerId) buzzer.hasAnswered.value = false;
    });

    bind("client-party-buzz-ack", (data: { targetId?: string; seq?: number }) => {
      if (data?.targetId !== channelStore.playerId) return;
      if (data?.seq) buzzRetry.ack(data.seq);
    });

    bind("client-party-answer-ack", (data: { targetId?: string; seq?: number }) => {
      if (data?.targetId !== channelStore.playerId) return;
      if (data?.seq) answerRetry.ack(data.seq);
    });

    bind("client-party-round-result", (data: any) => {
      heartbeat.markHostActivity();
      buzzer.roundResult.value = data.isCorrect ? "correct" : "incorrect";
      buzzer.buzzerState.value = "locked";
      buzzer.activePlayerId.value = data.playerId;
      buzzer.answerDeadlineAt.value = null;
    });

    bind("client-party-player-scores", (data: { players: PartyPlayer[] }) => {
      scoring.players.value = data.players;
    });

    bind("client-party-next-round", () => {
      heartbeat.markHostActivity();
      gameStore.nextRound();
      buzzer.hasAnswered.value = false;
    });

    bind("client-party-lightsout", (data?: { untilAt?: number; byPlayerId?: string }) => {
      const untilAt = typeof data?.untilAt === "number" ? data.untilAt : Date.now() + 4000;
      powerups.lightsOut.activate(untilAt, data?.byPlayerId ?? null);
    });

    bind("client-party-xlz", (data?: { roundIndex?: number; byPlayerId?: string }) => {
      powerups.xlzActiveForRoundIndex.value = data?.roundIndex ?? gameStore.currentRoundIndex;
      powerups.xlzByPlayerId.value = data?.byPlayerId ?? null;
    });

    bind("client-party-freeze", (data?: { untilAt?: number; byPlayerId?: string }) => {
      const untilAt = typeof data?.untilAt === "number" ? data.untilAt : Date.now() + 4000;
      powerups.activateFreeze(untilAt, data?.byPlayerId ?? null, getMyId());
    });

    bind("client-party-host-heartbeat", () => {
      if (!isHost.value) heartbeat.markHostActivity();
    });

    bind("client-party-game-over", (data: { players: PartyPlayer[] }) => {
      heartbeat.markHostActivity();
      scoring.players.value = data.players;
      gameStore.isGameOver = true;
      channelStore.setGameRunning(false);
      router.push("/gameover-party");
    });

    // Host-only events
    if (isHost.value) {
      bind("client-party-buzz", (data: { playerId: string; seq?: number }) => {
        heartbeat.markHostActivity();
        const canAccept = buzzer.buzzerState.value === "open";
        handleBuzz(data.playerId);
        if (data?.seq) {
          channel.value?.trigger("client-party-buzz-ack", { targetId: data.playerId, seq: data.seq, accepted: canAccept });
        }
      });

      bind("client-party-answer", (data: { playerId: string; isCorrect: boolean; seq?: number }) => {
        heartbeat.markHostActivity();
        if (buzzer.buzzerState.value === "answering" && buzzer.activePlayerId.value === data.playerId) {
          resolveAnswer(data.playerId, data.isCorrect);
        }
        if (data?.seq) {
          channel.value?.trigger("client-party-answer-ack", { targetId: data.playerId, seq: data.seq });
        }
      });

      bind("client-party-emoji", (data: { emoji: string; playerId?: string }) => {
        heartbeat.markHostActivity();
        if (data?.playerId) scoring.incrementEmojisSent(data.playerId);
        if (data?.emoji) scoring.addEmojiStat(data.emoji);
        window.dispatchEvent(new CustomEvent("emoji-received", { detail: data.emoji }));
      });

      bind("client-party-heartbeat", (data: { playerId?: string; ts?: number }) => {
        if (data?.playerId) heartbeat.markPlayerSeen(data.playerId, data.ts);
      });

      bind("client-party-state-request", () => {
        heartbeat.markHostActivity();
        broadcastPartyState("state-request");
      });

      bind("client-party-lightsout-request", (data?: { playerId?: string }) => {
        if (!data?.playerId || !channelStore.onlineGameRunning) return;
        if (powerups.lightsOut.isActive.value || powerups.lightsOut.hasUsed(data.playerId)) return;
        powerups.lightsOut.markUsed(data.playerId);
        scoring.incrementPowerupsUsed(data.playerId);
        const untilAt = Date.now() + 4000;
        powerups.lightsOut.activate(untilAt, data.playerId);
        channel.value?.trigger("client-party-lightsout", { untilAt, byPlayerId: data.playerId });
        broadcastPartyState("lightsout");
      });

      bind("client-party-xlz-request", (data?: { playerId?: string }) => {
        if (!data?.playerId || !channelStore.onlineGameRunning) return;
        if (powerups.xlzUsedBy.value?.[data.playerId]) return;
        if (powerups.isXlzActiveForRound(gameStore.currentRoundIndex)) return;
        powerups.activateXlz(gameStore.currentRoundIndex, data.playerId);
        scoring.incrementPowerupsUsed(data.playerId);
        channel.value?.trigger("client-party-xlz", { roundIndex: gameStore.currentRoundIndex, byPlayerId: data.playerId });
        broadcastPartyState("xlz");
      });

      bind("client-party-freeze-request", (data?: { playerId?: string }) => {
        if (!data?.playerId || !channelStore.onlineGameRunning) return;
        if (powerups.freeze.hasUsed(data.playerId)) return;
        powerups.freeze.markUsed(data.playerId);
        scoring.incrementPowerupsUsed(data.playerId);
        const untilAt = Date.now() + 4000;
        powerups.activateFreeze(untilAt, data.playerId, getMyId());
        channel.value?.trigger("client-party-freeze", { untilAt, byPlayerId: data.playerId });
        broadcastPartyState("freeze");
      });

      // Periodic state broadcast
      stateBroadcastInterval = workerSetInterval(() => {
        buzzer.startAnswerTimer(() => resolveAnswer(buzzer.activePlayerId.value, false));
        broadcastPartyState("periodic");
      }, 10000);

      // Host heartbeat
      heartbeat.startHostHeartbeat(
        () => channel.value?.trigger("client-party-host-heartbeat", { ts: Date.now() }),
        () => channelStore.onlineGameRunning,
      );
    }

    // Player heartbeat + stale detection
    if (!isHost.value && channelStore.onlineGameRunning) {
      heartbeat.startPlayerHeartbeat(
        channelStore.playerId,
        () => channel.value?.trigger("client-party-heartbeat", { playerId: channelStore.playerId, ts: Date.now() }),
        () => channelStore.onlineGameRunning,
      );
      heartbeat.startStaleDetection(() => {
        channel.value?.trigger("client-party-state-request", { requestedBy: channelStore.playerId });
      });
    }

    // State sync handler (player only)
    bind("client-party-state", (data: { state?: PartyStatePayload }) => {
      if (isHost.value) return;
      heartbeat.markHostActivity();
      const state = data?.state;
      if (!state) return;

      if (Array.isArray(state.players)) scoring.players.value = state.players;
      if (typeof state.roundTimeLimit === "number") buzzer.roundTimeLimit.value = state.roundTimeLimit;
      if (typeof state.buzzerTimeLimit === "number") buzzer.buzzerTimeLimit.value = state.buzzerTimeLimit;
      if (typeof state.roundIndex === "number") gameStore.setRoundIndex(state.roundIndex);

      buzzer.activePlayerId.value = state.activePlayerId ?? null;
      buzzer.buzzerState.value = state.buzzerState ?? buzzer.buzzerState.value;
      buzzer.answerDeadlineAt.value = typeof state.answerDeadlineAt === "number" ? state.answerDeadlineAt : null;

      // Sync powerups
      if (typeof state.lightsOutUntilAt === "number" && state.lightsOutUntilAt > Date.now()) {
        powerups.lightsOut.activate(state.lightsOutUntilAt, state.lightsOutByPlayerId ?? null);
      } else {
        powerups.lightsOut.deactivate();
      }
      if (state.lightsOutUsedBy) powerups.lightsOut.usedBy.value = state.lightsOutUsedBy;

      if (typeof state.xlzActiveForRoundIndex === "number") {
        powerups.xlzActiveForRoundIndex.value = state.xlzActiveForRoundIndex;
      } else {
        powerups.xlzActiveForRoundIndex.value = null;
      }
      powerups.xlzByPlayerId.value = state.xlzByPlayerId ?? null;
      if (state.xlzUsedBy) powerups.xlzUsedBy.value = state.xlzUsedBy;

      if (typeof state.freezeUntilAt === "number" && state.freezeUntilAt > Date.now()) {
        powerups.activateFreeze(state.freezeUntilAt, state.freezeByPlayerId ?? null, getMyId());
      } else {
        powerups.deactivateFreeze();
      }
      if (state.freezeUsedBy) powerups.freeze.usedBy.value = state.freezeUsedBy;
      if (state.playerLastSeen) heartbeat.playerLastSeen.value = state.playerLastSeen;

      if (buzzer.buzzerState.value !== "answering" || buzzer.activePlayerId.value !== channelStore.playerId) {
        buzzer.hasAnswered.value = false;
      }
    });
  };

  const unbindEvents = () => {
    channelEvents.unbindAll();
    eventsBound.value = false;
    if (stateBroadcastInterval) {
      workerClearInterval(stateBroadcastInterval);
      stateBroadcastInterval = null;
    }
    buzzRetry.reset();
    answerRetry.reset();
    heartbeat.stop();
    powerups.resetAll();
    buzzer.answerStartedAt.value = null;
  };

  // Auto setup/teardown
  watch(
    () => [channelStore.mode, channel.value, channelStore.isHost],
    ([mode, c]) => {
      if (mode !== "party" || !c) {
        unbindEvents();
        return;
      }
      setupEvents();
    },
    { immediate: true },
  );

  const reset = () => {
    unbindEvents();
    scoring.reset();
    buzzer.reset();
    powerups.resetAll();
    channelStore.setGameRunning(false);
  };

  return {
    // Buzzer
    players: scoring.players,
    buzzerState: buzzer.buzzerState,
    activePlayerId: buzzer.activePlayerId,
    activePlayer,
    roundResult: buzzer.roundResult,
    isRevealing,
    roundTimeLimit: buzzer.roundTimeLimit,
    buzzerTimeLimit: buzzer.buzzerTimeLimit,
    hasAnswered: buzzer.hasAnswered,
    answerDeadlineAt: buzzer.answerDeadlineAt,
    // Connection
    connectionStale: heartbeat.connectionStale,
    playerLastSeen: heartbeat.playerLastSeen,
    // Actions
    startGame,
    openBuzzer,
    handleBuzz,
    handleRoundTimeout,
    resolveAnswer,
    nextRound,
    endGame,
    pressBuzzer,
    submitAnswer,
    setupEvents,
    sendEmoji,
    broadcastPartyState,
    reset,
    // Powerups
    isLightsOut: powerups.lightsOut.isActive,
    lightsOutUntilAt: powerups.lightsOut.untilAt,
    lightsOutByPlayerId: powerups.lightsOut.byPlayerId,
    lightsOutUsedBy: powerups.lightsOut.usedBy,
    lightsOutUsedByMe: powerups.lightsOutUsedByMe,
    triggerLightsOut,
    xlzActiveForRoundIndex: powerups.xlzActiveForRoundIndex,
    xlzByPlayerId: powerups.xlzByPlayerId,
    xlzUsedBy: powerups.xlzUsedBy,
    xlzUsedByMe: powerups.xlzUsedByMe,
    isXlzActive: computed(() => powerups.isXlzActiveForRound(gameStore.currentRoundIndex)),
    triggerXlz,
    isFrozen: powerups.isFrozen,
    freezeUntilAt: powerups.freeze.untilAt,
    freezeByPlayerId: powerups.freeze.byPlayerId,
    freezeUsedBy: powerups.freeze.usedBy,
    freezeUsedByMe: powerups.freezeUsedByMe,
    triggerFreeze,
    emojiStatistics: scoring.emojiStatistics,
    // Retry (for external checks)
    pendingBuzz: buzzRetry.pending,
    pendingAnswer: answerRetry.pending,
  };
});
