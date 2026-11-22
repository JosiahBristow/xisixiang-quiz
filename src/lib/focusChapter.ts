import { ref } from 'vue'

/** 搜索命中章节后，跨页面请求首页滚动到对应章节 */
export const pendingChapterFocus = ref('')

export function requestChapterFocus(chapterId: string): void {
  pendingChapterFocus.value = chapterId
}
