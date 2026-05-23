<template>
  <main class="game-layout">
    <transition name="fade" mode="out-in">
      <CountdownTransition
        v-if="gameStore.gameState === 'starting'"
        @done="gameStore.setGameState('revealing')"
      />
    </transition>

    <section class="canvas-section">
      <MinimalSettings />
      <GameHeader
        :max="timerDuration"
        :count="timer"
        :is-correct="hasAnsweredCorrectly"
        :is-incorrect="hasAnswered && !hasAnsweredCorrectly"
        :total-score="playerStore.points"
        :currentRound="gameStore.currentRoundIndex + 1"
        :max-rounds="maxRounds"
        :is-survival="false"
      />

      <PixelCanvas
        :pixel-array="pixelData"
        :resolution="resolution"
        :is-revealing="isRevealing"
        :is-status-icon="hasAnswered"
        :timer-duration="timerDuration"
      />
    </section>

    <section class="answer-section">
      <AnswerButtons
        :hasAnswered="hasAnswered && !playerStore.isCreatorMode"
        :answers="currentRound?.options || []"
        @answered="handleAnswer"
      />
    </section>
  </main>
</template>

<script setup>
import PixelCanvas from "@/components/canvas/PixelCanvas.vue";
import CountdownTransition from "@/components/page-layout/CountdownTransition.vue";
import GameHeader from "@/components/game-ui/GameHeader.vue";
import MinimalSettings from "@/components/page-ui/MinimalSettings.vue";
import AnswerButtons from "@/components/game-ui/AnswerButtons.vue";
import { useRoundFlow } from "@/composables/useRoundFlow";

const {
  resolution,
  pixelData,
  hasAnswered,
  hasAnsweredCorrectly,
  isRevealing,
  timer,
  timerDuration,
  currentRound,
  maxRounds,
  handleAnswer,
  gameStore,
  playerStore,
} = useRoundFlow();
</script>

<style scoped>
.game-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  max-width: 500px;
  width: 100%;
}

@media (min-width: 1024px) {
  .game-layout {
    position: relative;
    grid-template-columns: 1fr 400px;
    gap: 64px;
    max-width: calc(950px + 2rem);
  }
}

.answer-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 16px 0 32px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
