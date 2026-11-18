<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MarqueeText from '../components/MarqueeText.vue'
import RewardBadge from '../components/RewardBadge.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { supabase } from '../lib/supabase'
import { auth } from '../stores/auth'
import { avatarCache, badgeCache, ensureAvatars } from '../stores/avatars'
import { ui } from '../stores/ui'

type Topic = '讨论' | '吐槽' | '求助' | '建议'

interface BoardMessage {
  id: string
  user_id: string
  nickname: string
  avatar_url: string | null
  content: string
  topic: Topic
  reply_to: string | null
  pinned: boolean
  hidden: boolean
  created_at: string
  like_count: number
  liked: boolean
}

const topics: Topic[] = ['讨论', '吐槽', '求助', '建议']
const topicClass: Record<Topic, string> = {
  讨论: 'discuss',
  吐槽: 'rant',
  求助: 'help',
  建议: 'idea',
}

const messages = ref<BoardMessage[]>([])
const loading = ref(true)
const boardError = ref('')
const isAdmin = ref(false)

const content = ref('')
const topic = ref<Topic>('讨论')
const sending = ref(false)
const postError = ref('')

const filterTopic = ref<'全部' | Topic>('全部')
const sortMode = ref<'new' | 'hot'>('new')

const replyTarget = ref<BoardMessage | null>(null)
const replyText = ref('')
const replySending = ref(false)

const cooldownLeft = ref(0)
let cooldownUntil = 0
let cooldownTimer: ReturnType<typeof setInterval> | null = null
let requestId = 0

const canSend = computed(
  () =>
    Boolean(auth.user) &&
    content.value.trim().length > 0 &&
    content.value.length <= 300 &&
    cooldownLeft.value === 0 &&
    !sending.value,
)

const canReply = computed(
  () =>
    Boolean(auth.user) &&
    replyText.value.trim().length > 0 &&
    replyText.value.length <= 300 &&
    cooldownLeft.value === 0 &&
    !replySending.value,
)

const topLevel = computed(() => messages.value.filter((m) => !m.reply_to))

