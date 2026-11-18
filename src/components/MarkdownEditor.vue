<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    maxlength?: number
    compact?: boolean
  }>(),
  {
    placeholder: '写下你的想法… 支持 Markdown',
    maxlength: 300,
    compact: false,
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const area = ref<HTMLTextAreaElement | null>(null)

const text = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value.slice(0, props.maxlength)),
})

const previewHtml = computed(() => renderMarkdown(props.modelValue))
const hasPreview = computed(() => !props.compact && props.modelValue.trim().length > 0)

function replaceSelection(before: string, after: string, placeholder: string) {
  const el = area.value
  const value = props.modelValue
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? value.length
  const selected = value.slice(start, end) || placeholder
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  text.value = next
  void nextTick(() => {
    if (!el) return
    el.focus()
    const s = start + before.length
    el.setSelectionRange(s, s + selected.length)
  })
}

function prefixLines(marker: string) {
  const el = area.value
  const value = props.modelValue
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? value.length
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const blockEnd = end <= start ? value.indexOf('\n', start) : end
  const realEnd = blockEnd === -1 ? value.length : blockEnd
  const block = value.slice(lineStart, realEnd)
  const replaced = block
    .split('\n')
    .map((line) => marker + line)
    .join('\n')
  text.value = value.slice(0, lineStart) + replaced + value.slice(realEnd)
  void nextTick(() => {
    area.value?.focus()
  })
}

const tools = [
  { label: 'B', title: '加粗', run: () => replaceSelection('**', '**', '加粗文字') },
  { label: 'I', title: '斜体', run: () => replaceSelection('*', '*', '斜体文字') },
  { label: 'H', title: '标题', run: () => prefixLines('## ') },
  { label: '•', title: '列表', run: () => prefixLines('- ') },
  { label: '❝', title: '引用', run: () => prefixLines('> ') },
  { label: '</>', title: '行内代码', run: () => replaceSelection('`', '`', '代码') },
  { label: '链', title: '链接', run: () => replaceSelection('[', '](https://)', '链接文字') },
]
</script>

<template>
  <div class="mde" :class="{ compact }">
    <div class="mde-toolbar">
      <button
        v-for="tool in tools"
        :key="tool.label"
        type="button"
        :title="tool.title"
        @click="tool.run()"
      >
        {{ tool.label }}
      </button>
      <span class="mde-hint">Markdown</span>
    </div>

    <div class="mde-body" :class="{ 'with-preview': hasPreview }">
      <textarea
        ref="area"
        v-model="text"
        class="mde-area"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :rows="compact ? 2 : 4"
      />
      <div v-if="hasPreview" class="mde-preview markdown" v-html="previewHtml" />
    </div>

    <div class="mde-foot">
      <span>支持 Markdown · 实时预览</span>
      <span>{{ modelValue.length }}/{{ maxlength }}</span>
    </div>
  </div>
</template>

<style scoped>
.mde {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mde-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.mde-toolbar button {
  height: 26px;
  min-width: 28px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  transition: border-color 0.15s, color 0.15s;
}

.mde-toolbar button:hover {
  border-color: var(--accent-line);
  color: var(--accent);
}

.mde-hint {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.mde-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 641px) {
  .mde-body.with-preview {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.mde-area {
  width: 100%;
  min-height: 92px;
  padding: 10px 12px;
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

.mde.compact .mde-area {
  min-height: 58px;
  font-size: 13.5px;
}

.mde-area:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mde-area::placeholder {
  color: var(--muted);
}

.mde-preview {
  min-height: 92px;
  max-height: 280px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 11px;
  border: 1px dashed var(--line-strong);
  background: var(--surface-2);
  font-size: 13.5px;
  line-height: 1.7;
}

.mde-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
