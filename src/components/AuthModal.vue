<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  auth,
  clearAuthMessages,
  endRecovery,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updateNickname,
  updatePassword,
  uploadAvatar,
} from '../stores/auth'
import { attempts, resetLocalProgress } from '../stores/progress'
import { fullSync, sync } from '../lib/sync'
import { hasSupabase } from '../lib/supabase'
import MarqueeText from './MarqueeText.vue'
import UserAvatar from './UserAvatar.vue'

const emit = defineEmits<{ (e: 'close'): void }>()

type Tab = 'login' | 'register'

const tab = ref<Tab>('login')
const email = ref('')
const password = ref('')
const nickname = ref('')
const busy = ref(false)
const saved = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarMsg = ref('')
const avatarErr = ref(false)
const forgot = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const resetError = ref('')
const resetDone = ref(false)

const isProfile = computed(() => Boolean(auth.user))
const title = computed(() => {
  if (auth.recovery) return '设置新密码'
  if (isProfile.value) return '账号与同步'
  if (forgot.value) return '找回密码'
  return tab.value === 'login' ? '登录' : '注册'
})

const pendingCount = computed(() => attempts.filter((a) => !a.synced).length)

const syncText = computed(() => {
  if (!auth.user) return ''
  if (sync.status === 'syncing') return '正在同步…'
  if (sync.status === 'error') return '同步失败，稍后会自动重试'
  if (pendingCount.value) return `${pendingCount.value} 条记录待上传`
  if (!sync.lastAt) return '已开启云同步'
  return `已同步 · ${timeAgo(sync.lastAt)}`
})

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

function switchTab(t: Tab) {
  tab.value = t
  forgot.value = false
  clearAuthMessages()
  saved.value = false
}

function startForgot() {
  forgot.value = true
  clearAuthMessages()
  saved.value = false
}

function backToLogin() {
  forgot.value = false
  clearAuthMessages()
}

async function sendReset() {
  if (busy.value || !email.value) return
  busy.value = true
  clearAuthMessages()
  await requestPasswordReset(email.value.trim())
  busy.value = false
}

