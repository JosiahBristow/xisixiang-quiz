<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchAll, type SearchHit } from '../lib/search'
import { requestChapterFocus } from '../lib/focusChapter'

const route = useRoute()
const router = useRouter()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const q = ref('')
const open = ref(false)
const active = ref(0)

const results = computed(() => (q.value.trim() ? searchAll(q.value) : []))
const show = computed(() => open.value && q.value.trim().length > 0)

watch(results, () => {
  active.value = 0
})

watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

function close() {
  open.value = false
}

function clear() {
  q.value = ''
  open.value = false
  input.value?.focus()
}

function move(delta: number) {
  if (!results.value.length) return
  active.value = (active.value + delta + results.value.length) % results.value.length
}

async function choose(hit: SearchHit | undefined) {
  if (!hit) return
  q.value = ''
  open.value = false

  if (hit.kind === 'chapter') {
    requestChapterFocus(hit.chapterId)
    if (route.name !== 'home') await router.push('/')
    return
  }

  await router.push({
    name: 'quiz',
    params: { scope: hit.chapterId || 'all' },
    query: { q: hit.id },
  })
}

function submit() {
  choose(results.value[active.value] ?? results.value[0])
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (!show.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  }
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
</script>

<template>
  <form ref="root" class="search-box" role="search" @submit.prevent="submit">
    <svg
      class="sb-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
    <input
      ref="input"
      v-model="q"
      type="search"
      class="sb-input"
      placeholder="搜索章节或题目"
      aria-label="搜索章节或题目"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="show"
      aria-controls="qz-search-results"
      @focus="open = true"
      @input="open = true"
      @keydown="onKey"
    />
    <button v-if="q" type="button" class="sb-clear" aria-label="清空搜索" @click="clear">×</button>

    <div v-if="show" id="qz-search-results" class="sb-pop" role="listbox">
      <template v-if="results.length">
        <button
          v-for="(hit, i) in results"
          :key="`${hit.kind}-${hit.id}`"
          type="button"
          class="sb-hit"
          :class="{ active: i === active }"
          role="option"
          :aria-selected="i === active"
          @mouseenter="active = i"
          @pointerdown.prevent="choose(hit)"
        >
          <span class="sb-kind">{{ hit.kind === 'chapter' ? '章' : '题' }}</span>
          <span class="sb-text">
            <b>{{ hit.title }}</b>
            <small>{{ hit.subtitle }}</small>
          </span>
        </button>
      </template>
      <p v-else class="sb-empty">没有找到「{{ q }}」</p>
      <p class="sb-tip">↑↓ 选择 · Enter 打开 · Esc 关闭</p>
    </div>
  </form>
</template>

<style scoped>
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}

.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.sb-icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: var(--muted);
}

.sb-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 13.5px;
}

.sb-input::-webkit-search-cancel-button {
  display: none;
}

.sb-input::placeholder {
  color: var(--muted);
}

.sb-clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 14px;
  line-height: 1;
}

.sb-pop {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 90;
  max-height: min(430px, 62vh);
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 26px 60px -26px rgba(0, 0, 0, 0.55);
}

.sb-hit {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 9px;
  text-align: left;
  color: var(--text);
}

.sb-hit.active,
.sb-hit:hover {
  background: var(--accent-soft);
}

.sb-kind {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 700;
}

.sb-hit.active .sb-kind {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.sb-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.45;
}

.sb-text b {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-text small {
  font-size: 10.5px;
  color: var(--muted);
}

.sb-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--muted);
}

.sb-tip {
  padding: 7px 10px 3px;
  border-top: 1px solid var(--line);
  margin-top: 4px;
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .search-box {
    height: 36px;
    padding: 0 10px;
  }

  .sb-pop {
    position: fixed;
    top: calc(var(--layout-header-h, 60px) + 6px);
    left: 12px;
    right: 12px;
    z-index: 120;
    max-height: 58vh;
  }
}
</style>
