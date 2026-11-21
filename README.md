# 习思想题库 · 刷题网站

习近平新时代中国特色社会主义思想题库的在线刷题站：按章练习、背题模式、错题本、四套主题、云端同步与排行榜。

**线上地址**：https://josiahbristow.github.io/xisixiang-quiz/  ·
**仓库**：https://github.com/JosiahBristow/xisixiang-quiz

- **485 道题 / 18 个章节**（单选 249、多选 236），由根目录 Word 题库自动解析生成
- **随机测试**：自选抽题数量，答题时答案全部隐藏，交卷后统一公布并逐题回顾
- **联机对战**：房间码 / 快速匹配实时 PK，正确+速度计分，胜负计入 PK 榜
- **积分与成就**：答对 +10、PK 获胜 +80、活跃日 +20；12 枚徽章、等级称号、连击提示
- **自定义头像**：上传后自动居中裁剪压缩到 256×256，显示在导航、排行榜、PK 与个人中心
- **积分商城**：可用积分解锁 3 套主题与 3 枚荣誉徽章，徽章可佩戴展示在排行榜
- **跳过已答对**：默认开启，练习与随机测试只刷还没做对的题，避免重复劳动
- **收藏夹**：刷题时一键收藏，独立收藏页回看或只刷收藏题，登录后云端同步
- **留言板**：登录可发帖 / 回复 / 点赞，支持 Markdown 编辑与实时预览，管理员可置顶、隐藏、删除
- 纯静态站点（Vue 3 + Vite），可直接部署到 GitHub Pages
- Supabase 提供邮箱登录、作答记录云同步与总榜 / 章节榜 / 周榜
- 深色、浅色、护眼、墨蓝四套主题，手机 / 电脑自适应

---

## 本地开发

```bash
npm install
npm run dev
```

打开终端提示的地址（默认 http://localhost:5173）。

> `npm run dev` / `npm run build` 前会自动执行 `npm run parse`，把 `习思想题库更新版/*.docx`
> 解析成 `src/data/questions.json`。改了 Word 题库后重新运行即可，无需手工整理数据。

生产构建与预览：

```bash
npm run build
npm run preview
```

---

## 一、配置 Supabase

1. 到 [supabase.com](https://supabase.com) 新建一个免费项目（Region 建议 Singapore / East Asia）。
2. 打开 **SQL Editor**，依次执行 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)、
   [`supabase/migrations/0002_pk.sql`](supabase/migrations/0002_pk.sql)、
   [`supabase/migrations/0004_incentives.sql`](supabase/migrations/0004_incentives.sql)、
   [`supabase/migrations/0005_total_score.sql`](supabase/migrations/0005_total_score.sql)、
   [`supabase/migrations/0006_avatars.sql`](supabase/migrations/0006_avatars.sql)、
   [`supabase/migrations/0007_rewards.sql`](supabase/migrations/0007_rewards.sql)、
   [`supabase/migrations/0008_points_balance.sql`](supabase/migrations/0008_points_balance.sql)、
   [`supabase/migrations/0009_board.sql`](supabase/migrations/0009_board.sql)、
   [`supabase/migrations/0010_favorites.sql`](supabase/migrations/0010_favorites.sql)
   （脚本幂等，可重复执行）。0001 会创建：
   - `profiles`：昵称（注册时自动生成）
   - `attempts`：逐题作答记录（进度 / 错题本 / 排行榜的数据源）
   - 行级安全策略（每个人只能读写自己的作答明细）
   - `lb_total` / `lb_chapter` / `lb_weekly` 三个排行榜函数

   0002 会创建联机对战所需的 `pk_rooms` / `pk_queue` / `pk_results` 表、
   房间与匹配相关 RPC，以及 `lb_pk` 胜负榜函数。

   0004 只新增 `lb_points` 积分榜函数；积分与成就本身由作答记录实时推导，不占用新表。

   0005 重写 `lb_total`，总榜改为综合分：答对×10 + 正确率×3 + 最长连对×5 + 活跃天×10 + PK胜×25。

   0006 为 `profiles` 增加头像地址，创建公开的 `avatars` 存储桶（2MB 限制）、
   按用户目录隔离的存储策略，以及供排行榜/联机查询头像的 `lb_avatars` 函数。

   0007 创建积分商城：`reward_items` 商品目录、`user_rewards` 购买记录、
   `purchase_reward` / `equip_reward_badge` RPC（含余额校验与佩戴权限），
   以及批量返回头像与佩戴徽章的 `lb_social` 函数。

   0008 将 `lb_points` 改为按积分余额排名（累计获得 − 商城消费）。

   0009 创建留言板：`messages` / `message_likes` 表、发帖与点赞 RPC（含 300 字与
   30 秒频率校验）、管理员邮箱判定函数 `is_admin`（默认 `josiah_bristow@outlook.com`）。

   0010 创建收藏夹表 `favorites`（每题一条、按用户隔离）。
