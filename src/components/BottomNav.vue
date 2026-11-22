<script setup lang="ts">
import { useRoute } from 'vue-router'
import { settings } from '../stores/settings'

const route = useRoute()

const items = [
  {
    to: '/',
    name: 'home',
    label: '题库',
    icon: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 5.5v16"/><path d="M8 7h8M8 11h6"/>',
  },
  {
    to: '/test',
    name: 'test',
    label: '测试',
    icon: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13 6 5 5"/>',
  },
  {
    to: '/pk',
    name: 'pk',
    label: '对战',
    icon: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  },
  {
    to: '/board',
    name: 'board',
    label: '留言',
    icon: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/>',
  },
  {
    to: '/me',
    name: 'me',
    label: '成就',
    icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M9 21h6"/>',
  },
  {
    to: '/leaderboard',
    name: 'leaderboard',
    label: '排行',
    icon: '<path d="M4 20v-6M10 20V8M16 20v-9M22 20H2"/>',
  },
]

function isActive(name: string) {
  return route.name === name || (name === 'home' && route.name === 'quiz')
}
</script>

<template>
  <nav v-if="settings.layout === 'douyin'" class="bottom-nav">
    <router-link
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="{ on: isActive(item.name) }"
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
      <small>{{ item.label }}</small>
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
}

.bottom-nav a small {
  font-size: 9.5px;
  line-height: 1;
  letter-spacing: 0.02em;
}

.bottom-nav a.on {
  color: #fe2c55;
}

.bottom-nav a.on small {
  font-weight: 600;
}
</style>
