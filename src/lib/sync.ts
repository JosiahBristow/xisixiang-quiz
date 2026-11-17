import { reactive } from 'vue'
import type { Attempt } from '../types'
import { supabase } from './supabase'
import { auth } from '../stores/auth'
import { markAttemptsSynced, mergeRemoteAttempts, pendingAttempts } from '../stores/progress'

const WATERMARK_KEY = 'qz.sync.watermark.v1'

export const sync = reactive({
  status: 'idle' as 'idle' | 'ok' | 'syncing' | 'error',
  lastAt: '',
})

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let started = false

interface RemoteAttempt {
  id: string
  question_id: string
  chapter: string
  correct: boolean
  attempted_at: string
}

function toAttempt(row: RemoteAttempt): Attempt {
  return {
    id: row.id,
    questionId: row.question_id,
    chapter: row.chapter,
    correct: row.correct,
    // 统一成本地 ISO 格式，避免与本地时间字符串比较时格式不一致
    at: new Date(row.attempted_at).toISOString(),
    synced: true,
  }
}

export async function pushPending(): Promise<void> {
  if (!supabase || !auth.user || running) return
  const pending = pendingAttempts()
  if (!pending.length) return
  running = true
  sync.status = 'syncing'
  try {
    const rows = pending.map((a) => ({
      id: a.id,
      user_id: auth.user!.id,
      question_id: a.questionId,
      chapter: a.chapter,
      correct: a.correct,
      attempted_at: a.at,
    }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from('attempts')
        .upsert(rows.slice(i, i + 200), { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
    }
    markAttemptsSynced(pending.map((a) => a.id))
    sync.status = 'ok'
    sync.lastAt = new Date().toISOString()
  } catch {
    sync.status = 'error'
  } finally {
    running = false
  }
}

export async function pullRemote(): Promise<void> {
  if (!supabase || !auth.user) return
  // 水位线取查询开始时间，防止查询过程中新增的记录被漏掉
  const startedAt = new Date().toISOString()
  const since = localStorage.getItem(WATERMARK_KEY) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('attempts')
    .select('id,question_id,chapter,correct,attempted_at')
    .gt('attempted_at', since)
    .order('attempted_at', { ascending: true })
    .limit(20000)
  if (error) {
    sync.status = 'error'
    return
  }
  if (data?.length) {
    mergeRemoteAttempts((data as RemoteAttempt[]).map(toAttempt))
  }
  localStorage.setItem(WATERMARK_KEY, startedAt)
  sync.lastAt = startedAt
}

export async function fullSync(): Promise<void> {
  if (!supabase || !auth.user) return
  sync.status = 'syncing'
  await pullRemote()
  await pushPending()
  if (sync.status === 'syncing') sync.status = 'ok'
}

export function scheduleSync(delay = 1800): void {
  if (!supabase || !auth.user) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void pushPending()
  }, delay)
}

export function startAutoSync(): void {
  if (started) return
  started = true

  window.addEventListener('qz:attempts-changed', () => scheduleSync(2200))
  window.addEventListener('qz:auth-changed', () => {
    if (auth.user) void fullSync()
  })
  window.addEventListener('online', () => void pushPending())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushPending()
  })
  setInterval(() => {
    if (auth.user && pendingAttempts().length) void pushPending()
  }, 60000)

  if (auth.user) void fullSync()
}
