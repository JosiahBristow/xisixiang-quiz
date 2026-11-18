import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import QuizView from './views/QuizView.vue'
import TestView from './views/TestView.vue'
import PkView from './views/PkView.vue'
import LeaderboardView from './views/LeaderboardView.vue'

// GitHub Pages 无法做服务端重写，统一使用 hash 路由，任何仓库子路径下都能直接刷新
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: '习思想题库 · 刷题' } },
    { path: '/quiz/:scope', name: 'quiz', component: QuizView, meta: { title: '刷题' } },
    { path: '/test', name: 'test', component: TestView, meta: { title: '随机测试' } },
    { path: '/pk', name: 'pk', component: PkView, meta: { title: '联机对战' } },
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardView, meta: { title: '排行榜' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '习思想题库'
  document.title = title
})

export default router
