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
        :is-revealing="false"
        :is-status-icon="hasAnswered"
        :timer-duration="timerDuration"
        :is-magnifier-mode="gameStore.gameState === 'revealing'"
        :mouse-pos="mousePos"
        @mousemove="updateMousePos"
        @touchstart="updateTouchPos"
        @touchmove="updateTouchPos"
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
import { ref } from "vue";
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
  timer,
  timerDuration,
  currentRound,
  maxRounds,
  handleAnswer,
  gameStore,
  playerStore,
} = useRoundFlow();

// Magnifier-specific logic
const mousePos = ref({ x: 300, y: 300 });

const updateMousePos = (event) => {
  if (gameStore.gameState !== "revealing") return;
  const rect = event.target.getBoundingClientRect();
  const scaleX = 600 / rect.width;
  const scaleY = 600 / rect.height;
  mousePos.value = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

const updateTouchPos = (event) => {
  if (gameStore.gameState !== "revealing") return;
  if (event.cancelable) event.preventDefault();
  const touch = event.touches[0];
  const canvasElement =
    event.currentTarget.$el?.querySelector("canvas") || event.target;
  const rect = canvasElement.getBoundingClientRect();
  const scaleX = 600 / rect.width;
  const scaleY = 600 / rect.height;
  mousePos.value = {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top) * scaleY,
  };
};
</script>

<style scoped>
.game-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  max-width: 500px;
  width: 100%;
  @media (min-width: 1024px) {
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
</style>
