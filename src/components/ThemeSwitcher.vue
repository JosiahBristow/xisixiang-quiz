<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ThemeId } from '../types'
import { isDarkTheme, setTheme, settings } from '../stores/settings'

interface ThemeOption {
  id: ThemeId
  label: string
  dots: string[]
}

const themes: ThemeOption[] = [
  { id: 'auto', label: '跟随系统', dots: ['#f4f0e7', '#171a1f', '#8f2f2f'] },
  { id: 'paper', label: '纸墨', dots: ['#f4f0e7', '#fbf8f2', '#8f2f2f'] },
  { id: 'night', label: '夜阑', dots: ['#101216', '#171a1f', '#d16a60'] },
  { id: 'bamboo', label: '青竹', dots: ['#edf1e3', '#f9fbf2', '#3f6b3f'] },
  { id: 'ink', label: '墨蓝', dots: ['#0d1622', '#13202e', '#cfa14f'] },
]

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const dark = computed(() => isDarkTheme())

function pick(id: ThemeId) {
  setTheme(id)
  open.value = false
}

function onDocPointer(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
</script>

<template>
  <div ref="root" class="theme-switch">
    <button class="icon-btn" aria-label="切换主题" :title="'切换主题'" @click="open = !open">
      <svg v-if="dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>

    <transition name="fade">
      <div v-if="open" class="popover theme-menu">
        <p class="theme-title">外观主题</p>
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-row"
          :class="{ on: settings.theme === t.id }"
          @click="pick(t.id)"
        >
          <span class="dots">
            <i v-for="(c, i) in t.dots" :key="i" :style="{ background: c }" />
          </span>
          <span class="t-label">{{ t.label }}</span>
          <svg v-if="settings.theme === t.id" class="t-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.theme-switch {
  position: relative;
}

.theme-menu {
  min-width: 210px;
  padding: 8px;
}

.theme-title {
  padding: 4px 10px 8px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 9px;
  font-size: 13.5px;
  color: var(--text);
  transition: background-color 0.13s;
}

.theme-row:hover {
  background: var(--surface-2);
}

.theme-row.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.dots {
  display: flex;
}

.dots i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid var(--surface);
  margin-left: -4px;
  box-shadow: 0 0 0 0.5px var(--line-strong);
}

.dots i:first-child {
  margin-left: 0;
}

.t-label {
  flex: 1;
  text-align: left;
}

.t-check {
  width: 15px;
  height: 15px;
}
</style>
