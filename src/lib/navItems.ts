export interface NavItem {
  to: string
  name: string
  label: string
  short: string
  icon: string
}

/** 顶栏 / 左侧栏 / 手机底栏共用同一份导航数据 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    name: 'home',
    label: '题库',
    short: '题库',
    icon: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 5.5v16"/><path d="M8 7h8M8 11h6"/>',
  },
  {
    to: '/test',
    name: 'test',
    label: '随机测试',
    short: '测试',
    icon: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13 6 5 5"/>',
  },
  {
    to: '/pk',
    name: 'pk',
    label: '联机对战',
    short: '对战',
    icon: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  },
  {
    to: '/board',
    name: 'board',
    label: '留言板',
    short: '留言',
    icon: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/>',
  },
  {
    to: '/me',
    name: 'me',
    label: '我的成就',
    short: '成就',
    icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M9 21h6"/>',
  },
  {
    to: '/leaderboard',
    name: 'leaderboard',
    label: '排行榜',
    short: '排行',
    icon: '<path d="M4 20v-6M10 20V8M16 20v-9M22 20H2"/>',
  },
]

export function isNavActive(item: NavItem, routeName: string | symbol | null | undefined): boolean {
  if (item.name === 'home') return routeName === 'home' || routeName === 'quiz'
  return routeName === item.name
}
