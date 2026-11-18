<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    /** 滚动速度，像素/秒 */
    speed?: number
  }>(),
  { speed: 26 },
)

const wrap = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const first = ref<HTMLElement | null>(null)
const scrolling = ref(false)

const GAP = 28
const PAUSE_MS = 2400

let observer: ResizeObserver | null = null
let animation: Animation | null = null

const reduceMotion =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

function stopAnimation() {
  animation?.cancel()
  animation = null
}

function startAnimation() {
  stopAnimation()
  const el = track.value
  const copy = first.value
  if (!el || !copy || !scrolling.value || reduceMotion?.matches) return

  const distance = copy.getBoundingClientRect().width + GAP
  if (distance <= 0) return

  const scrollSec = Math.max(2.6, distance / (props.speed ?? 26))
  const pauseSec = PAUSE_MS / 1000
  const total = scrollSec + pauseSec

  animation = el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${distance}px)`, offset: scrollSec / total },
      { transform: `translateX(-${distance}px)` },
    ],
    { duration: total * 1000, iterations: Infinity, easing: 'linear' },
  )
}

function measure() {
  scrolling.value = false
  stopAnimation()
  void nextTick(() => {
    const box = wrap.value
    const copy = first.value
    if (!box || !copy) return
    if (copy.scrollWidth <= box.clientWidth + 1) return

    scrolling.value = true
    void nextTick(() => startAnimation())
  })
}

function onEnter() {
  animation?.pause()
}

function onLeave() {
  animation?.play()
}

function onMotionChange() {
  measure()
}

watch(() => props.text, measure)

onMounted(() => {
  measure()
  observer = new ResizeObserver(() => measure())
  if (wrap.value) observer.observe(wrap.value)
  reduceMotion?.addEventListener('change', onMotionChange)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  reduceMotion?.removeEventListener('change', onMotionChange)
  stopAnimation()
})
</script>

<template>
  <span
    ref="wrap"
    class="marquee"
    :class="{ scrolling }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <span ref="track" class="mq-track">
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

.mq-text {
  flex-shrink: 0;
}
</style>
