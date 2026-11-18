import { reactive, ref, watch } from 'vue'
import type { QuizMode, Settings, ThemeId } from '../types'
import { readJSON, writeJSON } from '../lib/storage'

const KEY = 'qz.settings.v1'

export const settings = reactive<Settings>({ theme: 'auto', mode: 'practice', shuffle: true, testCount: 20 })

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export const systemDark = ref(media?.matches ?? false)

export function resolvedTheme(): Exclude<ThemeId, 'auto'> {
  if (settings.theme !== 'auto') return settings.theme
  return systemDark.value ? 'night' : 'paper'
}

export function isDarkTheme(): boolean {
  return ['night', 'ink', 'nocturne'].includes(resolvedTheme())
}

function applyTheme(): void {
  document.documentElement.dataset.theme = resolvedTheme()
}

let inited = false

export function initSettings(): void {
  if (inited) return
  inited = true
  const saved = readJSON<Partial<Settings>>(KEY, {})
  if (saved.theme) settings.theme = saved.theme
  if (saved.mode) settings.mode = saved.mode
  if (typeof saved.shuffle === 'boolean') settings.shuffle = saved.shuffle
  if (typeof saved.testCount === 'number') settings.testCount = saved.testCount

  applyTheme()
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
        testCount: settings.testCount,
      })
      applyTheme()
    },
    { deep: true },
  )
}

export function setTheme(theme: ThemeId): void {
  settings.theme = theme
}

export function setMode(mode: QuizMode): void {
  settings.mode = mode
}
