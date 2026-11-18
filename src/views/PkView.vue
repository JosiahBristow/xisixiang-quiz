<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Question } from '../types'
import type { PkRoom } from '../lib/pk'
import { pickCorrect, pointsFor, seededQuestions } from '../lib/pk'
import { hasSupabase, supabase } from '../lib/supabase'
import { auth } from '../stores/auth'
import { ui } from '../stores/ui'
import { refreshPkStats } from '../stores/pkStats'
import MarqueeText from '../components/MarqueeText.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { avatarCache, ensureAvatars } from '../stores/avatars'

const route = useRoute()

type Stage = 'lobby' | 'room'
type Phase = 'waiting' | 'countdown' | 'question' | 'reveal' | 'finished'

const letters = ['A', 'B', 'C', 'D']
const countChoices = [5, 10, 20]
const limitChoices = [10, 15, 20, 30]

/* ---------- 大厅 ---------- */
const stage = ref<Stage>('lobby')
const prefCount = ref(10)
const prefLimit = ref(15)
const joinCode = ref('')
const pendingCode = ref('')
const busy = ref(false)
const error = ref('')
const matching = ref(false)
const matchSeconds = ref(0)
const toast = ref('')
const copied = ref(false)

/* ---------- 房间 ---------- */
const room = ref<PkRoom | null>(null)
const phase = ref<Phase>('waiting')
const channel = ref<RealtimeChannel | null>(null)
const opponentOnline = ref(false)

/* ---------- 对局 ---------- */
const questions = ref<Question[]>([])
const qIndex = ref(0)
const myPick = ref<string | null>(null)
const oppPick = ref<string | null>(null)
const myElapsed = ref(0)
const oppElapsed = ref(0)
const myScore = ref(0)
const oppScore = ref(0)
const submitted = ref(false)
const oppSubmitted = ref(false)
const remainingMs = ref(0)
const countdown = ref(3)
const reveal = ref<{ myCorrect: boolean; oppCorrect: boolean; myPts: number; oppPts: number } | null>(null)
const final = ref<{ outcome: 'win' | 'loss' | 'draw'; my: number; opp: number; walkover: boolean } | null>(null)
const log = ref<{ my: boolean; opp: boolean; myPts: number; oppPts: number }[]>([])

let qStart = 0
let questionTick: ReturnType<typeof setInterval> | null = null
let nextTimeout: ReturnType<typeof setTimeout> | null = null
let countdownTick: ReturnType<typeof setInterval> | null = null
let startTimeout: ReturnType<typeof setTimeout> | null = null
let matchPoll: ReturnType<typeof setInterval> | null = null
let matchTick: ReturnType<typeof setInterval> | null = null
let roomPoll: ReturnType<typeof setInterval> | null = null
let walkoverTimeout: ReturnType<typeof setTimeout> | null = null
let heartbeatTick: ReturnType<typeof setInterval> | null = null
let monitorTick: ReturnType<typeof setInterval> | null = null
let lastSeen = 0
let autoJoined = false

const isHost = computed(() => Boolean(room.value && auth.user && room.value.host_id === auth.user.id))
const limitMs = computed(() => (room.value?.prefs.limit ?? 15) * 1000)
const current = computed<Question | undefined>(() => questions.value[qIndex.value])
const opponentUserId = computed(() => {
  if (!room.value || !auth.user) return null
  return room.value.host_id === auth.user.id ? room.value.guest_id : room.value.host_id
})
const opponentName = computed(() => {
  if (!room.value || !auth.user) return '对手'
  return room.value.host_id === auth.user.id
    ? room.value.guest_nickname || '对手'
    : room.value.host_nickname || '对手'
})
const shareLink = computed(() =>
  room.value ? `${location.origin}${location.pathname}#/pk?room=${room.value.code}` : '',
)
const outcomeText = computed(() => {
  if (!final.value) return ''
  return final.value.outcome === 'win' ? '胜利' : final.value.outcome === 'loss' ? '惜败' : '平局'
})
const timerPercent = computed(() =>
  limitMs.value ? Math.max(0, Math.min(100, (remainingMs.value / limitMs.value) * 100)) : 0,
)

