import { computed, reactive, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { readJSON, writeJSON } from '../lib/storage'
import { auth } from './auth'

interface FavoriteEntry {
  id: string
  at: string
}

const KEY = 'qz.favorites.v1'

function load(): FavoriteEntry[] {
  const raw = readJSON<FavoriteEntry[]>(KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({ id: item.id, at: item.at || new Date().toISOString() }))
}

const state = reactive<FavoriteEntry[]>(load())

function persist() {
  writeJSON(KEY, state)
}

/** 按收藏时间倒序 */
export const favorites = computed(() =>
  [...state].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
)

export const favoriteIds = computed(() => new Set(state.map((f) => f.id)))

export const favoriteCount = computed(() => state.length)

export function isFavorite(questionId: string): boolean {
  return favoriteIds.value.has(questionId)
}

export function toggleFavorite(questionId: string): boolean {
  const index = state.findIndex((f) => f.id === questionId)
  if (index >= 0) {
    state.splice(index, 1)
    persist()
    void syncRemove(questionId)
    return false
  }
  const at = new Date().toISOString()
  state.push({ id: questionId, at })
  persist()
  void syncAdd(questionId, at)
  return true
}

export function clearFavorites(): void {
  state.splice(0, state.length)
  persist()
  void syncClear()
}

async function syncAdd(questionId: string, at: string) {
  if (!supabase || !auth.user) return
  await supabase
    .from('favorites')
    .upsert(
      { user_id: auth.user.id, question_id: questionId, created_at: at },
      { onConflict: 'user_id,question_id', ignoreDuplicates: true },
    )
}

async function syncRemove(questionId: string) {
  if (!supabase || !auth.user) return
  await supabase
    .from('favorites')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('question_id', questionId)
}

async function syncClear() {
  if (!supabase || !auth.user) return
  await supabase.from('favorites').delete().eq('user_id', auth.user.id)
}

/** 登录后：本地先上传合并，再以云端为准 */
async function syncFavorites() {
  if (!supabase || !auth.user) return
  const uid = auth.user.id

  if (state.length) {
    await supabase.from('favorites').upsert(
      state.map((f) => ({ user_id: uid, question_id: f.id, created_at: f.at })),
      { onConflict: 'user_id,question_id', ignoreDuplicates: true },
    )
  }

  const { data, error } = await supabase
    .from('favorites')
    .select('question_id,created_at')
    .eq('user_id', uid)
  if (error || !data) return

  const rows = data as { question_id: string; created_at: string }[]
  state.splice(
    0,
    state.length,
    ...rows.map((row) => ({ id: row.question_id, at: row.created_at })),
  )
  persist()
}

watch(
  () => auth.user?.id,
  (id) => {
    if (id) void syncFavorites()
  },
  { immediate: true },
)
