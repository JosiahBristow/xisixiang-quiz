import { reactive, ref, watch } from 'vue'
import type { LayoutId, QuizMode, Settings, ThemeId } from '../types'
import { readJSON, writeJSON } from '../lib/storage'

const KEY = 'qz.settings.v1'

export const settings = reactive<Settings>({
  theme: 'auto',
  mode: 'practice',
  shuffle: true,
  skipCorrect: true,
  testCount: 20,
  layout: 'default',
})

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export const systemDark = ref(media?.matches ?? false)

export function resolvedTheme(): Exclude<ThemeId, 'auto'> {
  if (settings.theme !== 'auto') return settings.theme
  return systemDark.value ? 'night' : 'paper'
}

export function isDarkTheme(): boolean {
  if (settings.layout === 'douyin') return true
  if (settings.layout === 'bilibili') return false
  return ['night', 'ink', 'nocturne'].includes(resolvedTheme())
}

function applyTheme(): void {
  document.documentElement.dataset.theme = resolvedTheme()
}

function applyLayout(): void {
  if (settings.layout === 'default') {
    document.documentElement.removeAttribute('data-layout')
  } else {
    document.documentElement.dataset.layout = settings.layout
  }
}

let inited = false

export function initSettings(): void {
  if (inited) return
  inited = true
  const saved = readJSON<Partial<Settings>>(KEY, {})
  if (saved.theme) settings.theme = saved.theme
  if (saved.mode) settings.mode = saved.mode
  if (typeof saved.shuffle === 'boolean') settings.shuffle = saved.shuffle
  if (typeof saved.skipCorrect === 'boolean') settings.skipCorrect = saved.skipCorrect
  if (typeof saved.testCount === 'number') settings.testCount = saved.testCount
  if (saved.layout && ['default', 'bilibili', 'douyin'].includes(saved.layout)) {
    settings.layout = saved.layout
  }

  applyTheme()
  applyLayout()
  media?.addEventListener('change', (e) => {
    systemDark.value = e.matches
    applyTheme()
  })
  watch(
    settings,
    () => {
      writeJSON(KEY, {
        theme: settings.theme,
        mode: settings.mode,
        shuffle: settings.shuffle,
        skipCorrect: settings.skipCorrect,
        testCount: settings.testCount,
        layout: settings.layout,
      })
      applyTheme()
      applyLayout()
    },
    { deep: true },
  )
}

export function setTheme(theme: ThemeId): void {
  settings.theme = theme
  if (settings.layout !== 'default') settings.layout = 'default'
}

export function setLayout(layout: LayoutId): void {
  settings.layout = layout
}

export function setMode(mode: QuizMode): void {
  settings.mode = mode
}
