import { reactive } from 'vue'
import { supabase } from '../lib/supabase'

/** userId -> 头像公开地址（'' 表示没有头像或查询失败） */
export const avatarCache = reactive<Record<string, string>>({})

let fetching = false
let pending = new Set<string>()

export async function ensureAvatars(ids: (string | null | undefined)[]): Promise<void> {
  if (!supabase) return
  const missing = [
    ...new Set(
      ids.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && !(id in avatarCache),
      ),
    ),
  ]
  if (!missing.length) return

  for (const id of missing) pending.add(id)
  if (fetching) return
  fetching = true

  try {
    const targets = [...pending]
    pending = new Set()
    const { data, error } = await supabase.rpc('lb_avatars', { p_ids: targets })
    if (error) {
      // 迁移未执行或网络失败时先记为无头像，避免反复请求
      for (const id of targets) avatarCache[id] = ''
      return
    }
    for (const row of (data ?? []) as { id: string; avatar_url: string | null }[]) {
      avatarCache[row.id] = row.avatar_url ?? ''
    }
    for (const id of targets) {
      if (!(id in avatarCache)) avatarCache[id] = ''
    }
  } finally {
    fetching = false
    if (pending.size) void ensureAvatars([...pending])
  }
}
