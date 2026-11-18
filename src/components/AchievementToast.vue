<script setup lang="ts">
import { unlockToast } from '../stores/incentives'
</script>

<template>
  <transition name="award">
    <div v-if="unlockToast.current" class="award card">
      <span class="award-medal serif" :class="unlockToast.current.tier">{{ unlockToast.current.char }}</span>
      <div class="award-text">
        <small>解锁成就</small>
        <b>{{ unlockToast.current.name }}</b>
        <span>{{ unlockToast.current.desc }}</span>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.award {
  position: fixed;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 13px;
  width: min(360px, calc(100vw - 32px));
  padding: 13px 16px;
  transform: translateX(-50%);
  border-color: var(--accent-line);
  box-shadow: 0 24px 50px -20px rgba(0, 0, 0, 0.45);
}

.award-medal {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 21px;
  font-weight: 700;
  border: 1.5px solid transparent;
}

.award-medal.bronze {
  background: #f0e2d3;
  border-color: #d9b58f;
  color: #8a5a2b;
}

.award-medal.silver {
  background: #e9edf1;
  border-color: #bcc7d1;
  color: #55636f;
}

.award-medal.gold {
  background: #f6ebcf;
  border-color: #dcc07a;
  color: #8a6a1a;
}

[data-theme='night'] .award-medal.bronze,
[data-theme='ink'] .award-medal.bronze {
  background: #2c2218;
  border-color: #54402a;
  color: #d9a771;
}

[data-theme='night'] .award-medal.silver,
[data-theme='ink'] .award-medal.silver {
  background: #222a32;
  border-color: #3c4a57;
  color: #b6c5d2;
}

[data-theme='night'] .award-medal.gold,
[data-theme='ink'] .award-medal.gold {
  background: #2b2416;
  border-color: #564622;
  color: #e3c079;
}

.award-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.award-text small {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--muted);
}

.award-text b {
  font-size: 15px;
  font-weight: 700;
}

.award-text span {
  font-size: 11.5px;
  color: var(--text-2);
}

.award-enter-active,
.award-leave-active {
  transition: opacity 0.28s var(--ease), transform 0.28s var(--ease);
}

.award-enter-from,
.award-leave-to {
  opacity: 0;
  transform: translate(-50%, 18px);
}
</style>
