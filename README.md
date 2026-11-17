# 习思想题库 · 刷题网站

习近平新时代中国特色社会主义思想题库的在线刷题站：按章练习、背题模式、错题本、四套主题、云端同步与排行榜。

**线上地址**：https://josiahbristow.github.io/xisixiang-quiz/  ·
**仓库**：https://github.com/JosiahBristow/xisixiang-quiz

- **485 道题 / 18 个章节**（单选 249、多选 236），由根目录 Word 题库自动解析生成
- **随机测试**：自选抽题数量，答题时答案全部隐藏，交卷后统一公布并逐题回顾
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
2. 打开 **SQL Editor**，把 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   整段粘贴进去执行。脚本是幂等的，可重复执行，会创建：
   - `profiles`：昵称（注册时自动生成）
   - `attempts`：逐题作答记录（进度 / 错题本 / 排行榜的数据源）
   - 行级安全策略（每个人只能读写自己的作答明细）
   - `lb_total` / `lb_chapter` / `lb_weekly` 三个排行榜函数
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
- 中途离开或刷新页面，本次测试会保留在浏览器会话中，可回来继续答卷。

## 四、排行榜规则

| 榜单 | 统计口径 |
| --- | --- |
| 总榜 | 按去重后的已刷题数排序，数量相同看正确率 |
| 章节榜 | 该章刷过一半以上题目才入榜，按正确率排序 |
| 周榜 | 每周一 0 点（北京时间）重新开始，统计本周答题数 |

- 正确率按「每道题最近一次作答」计算，同一道题反复刷不会刷高题数。
- 榜单对未登录访客可见；登录后能看到「我的名次」。
- 题库与答案会随静态资源公开（任何静态站点都如此），排名数据由客户端上报，
  适合自习场景，不适合当作严肃考试系统。

---

## 五、项目结构

```
习思想题库更新版/          Word 题库（数据源，构建时解析）
scripts/parse-bank.mjs      docx → JSON 解析与校验
src/
  data/questions.json      解析产物（自动生成，可提交）
  views/                   首页 / 刷题页 / 随机测试 / 排行榜
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