/* ---------- 定时器清理 ---------- */
function stopQuestionTimer() {
  if (questionTick) {
    clearInterval(questionTick)
    questionTick = null
  }
}
function stopNext() {
  if (nextTimeout) {
    clearTimeout(nextTimeout)
    nextTimeout = null
  }
}
function stopCountdown() {
  if (countdownTick) {
    clearInterval(countdownTick)
    countdownTick = null
  }
}
function stopStart() {
  if (startTimeout) {
    clearTimeout(startTimeout)
    startTimeout = null
  }
}
function stopMatching() {
  if (matchPoll) {
    clearInterval(matchPoll)
    matchPoll = null
  }
  if (matchTick) {
    clearInterval(matchTick)
    matchTick = null
  }
}
function stopRoomPoll() {
  if (roomPoll) {
    clearInterval(roomPoll)
    roomPoll = null
  }
}
function stopWalkover() {
  if (walkoverTimeout) {
    clearTimeout(walkoverTimeout)
    walkoverTimeout = null
  }
}
function stopHeartbeat() {
  if (heartbeatTick) {
    clearInterval(heartbeatTick)
    heartbeatTick = null
  }
  if (monitorTick) {
    clearInterval(monitorTick)
    monitorTick = null
  }
}
function startHeartbeat() {
  stopHeartbeat()
  lastSeen = Date.now()
  heartbeatTick = setInterval(() => {
    if (!['countdown', 'question', 'reveal'].includes(phase.value)) return
    channel.value?.send({ type: 'broadcast', event: 'ping', payload: { userId: auth.user?.id } })
  }, 3000)
  monitorTick = setInterval(() => {
    if (!['countdown', 'question', 'reveal'].includes(phase.value)) return
    if (lastSeen && Date.now() - lastSeen > 12000) walkoverEnd()
  }, 1000)
}
function stopAllTimers() {
  stopQuestionTimer()
  stopNext()
  stopCountdown()
  stopStart()
  stopMatching()
  stopRoomPoll()
  stopWalkover()
  stopHeartbeat()
}

function resetMatch() {
  stopQuestionTimer()
  stopNext()
  stopCountdown()
  stopStart()
  stopWalkover()
  questions.value = []
  qIndex.value = 0
  myPick.value = null
  oppPick.value = null
  myElapsed.value = 0
  oppElapsed.value = 0
  myScore.value = 0
  oppScore.value = 0
  submitted.value = false
  oppSubmitted.value = false
  remainingMs.value = 0
  countdown.value = 3
  reveal.value = null
  final.value = null
  log.value = []
  qStart = 0
}

/* ---------- 房间 ---------- */
function enterRoom(data: PkRoom) {
  if (!supabase) return
  if (data.status === 'cancelled' || data.status === 'finished' || data.status === 'playing') {
    error.value =
      data.status === 'cancelled' ? '房间已取消' : data.status === 'playing' ? '本局已开始' : '本局已结束'
    return
  }
  resetMatch()
  error.value = ''
  room.value = data
  phase.value = 'waiting'
  stage.value = 'room'
  void ensureAvatars([data.host_id, data.guest_id])
  subscribeRoom()
  startRoomPoll()
}

function subscribeRoom() {
  const r = room.value
  const u = auth.user
  if (!supabase || !r || !u) return
  void leaveChannel()
  const ch = supabase.channel(`pk:${r.code}`, {
    config: { presence: { key: u.id }, broadcast: { self: false } },
  })
  ch.on('presence', { event: 'sync' }, () => onPresence())
  ch.on('broadcast', { event: 'start' }, ({ payload }) => onStartBroadcast(payload))
  ch.on('broadcast', { event: 'answer' }, ({ payload }) => onAnswerBroadcast(payload))
  ch.on('broadcast', { event: 'ping' }, ({ payload }) => onHeartbeat(payload))
  ch.on('broadcast', { event: 'rematch' }, ({ payload }) => onRematchBroadcast(payload))
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ nickname: auth.nickname })
  })
  channel.value = ch
}

async function leaveChannel() {
  const ch = channel.value
  channel.value = null
  opponentOnline.value = false
  if (ch) await ch.unsubscribe()
}

async function leaveRoom() {
  const code = room.value?.code
  stopAllTimers()
  await leaveChannel()
  if (supabase && code) void supabase.rpc('pk_leave_room', { p_code: code })
  room.value = null
  stage.value = 'lobby'
  resetMatch()
}

async function createRoom() {
  if (!supabase || busy.value) return
  busy.value = true
  error.value = ''
  const { data, error: e } = await supabase.rpc('pk_create_room', {
    p_prefs: { count: prefCount.value, limit: prefLimit.value },
  })
  busy.value = false
  if (e || !data) {
    error.value = '创建房间失败，请稍后重试'
    return
  }
  enterRoom(data as PkRoom)
}

async function joinRoomByCode(code: string) {
  if (!supabase || busy.value) return
  const clean = code.trim().toUpperCase()
  if (clean.length < 4) {
    error.value = '请输入 4 位房间码'
    return
  }
  busy.value = true
  error.value = ''
  const { data, error: e } = await supabase.rpc('pk_join_room', { p_code: clean })
  busy.value = false
  if (e || !data) {
    error.value = e?.message?.includes('房间') || e?.message?.includes('登录')
      ? e.message
      : '加入失败，请检查房间码'
    return
  }
  enterRoom(data as PkRoom)
}

async function startMatchmaking() {
  if (!supabase || busy.value) return
  busy.value = true
  error.value = ''
  const { data, error: e } = await supabase.rpc('pk_enqueue', {
    p_prefs: { count: prefCount.value, limit: prefLimit.value },
  })
  busy.value = false
  if (e) {
    error.value = '匹配失败，请稍后再试'
    return
  }
  const res = data as { matched?: boolean; room?: PkRoom } | null
  if (res?.matched && res.room) {
    enterRoom(res.room)
    return
  }
  matching.value = true
  matchSeconds.value = 0
  matchTick = setInterval(() => matchSeconds.value++, 1000)
  matchPoll = setInterval(() => void pollMatch(), 2000)
  void pollMatch()
}