const visibleTop = computed(() => {
  const list = topLevel.value.filter((m) => filterTopic.value === '全部' || m.topic === filterTopic.value)
  return [...list].sort((a, b) => {
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sortMode.value === 'hot') {
      if (b.like_count !== a.like_count) return b.like_count - a.like_count
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
})

function repliesOf(id: string): BoardMessage[] {
  return messages.value
    .filter((m) => m.reply_to === id)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

async function loadAdmin() {
  if (!supabase || !auth.user) {
    isAdmin.value = false
    return
  }
  const { data } = await supabase.rpc('is_admin')
  isAdmin.value = Boolean(data)
}

async function load() {
  if (!supabase) return
  const id = ++requestId
  loading.value = true
  boardError.value = ''
  const [res] = await Promise.all([
    supabase.rpc('lb_messages', { p_limit: 300 }),
    loadAdmin(),
  ])
  if (id !== requestId) return
  if (res.error) {
    boardError.value = '留言加载失败，请稍后再试'
    messages.value = []
  } else {
    messages.value = ((res.data ?? []) as BoardMessage[]).map((m) => ({
      ...m,
      like_count: Number(m.like_count) || 0,
      liked: Boolean(m.liked),
    }))
    void ensureAvatars(messages.value.map((m) => m.user_id))
  }
  loading.value = false
}

function startCooldown() {
  cooldownUntil = Date.now() + 30_000
  cooldownLeft.value = 30
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldownLeft.value = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    if (cooldownLeft.value === 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 500)
}

function translateError(message: string): string {
  if (message.includes('频繁')) return '发言太频繁，请 30 秒后再试'
  if (message.includes('300')) return '留言最多 300 字'
  if (message.includes('登录')) return '请先登录'
  return '发送失败，请稍后再试'
}

async function submit() {
  if (!auth.user) {
    ui.authOpen = true
    return
  }
  if (!canSend.value || !supabase) return
  sending.value = true
  postError.value = ''
  const { error } = await supabase.rpc('post_message', {
    p_content: content.value,
    p_topic: topic.value,
    p_reply_to: null,
  })
  sending.value = false
  if (error) {
    postError.value = translateError(error.message)
    if (error.message.includes('频繁')) startCooldown()
    return
  }
  content.value = ''
  filterTopic.value = '全部'
  sortMode.value = 'new'
  startCooldown()
  await load()
}

function setFilter(value: string) {
  filterTopic.value = value as '全部' | Topic
}

function startReply(message: BoardMessage) {
  if (!auth.user) {
    ui.authOpen = true
    return
  }
  replyTarget.value = replyTarget.value?.id === message.id ? null : message
  replyText.value = ''
}

async function sendReply() {
  const target = replyTarget.value
  if (!target || !auth.user || !supabase || !canReply.value) return
  replySending.value = true
  postError.value = ''
  const { error } = await supabase.rpc('post_message', {
    p_content: replyText.value,
    p_topic: target.topic,
    p_reply_to: target.id,
  })
  replySending.value = false
  if (error) {
    postError.value = translateError(error.message)
    if (error.message.includes('频繁')) startCooldown()
    return
  }
  replyText.value = ''
  replyTarget.value = null
  startCooldown()
  await load()
}

async function toggleLike(message: BoardMessage) {
  if (!auth.user) {
    ui.authOpen = true
    return
  }
  if (!supabase) return
  const { data, error } = await supabase.rpc('toggle_message_like', { p_message_id: message.id })
  if (error) return
  const result = data as { liked?: boolean; count?: number } | null
  message.liked = Boolean(result?.liked)
  message.like_count = Number(result?.count) || 0
}

function canDelete(message: BoardMessage): boolean {
  return Boolean(auth.user && (auth.user.id === message.user_id || isAdmin.value))
}

async function removeMessage(message: BoardMessage) {
  if (!supabase || !canDelete(message)) return
  if (!window.confirm('确定删除这条留言吗？')) return
  const { error } = await supabase.from('messages').delete().eq('id', message.id)
  if (error) {
    boardError.value = '删除失败，请稍后再试'
    return
  }
  await load()
}

async function togglePin(message: BoardMessage) {
  if (!supabase || !isAdmin.value) return
  const { error } = await supabase
    .from('messages')
    .update({ pinned: !message.pinned })
    .eq('id', message.id)
  if (error) {
    boardError.value = '操作失败，请稍后再试'
    return
  }
  message.pinned = !message.pinned
}

async function toggleHide(message: BoardMessage) {
  if (!supabase || !isAdmin.value) return
  const { error } = await supabase
    .from('messages')
    .update({ hidden: !message.hidden })
    .eq('id', message.id)
  if (error) {
    boardError.value = '操作失败，请稍后再试'
    return
  }
  message.hidden = !message.hidden
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

const avatarOf = (m: BoardMessage) => avatarCache[m.user_id] || m.avatar_url || ''

watch(
  () => auth.user?.id,
  () => {
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <main class="board">
    <div class="wrap board-wrap">
      <header class="board-head">
        <p class="eyebrow"><span class="rule" />留言板</p>
        <div class="bh-row">
          <h1 class="serif">有话直说。</h1>
          <span v-if="isAdmin" class="badge badge-accent">管理员</span>
        </div>
        <p class="sub">聊题目、提建议、找同伴。发言间隔 30 秒，每条最多 300 字。</p>
      </header>

      <section v-if="!auth.user" class="card login-cta">
        <div class="lc-mark serif">言</div>
        <div class="lc-text">
          <b>登录后参与留言</b>
          <small>游客可以浏览，登录后可以发帖、回复和点赞。</small>
        </div>
        <button class="btn btn-primary btn-sm" @click="ui.authOpen = true">登录 / 注册</button>
      </section>

      <section v-else class="card composer">
        <div class="composer-top">
          <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="34" />
          <b>{{ auth.nickname }}</b>
          <span v-if="cooldownLeft" class="cooldown">{{ cooldownLeft }} 秒后可再次发送</span>
        </div>
        <textarea
          v-model="content"
          class="board-input"
          rows="3"
          maxlength="300"
          placeholder="写下你的想法、疑问或建议…"
        />
        <div class="composer-foot">
          <div class="composer-topics">
            <button
              v-for="t in topics"
              :key="t"
              class="topic-chip"
              :class="{ on: topic === t }"
              @click="topic = t"
            >
              {{ t }}
            </button>
          </div>
          <span class="char-count">{{ content.length }}/300</span>
          <button class="btn btn-primary btn-sm" :disabled="!canSend" @click="submit">
            {{ sending ? '发送中…' : cooldownLeft ? '冷却中' : '发送' }}
          </button>
        </div>
        <p v-if="postError" class="board-error">{{ postError }}</p>
      </section>

      <div class="board-toolbar">
        <div class="topic-filter">
          <button
            v-for="t in ['全部', ...topics]"
            :key="t"
            :class="{ on: filterTopic === t }"
            @click="setFilter(t)"
          >
            {{ t }}
          </button>
        </div>
        <div class="seg sort-seg">
          <button :class="{ on: sortMode === 'new' }" @click="sortMode = 'new'">最新</button>
          <button :class="{ on: sortMode === 'hot' }" @click="sortMode = 'hot'">最热</button>
        </div>
      </div>

      <p v-if="boardError" class="board-error banner">
        {{ boardError }}
        <button class="retry" @click="load">重试</button>
      </p>

      <div v-if="loading && !messages.length" class="card board-empty">留言加载中…</div>

      <div v-else-if="!visibleTop.length" class="card board-empty">
        <div class="empty-mark serif">言</div>
        <p>{{ filterTopic === '全部' ? '还没有留言，来抢第一条。' : `「${filterTopic}」下还没有留言。` }}</p>
      </div>

      <template v-else>
        <article
          v-for="m in visibleTop"
          :key="m.id"
          class="card msg"
          :class="{ pinned: m.pinned, hidden: m.hidden }"
        >
        <header class="msg-head">
          <UserAvatar :src="avatarOf(m)" :name="m.nickname" :size="38" />
          <div class="msg-meta">
            <div class="msg-name-row">
              <MarqueeText :text="m.nickname" class="msg-name" />
              <RewardBadge
                v-if="badgeCache[m.user_id]"
                :item-id="badgeCache[m.user_id]"
                :size="16"
              />
              <span v-if="m.pinned" class="badge pinned-tag">置顶</span>
              <span v-if="m.hidden" class="badge badge-bad">已隐藏</span>
            </div>
            <div class="msg-sub">
              <span class="topic-tag" :class="topicClass[m.topic]">{{ m.topic }}</span>
              <span>{{ timeAgo(m.created_at) }}</span>
            </div>
          </div>
        </header>

        <p class="msg-content">{{ m.content }}</p>

        <footer class="msg-actions">
          <button class="act like" :class="{ liked: m.liked }" @click="toggleLike(m)">
            <span class="heart">♥</span>
            {{ m.like_count }}
          </button>
          <button v-if="!m.hidden" class="act" @click="startReply(m)">回复</button>
          <button v-if="canDelete(m)" class="act danger" @click="removeMessage(m)">删除</button>
          <template v-if="isAdmin">
            <button class="act admin" @click="togglePin(m)">{{ m.pinned ? '取消置顶' : '置顶' }}</button>
            <button class="act admin" @click="toggleHide(m)">{{ m.hidden ? '取消隐藏' : '隐藏' }}</button>
          </template>
          <span v-if="repliesOf(m.id).length" class="reply-count">{{ repliesOf(m.id).length }} 条回复</span>
        </footer>

        <div v-if="repliesOf(m.id).length" class="replies">
          <div v-for="r in repliesOf(m.id)" :key="r.id" class="reply" :class="{ hidden: r.hidden }">
            <UserAvatar :src="avatarOf(r)" :name="r.nickname" :size="26" />
            <div class="reply-body">
              <div class="reply-head">
                <b>{{ r.nickname }}</b>
                <span>{{ timeAgo(r.created_at) }}</span>
                <span v-if="r.hidden" class="badge badge-bad">已隐藏</span>
              </div>
              <p>{{ r.content }}</p>
              <div class="reply-actions">
                <button class="act like" :class="{ liked: r.liked }" @click="toggleLike(r)">
                  <span class="heart">♥</span>
                  {{ r.like_count }}
                </button>
                <button v-if="canDelete(r)" class="act danger" @click="removeMessage(r)">删除</button>
                <button v-if="isAdmin" class="act admin" @click="toggleHide(r)">
                  {{ r.hidden ? '取消隐藏' : '隐藏' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="replyTarget?.id === m.id" class="reply-box">
          <textarea
            v-model="replyText"
            class="board-input small"
            rows="2"
            maxlength="300"
            :placeholder="`回复 ${m.nickname}…`"
          />
          <div class="reply-foot">
            <span class="char-count">{{ replyText.length }}/300</span>
            <button class="btn btn-ghost btn-sm" @click="replyTarget = null">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="!canReply" @click="sendReply">
              {{ replySending ? '发送中…' : cooldownLeft ? '冷却中' : '发送回复' }}
            </button>
          </div>
        </div>
        </article>
      </template>

      <p class="board-note">请友善交流，留言永久保留；违规内容由管理员隐藏或删除。</p>
    </div>
  </main>
</template>

<style scoped>
.board {
  flex: 1;
  padding: 30px 0 60px;
}

.board-wrap {
  max-width: 780px;
}

.board-head {
  margin-bottom: 20px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.rule {
  display: inline-block;
  width: 20px;
  height: 1.5px;
  background: var(--accent-line);
}

.bh-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 4px;
}

.bh-row h1 {
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sub {
  font-size: 12.5px;
  color: var(--text-2);
}

/* ---------- 登录提示 ---------- */
.login-cta {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
}

.lc-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent);
  font-size: 20px;
  font-weight: 700;
}

.lc-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}

.lc-text b {
  font-size: 13.5px;
}

.lc-text small {
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 发帖 ---------- */
.composer {
  padding: 16px 18px 14px;
}

.composer-top {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
}

.composer-top b {
  font-size: 13px;
  font-weight: 600;
}

.cooldown {
  margin-left: auto;
  font-size: 11px;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}

.board-input {
  width: 100%;
  min-height: 82px;
  padding: 11px 13px;
  border-radius: 11px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.board-input.small {
  min-height: 58px;
  font-size: 13.5px;
}

.board-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.board-input::placeholder {
  color: var(--muted);
}

.composer-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
}

.composer-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.topic-chip {
  height: 28px;
  padding: 0 11px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 11.5px;
  transition: all 0.15s;
}

.topic-chip:hover {
  border-color: var(--accent-line);
}

.topic-chip.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.char-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.board-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--bad);
}

.board-error.banner {
  padding: 9px 14px;
  border-radius: 9px;
  background: var(--bad-soft);
  border: 1px solid var(--bad-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.retry {
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: underline;
}

/* ---------- 筛选 ---------- */
.board-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0 12px;
}

.topic-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.topic-filter button {
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-2);
  border: 1px solid transparent;
  transition: all 0.15s;
}

.topic-filter button:hover {
  background: var(--surface-2);
}

.topic-filter button.on {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent);
  font-weight: 600;
}

/* ---------- 留言 ---------- */
.msg {
  padding: 16px 18px;
  margin-bottom: 10px;
  transition: border-color 0.15s;
}

.msg.pinned {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 1px var(--accent-soft), var(--shadow);
}

.msg.hidden {
  opacity: 0.6;
  border-style: dashed;
}

.msg-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.msg-meta {
  flex: 1;
  min-width: 0;
}

.msg-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.msg-name {
  max-width: 220px;
  font-size: 13.5px;
  font-weight: 600;
}

.pinned-tag {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent);
  font-size: 10px;
  height: 20px;
  padding: 0 6px;
}

.msg-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--muted);
}

.topic-tag {
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--line);
}

