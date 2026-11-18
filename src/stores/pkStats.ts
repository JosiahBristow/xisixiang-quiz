import { reactive, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { readJSON, writeJSON } from '../lib/storage'
import { auth } from './auth'

export const pkStats = reactive({
  wins: 0,
  games: 0,
  loaded: false,
})

let fetching = false

function cacheKey(uid: string): string {
  return `qz.pkstats.${uid}.v1`
}

async function fetchStats(uid: string): Promise<void> {
  if (!supabase || fetching) return
  fetching = true
  try {
    const { data, error } = await supabase
      .from('pk_results')
      .select('outcome')
      .eq('user_id', uid)
    if (!error && Array.isArray(data)) {
      pkStats.games = data.length
      pkStats.wins = data.filter((r) => (r as { outcome?: string }).outcome === 'win').length
      writeJSON(cacheKey(uid), { wins: pkStats.wins, games: pkStats.games })
    }
  } finally {
    fetching = false
    pkStats.loaded = true
  }
}

export function refreshPkStats(): void {
  const uid = auth.user?.id
  if (!uid) return
  void fetchStats(uid)
}

watch(
  () => auth.user?.id,
  (uid) => {
    if (!uid) {
      pkStats.wins = 0
      pkStats.games = 0
      pkStats.loaded = true
      return
    }
    const cached = readJSON<{ wins?: number; games?: number } | null>(cacheKey(uid), null)
    if (cached) {
      pkStats.wins = Number(cached.wins) || 0
      pkStats.games = Number(cached.games) || 0
    }
    void fetchStats(uid)
  },
  { immediate: true },
)