async function pollMatch() {
  if (!supabase || !matching.value) return
  const { data } = await supabase.rpc('pk_my_room')
  const r = data as PkRoom | null
  if (r?.code) {
    stopMatching()
    matching.value = false
    enterRoom(r)
  }
}

async function cancelMatchmaking() {
  stopMatching()
  matching.value = false
  if (supabase) await supabase.rpc('pk_cancel')
}

function startRoomPoll() {
  stopRoomPoll()
  roomPoll = setInterval(async () => {
    if (!supabase || !room.value || stage.value !== 'room' || phase.value !== 'waiting') return
    const { data, error: e } = await supabase.rpc('pk_get_room', { p_code: room.value.code })
    if (e) return
    const r = data as PkRoom
    if (r.status === 'cancelled') {
      toast.value = '房间已被取消'
      await leaveRoom()
      return
    }
    if (r.status === 'finished') {
      toast.value = '本局已在别处结束'
      await leaveRoom()
      return
    }
    room.value = { ...room.value, guest_id: r.guest_id, guest_nickname: r.guest_nickname }
    if (opponentOnline.value && isHost.value && phase.value === 'waiting') scheduleStart()
  }, 3000)
}

function onPresence() {
  const ch = channel.value
  const r = room.value
  const u = auth.user
  if (!ch || !r || !u) return
  const state = ch.presenceState() as Record<string, { nickname?: string }[]>
  const otherId = Object.keys(state).find((id) => id !== u.id)
  const hasOpponent = Boolean(otherId)
  opponentOnline.value = hasOpponent
  if (hasOpponent) lastSeen = Date.now()

  if (otherId) {
    void ensureAvatars([otherId])
    const meta = state[otherId]?.[0]
    if (meta?.nickname) {
      if (r.host_id === u.id) r.guest_nickname = meta.nickname
      else r.host_nickname = meta.nickname
    }
  }

  if (phase.value === 'waiting') {
    if (hasOpponent && isHost.value) scheduleStart()
    else if (!hasOpponent) stopStart()
    return
  }

  if (phase.value === 'countdown' || phase.value === 'question' || phase.value === 'reveal') {
    if (!hasOpponent) {
      if (!walkoverTimeout) {
        walkoverTimeout = setTimeout(() => {
          walkoverTimeout = null
          walkoverEnd()
        }, 4000)
      }
    } else {
      stopWalkover()
    }
  }
}

function scheduleStart() {
  if (startTimeout || phase.value !== 'waiting' || !isHost.value) return
  startTimeout = setTimeout(() => {
    startTimeout = null
    const r = room.value
    if (!r || phase.value !== 'waiting' || !opponentOnline.value) return
    void supabase?.rpc('pk_start_room', { p_code: r.code })
    channel.value?.send({
      type: 'broadcast',
      event: 'start',
      payload: { seed: r.seed, count: r.prefs.count, limit: r.prefs.limit },
    })
    beginMatch(r.seed, r.prefs.count, r.prefs.limit)
  }, 1200)
}

function onStartBroadcast(payload: unknown) {
  const p = payload as { seed?: number; count?: number; limit?: number } | null
  if (!p || isHost.value) return
  if (phase.value !== 'waiting') return
  beginMatch(Number(p.seed) || 0, Number(p.count) || 10, Number(p.limit) || 15)
}

/* ---------- 对局 ---------- */
function beginMatch(seed: number, count: number, limit: number) {
  if (phase.value !== 'waiting') return
  questions.value = seededQuestions(seed, count)
  myScore.value = 0
  oppScore.value = 0
  log.value = []
  myPick.value = null
  oppPick.value = null
  submitted.value = false
  oppSubmitted.value = false
  qIndex.value = 0
  countdown.value = 3
  phase.value = 'countdown'
  stopStart()
  stopRoomPoll()
  startHeartbeat()
  countdownTick = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      stopCountdown()
      startQuestion(0)
    }
  }, 900)
}

function startQuestion(i: number) {
  const q = questions.value[i]
  if (!q) {
    finishMatch(false)
    return
  }
  qIndex.value = i
  myPick.value = null
  oppPick.value = null
  submitted.value = false
  oppSubmitted.value = false
  myElapsed.value = 0
  oppElapsed.value = 0
  reveal.value = null
  remainingMs.value = limitMs.value
  qStart = Date.now()
  phase.value = 'question'
  stopQuestionTimer()
  questionTick = setInterval(() => {
    if (phase.value !== 'question') {
      stopQuestionTimer()
      return
    }
    const elapsed = Date.now() - qStart
    remainingMs.value = Math.max(0, limitMs.value - elapsed)
    if (remainingMs.value <= 0) {
      if (!submitted.value) submitAnswer(null)
      if (elapsed >= limitMs.value + 1800) endQuestion()
    }
  }, 100)
}