.topic-tag.discuss {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-line);
}

.topic-tag.rant {
  background: var(--bad-soft);
  color: var(--bad);
  border-color: var(--bad-line);
}

.topic-tag.help {
  background: #f6ebcf;
  color: #8a6a1a;
  border-color: #dcc07a;
}

.topic-tag.idea {
  background: var(--ok-soft);
  color: var(--ok);
  border-color: var(--ok-line);
}

[data-theme='night'] .topic-tag.help,
[data-theme='ink'] .topic-tag.help,
[data-theme='nocturne'] .topic-tag.help {
  background: #2b2416;
  color: #e3c079;
  border-color: #564622;
}

.msg-content {
  margin: 12px 0 0 48px;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 12px 0 0 48px;
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--muted);
  transition: color 0.15s;
  font-variant-numeric: tabular-nums;
}

.act:hover {
  color: var(--text);
}

.act.like .heart {
  font-size: 13px;
  line-height: 1;
}

.act.like.liked {
  color: var(--bad);
}

.act.danger {
  color: var(--muted);
}

.act.danger:hover {
  color: var(--bad);
}

.act.admin {
  color: var(--gold);
}

.reply-count {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--muted);
}

/* ---------- 回复 ---------- */
.replies {
  margin: 12px 0 0 48px;
  padding-left: 14px;
  border-left: 2px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reply {
  display: flex;
  gap: 9px;
}

.reply.hidden {
  opacity: 0.6;
}

.reply-body {
  flex: 1;
  min-width: 0;
}

.reply-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 10.5px;
  color: var(--muted);
}

