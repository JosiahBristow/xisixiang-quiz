import { reactive } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export const auth = reactive({
  ready: false,
  user: null as User | null,
  nickname: '',
  loading: false,
  error: '',
  notice: '',
})

let inited = false

function translateError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码不正确'
  if (m.includes('user already registered')) return '该邮箱已注册，请直接登录'
  if (m.includes('password should be at least')) return '密码至少需要 6 位'
  if (m.includes('email not confirmed')) return '邮箱尚未验证，请先查收确认邮件'
  if (m.includes('invalid format')) return '邮箱格式不正确'
  if (m.includes('rate limit')) return '操作太频繁，请稍后再试'
  if (m.includes('signups not allowed')) return '当前项目已关闭注册'
  return message
}

async function ensureProfile(user: User): Promise<string> {
  if (!supabase) return ''
  const { data } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .maybeSingle()
  if (data?.nickname) return data.nickname

  const base = (user.email ?? '同学').split('@')[0].slice(0, 12) || '同学'
  for (let i = 0; i < 6; i++) {
    const nickname = i === 0 ? base : `${base}${Math.floor(Math.random() * 900 + 100)}`
    const { error } = await supabase.from('profiles').insert({ id: user.id, nickname })
    if (!error) return nickname
    if ((error as { code?: string }).code !== '23505') break
  }
  return base
}

async function applyUser(user: User | null): Promise<void> {
  auth.user = user
  if (!user) {
    auth.nickname = ''
  } else {
    // 先用邮箱前缀占位，避免头像区域短暂空白；随后以云端的昵称为准
    auth.nickname = (user.email ?? '').split('@')[0] || '同学'
    auth.nickname = await ensureProfile(user)
  }
  window.dispatchEvent(new Event('qz:auth-changed'))
}

export async function initAuth(): Promise<void> {
  if (inited) return
  inited = true
  if (!supabase) {
    auth.ready = true
    return
  }
  const { data } = await supabase.auth.getSession()
  await applyUser(data.session?.user ?? null)
  auth.ready = true
  supabase.auth.onAuthStateChange((_event, session) => {
    void applyUser(session?.user ?? null)
  })
}

export async function signIn(email: string, password: string): Promise<boolean> {
  if (!supabase) return false
  auth.loading = true
  auth.error = ''
  auth.notice = ''
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  auth.loading = false
  if (error) {
    auth.error = translateError(error.message)
    return false
  }
  return true
}

export async function signUp(email: string, password: string): Promise<'in' | 'confirm' | 'error'> {
  if (!supabase) return 'error'
  auth.loading = true
  auth.error = ''
  auth.notice = ''
  const { data, error } = await supabase.auth.signUp({ email, password })
  auth.loading = false
  if (error) {
    auth.error = translateError(error.message)
    return 'error'
  }
  if (!data.session) {
    auth.notice = '注册成功！请到邮箱点击确认链接后再回来登录。'
    return 'confirm'
  }
  return 'in'
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
  auth.user = null
  auth.nickname = ''
}

export async function updateNickname(nick: string): Promise<boolean> {
  if (!supabase || !auth.user) return false
  const nickname = nick.trim()
  if (nickname.length < 2 || nickname.length > 16) {
    auth.error = '昵称需要 2–16 个字符'
    return false
  }
  const { error } = await supabase.from('profiles').update({ nickname }).eq('id', auth.user.id)
  if (error) {
    auth.error = (error as { code?: string }).code === '23505' ? '这个昵称已被占用，换一个吧' : '保存失败，请稍后再试'
    return false
  }
  auth.nickname = nickname
  return true
}

export function clearAuthMessages(): void {
  auth.error = ''
  auth.notice = ''
}