function choose(key: string) {
  if (phase.value !== 'question' || submitted.value) return
  submitAnswer(key)
}

function submitAnswer(key: string | null) {
  if (submitted.value) return
  submitted.value = true
  myPick.value = key
  myElapsed.value = Math.min(limitMs.value, Math.max(0, Date.now() - qStart))
  channel.value?.send({
    type: 'broadcast',
    event: 'answer',
    payload: {
      userId: auth.user?.id,
      qIndex: qIndex.value,
      pick: key,
      elapsed: myElapsed.value,
    },
  })
  if (oppSubmitted.value) endQuestion()
}

function onHeartbeat(payload: unknown) {
  const p = payload as { userId?: string } | null
  if (p?.userId && p.userId !== auth.user?.id) lastSeen = Date.now()
}

function onAnswerBroadcast(payload: unknown) {
  const p = payload as { userId?: string; qIndex?: number; pick?: string | null; elapsed?: number } | null
  if (!p || !auth.user) return
  if (p.userId !== auth.user.id) lastSeen = Date.now()
  if (p.qIndex !== qIndex.value) return
  if (p.userId === auth.user.id) return
  if (oppSubmitted.value) return
  oppSubmitted.value = true
  oppPick.value = p.pick ?? null
  oppElapsed.value = Math.min(limitMs.value, Math.max(0, Number(p.elapsed) || 0))
  if (submitted.value && phase.value === 'question') endQuestion()
}

function endQuestion() {
  if (phase.value !== 'question') return
  const q = questions.value[qIndex.value]
  if (!q) return
  stopQuestionTimer()
  const myOk = pickCorrect(q, myPick.value)
  const oppOk = pickCorrect(q, oppPick.value)
  const myPts = pointsFor(myOk, myElapsed.value, limitMs.value)
  const oppPts = pointsFor(oppOk, oppElapsed.value, limitMs.value)
  myScore.value += myPts
  oppScore.value += oppPts
  log.value.push({ my: myOk, opp: oppOk, myPts, oppPts })
  reveal.value = { myCorrect: myOk, oppCorrect: oppOk, myPts, oppPts }
  phase.value = 'reveal'
  nextTimeout = setTimeout(() => {
    nextTimeout = null
    if (phase.value !== 'reveal') return
    if (qIndex.value + 1 < questions.value.length) startQuestion(qIndex.value + 1)
    else finishMatch(false)
  }, 2600)
}

function finishMatch(walkover: boolean) {
  if (phase.value === 'finished') return
  stopQuestionTimer()
  stopNext()
  stopCountdown()
  stopWalkover()
  stopRoomPoll()
  stopHeartbeat()
  const outcome: 'win' | 'loss' | 'draw' = walkover
    ? 'win'
    : myScore.value > oppScore.value
      ? 'win'
      : myScore.value < oppScore.value
        ? 'loss'
        : 'draw'
  final.value = { outcome, my: myScore.value, opp: oppScore.value, walkover }
  phase.value = 'finished'
  void reportResult(walkover)
}

async function reportResult(walkover: boolean) {
  if (!supabase || !room.value) return
  await supabase.rpc('pk_finish', {
    p_code: room.value.code,
    p_my_score: myScore.value,
    p_opp_score: oppScore.value,
    p_walkover: walkover,
  })
  refreshPkStats()
}

function walkoverEnd() {
  if (phase.value === 'finished' || phase.value === 'waiting') return
  toast.value = '对手已离开，本局判你获胜'
  finishMatch(true)
}

/* ---------- 再战 ---------- */
async function rematch() {
  if (!supabase || !room.value || busy.value) return
  busy.value = true
  const prefs = room.value.prefs
  const { data, error: e } = await supabase.rpc('pk_create_room', { p_prefs: prefs })
  busy.value = false
  if (e || !data) {
    toast.value = '发起再战失败，请回到大厅重新建房'
    return
  }
  const next = data as PkRoom
  await channel.value?.send({ type: 'broadcast', event: 'rematch', payload: { code: next.code } })
  await leaveChannel()
  enterRoom(next)
}

function onRematchBroadcast(payload: unknown) {
  const p = payload as { code?: string } | null
  if (!p?.code || isHost.value) return
  toast.value = '房主发起再战，正在进入新房间…'
  void followRematch(p.code)
}

async function followRematch(code: string) {
  if (!supabase) return
  stopRoomPoll()
  await leaveChannel()
  const { data, error: e } = await supabase.rpc('pk_join_room', { p_code: code })
  if (e || !data) {
    toast.value = '再战房间已失效'
    await leaveRoom()
    return
  }
  enterRoom(data as PkRoom)
}