.reply-head b {
  font-size: 12px;
  color: var(--text);
  font-weight: 600;
}

.reply p {
  margin: 3px 0 2px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.reply-actions {
  display: flex;
  gap: 12px;
}

.reply-box {
  margin: 14px 0 0 48px;
  padding: 12px;
  border-radius: 11px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.reply-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.reply-foot .char-count {
  margin-left: 0;
  margin-right: auto;
}

/* ---------- 空状态 ---------- */
.board-empty {
  padding: 44px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 24px;
}

.board-note {
  margin-top: 20px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .board {
    padding: 20px 0 44px;
  }

  .login-cta {
    flex-wrap: wrap;
    padding: 14px 15px;
  }

  .login-cta .btn {
    width: 100%;
  }

  .composer {
    padding: 14px 14px 12px;
  }

  .composer-foot {
    gap: 8px;
  }

  .composer-topics {
    width: 100%;
  }

  .char-count {
    margin-left: 0;
  }

  .composer-foot .btn {
    margin-left: auto;
  }

  .msg {
    padding: 14px 14px 13px;
  }

  .msg-content,
  .msg-actions,
  .replies,
  .reply-box {
    margin-left: 0;
  }

  .msg-name {
    max-width: 150px;
  }

  .msg-actions {
    gap: 4px 12px;
  }

  .reply-box {
    padding: 10px;
  }

  .board-toolbar {
    gap: 8px;
  }

  .sort-seg {
    margin-left: auto;
  }
}
</style>
