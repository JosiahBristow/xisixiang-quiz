<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string
    size?: number
  }>(),
  { src: '', name: '', size: 28 },
)

const failed = ref(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <span
    class="ua"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.max(10, Math.round(size * 0.4)) + 'px',
    }"
  >
    <img v-if="src && !failed" :src="src" alt="" loading="lazy" @error="failed = true" />
    <span v-else class="ua-initial">{{ (name || '我').slice(0, 1) }}</span>
  </span>
</template>

<style scoped>
.ua {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  line-height: 1;
  user-select: none;
}

.ua img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ua-initial {
  display: block;
}
</style>