/* ---------- 展示辅助 ---------- */
function optionClass(i: number) {
  const q = current.value
  if (!q) return {}
  const key = letters[i]
  const isAnswer = q.answer.includes(key)
  if (phase.value === 'reveal') {
    return {
      correct: isAnswer,
      wrongPick: myPick.value === key && !isAnswer,
      oppPicked: oppPick.value === key,
    }
  }
  return { selected: myPick.value === key }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    toast.value = '复制失败，请手动复制房间码'
  }
}

watch(toast, (v) => {
  if (!v) return
  setTimeout(() => {
    if (toast.value === v) toast.value = ''
  }, 4200)
})

watch(
  () => auth.user?.id,
  (id) => {
    if (!id) {
      if (stage.value === 'room') void leaveRoom()
      return
    }
    if (pendingCode.value && !autoJoined && stage.value === 'lobby') {
      autoJoined = true
      void joinRoomByCode(pendingCode.value)
    }
  },
)

onMounted(() => {
  const q = String(route.query.room ?? '').trim().toUpperCase()
  if (q) {
    pendingCode.value = q
    joinCode.value = q
    if (auth.user && !autoJoined) {
      autoJoined = true
      void joinRoomByCode(q)
    }
  }
})

onBeforeUnmount(() => {
  const code = room.value?.code
  stopAllTimers()
  void leaveChannel()
  if (supabase) {
    if (matching.value) void supabase.rpc('pk_cancel')
    if (code) void supabase.rpc('pk_leave_room', { p_code: code })
  }
})
</script>

