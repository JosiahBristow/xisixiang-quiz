<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AuthModal from './components/AuthModal.vue'
import AchievementToast from './components/AchievementToast.vue'
import BottomNav from './components/BottomNav.vue'
import SideNav from './components/SideNav.vue'
import { auth, initAuth } from './stores/auth'
import { settings } from './stores/settings'
import { ui } from './stores/ui'
import { startAutoSync } from './lib/sync'

const route = useRoute()

// 密码重置链接回来时自动打开设置新密码弹窗
watch(
  () => auth.recovery,
  (v) => {
    if (v) ui.authOpen = true
  },
)

onMounted(async () => {
  await initAuth()
  startAutoSync()
})
</script>

<template>
  <SideNav v-if="settings.layout === 'douyin'" />
  <AppHeader />
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" :key="route.fullPath" />
    </transition>
  </router-view>
  <BottomNav />
  <AuthModal v-if="ui.authOpen" @close="ui.authOpen = false" />
  <AchievementToast />
</template>
