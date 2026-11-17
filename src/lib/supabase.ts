import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * 没配置 Supabase 时站点仍可完整刷题，只是登录与排行榜不可用。
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export const hasSupabase = Boolean(supabase)
