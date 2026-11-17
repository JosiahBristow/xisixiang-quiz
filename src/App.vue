<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AuthModal from './components/AuthModal.vue'
import { initAuth } from './stores/auth'
import { ui } from './stores/ui'
import { startAutoSync } from './lib/sync'

const route = useRoute()

onMounted(async () => {
  await initAuth()
  startAutoSync()
})
</script>

<template>
  <AppHeader />
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" :key="route.fullPath" />
    </transition>
  </router-view>
  <AuthModal v-if="ui.authOpen" @close="ui.authOpen = false" />
</template>
