<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RewardItem } from '../lib/rewards'
import { THEME_REWARDS } from '../lib/rewards'
import type { ThemeId } from '../types'
import { auth } from '../stores/auth'
import { availablePoints, isOwned, purchaseReward } from '../stores/rewards'
import { isDarkTheme, setTheme, settings } from '../stores/settings'
import { ui } from '../stores/ui'

interface ThemeOption {
  id: ThemeId
  label: string
  dots: string[]
  reward?: RewardItem
}

const dotsByTheme: Record<string, string[]> = {
  cinnabar: ['#f7f0e9', '#fffaf4', '#9c3328'],
  celadon: ['#edf4f0', '#f9fdfa', '#3d6f62'],
  nocturne: ['#10101f', '#18182b', '#c9a2ff'],
}

const freeThemes: ThemeOption[] = [
  { id: 'auto', label: '跟随系统', dots: ['#f4f0e7', '#171a1f', '#8f2f2f'] },
  { id: 'paper', label: '纸墨', dots: ['#f4f0e7', '#fbf8f2', '#8f2f2f'] },
  { id: 'night', label: '夜阑', dots: ['#101216', '#171a1f', '#d16a60'] },
  { id: 'bamboo', label: '青竹', dots: ['#edf1e3', '#f9fbf2', '#3f6b3f'] },
  { id: 'ink', label: '墨蓝', dots: ['#0d1622', '#13202e', '#cfa14f'] },
]

const premiumThemes: ThemeOption[] = THEME_REWARDS.map((r) => ({
  id: r.theme as ThemeId,
  label: r.name,
  dots: dotsByTheme[r.theme ?? ''] ?? ['#ccc', '#eee', '#999'],
  reward: r,
}))

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const dark = computed(() => isDarkTheme())
const themeMsg = ref('')
const purchasing = ref(false)

async function pick(t: ThemeOption) {
  themeMsg.value = ''
  if (t.reward && !isOwned(t.reward.id)) {
    if (!auth.user) {
      open.value = false
      ui.authOpen = true
      return
    }
    const short = t.reward.cost - availablePoints.value
    if (short > 0) {
      themeMsg.value = `积分不足，还差 ${short} 分`
      return
    }
    if (!window.confirm(`使用 ${t.reward.cost} 积分解锁「${t.reward.name}」主题？`)) return
    purchasing.value = true
    const res = await purchaseReward(t.reward.id)
    purchasing.value = false
    if (!res.ok) {
      themeMsg.value = res.msg ?? '兑换失败，请稍后再试'
      return
    }
  }
  setTheme(t.id)
  open.value = false
}

function toggle() {
  open.value = !open.value
  themeMsg.value = ''
}

function onDocPointer(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
</script>

<template>
  <div ref="root" class="theme-switch">
    <button class="icon-btn" aria-label="切换主题" title="切换主题" @click="toggle">
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
          v-for="t in freeThemes"
          :key="t.id"
          class="theme-row"
          :class="{ on: settings.theme === t.id }"
          @click="pick(t)"
        >
          <span class="dots">
            <i v-for="(c, i) in t.dots" :key="i" :style="{ background: c }" />
          </span>
          <span class="t-label">{{ t.label }}</span>
          <svg v-if="settings.theme === t.id" class="t-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>

        <div class="theme-divider">积分主题</div>

        <button
          v-for="t in premiumThemes"
          :key="t.id"
          class="theme-row"
          :class="{ on: settings.theme === t.id, locked: !isOwned(t.reward!.id) }"
          :disabled="purchasing"
          @click="pick(t)"
        >
          <span class="dots">
            <i v-for="(c, i) in t.dots" :key="i" :style="{ background: c }" />
          </span>
          <span class="t-label">{{ t.label }}</span>
          <span v-if="!isOwned(t.reward!.id)" class="t-cost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {{ t.reward!.cost }}
          </span>
          <svg v-else-if="settings.theme === t.id" class="t-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>

        <p v-if="themeMsg" class="theme-msg">{{ themeMsg }}</p>

        <router-link to="/me" class="theme-shop" @click="open = false">
          <span>可用 {{ availablePoints }} 积分</span>
          <span>去商城 →</span>
        </router-link>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.theme-switch {
  position: relative;
}

.theme-menu {
  min-width: 238px;
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

.theme-row:hover:not(:disabled) {
  background: var(--surface-2);
}

.theme-row.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.theme-row.locked .t-label {
  color: var(--text-2);
}

.theme-row:disabled {
  opacity: 0.6;
  cursor: wait;
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

.theme-divider {
  margin: 6px 10px 4px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.t-cost {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}

.t-cost svg {
  width: 11px;
  height: 11px;
}

.theme-msg {
  margin: 4px 10px 0;
  font-size: 11px;
  color: var(--bad);
  line-height: 1.5;
}

.theme-shop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px 3px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--muted);
  transition: color 0.15s;
}

.theme-shop:hover {
  color: var(--accent);
}
</style>