async function savePassword() {
  if (busy.value) return
  resetError.value = ''
  if (newPassword.value.length < 6) {
    resetError.value = '密码至少 6 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    resetError.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  const ok = await updatePassword(newPassword.value)
  busy.value = false
  if (!ok) {
    resetError.value = auth.error || '保存失败，请稍后再试'
    return
  }
  resetDone.value = true
  setTimeout(() => {
    endRecovery()
    resetDone.value = false
    emit('close')
  }, 1400)
}

function finishRecovery() {
  endRecovery()
  resetDone.value = false
  emit('close')
}

function cancelRecovery() {
  if (!window.confirm('退出密码重置？')) return
  finishRecovery()
}

function close() {
  if (auth.recovery) {
    if (!window.confirm('退出密码重置？')) return
    endRecovery()
    resetDone.value = false
  }
  emit('close')
}

async function submit() {
  if (busy.value) return
  busy.value = true
  clearAuthMessages()
  try {
    if (tab.value === 'login') {
      const ok = await signIn(email.value.trim(), password.value)
      if (ok) emit('close')
    } else {
      const result = await signUp(email.value.trim(), password.value)
      if (result === 'in') emit('close')
    }
  } finally {
    busy.value = false
  }
}

async function saveNick() {
  if (busy.value) return
  busy.value = true
  saved.value = false
  const ok = await updateNickname(nickname.value)
  busy.value = false
  if (ok) {
    saved.value = true
    setTimeout(() => (saved.value = false), 1800)
  }
}

async function logout() {
  await signOut()
  emit('close')
}

async function doSync() {
  await fullSync()
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  avatarMsg.value = ''
  avatarErr.value = false
  try {
    await uploadAvatar(file)
    avatarMsg.value = '头像已更新'
  } catch (err) {
    avatarErr.value = true
    avatarMsg.value = err instanceof Error ? err.message : '头像上传失败，请重试'
  }
}

function confirmReset() {
  if (confirm('确定清空本机的刷题记录吗？云端记录不会被删除。')) resetLocalProgress()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => auth.nickname,
  (v) => {
    nickname.value = v
  },
  { immediate: true },
)

onMounted(() => {
  clearAuthMessages()
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="mask" @click.self="close">
    <div class="modal card" role="dialog" aria-modal="true">
      <button class="close icon-btn" aria-label="关闭" @click="close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <header class="m-head">
        <h2>{{ title }}</h2>
        <p v-if="auth.recovery">请设置至少 6 位的新密码。</p>
        <p v-else-if="forgot">输入注册邮箱，我们会发送重置链接（约 1 小时有效）。</p>
        <p v-else-if="!isProfile">登录后成绩进入排行榜，刷题进度自动云同步。</p>
      </header>

      <template v-if="auth.recovery">
        <div v-if="!auth.ready" class="notice">正在验证重置链接…</div>
        <template v-else-if="!auth.user">
          <div class="notice">重置链接已失效或已过期，请重新申请找回密码。</div>
          <button class="btn btn-primary btn-block" @click="finishRecovery">返回登录</button>
        </template>
        <template v-else>
          <p class="recovery-email">账号：{{ auth.user.email }}</p>
          <div v-if="resetDone" class="notice ok">密码已更新，即将关闭…</div>
          <form v-else class="m-form" @submit.prevent="savePassword">
            <div class="field">
              <label for="new-password">新密码</label>
              <input
                id="new-password"
                v-model="newPassword"
                class="input"
                type="password"
                required
                minlength="6"
                autocomplete="new-password"
                placeholder="至少 6 位"
              />
            </div>
            <div class="field">
              <label for="confirm-password">确认新密码</label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                class="input"
                type="password"
                required
                minlength="6"
                autocomplete="new-password"
                placeholder="再输入一次"
              />
            </div>
            <p v-if="resetError || auth.error" class="err-text">{{ resetError || auth.error }}</p>
            <button
              class="btn btn-primary btn-block"
              type="submit"
              :disabled="busy || newPassword.length < 6 || confirmPassword.length < 6"
            >
              {{ busy ? '保存中…' : '保存新密码' }}
            </button>
            <button type="button" class="btn btn-ghost btn-block" @click="cancelRecovery">
              取消重置
            </button>
          </form>
        </template>
      </template>

      <div v-else-if="!hasSupabase" class="notice">
        当前站点还没有配置 Supabase 环境变量，登录与排行榜暂不可用。
      </div>

      <template v-else-if="isProfile">
        <div class="profile">
          <div class="avatar-block">
            <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="54" />
            <button class="avatar-upload" :disabled="auth.avatarLoading" @click="avatarInput?.click()">
              {{ auth.avatarLoading ? '处理中…' : '换头像' }}
            </button>
            <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatarChange" />
          </div>
          <div class="p-id">
            <MarqueeText :text="auth.nickname" class="p-name" />
            <small>{{ auth.user?.email }}</small>
          </div>
        </div>

        <small v-if="avatarMsg" class="avatar-msg" :class="{ err: avatarErr }">{{ avatarMsg }}</small>
        <p class="avatar-hint">支持 JPG / PNG，大图会自动压缩到 256×256</p>

        <div class="field">
          <label for="nick">昵称（显示在排行榜）</label>
          <div class="nick-row">
            <input id="nick" v-model="nickname" class="input" maxlength="16" placeholder="2–16 个字符" />
            <button class="btn btn-primary btn-sm" :disabled="busy" @click="saveNick">保存</button>
          </div>
          <small v-if="saved" class="ok-text">已保存</small>
          <small v-else-if="auth.error" class="err-text">{{ auth.error }}</small>
        </div>

        <div class="sync-box">
          <div class="sync-info">
            <b>云同步</b>
            <small>{{ syncText }}</small>
          </div>
          <button class="btn btn-soft btn-sm" @click="doSync">立即同步</button>
        </div>

        <div class="m-actions">
          <button class="btn btn-ghost btn-sm" @click="confirmReset">清空本机进度</button>
          <button class="btn btn-ghost btn-sm danger" @click="logout">退出登录</button>
        </div>
      </template>

      <template v-else-if="forgot">
        <button type="button" class="back-link" @click="backToLogin">← 返回登录</button>
        <form class="m-form" @submit.prevent="sendReset">
          <div class="field">
            <label for="forgot-email">注册邮箱</label>
            <input
              id="forgot-email"
              v-model="email"
              class="input"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          <p v-if="auth.error" class="err-text">{{ auth.error }}</p>
          <p v-if="auth.notice" class="ok-text">{{ auth.notice }}</p>
          <button class="btn btn-primary btn-block" type="submit" :disabled="busy || !email">
            {{ busy ? '发送中…' : '发送重置邮件' }}
          </button>
          <p class="tip">长时间未收到请检查垃圾箱；同一邮箱有发送频率限制。</p>
        </form>
      </template>

      <template v-else>
        <div class="tabs seg">
          <button :class="{ on: tab === 'login' }" @click="switchTab('login')">登录</button>
          <button :class="{ on: tab === 'register' }" @click="switchTab('register')">注册</button>
        </div>

        <form class="m-form" @submit.prevent="submit">
          <div class="field">
            <label for="email">邮箱</label>
            <input
              id="email"
              v-model="email"
              class="input"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div class="field">
            <label for="password">密码</label>
            <input
              id="password"
              v-model="password"
              class="input"
              type="password"
              required
              minlength="6"
              :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
              placeholder="至少 6 位"
            />
          </div>

          <button type="button" class="forgot-link" @click="startForgot">忘记密码？</button>

          <p v-if="auth.error" class="err-text">{{ auth.error }}</p>
          <p v-if="auth.notice" class="ok-text">{{ auth.notice }}</p>

          <button
            class="btn btn-primary btn-block"
            type="submit"
            :disabled="busy || !email || password.length < 6"
          >
            {{ busy ? '请稍候…' : tab === 'login' ? '登录' : '注册并登录' }}
          </button>

          <p class="tip">注册后，本机已有的刷题记录会自动同步到云端。</p>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 8, 6, 0.45);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.18s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
}

.modal {
  position: relative;
  width: min(420px, 100%);
  max-height: min(88vh, 720px);
  overflow-y: auto;
  padding: 28px 28px 24px;
  animation: modalIn 0.24s var(--ease);
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}

.close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
}