<template>
  <main class="pk">
    <div class="wrap pk-wrap">
      <header class="pk-head">
        <p class="eyebrow"><span class="rule" />联机对战</p>
        <h1 class="serif">棋逢对手，题逢知己。</h1>
        <p class="sub">同题同序，答得又快又准才能赢。战绩计入 PK 榜。</p>
      </header>

      <div v-if="!hasSupabase" class="card simple-notice">
        <h2>联机功能未启用</h2>
        <p>请先配置 Supabase 环境变量并执行 0002_pk.sql 迁移。</p>
      </div>

      <div v-else-if="!auth.user" class="card login-cta">
        <div class="lc-mark serif">战</div>
        <h2>登录后开始对战</h2>
        <p>联机 PK 需要登录账号，战绩会记入 PK 榜。</p>
        <button class="btn btn-primary" @click="ui.authOpen = true">登录 / 注册</button>
      </div>

      <template v-else-if="stage === 'lobby'">
        <div class="lobby-grid">
          <section class="card lobby-card">
            <span class="lc-no serif">01</span>
            <h2>创建房间</h2>
            <p class="card-sub">设好规则，把房间码或链接发给好友。</p>
            <div class="pref-row">
              <span class="pref-label">题数</span>
              <div class="pref-chips">
                <button
                  v-for="c in countChoices"
                  :key="c"
                  :class="{ on: prefCount === c }"
                  @click="prefCount = c"
                >
                  {{ c }} 题
                </button>
              </div>
            </div>
            <div class="pref-row">
              <span class="pref-label">每题限时</span>
              <div class="pref-chips">
                <button
                  v-for="l in limitChoices"
                  :key="l"
                  :class="{ on: prefLimit === l }"
                  @click="prefLimit = l"
                >
                  {{ l }} 秒
                </button>
              </div>
            </div>
            <button class="btn btn-primary btn-block" :disabled="busy" @click="createRoom">创建房间</button>
          </section>

          <section class="card lobby-card">
            <span class="lc-no serif">02</span>
            <h2>加入房间</h2>
            <p class="card-sub">输入好友发来的 4 位房间码。</p>
            <input
              v-model="joinCode"
              class="input code-input"
              maxlength="4"
              placeholder="ABCD"
              autocomplete="off"
              @input="joinCode = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, '')"
              @keyup.enter="joinRoomByCode(joinCode)"
            />
            <button
              class="btn btn-primary btn-block"
              :disabled="busy || joinCode.length < 4"
              @click="joinRoomByCode(joinCode)"
            >
              加入房间
            </button>
          </section>

          <section class="card lobby-card">
            <span class="lc-no serif">03</span>
            <h2>快速匹配</h2>
            <p class="card-sub">和在线同学随机配对，题目设置取先排队者的。</p>

            <div v-if="!matching" class="match-idle">
              <p class="match-pref">当前设置：{{ prefCount }} 题 · 每题 {{ prefLimit }} 秒</p>
              <button class="btn btn-ghost btn-block" :disabled="busy" @click="startMatchmaking">开始匹配</button>
            </div>
            <div v-else class="match-wait">
              <span class="spinner" />
              <b>正在寻找对手…</b>
              <small>已等待 {{ matchSeconds }} 秒</small>
              <button class="btn btn-ghost btn-sm" @click="cancelMatchmaking">取消匹配</button>
            </div>
          </section>
        </div>

        <p v-if="error" class="error-line">{{ error }}</p>
        <p class="lobby-note">对局中请勿切到后台或锁屏，否则可能被判掉线。</p>
      </template>

      <template v-else>
        <!-- 等待对手 -->
        <section v-if="phase === 'waiting'" class="card wait-card">
          <div class="wait-top">
            <span class="badge">房间码</span>
            <b class="room-code serif">{{ room?.code }}</b>
            <button class="btn btn-soft btn-sm" @click="copyLink">{{ copied ? '已复制链接' : '复制邀请链接' }}</button>
          </div>

          <div class="wait-players">
            <div class="wp-player">
              <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="48" />
              <MarqueeText :text="auth.nickname" class="wp-name" />
              <small>{{ isHost ? '房主 · 你' : '客人 · 你' }}</small>
            </div>
            <span class="wp-vs serif">VS</span>
            <div class="wp-player" :class="{ empty: !opponentOnline }">
              <UserAvatar :src="avatarCache[opponentUserId ?? '']" :name="opponentOnline ? opponentName : '?'" :size="48" />
              <MarqueeText :text="opponentOnline ? opponentName : '等待对手'" class="wp-name" />
              <small>{{ opponentOnline ? '已就位' : '把房间码发给好友' }}</small>
            </div>
          </div>

          <p class="wait-hint">
            {{ opponentOnline ? '双方就位，即将开始…' : '对手进入后自动开局' }}
          </p>
          <button class="btn btn-ghost btn-sm wait-cancel" @click="leaveRoom">取消房间</button>
        </section>

        <!-- 倒计时 -->
        <section v-else-if="phase === 'countdown'" class="card count-card">
          <p class="count-score">
            <span>{{ auth.nickname }}</span>
            <b class="serif">{{ myScore }} : {{ oppScore }}</b>
            <span>{{ opponentName }}</span>
          </p>
          <div class="count-num serif">{{ Math.max(countdown, 1) }}</div>
          <p class="count-hint">准备开始</p>
        </section>

        <!-- 答题 / 揭晓 -->
        <section v-else-if="phase === 'question' || phase === 'reveal'" class="match">
          <div class="score-bar card">
            <div class="sb-side">
              <UserAvatar :src="auth.avatarUrl" :name="auth.nickname" :size="28" />
              <div class="sb-id">
                <MarqueeText :text="auth.nickname" class="sb-name" />
                <small>你</small>
              </div>
              <span class="sb-score serif">{{ myScore }}</span>
            </div>
            <span class="sb-vs serif">VS</span>
            <div class="sb-side right">
              <span class="sb-score serif">{{ oppScore }}</span>
              <div class="sb-id">
                <MarqueeText :text="opponentName" class="sb-name" />
                <small>{{ opponentOnline ? '对手' : '已掉线' }}</small>
              </div>
              <UserAvatar :src="avatarCache[opponentUserId ?? '']" :name="opponentName" :size="28" />
            </div>
          </div>

          <article v-if="current" class="q-card card">
            <header class="q-head">
              <span class="badge badge-accent">第 {{ qIndex + 1 }} / {{ questions.length }} 题</span>
              <span class="timer" :class="{ urgent: remainingMs <= 5000 }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
                {{ Math.ceil(remainingMs / 1000) }}s
              </span>
            </header>
            <div class="track q-timer"><i :style="{ width: timerPercent + '%' }" /></div>

            <h2 class="stem">{{ current.stem }}</h2>

            <div class="options">
              <button
                v-for="(opt, i) in current.options"
                :key="i"
                class="opt"
                :class="optionClass(i)"
                :disabled="submitted || phase === 'reveal'"
                @click="choose(letters[i])"
              >
                <span class="opt-key">{{ letters[i] }}</span>
                <span class="opt-text">{{ opt }}</span>
                <span v-if="phase === 'reveal' && oppPick === letters[i]" class="opp-tag">对手</span>
              </button>
            </div>

            <div v-if="phase === 'question' && submitted" class="opp-status">
              {{ oppSubmitted ? '双方已作答，正在揭晓…' : '已提交，等待对手…' }}
            </div>

            <div v-if="phase === 'reveal' && reveal" class="reveal-box" :class="reveal.myCorrect ? 'ok' : 'bad'">
              <div class="rv-line">
                <b>{{ reveal.myCorrect ? '答对了' : myPick ? '答错了' : '超时未答' }}</b>
                <span>正确答案 {{ current.answer.join(' ') }}</span>
              </div>
              <p>
                你 {{ myPick ?? '未作答' }} · +{{ reveal.myPts }} 分
                <span class="rv-sep">｜</span>
                对手 {{ oppPick ?? '未作答' }} · +{{ reveal.oppPts }} 分
              </p>
            </div>
          </article>
        </section>

        <!-- 结算 -->
        <section v-else-if="phase === 'finished' && final" class="card result-card">
          <div class="result-word serif" :class="final.outcome">{{ outcomeText }}</div>
          <p class="result-score">
            <span>{{ auth.nickname }}</span>
            <b class="serif">{{ final.my }} : {{ final.opp }}</b>
            <span>{{ opponentName }}</span>
          </p>
          <p v-if="final.walkover" class="result-note">对手中途离开，本局判定你获胜</p>
          <p v-else-if="final.outcome === 'win'" class="result-note">节奏很稳，下一局继续压制。</p>
          <p v-else-if="final.outcome === 'loss'" class="result-note">差几道题，再来一局找回场子。</p>
          <p v-else class="result-note">势均力敌，谁都别服谁。</p>

          <div v-if="log.length" class="result-log">
            <div class="log-row">
              <span>你</span>
              <i v-for="(l, i) in log" :key="'me' + i" :class="l.my ? 'y' : 'n'" />
            </div>
            <div class="log-row">
              <span>对手</span>
              <i v-for="(l, i) in log" :key="'op' + i" :class="l.opp ? 'y' : 'n'" />
            </div>
          </div>

          <div class="result-actions">
            <button v-if="isHost" class="btn btn-primary" :disabled="busy" @click="rematch">再来一局</button>
            <button class="btn btn-ghost" @click="leaveRoom">回到大厅</button>
          </div>
          <p v-if="!isHost" class="result-hint">等待房主发起再战，或回到大厅另开一局</p>
        </section>
      </template>
    </div>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </main>
