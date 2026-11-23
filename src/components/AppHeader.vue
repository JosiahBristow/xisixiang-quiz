<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeSwitcher from './ThemeSwitcher.vue'
import SearchBox from './SearchBox.vue'
import MarqueeText from './MarqueeText.vue'
import UserAvatar from './UserAvatar.vue'
import RewardBadge from './RewardBadge.vue'
import { auth, signOut } from '../stores/auth'
import { settings } from '../stores/settings'
import { ui } from '../stores/ui'
import { hasSupabase } from '../lib/supabase'
import { NAV_ITEMS, isNavActive } from '../lib/navItems'

const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const userRef = ref<HTMLElement | null>(null)

function onDocPointer(e: PointerEvent) {
  if (menuOpen.value && userRef.value && !userRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))

function openAuth() {
  menuOpen.value = false
  ui.authOpen = true
}

async function logout() {
  menuOpen.value = false
  await signOut()
  router.push('/')
}

/** 默认布局保持原有顶栏文案 */
function defaultNavLabel(item: { name: string; label: string; short: string }) {
  if (item.name === 'pk') return '对战'
  if (item.name === 'me') return '成就'
  return item.label
}
</script>

<template>
  <header class="app-header" :class="`layout-${settings.layout}`">
    <div class="wrap head-inner">
      <router-link to="/" class="brand" aria-label="回到首页">
        <span class="seal">习</span>
        <span class="brand-text">
          <strong>习思想题库</strong>
          <small>刷题 · 背题 · 排名</small>
        </span>
      </router-link>

      <SearchBox v-if="settings.layout !== 'default'" class="head-search" />

      <nav v-if="settings.layout === 'default'" class="nav nav-main">
        <router-link
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :to="item.to"
          :class="{ on: isNavActive(item, route.name) }"
        >
          <span class="nav-long">{{ defaultNavLabel(item) }}</span>
          <span class="nav-short">{{ item.short }}</span>
        </router-link>
      </nav>

      <div class="head-right">
        <ThemeSwitcher />
        <div v-if="hasSupabase" ref="userRef" class="user">
          <button v-if="auth.user" class="avatar-btn" aria-label="账号菜单" @click="menuOpen = !menuOpen">
            <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="28" />
            <span class="uname">{{ auth.nickname }}</span>
          </button>
          <button v-else class="btn btn-soft btn-sm" @click="openAuth">登录</button>

          <transition name="fade">
            <div v-if="menuOpen && auth.user" class="popover user-menu">
              <div class="um-head">
                <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="40" />
                <div class="um-id">
                  <span class="um-name-row">
                    <MarqueeText :text="auth.nickname" class="um-name" />
                    <RewardBadge
                      v-if="auth.equippedBadge"
                      :item-id="auth.equippedBadge"
                      :size="16"
                    />
                  </span>
                  <small>{{ auth.user.email }}</small>
                </div>
              </div>
              <router-link to="/favorites" class="menu-item" @click="menuOpen = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
                  <path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z" />
                </svg>
                我的收藏
              </router-link>
              <router-link to="/me" class="menu-item" @click="menuOpen = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
                  <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 12v4M9 20h6" />
                </svg>
                我的成就
              </router-link>
              <button class="menu-item" @click="openAuth">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <circle cx="12" cy="8" r="3.6" />
                  <path d="M4.5 20c.8-3.6 3.9-5.6 7.5-5.6s6.7 2 7.5 5.6" />
                </svg>
                账号与同步
              </button>
              <button class="menu-item danger" @click="logout">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M14 8V5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
                  <path d="M10 12h10m0 0-3-3m3 3-3 3" />
                </svg>
                退出登录
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <div v-if="settings.layout === 'bilibili'" class="head-sub">
      <div class="wrap">
        <nav class="nav nav-sub">
          <router-link
            v-for="item in NAV_ITEMS"
            :key="item.to"
            :to="item.to"
            :class="{ on: isNavActive(item, route.name) }"
          >
            {{ item.label }}
          </router-link>
        </nav>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: var(--bg);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
}

.head-inner {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 64px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.seal {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-contrast) 22%, transparent);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-text strong {
  font-size: 16px;
  letter-spacing: 0.02em;
}

.brand-text small {
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.14em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
}

.nav a {
  padding: 7px 13px;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
  transition: background-color 0.15s, color 0.15s;
}

.nav a:hover {
  color: var(--text);
  background: var(--surface-2);
}

.nav a.on {
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

.nav-long {
  display: inline;
}

.nav-short {
  display: none;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.user {
  position: relative;
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  transition: border-color 0.15s, background-color 0.15s;
}

.avatar-btn:hover {
  border-color: var(--accent-line);
}

.avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}

.avatar.lg {
  width: 40px;
  height: 40px;
  font-size: 16px;
}

.uname {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.user-menu {
  min-width: 240px;
}

.um-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
}

.um-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.um-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.um-name {
  font-size: 14px;
  font-weight: 600;
}

.um-id small {
  font-size: 11.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 9px;
  font-size: 13.5px;
  color: var(--text);
  text-align: left;
  transition: background-color 0.13s;
}

.menu-item:hover {
  background: var(--surface-2);
}

.menu-item svg {
  width: 17px;
  height: 17px;
  color: var(--text-2);
}

.menu-item.danger {
  color: var(--bad);
}

.menu-item.danger svg {
  color: var(--bad);
}

@media (max-width: 820px) {
  .nav-long {
    display: none;
  }

  .nav-short {
    display: inline;
  }

  .nav a {
    padding: 6px 9px;
    font-size: 13px;
  }
}

@media (max-width: 640px) {
  .head-inner {
    height: 58px;
    gap: 6px;
  }

  /* 移动端只保留印章，给四项导航腾出空间 */
  .brand-text {
    display: none;
  }

  .seal {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }

  .nav {
    margin-left: 0;
    gap: 1px;
  }

  .nav a {
    padding: 6px;
    font-size: 13px;
  }

  .head-right {
    gap: 2px;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
  }

  .uname {
    display: none;
  }

  .avatar-btn {
    padding: 3px;
  }
}

@media (max-width: 480px) {
  .nav-long {
    display: none;
  }

  .nav-short {
    display: inline;
  }

  .nav a {
    padding: 6px 4px;
    font-size: 12.5px;
  }
}

@media (max-width: 380px) {
  .head-inner {
    gap: 5px;
  }

  .nav a {
    padding: 6px 3px;
    font-size: 12.5px;
  }
}

@media (max-width: 360px) {
  .head-inner {
    gap: 4px;
  }

  .seal {
    display: none;
  }

  .nav a {
    padding: 6px 3px;
    font-size: 12px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
  }

  .head-right .btn-sm {
    height: 32px;
    padding: 0 10px;
    font-size: 12.5px;
  }
}

/* ---------- 布局皮肤：搜索框与二级导航 ---------- */
.head-search {
  flex: 1 1 320px;
  max-width: 520px;
  margin-inline: auto;
}

.head-sub {
  border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  background: color-mix(in srgb, var(--surface) 62%, transparent);
}

.head-sub .wrap {
  display: flex;
  align-items: center;
}

.nav-sub {
  height: 44px;
  gap: 2px;
  margin-left: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-sub::-webkit-scrollbar {
  display: none;
}

.nav-sub a {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 14px;
  border-radius: 0;
  white-space: nowrap;
  font-size: 13.5px;
}

.nav-sub a:hover {
  background: transparent;
}
</style>