3. 进入 **Authentication → Providers → Email**，关闭 **Confirm email**
   （自己人使用，注册后可立即登录；开着的话需要先点邮件里的确认链接）。
4. 进入 **Project Settings → API**，复制 **Project URL** 和 **anon public key**，写入项目根目录 `.env`：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的-anon-key
```

> anon key 本身就设计为公开，安全性完全由数据库 RLS 保证，不要使用 service_role key。

没有配置 Supabase 时，网站依然可以完整刷题，只是登录、云同步与排行榜不可用。

---

## 二、部署到 GitHub Pages

1. 新建 GitHub 仓库并推送本项目：

```bash
git init
git add -A
git commit -m "feat: 刷题网站"
git branch -M main
git remote add origin git@github.com:你的用户名/仓库名.git
git push -u origin main
```

2. 仓库 **Settings → Secrets and variables → Actions → Variables**，添加两个 **Repository variables**：

| 名称 | 值 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://你的项目.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 你的 anon public key |

（用 variables 而不是 secrets：这两个值本来就会打包进前端，写成 secrets 只会让日志更难排查。）

3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

4. 之后每次推送到 `main`，[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
   会自动解析题库、构建并发布，地址形如 `https://你的用户名.github.io/仓库名/`。

> 站点使用 hash 路由（`#/quiz/ch1`），因此 GitHub Pages 上刷新深链也不会 404。

---

## 三、随机测试

- 首页「随机测试」选择 10 / 20 / 30 / 50 / 全部题，进入后随机抽题。
- 答题过程中不显示任何对错，可自由跳题、修改答案，有答题卡和计时。
- 交卷后统一公布正确率、逐题答案与知识点；答错的题自动进入错题本，未作答不计入。
- 设置「跳过已答对」后，只从还没做对的题里抽题；可抽数量会实时显示。
- 中途离开或刷新页面，本次测试会保留在浏览器会话中，可回来继续答卷。

## 四、联机对战

- 入口：导航栏「对战」或 `/#/pk`，需登录。
- **房间码**：创建房间时可选 5 / 10 / 20 题、每题 10 / 15 / 20 / 30 秒；
  把 4 位房间码或邀请链接发给好友，双方到齐后自动开局。
- **快速匹配**：进入匹配池，由服务端原子配对，题目设置取先排队的一方。
- **规则**：双方题目与顺序完全一致；答对得 100 分 + 最高 60 速度分；
  每题双方作答或超时后揭晓，比分实时同步；中途掉线判对手获胜。
- 结算写入 `pk_results`，胜负进入排行榜的「PK 榜」（胜场 → 胜率排序，展示连胜）。

> 题目与答案仍打包在前端，联机频道只同步作答事件，整体是按朋友娱乐的标准设计的。

## 五、积分与成就

- **刷题筛选**：首页章节区和随机测试设置里都有「跳过已答对」开关（默认开启），
  题目池只保留最近一次作答不是正确的题；错题本不受影响。
- **积分**：答对一题 +10（同一道题只计一次）、PK 获胜 +80、当日活跃 +20。
  积分用于「积分榜」排名与个人等级（童生 → 秀才 → 举人 → 贡士 → 进士 → 翰林 → 大学士）。
- **连击**：连续答对题数，答错归零；答题页会即时提示「连对 ×N」。
- **成就**：共 12 枚徽章，覆盖首答、连击、答对题量、单章正确率、连续打卡、全勤周与 PK 胜场；
  达成时全局弹出解锁提示，个人中心可查看徽章墙与最近 7 天答题曲线。