</template>

<style scoped>
.pk {
  flex: 1;
  padding: 32px 0 60px;
}

.pk-wrap {
  max-width: 900px;
}

.pk-head {
  margin-bottom: 22px;
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

.pk-head h1 {
  margin: 10px 0 6px;
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sub {
  font-size: 13px;
  color: var(--text-2);
}

.simple-notice,
.login-cta {
  padding: 44px 30px;
  text-align: center;
}

.simple-notice h2,
.login-cta h2 {
  font-size: 18px;
  margin-bottom: 6px;
}

.simple-notice p,
.login-cta p {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 18px;
}

.lc-mark {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  border-radius: 50%;
  border: 1.5px solid var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 30px;
  font-weight: 700;
}

/* ---------- 大厅 ---------- */
.lobby-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
}

.lobby-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  position: relative;
}

.lc-no {
  position: absolute;
  top: 16px;
  right: 18px;
  font-size: 20px;
  font-weight: 700;
  color: var(--muted);
  opacity: 0.5;
}

.lobby-card h2 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.card-sub {
  margin: 5px 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
  min-height: 38px;
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.pref-label {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

.pref-chips {
  display: flex;
  gap: 4px;
}

.pref-chips button {
  height: 28px;
  padding: 0 9px;
  white-space: nowrap;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 11.5px;
  color: var(--text-2);
  transition: all 0.15s;
}

.pref-chips button:hover {
  border-color: var(--accent-line);
}

.pref-chips button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.lobby-card > .btn {
  margin-top: auto;
}

.code-input {
  text-align: center;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
  height: 52px;
  margin-bottom: 12px;
}

.match-idle {
  margin-top: auto;
}

.match-pref {
  margin-bottom: 10px;
  font-size: 11.5px;
  color: var(--muted);
  text-align: center;
}

.match-wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 0 2px;
}

.match-wait b {
  font-size: 13.5px;
}

.match-wait small {
  font-size: 11.5px;
  color: var(--muted);
}

.match-wait .btn {
  margin-top: 8px;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2.5px solid var(--surface-3);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-line {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--bad);
  text-align: center;
}

.lobby-note {
  margin-top: 14px;
  text-align: center;
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 等待房间 ---------- */
.wait-card {
  padding: 30px 30px 24px;
  text-align: center;
}

.wait-top {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.room-code {
  font-size: 34px;
  letter-spacing: 0.2em;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}

.wait-players {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin: 30px 0 22px;
}

.wp-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 130px;
}

.wp-player .avatar.lg {
  width: 52px;
  height: 52px;
  font-size: 21px;
  margin-bottom: 2px;
}

.wp-name {
  width: 100%;
  max-width: 132px;
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
}

.wp-name.scrolling {
  text-align: left;
}

.wp-player small {
  font-size: 11px;
  color: var(--muted);
}

.wp-player.empty .avatar {
  border: 1px dashed var(--line-strong);
  background: var(--surface-2);
  color: var(--muted);
}

.wp-vs {
  font-size: 18px;
  color: var(--muted);
}

.wait-hint {
  font-size: 12px;
  color: var(--text-2);
}

.wait-cancel {
  margin-top: 18px;
}

/* ---------- 倒计时 ---------- */
.count-card {
  padding: 40px 30px 34px;
  text-align: center;
}

.count-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 13px;
  color: var(--text-2);
}

.count-score b {
  font-size: 26px;
  color: var(--text);
}

.count-num {
  margin: 16px 0 6px;
  font-size: 86px;
  line-height: 1;
  font-weight: 700;
  color: var(--accent);
  animation: pop 0.9s var(--ease) infinite;
}

@keyframes pop {
  0% {
    transform: scale(0.85);
    opacity: 0.5;
  }
  45% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.95);
    opacity: 0.85;
  }
}

