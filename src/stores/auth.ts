import { reactive } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { compressAvatar } from '../lib/image'
import { avatarCache, badgeCache } from './avatars'

export const auth = reactive({
  ready: false,
  user: null as User | null,
  nickname: '',
  avatarUrl: '',
  equippedBadge: '',
  loading: false,
  avatarLoading: false,
  recovery: false,
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
  if (m.includes('different from the old password')) return '新密码不能与旧密码相同'
  if (m.includes('for security purposes')) return '操作太频繁，请稍后再试'
  if (m.includes('auth session missing') || m.includes('invalid') || m.includes('expired')) {
    return '重置链接已失效，请重新申请找回密码'
  }
  return message
}

export function beginRecovery(): void {
  auth.recovery = true
  try {
    sessionStorage.setItem('qz.recovery', '1')
  } catch {
    /* ignore */
  }
}

export function endRecovery(): void {
  auth.recovery = false
  try {
    sessionStorage.removeItem('qz.recovery')
  } catch {
    /* ignore */
  }
}

async function ensureProfile(
  user: User,
): Promise<{ nickname: string; avatarUrl: string; equippedBadge: string }> {
  if (!supabase) return { nickname: '', avatarUrl: '', equippedBadge: '' }
  const { data } = await supabase
    .from('profiles')
    .select('nickname, avatar_url, equipped_badge')
    .eq('id', user.id)
    .maybeSingle()
  if (data?.nickname) {
    const row = data as { avatar_url?: string | null; equipped_badge?: string | null }
    return {
      nickname: data.nickname,
      avatarUrl: row.avatar_url ?? '',
      equippedBadge: row.equipped_badge ?? '',
    }
  }

  const base = (user.email ?? '同学').split('@')[0].slice(0, 12) || '同学'
  for (let i = 0; i < 6; i++) {
    const nickname = i === 0 ? base : `${base}${Math.floor(Math.random() * 900 + 100)}`
    const { error } = await supabase.from('profiles').insert({ id: user.id, nickname })
    if (!error) return { nickname, avatarUrl: '', equippedBadge: '' }
    if ((error as { code?: string }).code !== '23505') break
  }
  return { nickname: base, avatarUrl: '', equippedBadge: '' }
}

async function applyUser(user: User | null): Promise<void> {
  auth.user = user
  if (!user) {
    auth.nickname = ''
    auth.avatarUrl = ''
    auth.equippedBadge = ''
  } else {
    // 先用邮箱前缀占位，避免头像区域短暂空白；随后以云端的昵称为准
    auth.nickname = (user.email ?? '').split('@')[0] || '同学'
    const profile = await ensureProfile(user)
    auth.nickname = profile.nickname
    auth.avatarUrl = profile.avatarUrl
    auth.equippedBadge = profile.equippedBadge
    avatarCache[user.id] = profile.avatarUrl
    badgeCache[user.id] = profile.equippedBadge
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
  try {
    if (sessionStorage.getItem('qz.recovery')) auth.recovery = true
  } catch {
    /* ignore */
  }
  const { data } = await supabase.auth.getSession()
  await applyUser(data.session?.user ?? null)
  auth.ready = true
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') beginRecovery()
    void applyUser(session?.user ?? null)
  })
}

function translateResetRequestError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('email_address_invalid') || m.includes('email address')) {
    return '邮箱地址不可用，请使用真实邮箱'
  }
  if (m.includes('rate limit') || m.includes('security purposes')) return '操作太频繁，请稍后再试'
  if (m.includes('redirect') || m.includes('not allowed')) {
    return '暂时无法发送重置邮件，请联系管理员检查 Supabase 的站点地址配置'
  }
  return '发送失败，请稍后再试'
}

/** 发送密码重置邮件 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  if (!supabase) return false
  auth.loading = true
  auth.error = ''
  auth.notice = ''
  const redirectTo = `${location.origin}${location.pathname}`
  let { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  // 站点地址尚未加入 Redirect URLs 时，回退到 Supabase 默认 Site URL
  if (error && /redirect|not allowed/i.test(error.message)) {
    const retry = await supabase.auth.resetPasswordForEmail(email.trim())
    error = retry.error
  }
  auth.loading = false
  if (error) {
    auth.error = translateResetRequestError(error.message)
    return false
  }
  auth.notice = '如果该邮箱已注册，重置邮件已发送，请查收（也检查一下垃圾箱）。'
  return true
}

/** 在密码重置会话中设置新密码 */
export async function updatePassword(password: string): Promise<boolean> {
  if (!supabase) return false
  auth.loading = true
  auth.error = ''
  auth.notice = ''
  const { error } = await supabase.auth.updateUser({ password })
  auth.loading = false
  if (error) {
    auth.error = translateError(error.message)
    return false
  }
  auth.notice = '密码已更新，请使用新密码登录'
  return true
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
  endRecovery()
  await supabase.auth.signOut()
  auth.user = null
  auth.nickname = ''
  auth.avatarUrl = ''
  auth.equippedBadge = ''
}

export async function uploadAvatar(file: File): Promise<void> {
  if (!supabase || !auth.user) throw new Error('请先登录')
  auth.avatarLoading = true
  try {
    const blob = await compressAvatar(file)
    const path = `${auth.user.id}/avatar.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '3600',
    })
    if (error) throw new Error('上传失败，请稍后再试')

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${data.publicUrl}?v=${Date.now()}`
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', auth.user.id)
    if (saveError) throw new Error('头像保存失败，请稍后再试')

    auth.avatarUrl = url
    avatarCache[auth.user.id] = url
  } finally {
    auth.avatarLoading = false
  }
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