- 未登录时积分与徽章按本机记录计算；登录后随作答记录自动同步，积分榜只统计登录账号。
- **积分商城**：积分余额 = 累计获得 − 商城消费。主题（朱砂 / 青瓷 / 夜航）与
  荣誉徽章（青玉 / 流金 / 丹凤）可分别解锁；徽章穿戴后显示在排行榜与个人中心。
  消费会从积分余额中扣除，并同步影响积分榜排名；等级仍按累计获得计算。

## 六、收藏夹

- 练习、背题、随机测试的题目右上角都有星标按钮，点一下即可收藏/取消收藏。
- 首页「收藏夹」横幅和头像菜单「我的收藏」可进入 `/#/favorites`：回看题目与答案，
  或点「刷收藏题」进入只含收藏题目的刷题模式（`/quiz/fav`，不受「跳过已答对」影响）。
- 未登录时保存在本机；登录后自动合并并同步到云端 `favorites` 表，换设备可恢复。
- 收藏夹页支持单题移除和一键清空。

## 七、留言板

- 入口：导航栏「留言板」或 `/#/board`；游客可浏览，登录后可发帖、回复、点赞。
- 发帖：话题（讨论 / 吐槽 / 求助 / 建议），每条最多 300 字，同一账号 30 秒内只能发一条。
- 排版：内置简单 Markdown 编辑器（加粗 / 斜体 / 标题 / 列表 / 引用 / 代码 / 链接）
  与实时预览；渲染结果经 DOMPurify 净化，自动拦截脚本、事件属性与 `javascript:` 链接。
- 互动：一层楼中楼回复，支持点赞并按「最新 / 最热」排序，置顶内容始终靠前。
- 权限：作者可删除自己的留言；管理员可置顶、隐藏、删除任意留言。
- 管理员：默认邮箱 `josiah_bristow@outlook.com`，判定逻辑在 `public.is_admin()`，换人改这一处即可。
- 留言永久保留，隐藏内容仅管理员可见。

## 八、排行榜规则

| 榜单 | 统计口径 |
| --- | --- |
| 总榜 | 综合分排序：答对×10 + 正确率×3 + 最长连对×5 + 活跃天×10 + PK胜×25 |
| 章节榜 | 该章刷过一半以上题目才入榜，按正确率排序 |
| 周榜 | 每周一 0 点（北京时间）重新开始，统计本周答题数 |
| PK 榜 | 按联机对战胜场排序，同胜场看胜率，额外显示当前连胜 |
| 积分榜 | 按积分余额排序，余额 = 答对×10 + PK胜×80 + 活跃天×20 − 商城消费 |

- 正确率按「每道题最近一次作答」计算，同一道题反复刷不会刷高题数。
- 榜单对未登录访客可见；登录后能看到「我的名次」。
- 题库与答案会随静态资源公开（任何静态站点都如此），排名数据由客户端上报，
  适合自习场景，不适合当作严肃考试系统。

---

## 九、项目结构

```
习思想题库更新版/          Word 题库（数据源，构建时解析）
scripts/parse-bank.mjs      docx → JSON 解析与校验
src/
  data/questions.json      解析产物（自动生成，可提交）
  views/                   首页 / 刷题页 / 随机测试 / 联机对战 / 排行榜 / 我的成就 / 留言板 / 收藏夹
  components/              头部、主题切换、登录弹窗
  stores/                  设置、进度（localStorage）、认证
  lib/                     Supabase 客户端、云同步、题库查询
  styles/                  四套主题变量 + 基础样式
supabase/migrations/       数据库初始化 SQL
.github/workflows/         GitHub Pages 自动部署
```

### 数据说明

- 解析失败或有异常时，`npm run parse` 会打印具体章节与题号，便于人工核对 Word 原文。
- 答案从题干末尾的 `（AB）` 提取；个别嵌在题干中间的答案会替换为 `______`。
- 本地进度存在 `localStorage`，登录后自动把记录同步到 `attempts` 表，
  换设备登录会拉取云端历史记录并按 uuid 去重合并。