.count-hint {
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--muted);
}

/* ---------- 对战 ---------- */
.score-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 18px;
  margin-bottom: 12px;
}

.sb-side {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}

.sb-side.right {
  justify-content: flex-end;
  text-align: right;
}

.sb-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.sb-name {
  max-width: 92px;
  font-size: 12.5px;
  font-weight: 600;
}

.sb-id small {
  font-size: 10px;
  color: var(--muted);
}

.sb-score {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sb-vs {
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
}

.q-card {
  padding: 26px 34px 22px;
}

.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.timer {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  transition: color 0.2s;
}

.timer svg {
  width: 15px;
  height: 15px;
}

.timer.urgent {
  color: var(--bad);
}

.q-timer {
  margin: 12px 0 20px;
  height: 4px;
  border: 0;
  background: var(--surface-3);
}

.stem {
  font-size: 16.5px;
  font-weight: 500;
  line-height: 1.85;
  margin-bottom: 20px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.opt {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  width: 100%;
  padding: 12px 15px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
  text-align: left;
  transition: border-color 0.15s, background-color 0.15s;
}

.opt:hover:not(:disabled) {
  border-color: var(--accent-line);
  background: color-mix(in srgb, var(--accent-soft) 30%, var(--surface));
}

.opt:disabled {
  cursor: default;
}

.opt-key {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 700;
}

.opt-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.7;
  padding-top: 1px;
  word-break: break-word;
}

.opt.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.opt.selected .opt-key {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.opt.correct {
  border-color: var(--ok-line);
  background: var(--ok-soft);
}

.opt.correct .opt-key {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
}

.opt.wrongPick {
  border-color: var(--bad-line);
  background: var(--bad-soft);
}

.opt.wrongPick .opt-key {
  background: var(--bad);
  border-color: var(--bad);
  color: #fff;
}

.opp-tag {
  flex-shrink: 0;
  align-self: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-2);
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  padding: 1px 5px;
}

.opp-status {
  margin-top: 16px;
  font-size: 11.5px;
  color: var(--muted);
  text-align: center;
}

.reveal-box {
  margin-top: 18px;
  padding: 12px 15px;
  border-radius: 10px;
  border-left: 3px solid transparent;
  animation: rise 0.25s var(--ease) both;
}

.reveal-box.ok {
  border-left-color: var(--ok);
  background: var(--ok-soft);
  color: var(--ok);
}

.reveal-box.bad {
  border-left-color: var(--bad);
  background: var(--bad-soft);
  color: var(--bad);
}

.rv-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.rv-line b {
  font-size: 13.5px;
  font-weight: 700;
}

.rv-line span {
  font-size: 12.5px;
  letter-spacing: 0.04em;
}

.reveal-box p {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.rv-sep {
  margin: 0 4px;
  opacity: 0.5;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

/* ---------- 结算 ---------- */
.result-card {
  padding: 40px 30px 30px;
  text-align: center;
}

.result-word {
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.08em;
}

.result-word.win {
  color: var(--ok);
}

.result-word.loss {
  color: var(--bad);
}

.result-word.draw {
  color: var(--text-2);
}

.result-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 18px;
  font-size: 12.5px;
  color: var(--text-2);
}

.result-score b {
  font-size: 28px;
  color: var(--text);
}

.result-note {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--muted);
}

.result-log {
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 22px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.log-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-row span {
  width: 38px;
  text-align: right;
  font-size: 10.5px;
  color: var(--muted);
}

.log-row i {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--line-strong);
}

.log-row i.y {
  background: var(--ok);
}

.log-row i.n {
  background: var(--bad);
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}

.result-hint {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- 提示 ---------- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  z-index: 90;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  font-size: 12.5px;
  font-weight: 500;
  box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.4);
  animation: rise 0.25s var(--ease) both;
}

@media (max-width: 640px) {
  .pk {
    padding: 20px 0 44px;
  }

  .lobby-card {
    padding: 16px;
  }

  .card-sub {
    min-height: 0;
  }

  .wait-card {
    padding: 22px 16px 20px;
  }

  .room-code {
    font-size: 28px;
  }

  .wait-players {
    gap: 12px;
    margin: 24px 0 18px;
  }

  .wp-player {
    width: 104px;
  }

  .wp-player .avatar.lg {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }

  .score-bar {
    padding: 10px 12px;
  }

  .sb-name {
    max-width: 64px;
    font-size: 11.5px;
  }

  .sb-score {
    font-size: 19px;
  }

  .q-card {
    padding: 18px 14px 16px;
    border-radius: 16px;
  }

  .stem {
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 16px;
  }

  .opt {
    padding: 10px 11px;
    gap: 10px;
  }

  .opt-text {
    font-size: 13.5px;
  }

  .result-word {
    font-size: 52px;
  }

  .count-num {
    font-size: 72px;
  }

  .toast {
    bottom: 16px;
    max-width: calc(100% - 32px);
    text-align: center;
  }
}
</style>
