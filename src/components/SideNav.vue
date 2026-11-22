<script setup lang="ts">
import { useRoute } from 'vue-router'
import { NAV_ITEMS, isNavActive } from '../lib/navItems'

const route = useRoute()
</script>

<template>
  <aside class="side-nav" aria-label="主导航">
    <router-link to="/" class="sn-brand" aria-label="回到首页">
      <span class="sn-logo serif">习</span>
      <span class="sn-brand-text">
        <b>习思想题库</b>
        <small>刷题 · 背题 · 排名</small>
      </span>
    </router-link>

    <nav class="sn-links">
      <router-link
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="sn-link"
        :class="{ on: isNavActive(item, route.name) }"
        :aria-label="item.label"
        :title="item.label"
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
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <p class="sn-foot">抖音布局 · 桌面端</p>
  </aside>
</template>

<style scoped>
.side-nav {
  display: none;
}

.sn-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px 18px;
  border-bottom: 1px solid var(--line);
}

.sn-logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #25f4ee, #fe2c55);
  color: #0b0b0e;
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
}

.sn-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.sn-brand-text b {
  font-size: 15px;
  letter-spacing: 0.02em;
}

.sn-brand-text small {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.1em;
}

.sn-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 14px;
}

.sn-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.16s, color 0.16s;
}

.sn-link svg {
  width: 21px;
  height: 21px;
  flex-shrink: 0;
}

.sn-link:hover {
  background: var(--surface-2);
  color: var(--text);
}

.sn-link.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.sn-link.on::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 999px;
  background: var(--accent);
}

.sn-foot {
  margin-top: auto;
  padding: 18px 22px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

@media (min-width: 1025px) {
  .side-nav {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 55;
    display: flex;
    flex-direction: column;
    width: 200px;
    padding-top: 16px;
    background: var(--surface);
    border-right: 1px solid var(--line);
    box-shadow: 12px 0 34px -30px rgba(0, 0, 0, 0.7);
  }
}
</style>
