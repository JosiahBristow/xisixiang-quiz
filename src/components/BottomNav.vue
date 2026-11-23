<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { settings } from '../stores/settings'
import { NAV_ITEMS, isNavActive } from '../lib/navItems'

const route = useRoute()

const items = computed(() => NAV_ITEMS.filter((item) => item.mobile !== false))
</script>

<template>
  <nav v-if="settings.layout === 'douyin'" class="bottom-nav">
    <router-link
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="{ on: isNavActive(item, route.name) }"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        v-html="item.icon"
      />
      <small>{{ item.short }}</small>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(10, 10, 12, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

@media (max-width: 640px) {
  .bottom-nav {
    display: flex;
  }
}

.bottom-nav a {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #8f8f99;
  text-decoration: none;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.bottom-nav a svg {
  width: 21px;
  height: 21px;
  transition: transform 0.18s var(--ease), filter 0.18s;
}

.bottom-nav a small {
  font-size: 9.5px;
  line-height: 1;
  letter-spacing: 0.02em;
}

.bottom-nav a.on {
  color: #fe2c55;
}

.bottom-nav a.on svg {
  transform: translateY(-2px) scale(1.1);
  filter: drop-shadow(0 0 7px rgba(254, 44, 85, 0.55));
}

.bottom-nav a.on small {
  font-weight: 600;
}
</style>
