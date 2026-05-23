<template>
  <main class="game-layout">
    <transition name="fade" mode="out-in">
      <CountdownTransition
        v-if="gameStore.gameState === 'starting'"
        message="GET READY"
        @done="start"
      />
    </transition>

    <section class="canvas-section">
      <MinimalSettings />
      <GameHeader
        :max="survivalStore.maxTime"
        :count="survivalStore.timeLeft"
        :total-score="survivalStore.solvedCount"
        :is-survival="true"
        :highscore="survivalStore.highscore"
      />
      <PixelCanvas
        :pixel-array="pixelData"
        :resolution="resolution"
        :is-revealing="isRevealing"
        :is-status-icon="survivalStore.hasAnswered"
        :timer-duration="15"
      />
    </section>

    <section class="answer-section">
      <AnswerButtons
        :hasAnswered="survivalStore.hasAnswered"
        :answers="survivalStore.currentDrawing?.options || []"
        @answered="handleAnswer"
      />
    </section>
  </main>
</template>

<script setup>
import PixelCanvas from "@/components/canvas/PixelCanvas.vue";
import CountdownTransition from "@/components/page-layout/CountdownTransition.vue";
import GameHeader from "@/components/game-ui/GameHeader.vue";
import AnswerButtons from "@/components/game-ui/AnswerButtons.vue";
import MinimalSettings from "@/components/page-ui/MinimalSettings.vue";
import { useSurvivalFlow } from "@/composables/useSurvivalFlow";

const {
  resolution,
  pixelData,
  isRevealing,
  handleAnswer,
  start,
  survivalStore,
  gameStore,
} = useSurvivalFlow();
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
