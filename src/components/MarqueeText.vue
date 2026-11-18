<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  text: string
  /** 滚动速度，像素/秒 */
  speed?: number
}>()

const wrap = ref<HTMLElement | null>(null)
const first = ref<HTMLElement | null>(null)
const scrolling = ref(false)
const distance = ref(0)
const duration = ref(6)

let observer: ResizeObserver | null = null

function measure() {
  // 先回到单份文本，测量是否超出容器
  scrolling.value = false
  distance.value = 0
  void nextTick(() => {
    const box = wrap.value
    const copy = first.value
    if (!box || !copy) return
    if (copy.scrollWidth <= box.clientWidth + 1) return

    scrolling.value = true
    void nextTick(() => {
      if (!first.value) return
      const gap = 28
      distance.value = Math.round(first.value.getBoundingClientRect().width + gap)
      duration.value = Math.max(3, distance.value / (props.speed ?? 26))
    })
  })
}

watch(() => props.text, measure)

onMounted(() => {
  measure()
  observer = new ResizeObserver(() => measure())
  if (wrap.value) observer.observe(wrap.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <span ref="wrap" class="marquee" :class="{ scrolling }">
    <span class="mq-track" :style="{ '--dist': distance + 'px', '--dur': duration + 's' }">
      <span ref="first" class="mq-text">{{ text }}</span>
      <span v-if="scrolling" class="mq-text" aria-hidden="true">{{ text }}</span>
    </span>
  </span>
</template>

<style scoped>
.marquee {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
}

.mq-track {
  display: inline-flex;
  gap: 28px;
  will-change: transform;
}

.marquee.scrolling .mq-track {
  animation: marquee var(--dur) linear infinite;
}

.mq-text {
  flex-shrink: 0;
}

.marquee:hover .mq-track {
  animation-play-state: paused;
}

@keyframes marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-1 * var(--dist)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .marquee.scrolling .mq-track {
    animation: none;
  }
}
</style>
