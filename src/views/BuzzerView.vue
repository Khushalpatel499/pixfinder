<template>
  <main class="game-layout">
    <transition name="fade" mode="out-in">
      <CountdownTransition
        v-if="gameStore.gameState === 'starting'"
        message="GET READY"
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
        :pauseReveal="pauseReveal"
      />
    </section>

    <section class="answer-section">
      <transition name="fade" mode="out-in">
        <AnswerButtons
          v-if="showAnswers"
          :hasAnswered="hasAnswered"
          :answers="currentRound?.options || []"
          @answered="handleBuzzerAnswer"
        />
        <div v-else class="buzzer-container">
          <button @click="handleBuzzerPress" class="neon-buzzer">
            <span class="buzzer-text">I KNOW IT!</span>
            <div class="glow-layer"></div>
          </button>
        </div>
      </transition>
    </section>
  </main>
</template>

<script setup>
import { ref, watch } from "vue";
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
  startTimer,
  clearAllTimers,
  gameStore,
  playerStore,
  soundStore,
} = useRoundFlow();

// Buzzer-specific state
const showAnswers = ref(false);
const pauseReveal = ref(false);
const potentialPoints = ref(0);

const handleBuzzerPress = () => {
  if (gameStore.gameState !== "revealing" || showAnswers.value || hasAnswered.value) return;

  potentialPoints.value = timer.value;
  showAnswers.value = true;
  pauseReveal.value = true;
  gameStore.setGameState("answering");
  soundStore.playSound("buzz");

  // Switch to 5s answer window
  clearAllTimers();
  startTimer(5);
};

const handleBuzzerAnswer = (selectedOption) => {
  // Override points to use the moment buzzer was pressed
  const savedTimer = timer.value;
  timer.value = potentialPoints.value;
  handleAnswer(selectedOption);
  timer.value = savedTimer;
};

// Reset buzzer state on new round
watch(
  () => gameStore.gameState,
  (state) => {
    if (state === "revealing") {
      showAnswers.value = false;
      pauseReveal.value = false;
    }
  },
);
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
  min-height: 160px;
}

.buzzer-container {
  margin: 32px 0;
}

.neon-buzzer {
  position: relative;
  width: 100%;
  padding: 20px;
  background: rgba(236, 72, 153, 0.1);
  border: 2px solid #ec4899;
  border-radius: 8px;
  color: #fff;
  font-family: "8bit", sans-serif;
  font-size: 1.5rem;
  letter-spacing: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.neon-buzzer:active {
  background: #ec4899;
  transform: scale(0.98);
  color: #000;
}

.buzzer-text {
  position: relative;
  z-index: 2;
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