.m-head h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.m-head p {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.65;
}

.notice {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bad-soft);
  border: 1px solid var(--bad-line);
  color: var(--bad);
  font-size: 13px;
  line-height: 1.65;
}

.notice.ok {
  background: var(--ok-soft);
  border-color: var(--ok-line);
  color: var(--ok);
}

.recovery-email {
  margin: 16px 0 12px;
  font-size: 12px;
  color: var(--muted);
}

.forgot-link {
  align-self: flex-end;
  margin-top: -6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}

.forgot-link:hover {
  text-decoration: underline;
}

.back-link {
  align-self: flex-start;
  margin-top: 18px;
  font-size: 12px;
  color: var(--text-2);
}

.back-link:hover {
  color: var(--accent);
}

.tabs {
  margin-top: 20px;
  width: 100%;
}

.tabs button {
  flex: 1;
}

.m-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}

.err-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--bad);
  line-height: 1.5;
}

.ok-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--ok);
  line-height: 1.5;
}

.tip {
  font-size: 11.5px;
  color: var(--muted);
  text-align: center;
  line-height: 1.6;
}

/* ---------- 账号页 ---------- */
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 22px 0 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.avatar-upload {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  transition: background-color 0.15s;
}

.avatar-upload:hover:not(:disabled) {
  background: var(--accent-soft);
}

.avatar-upload:disabled {
  opacity: 0.6;
  cursor: default;
}

.avatar-msg {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--ok);
}

.avatar-msg.err {
  color: var(--bad);
}

.avatar-hint {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--muted);
}

.p-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.4;
}

.p-name {
  font-size: 16px;
  font-weight: 600;
}

.p-id small {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.nick-row {
  display: flex;
  gap: 8px;
}

.nick-row .input {
  flex: 1;
}

.sync-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 13px 15px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.sync-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.4;
}

.sync-info b {
  font-size: 13px;
}

.sync-info small {
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
}

.m-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 20px;
}

.m-actions .danger {
  color: var(--bad);
}

.m-actions .danger:hover {
  border-color: var(--bad-line);
  color: var(--bad);
}

@media (max-width: 640px) {
  .mask {
    padding: 12px;
    align-items: flex-end;
  }

  .modal {
    width: 100%;
    max-height: 86vh;
    padding: 24px 18px 20px;
    border-radius: 20px;
    animation: sheetIn 0.26s var(--ease);
  }

  @keyframes sheetIn {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
  }
}
</style>
