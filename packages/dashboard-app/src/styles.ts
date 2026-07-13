/**
 * 全局样式（内联字符串，CSP 自足——零外部字体/CDN/图片）。设计语言：v8「Trellis 惊艳版」
 * （token 真相源：design-demos/v8-trellis-encore.html :root 三段，2026-07-13 v8-A 换基座；
 *  布局/组件词汇仍沿 v4/v5/v6 各轮真相源注释，色值冲突时以 v8 token 为准）——
 * 冷灰蓝×白软 SaaS 骨架；绿 --green=主操作/确认/品牌（主按钮 --btn-bg 绿实底 --solid-fg 字、
 * 选中行绿 tint + --ring 绿 halo），蓝 --accent=链接/信息/计数/焦点环（蓝 halo 走 --ring-blue）；
 * 红=复核门/回退/错误；紫 --purple-* 与琥珀 --amb-* 为 v8 新语义扩展（agent 活动/中性警示）；
 * --ink/--ink-fg 专用于「brand 块」（深色填充铭牌），v8 无 ink——取 --text 同族近黑蓝对位；
 * mono 仅用于 id/路径/sha/JSON/字段名，其余一律 sans。
 * 深浅色自适应三段式（机制沿用）：
 *   · 默认浅色；@media (prefers-color-scheme: dark) 跟随系统；
 *   · [data-theme="dark"] / [data-theme="light"] 用户显式切换覆盖系统（两向皆胜）。
 */
export const GLOBAL_CSS = `
:root {
  color-scheme: light;
  --bg: #f8f9fc; --card: #ffffff; --fill: #f5f7fa; --fill-2: #eef1f5;
  --border: #e5e8ec; --border-2: #d6dce4;
  --text: #1a2330; --text-2: #46536b; --text-3: #5f6b80;
  --accent: #2563eb; --accent-d: #1d4ed8; --accent-t: #e9effd; --accent-b: #c7d7fa;
  --green: #16a34a; --green-d: #15803d; --green-t: #e9f9ef; --green-b: #c2e9cf;
  --red: #dc2626; --red-d: #b91c1c; --red-t: #fdeded; --red-b: #f5c8c8;
  --purple: #8b5cf6; --purple-d: #6d28d9; --purple-t: #f2edfe; --purple-b: #ded2fb;
  --amb-d: #8a4d10; --amb-t: #f8efdd; --amb-b: #eeddba;
  /* v8 无 ink token——取 --text 同族近黑蓝对位；hover 提亮一档（旧 v4 #0d0d0d→#2e2e2c 同款步进） */
  --ink: #1a2330; --ink-fg: #ffffff; --ink-hover: #2b3648;
  /* v8 主按钮=绿实底（demo .btn.solid-green）；hover 取 green-d（demo 暗一档 brightness(.94) 对位） */
  --btn-bg: #16a34a; --btn-fg: #ffffff; --btn-hover: #15803d;
  --solid-fg: var(--btn-fg); /* 同义引用：--btn-fg 既有=「彩色实底上的前景」，即 demo --solid-fg */
  --code-bg: #f6f8fa; --code-border: #e5e8ec;
  --scrim: rgba(16,24,40,.34);
  --shadow: 0 1px 2px rgba(16,24,40,.04); --shadow-2: 0 1px 3px rgba(16,24,40,.07),0 1px 2px rgba(16,24,40,.04);
  --shadow-3: 0 12px 32px -8px rgba(16,24,40,.16),0 2px 8px rgba(16,24,40,.06);
  --ring: rgba(22,163,74,.10); --ring-blue: rgba(37,99,235,.12);
  --radius: 12px; --radius-sm: 8px;
  --nav-offset: 64px; /* nav 实际高(约 41-45px) + 20px 呼吸——.side-col sticky top 对齐用，改 .nav 高度需同步此值 */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #12161f; --card: #1a202b; --fill: #212836; --fill-2: #273040;
    --border: #2b3342; --border-2: #3b4557;
    --text: #e8ecf3; --text-2: #b4bdcc; --text-3: #8f9aad;
    --accent: #6d9bfb; --accent-d: #9db9fd; --accent-t: rgba(109,155,251,.15); --accent-b: rgba(109,155,251,.42);
    --green: #3ecf77; --green-d: #8fe7b1; --green-t: rgba(62,207,119,.13); --green-b: rgba(62,207,119,.38);
    --red: #ee6b6b; --red-d: #f8a8a8; --red-t: rgba(238,107,107,.14); --red-b: rgba(238,107,107,.42);
    --purple: #a78bfa; --purple-d: #c8b4fd; --purple-t: rgba(167,139,250,.15); --purple-b: rgba(167,139,250,.42);
    --amb-d: #e8b06a; --amb-t: rgba(224,164,88,.13); --amb-b: rgba(224,164,88,.40);
    --ink: #e8ecf3; --ink-fg: #0c111c; --ink-hover: #c9d2e0;
    /* 暗态实底前景=近黑蓝（demo --solid-fg #0c111c）；hover 提亮（demo brightness(1.08) 对位） */
    --btn-bg: #3ecf77; --btn-fg: #0c111c; --btn-hover: #5fdd90;
    --solid-fg: var(--btn-fg);
    --code-bg: #10151f; --code-border: #28303f;
    --scrim: rgba(0,0,0,.55);
    --shadow: 0 1px 2px rgba(0,0,0,.35); --shadow-2: 0 2px 6px rgba(0,0,0,.35);
    --shadow-3: 0 16px 40px -8px rgba(0,0,0,.55);
    --ring: rgba(62,207,119,.14); --ring-blue: rgba(109,155,251,.16);
  }
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #f8f9fc; --card: #ffffff; --fill: #f5f7fa; --fill-2: #eef1f5;
  --border: #e5e8ec; --border-2: #d6dce4;
  --text: #1a2330; --text-2: #46536b; --text-3: #5f6b80;
  --accent: #2563eb; --accent-d: #1d4ed8; --accent-t: #e9effd; --accent-b: #c7d7fa;
  --green: #16a34a; --green-d: #15803d; --green-t: #e9f9ef; --green-b: #c2e9cf;
  --red: #dc2626; --red-d: #b91c1c; --red-t: #fdeded; --red-b: #f5c8c8;
  --purple: #8b5cf6; --purple-d: #6d28d9; --purple-t: #f2edfe; --purple-b: #ded2fb;
  --amb-d: #8a4d10; --amb-t: #f8efdd; --amb-b: #eeddba;
  --ink: #1a2330; --ink-fg: #ffffff; --ink-hover: #2b3648;
  --btn-bg: #16a34a; --btn-fg: #ffffff; --btn-hover: #15803d;
  --solid-fg: var(--btn-fg);
  --code-bg: #f6f8fa; --code-border: #e5e8ec;
  --scrim: rgba(16,24,40,.34);
  --shadow: 0 1px 2px rgba(16,24,40,.04); --shadow-2: 0 1px 3px rgba(16,24,40,.07),0 1px 2px rgba(16,24,40,.04);
  --shadow-3: 0 12px 32px -8px rgba(16,24,40,.16),0 2px 8px rgba(16,24,40,.06);
  --ring: rgba(22,163,74,.10); --ring-blue: rgba(37,99,235,.12);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #12161f; --card: #1a202b; --fill: #212836; --fill-2: #273040;
  --border: #2b3342; --border-2: #3b4557;
  --text: #e8ecf3; --text-2: #b4bdcc; --text-3: #8f9aad;
  --accent: #6d9bfb; --accent-d: #9db9fd; --accent-t: rgba(109,155,251,.15); --accent-b: rgba(109,155,251,.42);
  --green: #3ecf77; --green-d: #8fe7b1; --green-t: rgba(62,207,119,.13); --green-b: rgba(62,207,119,.38);
  --red: #ee6b6b; --red-d: #f8a8a8; --red-t: rgba(238,107,107,.14); --red-b: rgba(238,107,107,.42);
  --purple: #a78bfa; --purple-d: #c8b4fd; --purple-t: rgba(167,139,250,.15); --purple-b: rgba(167,139,250,.42);
  --amb-d: #e8b06a; --amb-t: rgba(224,164,88,.13); --amb-b: rgba(224,164,88,.40);
  --ink: #e8ecf3; --ink-fg: #0c111c; --ink-hover: #c9d2e0;
  --btn-bg: #3ecf77; --btn-fg: #0c111c; --btn-hover: #5fdd90;
  --solid-fg: var(--btn-fg);
  --code-bg: #10151f; --code-border: #28303f;
  --scrim: rgba(0,0,0,.55);
  --shadow: 0 1px 2px rgba(0,0,0,.35); --shadow-2: 0 2px 6px rgba(0,0,0,.35);
  --shadow-3: 0 16px 40px -8px rgba(0,0,0,.55);
  --ring: rgba(62,207,119,.14); --ring-blue: rgba(109,155,251,.16);
}
* { box-sizing: border-box; }
body { margin: 0; }
.app { min-height: 100vh; background: var(--bg); color: var(--text-2); font-family: var(--font); font-size: 13px; line-height: 1.45; display: flex; flex-direction: column; }
.main { flex: 1; padding: 20px; max-width: 1200px; width: 100%; margin: 0 auto; }

/* ── 导航 ── */
/* 改 nav 高度需同步 --nav-offset（:root 变量，供 .side-col sticky top 对齐，见下方 .side-col 规则）。 */
.nav { display: flex; align-items: center; gap: 18px; padding: 10px 20px; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.nav__brand { display: flex; align-items: center; gap: 9px; font-weight: 700; color: var(--text); font-size: 14px; white-space: nowrap; }
.nav__brand-mark { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--ink); color: var(--ink-fg); }
.nav__primary { display: flex; gap: 2px; }
.nav__item { position: relative; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 7px; cursor: pointer; transition: color .14s ease, background .14s ease; }
.nav__item:hover { color: var(--text); }
.nav__item--active { background: var(--accent-t); color: var(--accent); font-weight: 700; }
.nav__badge { display: inline-block; margin-left: 6px; min-width: 17px; padding: 0 5px; height: 17px; line-height: 17px; text-align: center; font-size: 10.5px; font-weight: 700; font-family: var(--mono); color: var(--red-d); background: var(--red-t); border: 1px solid var(--red-b); border-radius: 9px; }
.nav__project { position: relative; }
.nav__project-btn { border: 1px solid var(--border); background: transparent; color: var(--text-2); font: inherit; font-size: 12.5px; font-family: var(--mono); padding: 4px 10px; border-radius: 7px; cursor: pointer; transition: border-color .14s ease; }
.nav__project-btn:hover { border-color: var(--text-3); }
.nav__project-label { font-size: 12.5px; font-family: var(--mono); color: var(--text-2); padding: 4px 2px; }
.nav__tools { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nav__tool { border: 1px solid var(--border); background: transparent; color: var(--text-2); border-radius: 7px; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 12.5px; transition: border-color .14s ease, color .14s ease; }
.nav__tool:hover { border-color: var(--text-3); color: var(--text); }
.nav__tool--icon { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; background: var(--card); box-shadow: var(--shadow); border-radius: var(--radius-sm); }
.nav__tool--icon:hover { background: var(--fill); border-color: var(--border); color: var(--text); }
.nav__conn { color: var(--text-3); font-size: 10px; }
.nav__conn--on { color: var(--green); }

/* ── 断线横幅（App 层，视图无关；评审 P2-13）── */
.offline-banner { display: flex; align-items: center; gap: 10px; padding: 8px 20px; background: var(--red-t); color: var(--red-d); font-size: 12.5px; font-weight: 600; border-bottom: 1px solid var(--red-b); }
.offline-banner__msg { flex: 1; }
.offline-banner__btn { border: 1px solid var(--red-b); background: transparent; color: var(--red-d); border-radius: 7px; padding: 4px 11px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; transition: background .14s ease; }
.offline-banner__btn:hover { background: var(--red-t); }

/* ── 视图头 / 提示 ── */
.view__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view__title { margin: 0; font-size: 18px; color: var(--text); }
.view__subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--text-3); }
.view__note { padding: 20px; color: var(--text-3); font-size: 13px; }
.view__note--error { color: var(--red); }

/* ── 双列视图骨架：主列 + 右侧 sticky 摘要栏（Task 17，spec §3；视觉基准
   v4-openai-trellis.html 的 .grid/.colR/.card/.sum-row/.file-row/.proj-row/.code，本文件
   按既有 BEM 词汇重命名为 .view-split/.side-col/.side-card*）。宽度收窄到 280px——v4 的
   356px 是给它自己更宽的 1400px 容器算的，本应用 .main 的 max-width:1200px 用不上那么宽。
   窄屏（≤720px，同文件末尾既有断点）右栏下沉到主列下方、撤销 sticky，见文件末尾
   @media (max-width: 720px) 块。既有视图内容（inbox__list 等）
   原样作为 .view-split__main 的子节点，不改自身结构。── */
.view-split { display: flex; align-items: flex-start; gap: 20px; }
.view-split__main { flex: 1; min-width: 0; }
.side-col { flex: 0 0 280px; width: 280px; display: flex; flex-direction: column; gap: 16px; position: sticky; top: var(--nav-offset); }
.side-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.side-card__head { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--border); color: var(--text-3); }
.side-card__head b { font-size: 13px; font-weight: 700; color: var(--text); }
.side-card__head-action { margin-left: auto; }
.side-card__body { padding: 2px 14px 4px; }
/* 摘要行 / 项目行共用：图标 + label + 右侧蓝 mono 计数（v4 .sum-row/.proj-row 合流）。 */
.side-card__row { display: flex; align-items: center; gap: 9px; padding: 9px 0; font-size: 12.5px; color: var(--text-2); }
.side-card__row + .side-card__row { border-top: 1px solid var(--border); }
.side-card__row-label { flex: 1; min-width: 0; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-card__row-value { font-family: var(--mono); font-size: 14px; font-weight: 750; color: var(--accent-d); flex: none; }

/* ── 空态（教学式 onboarding 复用同族）── */
.empty { max-width: 460px; margin: 8vh auto; text-align: center; padding: 30px 32px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
.empty__mark { width: 42px; height: 42px; border-radius: var(--radius); background: var(--ink); color: var(--ink-fg); font-size: 20px; line-height: 42px; margin: 0 auto 14px; font-weight: 700; }
.empty__title { margin: 0 0 8px; font-size: 17px; color: var(--text); }
.empty__desc { margin: 0 0 18px; font-size: 12.5px; color: var(--text-3); line-height: 1.7; }

/* ── 卡片基元 ── */
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px 14px; transition: border-color .14s ease, box-shadow .14s ease; }
.card__track { font-size: 10.5px; color: var(--text-3); background: var(--fill); border-radius: 4px; padding: 1px 6px; }

/* ── 徽章语义（spec §1：gate 徽章=red-t 底 red-d 字 tint；phase 胶囊=中性 fill；运行=透明底绿字）── */
.badge { display: inline-block; font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
.badge--gate { background: var(--red-t); color: var(--red-d); }
.badge--pending { background: var(--fill); color: var(--text-3); }
.badge--run { background: transparent; color: var(--green); padding-left: 0; }
.g-phase { display: inline-block; font-family: var(--mono); font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--fill); color: var(--text); border: 1px solid var(--border); white-space: nowrap; }

/* T18 死 CSS 清理登记：.board__*（含 board-col-shake keyframes 与两处 media query 分支）
   随 BoardView 退役删除——全仓 tsx 零消费。 */
/* T18 死 CSS 清理登记：.settings__* 4 条随 SettingsView 退役删除——全仓 tsx 零消费。 */

/* ── 技能穿梭框（设置 · 矩阵单元编辑，评审 P1-10 后半，Task 16）：双栏 available/chosen +
   搜索框，此前 .modal / .split 零 CSS 规则裸渲染在此收口。宽度受 Dialog 固定
   width:min(420px,92%) 约束（Dialog 不接受宽度覆盖），条目用省略号防溢出、title 属性兜底
   全名。条目点击即移动为主交互，拖拽保留为增强——不另设选中态类之外的强调色，直接靠
   .transfer__item--chosen 修饰符区分已选条目。 ── */
.transfer__search { display: block; width: 100%; margin: 4px 0 0; font: inherit; font-size: 12.5px; color: var(--text); background: var(--fill); border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px; transition: border-color .14s ease, box-shadow .14s ease; }
.transfer__search::placeholder { color: var(--text-3); }
.transfer__search:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring-blue); }
.transfer { display: flex; gap: 10px; margin-top: 10px; }
.transfer__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; height: 220px; overflow-y: auto; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px; }
.transfer__item { display: block; width: 100%; text-align: left; font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text-2); background: var(--fill); border: 1px solid transparent; border-radius: 6px; padding: 6px 9px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: border-color .14s ease, background .14s ease, color .14s ease; }
.transfer__item:hover { border-color: var(--accent-b); background: var(--accent-t); color: var(--accent-d); }
.transfer__item--chosen { background: var(--accent-t); color: var(--accent-d); }
.transfer__item--chosen:hover { border-color: var(--red-b); background: var(--red-t); color: var(--red-d); }
.transfer__error { margin: 0; padding: 6px 2px; font-size: 11.5px; color: var(--red); font-weight: 600; }

/* ── 页脚 / Advanced ── */
.footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }
.footer__ver { margin-left: auto; font-size: 11.5px; color: var(--text-3); font-family: var(--mono); }
.advanced { flex: 1; }
.advanced__summary { cursor: pointer; font-size: 12.5px; color: var(--text-3); font-weight: 600; }
.advanced__summary:hover { color: var(--text); }
.advanced__body { padding: 12px 0 0; }
.advanced__desc { font-size: 12px; color: var(--text-3); margin: 0 0 10px; }
.advanced__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.advanced__item { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
.advanced__name { color: var(--text-2); min-width: 130px; }
.advanced__when { color: var(--text-3); font-size: 12px; }

/* ── 按钮家族 ── */
.btn { border: 0; background: var(--btn-bg); color: var(--btn-fg); border-radius: var(--radius-sm); padding: 8px 16px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: filter .14s ease, background .14s ease; }
.btn:hover { filter: none; background: var(--btn-hover); }
.btn--ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); font-weight: 600; }
.btn--ghost:hover { filter: none; border-color: var(--text-3); color: var(--text); }
.btn--danger { background: transparent; color: var(--red-d); border: 1px solid var(--red-b); }
.btn--danger:hover { filter: none; background: var(--red-t); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--icon { background: transparent; border: 1px solid transparent; color: var(--text-3); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; transition: color .14s ease, border-color .14s ease, background .14s ease; }
.btn--icon:hover { color: var(--red); border-color: var(--border); background: var(--fill); }

/* ── 对话框 / toast ── */
.dialog__backdrop { position: fixed; inset: 0; background: rgba(12,20,14,.38); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; width: min(420px, 92%); box-shadow: var(--shadow-2); }
.dialog__title { margin: 0 0 6px; font-size: 15px; color: var(--text); font-weight: 700; }
.dialog__desc { margin: 0 0 16px; font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

/* 底部居中胶囊（v4 #toast 忠实还原，spec §2 组件语言表 toast 行）：
   成功=--ink/--ink-fg 中性深底白字，错误=--red 底白字；z-index 60 高于 .dialog__backdrop(50)。
   入场动效由 App.tsx 挂载时调用 shared/motion.ts 的 toastIn()（y 14→0 + fade）承担，此处不重复定义。 */
.flash {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 7px; max-width: 70vw;
  padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  box-shadow: var(--shadow-2); pointer-events: none; z-index: 60;
}
.flash--toast { background: var(--ink); color: var(--ink-fg); }
.flash--error { background: var(--red); color: #ffffff; }

/* ── 表单控件（含错误态语义）── */
.input, .select {
  font: inherit; font-size: 12.5px; color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.input::placeholder { color: var(--text-3); }
.input:focus-visible, .select:focus-visible { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-t); }
.input--error { border-color: var(--red); }
.input--error:focus-visible { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-t); }
.select { cursor: pointer; }
.field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--text-2); font-weight: 600; }
.field .input, .field .select { font-weight: 400; }
.field__label { font-size: 10.5px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: .03em; }
:root[data-theme="dark"] .field__label { color: var(--green); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .field__label { color: var(--green); } }
.field__error { font-size: 11px; color: var(--red); font-weight: 600; }

/* ── tap 流量查看器（Advanced 折叠面板内）── */
.traffic { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.traffic__note { margin: 0; font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.traffic__loading { margin: 0; font-size: 12px; color: var(--text-3); }
.traffic__empty { margin: 0; font-size: 12px; color: var(--text-3); opacity: .75; }
.traffic__error { margin: 0; font-size: 11.5px; color: var(--red); font-weight: 600; }
.traffic__sessions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.traffic__session-btn { display: flex; align-items: center; gap: 10px; width: 100%; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 10px; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color .14s ease; }
.traffic__session-btn:hover { border-color: var(--green); }
.traffic__session-btn.is-selected { border: 1.5px solid var(--green); box-shadow: 0 0 0 3px var(--green-t); }
.traffic__client { font-family: var(--mono); font-weight: 600; color: var(--text); font-size: 12px; }
.traffic__count { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.traffic__status { margin-left: auto; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--fill); color: var(--text-3); }
.traffic__status--active { background: var(--green-t); color: var(--green); }
.traffic__records { margin: 0; padding: 10px 12px 10px 32px; background: var(--fill); border: 1px dashed var(--border); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 11px; line-height: 1.7; color: var(--text-2); overflow-x: auto; }
.traffic__record { white-space: nowrap; }

/* T18 死 CSS 清理登记：.afk-* 全组（含 dark 主题双写与窄屏 media query）随 AfkWorkbench
   退役删除——全仓 tsx 零消费。 */

/* 死 CSS 清理登记（观察项⑤）：2026-07-10 trellis Task 13 LoopsPanel 的 .loop-* 治理面板整组
   （.loop-row/.loop-line/.loop-caret/.loop-level(__tag)/.loop-ready/.loop-detail/.loop-band/
   .loop-budget(__track/__fill/__fill--warn/__label/__label--none)/.loop-dims/.loop-dim(__mark/
   --pass/--fail)/.loop-tripped）随该组件在 v5 T18 随 loops/ 目录退役而删除——全 src 逐类零引用
   复核。唯一存活的是 .loop-reject（LoopCard.tsx 在用），保留于此。 */
/* .loop-reject：LoopCard 级别制裁/保存 POST 拒绝的错误反馈块（同色底、语义=错误，非"解释"）。 */
.loop-reject { margin: 0; padding: 8px 11px; border-radius: 7px; background: var(--red-t); color: var(--red); font-size: 11.5px; font-weight: 600; }

/* ── 工作台（T12 骨架，wb- 区块）：线性 stepper 阶段卡 + 右栏摘要/流程预览/预演。
   交互真相源 design-demos/v5-progress-workbench.html workbench 段（六轮验收定稿）；视觉 token
   沿 v4 不变（全部走既有变量，无新原色）。右栏复用既有 .view-split/.side-col 骨架（Task 17
   先例 280px——v5 demo 的 356px 是它自己 1400px 容器的取值，本应用 .main max-width:1200px）。
   阶段编辑区（T13）/技能链（T14）/Hook 时序线（T15）/Loop 卡（T16）后续在 .wb-editor 卡内挂载。 ── */
.wb-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.wb-wf { position: relative; }
.wb-wf-btn { display: inline-flex; align-items: center; gap: 9px; height: 36px; padding: 0 13px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow); font: inherit; color: inherit; cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.wb-wf-btn:hover { border-color: var(--border-2); background: var(--fill); }
.wb-wf-k { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--text-3); font-family: var(--mono); }
.wb-wf-name { font-size: 13px; font-weight: 700; color: var(--text); font-family: var(--mono); }
.wb-wf-sub { font-size: 12px; color: var(--text-3); }
.wb-chev { font-size: 10px; color: var(--text-3); }
.wb-wf-menu { position: absolute; left: 0; top: calc(100% + 6px); min-width: 238px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-2); padding: 6px; z-index: 40; }
.wb-wf-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; background: transparent; border-radius: var(--radius-sm); font: inherit; font-size: 13px; font-family: var(--mono); color: var(--text-2); text-align: left; cursor: pointer; transition: background .12s ease; }
.wb-wf-item:hover { background: var(--fill); }
.wb-wf-item.on { background: var(--fill-2); color: var(--text); font-weight: 600; }
.wb-wf-item .n { margin-left: auto; font-size: 12px; color: var(--text-3); font-family: var(--font); }
/* stepper 底轨 */
.wb-rail { background: var(--fill); border-radius: 16px; padding: 11px; margin-bottom: 16px; }
.wb-step-gate { margin-left: auto; }
.wb-skc { display: inline-block; max-width: 124px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border-radius: 6px; background: var(--fill); border: 1px solid var(--border); font-size: 11px; color: var(--text-2); font-family: var(--mono); }
.wb-skc-n { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
/* 阶段编辑卡（T13，StepEditor）：基本/产出物分区表单。对照 demo 的 wb- 编辑区块
   （wb-basic/wb-input/wb-switchrow/wb-chips），全部走既有 token。 */
.wb-editor-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.wb-editor-head b { font-size: 13px; color: var(--text); }
.wb-ed-note { font-size: 12px; color: var(--text-3); font-weight: 400; margin-left: auto; }
.wb-ed-ro { margin: 10px 0 0; padding: 8px 11px; background: var(--fill); border-radius: var(--radius-sm); }
.wb-ed-sec { padding: 14px 0 4px; }
.wb-ed-sec + .wb-ed-sec { margin-top: 12px; border-top: 1px solid var(--border); }
.wb-ed-sec-h { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.wb-ed-sec-h .hint { font-size: 12px; font-weight: 400; color: var(--text-3); }
.wb-basic { display: grid; grid-template-columns: 230px 170px minmax(0, 1fr); gap: 14px; }
@media (max-width: 720px) { .wb-basic { grid-template-columns: 1fr; } }
.wb-flabel { display: block; font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 5px; }
.wb-input { width: 100%; height: 34px; padding: 0 11px; border-radius: 9px; border: 1px solid var(--border); background: var(--card); font: inherit; font-size: 13.5px; color: var(--text); transition: border-color .12s ease, box-shadow .12s ease; }
.wb-input:hover { border-color: var(--border-2); }
.wb-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring-blue); }
.wb-input:disabled { background: var(--fill); color: var(--text-3); cursor: not-allowed; }
.wb-input--ro { display: flex; align-items: center; background: var(--fill); color: var(--text-2); font-family: var(--mono); }
.wb-switchrow { display: flex; align-items: center; gap: 9px; }
.wb-swlabel { font-size: 13px; font-weight: 600; }
.wb-note { font-size: 12px; color: var(--text-3); line-height: 1.55; }
.wb-sec-note { margin-top: 10px; }
.wb-tail-note { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
/* 开关（demo .switch 同款，34×20 胶囊 + 位移圆钮；开=accent） */
.switch { position: relative; width: 34px; height: 20px; border-radius: 999px; background: var(--fill-2); border: 1px solid var(--border-2); cursor: pointer; flex: none; transition: background .15s ease, border-color .15s ease; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 999px; background: var(--card); box-shadow: var(--shadow-2); transition: transform .15s ease; }
.switch[aria-checked="true"] { background: var(--accent); border-color: var(--accent); }
.switch[aria-checked="true"]::after { transform: translateX(14px); }
.switch:disabled { opacity: .55; cursor: not-allowed; }
/* 产出物 chips：字段 chip + × 移除 + 「+ 添加」就地输入 */
.wb-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.wb-empty { font-size: 12.5px; color: var(--text-3); }
.wb-chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--border); background: var(--fill); font-size: 12px; color: var(--text-2); font-family: var(--mono); }
.wb-x { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-right: -3px; padding: 0; border: 0; background: transparent; border-radius: 5px; color: var(--text-3); font-size: 13px; line-height: 1; cursor: pointer; transition: background .12s ease, color .12s ease; }
.wb-x:hover { background: var(--red-t); color: var(--red-d); }
.wb-addchip { height: 24px; padding: 0 9px; border-radius: 7px; border: 1px dashed var(--border-2); background: transparent; color: var(--text-3); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease; }
.wb-addchip:hover { background: var(--fill); color: var(--text-2); }
.wb-chip-in { width: 180px; height: 26px; font-size: 12px; font-family: var(--mono); }
.wb-ed-adderr { margin: 6px 0 0; }
/* 工具条右侧：状态 pill 家族（沿旧画布编辑器状态 pill 的既有语义：脏=中性虚线、成功=绿、失败=红、只读=灰） */
.wb-spacer { flex: 1; }
.wb-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.wb-status--dirty { background: var(--fill); color: var(--text-2); border: 1px dashed var(--border-2); }
.wb-status--ok { background: var(--green-t); color: var(--green); }
.wb-status--error { background: var(--red-t); color: var(--red); }
.wb-status--ro { background: var(--fill-2); color: var(--text-3); }
/* kernel validate 错误原文列表（保存失败时挂在工具条下方，就近呈现不打断编辑） */
.wb-save-errors { margin: 0 0 14px; padding: 10px 12px; list-style: none; border: 1px solid var(--red-b); background: var(--red-t); border-radius: var(--radius-sm); }
.wb-save-errors li { font-size: 12.5px; color: var(--red-d); line-height: 1.6; font-family: var(--mono); }
/* 右栏流程预览 + 预演 */
/* ── v6 T13：最近流转卡(真实 history 回放;假预演 wb-pv-*/wb-play 已退役) ── */
.wb-rt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.wb-rt-item { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 12px; line-height: 1.45; }
.wb-rt-ts { flex: none; font-size: 10.5px; color: var(--text-3); }
.wb-rt-chg { flex: none; font-size: 11px; color: var(--text-2); }
.wb-rt-what { color: var(--text); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
@media (max-width: 720px) {
  .main { padding: 14px; }
  /* Task 17：右栏窄屏下沉到主列下方，撤销 sticky（没有横向空间放 280px 侧栏了）。 */
  .view-split { flex-direction: column; } .side-col { width: 100%; flex: none; position: static; }
}

/* ==== T10 ==== */
/* ── 进度视图（prg- 区块）：分组卡 + chevron 箭头带 + 筛选条 + 调度器健康灯。
   对照 design-demos/v5-progress-workbench.html 进度段；token 全走既有变量。
   busy 黄 = 红绿 token 在 oklch 空间取中派生（决议 #9 不引入新原色）——双写兜底：
   不支持 color-mix 的内核回落第一行 var(--red)。 ── */
.prg-doctor { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 999px; background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow); font-size: 12px; font-weight: 600; color: var(--text-2); white-space: nowrap; }
.prg-doctor__d { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.prg-doctor__d--ok { background: var(--green); }
.prg-doctor__d--busy { background: var(--red); background: color-mix(in oklch, var(--red) 52%, var(--green)); }
.prg-doctor__d--attention { background: var(--red); }
/* 加载/错误提示行（骨架期轻量文本，不抢分组卡视觉） */
.prg-note { margin: 0 0 12px; font-size: 12.5px; color: var(--text-3); }
.prg-note--error { color: var(--red-d); }
@keyframes prg-blink { 50% { opacity: .3; } }
/* 空态 + 底部说明 */
.prg-empty { padding: 26px 16px; text-align: center; font-size: 12.5px; color: var(--text-3); border: 1px dashed var(--border-2); border-radius: var(--radius); margin-bottom: 18px; }
.prg-foot { margin-top: 14px; font-size: 12.5px; color: var(--text-3); }
/* ==== T8 共享任务详情（TaskDetail：dt- 卡骨架 + dtl- 垂直时间线）——视觉基准
   design-demos/v5-progress-workbench.html 收件箱右卡；全部走既有 token，无新原色。
   节点语义分工沿 spec §1：绿=完成、蓝 accent=当前（带 ring）、红=失败、空心=未开始。 ==== */
.dt { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0 16px; }
.dt-head { display: flex; align-items: center; gap: 9px; padding: 13px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.dt-name { font-family: var(--mono); font-size: 13.5px; font-weight: 700; color: var(--text); }
.dt-sp { flex: 1; }
.dt-close { margin-left: 0; }
.dt-sec { padding: 13px 0; border-bottom: 1px solid var(--border); }
.dt-sec:last-of-type { border-bottom: none; }
.dt-sec-h { display: flex; align-items: baseline; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
.dt-hint { font-size: 12px; font-weight: 400; color: var(--text-3); }
.dt-req { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.6; }
/* 垂直时间线（dtl-）：左轨 2px 竖线 + 16px 节点圆 */
.dtl-it { position: relative; padding: 0 0 12px 24px; }
.dtl-it:last-child { padding-bottom: 0; }
.dtl-it::before { content: ""; position: absolute; left: 7px; top: 18px; bottom: -2px; width: 2px; background: var(--border); border-radius: 2px; }
.dtl-it--done::before { background: var(--green-b); }
.dtl-it:last-child::before { display: none; }
.dtl-node { position: absolute; left: 0; top: 2px; width: 16px; height: 16px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 700; line-height: 1; }
.dtl-node--done { background: var(--green); color: var(--btn-fg); }
.dtl-node--cur { background: var(--btn-bg); box-shadow: 0 0 0 3px var(--ring); }
.dtl-node--fail { background: var(--red); color: var(--btn-fg); font-size: 10px; }
.dtl-node--todo { background: var(--card); border: 2px solid var(--border-2); }
.dtl-r { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 22px; }
.dtl-name { font-size: 13px; font-weight: 500; color: var(--text); }
.dtl-it--cur .dtl-name, .dtl-it--fail .dtl-name { font-weight: 600; }
.dtl-it--fail .dtl-name { color: var(--red-d); }
.dtl-it--todo .dtl-name { font-weight: 400; color: var(--text-3); }
.dtl-dim { font-size: 12px; color: var(--text-3); }
/* 行内产物 chip：实值可拷贝（mono），未产出虚线占位 */
.dtl-chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; border-radius: 7px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 11.5px; font-family: var(--mono); color: var(--text-2); cursor: pointer; transition: background .12s ease, border-color .12s ease, color .12s ease; }
.dtl-chip:hover { background: var(--fill-2); border-color: var(--border-2); color: var(--text); }
.dtl-chip .cp { color: var(--text-3); font-size: 11px; }
.dtl-chip--ro { cursor: default; }
.dtl-chip--ro:hover { background: var(--fill); border-color: var(--border); color: var(--text-2); }
.dtl-chip--empty { display: inline-flex; align-items: center; height: 22px; padding: 0 7px; border-radius: 7px; border: 1px dashed var(--border-2); background: transparent; font-size: 11.5px; font-family: var(--mono); color: var(--text-3); }
/* 当前/失败行下的高亮框：结论行 + 字段格栅 */
.dtl-box { margin-top: 8px; padding: 10px 11px; background: var(--accent-t); border: 1px solid var(--accent-b); border-radius: var(--radius-sm); }
.dtl-box--bad { background: var(--red-t); border-color: var(--red-b); }
.dt-verdict { display: flex; align-items: baseline; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text); margin-bottom: 8px; line-height: 1.5; }
.dt-verdict--bad { color: var(--red-d); }
.dt-verdict .ic { flex: none; }
.dt-verdict .ic--good { color: var(--green); }
.dt-arts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.dt-field { background: var(--card); border: 1px solid var(--border); border-radius: 7px; padding: 5px 8px; min-width: 0; }
.dt-fk { font-size: 10.5px; color: var(--text-3); font-family: var(--mono); overflow-wrap: anywhere; }
.dt-fv { font-size: 12px; color: var(--text); overflow-wrap: anywhere; }
.dt-fv--copy { display: inline; padding: 0; border: 0; background: transparent; font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text); cursor: pointer; text-align: left; transition: color .12s ease; }
.dt-fv--copy:hover { color: var(--accent-d); }
.dt-field--pass .dt-fv { color: var(--green-d); font-weight: 700; }
.dt-field--fail .dt-fv { color: var(--red-d); font-weight: 700; }
.dt-field--miss { background: transparent; border-style: dashed; }
.dt-field--miss .dt-fv { color: var(--text-3); }
.dt-none { margin: 0; font-size: 12px; color: var(--text-3); }
.dt-note { margin: 8px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.55; }
/* 「在终端继续」命令区 */
.dt-code { display: flex; align-items: center; gap: 8px; padding: 8px 11px; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; }
.dt-code .p { color: var(--text-3); }
.dt-code code { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--text); }
.dt-code-copy { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; background: transparent; border-radius: 6px; color: var(--text-3); cursor: pointer; transition: background .12s ease, color .12s ease; }
.dt-code-copy:hover { background: var(--fill-2); color: var(--text); }
/* history 区 */
.dt-hist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; max-height: 180px; overflow-y: auto; }
.dt-hist-it { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.dt-hist-ts { font-family: var(--mono); color: var(--text-3); white-space: nowrap; }
.dt-hist-txt { color: var(--text-2); overflow-wrap: anywhere; }
/* 形态 B（dt-tabs 阶段 sheet，进度行内展开 T11 复用）——demo v5 dt-tabs/dt-pane 对位，全走既有 token */
.dt-tabs { display: flex; align-items: center; gap: 5px; overflow-x: auto; padding: 3px; margin: -3px -3px 9px; }
.dt-tab { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 25px; padding: 0 9px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--fill); border: 1px solid var(--border); color: var(--text-3); cursor: pointer; transition: background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease; }
.dt-tab:hover { background: var(--fill-2); color: var(--text-2); }
.dt-tab .tfx { font-size: 10.5px; line-height: 1; }
.dt-tab--done { color: var(--text-2); }
.dt-tab--done .tfx { color: var(--green); }
.dt-tab--cur, .dt-tab--cur:hover { background: var(--btn-bg); border-color: var(--btn-bg); color: var(--btn-fg); }
.dt-tab--fail, .dt-tab--fail:hover { background: var(--red); border-color: var(--red); color: var(--btn-fg); }
.dt-tab.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring-blue); color: var(--text); }
.dt-tab--cur.on { border-color: var(--btn-bg); color: var(--btn-fg); }
.dt-tab--fail.on { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-t); color: var(--btn-fg); }
.dt-pane[hidden] { display: none; }
.dt-empty { padding: 16px 12px; text-align: center; font-size: 12.5px; color: var(--text-3); border: 1px dashed var(--border-2); border-radius: 10px; }
/* ==== T14 ==== */
/* 技能链区（SkillChain）：依赖链 chips + 添加面板 + default 轨道 tab。
   对照 demo 的 wb-chain / wb-skpanel / wb-tracks 区块，全部走既有 v4 token。 */
.wb-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 7px 0; }
.wb-chain + .wb-chain { border-top: 1px dashed var(--border); }
.wb-chain-k { font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--text-3); margin-right: 4px; flex: none; }
.wb-chain-seg { display: inline-flex; align-items: center; gap: 6px; }
.wb-chip--ghost { opacity: .55; border-style: dashed; }
.wb-sk-actions { display: flex; align-items: center; gap: 8px; padding-top: 9px; }
.wb-sk-err { margin: 8px 0 0; }
.wb-skpanel { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: var(--shadow-2); padding: 12px; }
.wb-skp-h { font-size: 12.5px; font-weight: 700; margin-bottom: 9px; }
.wb-skp-h .hint { font-weight: 400; color: var(--text-3); margin-left: 6px; font-size: 12px; }
.wb-skp-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 11px; }
.wb-skopt { height: 26px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease, box-shadow .12s ease; }
.wb-skopt:hover { border-color: var(--border-2); }
.wb-skopt.on, .wb-skopt.on:hover { border-color: var(--accent); background: var(--accent-t); color: var(--accent-d); box-shadow: 0 0 0 3px var(--ring-blue); }
.wb-skopt:disabled { opacity: .5; cursor: not-allowed; }
.wb-skp-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wb-skp-foot label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); font-weight: 600; }
.wb-skp-dep { width: auto; max-width: 300px; height: 28px; font-size: 12px; font-family: var(--mono); }
/* default 强制技能矩阵的轨道 tab（pm/frontend/backend） */
.wb-tracks { display: flex; gap: 4px; margin-bottom: 10px; }
.wb-track { height: 26px; padding: 0 11px; border: 0; background: transparent; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-3); font-family: var(--mono); cursor: pointer; transition: background .12s ease, color .12s ease; }
.wb-track:hover { background: var(--fill); color: var(--text-2); }
.wb-track.on, .wb-track.on:hover { background: var(--fill-2); color: var(--text); }
.wb-track b { font-weight: 700; color: var(--accent); margin-left: 3px; }
/* ==== T15：Hook 会话时序线（wb-hk 区块）——四时机节点 + 循环弧 + 人话 hook 卡。
   对照 demo v5 的 .wb-hkline/.wb-hknode/.wb-hkloop/.wb-hkstack/.wb-hkcard，全部走既有 token，
   无新原色；循环弧跨第 3-4 列（PreToolUse/PostToolUse 每轮工具调用都重复）。 ==== */
.wb-hk-note { margin: -2px 0 14px; }
.wb-hkline { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 12px; padding-top: 2px; }
.wb-hkline::before { content: ""; position: absolute; left: 5px; right: 14px; top: 10px; height: 2px; border-radius: 2px; background: var(--border-2); }
.wb-hkline::after { content: ""; position: absolute; right: 6px; top: 6px; border-left: 7px solid var(--border-2); border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.wb-hknode { grid-row: 1; position: relative; padding: 22px 0 10px 18px; }
.wb-hknode::before { content: ""; position: absolute; left: 0; top: 5px; width: 12px; height: 12px; border-radius: 999px; background: var(--card); border: 3px solid var(--accent); }
.wb-hk-t { font-size: 13px; font-weight: 700; line-height: 1.2; }
.wb-hk-ev { font-size: 11px; color: var(--text-3); margin-top: 1px; font-family: var(--mono); }
.wb-hkloop { grid-row: 2; grid-column: 3 / 5; position: relative; height: 14px; margin: 0 14px 12px 4px; border: 1.5px dashed var(--border-2); border-bottom: none; border-radius: 10px 10px 0 0; }
.wb-hkloop span { position: absolute; left: 50%; top: -9px; transform: translateX(-50%); background: var(--card); padding: 0 8px; font-size: 11px; color: var(--text-3); white-space: nowrap; }
.wb-hkstack { grid-row: 3; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.wb-hkcard { background: var(--fill); border-radius: 10px; padding: 8px 11px; }
/* 暂不可配（confirm-clear/decision-recorder）：整卡灰显——sh 侧未接线，开关放开就是「设置不起效」。 */
.wb-hkcard--pending { opacity: .6; }
.wb-hkcard-t { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 650; }
.wb-hkcard-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-hkcard-t .switch { margin-left: auto; transform: scale(.85); transform-origin: right center; }
.wb-hkcard-d { font-size: 11.5px; color: var(--text-3); line-height: 1.5; margin-top: 2px; }
.wb-hk-badge { flex: none; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: var(--fill-2); color: var(--text-3); white-space: nowrap; }
/* 强制常开（gate/interactive-skill-gate，决议#2）：红系底与复核门同语义家族——「这里有一道不可撤的门」。 */
.wb-hk-badge--locked { background: var(--red-t); color: var(--red-d); }
@media (max-width: 720px) {
  /* 窄屏时序线退化为纵向清单：一列到底，循环弧与横轨都失去几何意义，直接隐藏。
     节点/卡列位是行内 style（gridColumn），此处 !important 压制（同上方 reduced-motion 先例）。 */
  .wb-hkline { grid-template-columns: 1fr; }
  .wb-hkline::before, .wb-hkline::after, .wb-hkloop { display: none; }
  .wb-hknode, .wb-hkstack { grid-column: 1 !important; grid-row: auto; }
}

/* ── v6 T12：Hook 时序线挪右栏（side-col 280px）——纵排分组取代 4 列横排（交互真相源
   v6-workbench-flow.html 方案 A 右栏；上方 720px 断点的旧退化分支保留兜底）。横轨/箭头
   失去几何意义 → 隐藏；分组左侧竖线延续「时序」隐喻；循环提示改 PreToolUse 组内一行小字。 ── */
.wb-hkline--rail { display: flex; flex-direction: column; gap: 12px; padding-top: 0; }
.wb-hkline--rail::before, .wb-hkline--rail::after { display: none; }
.wb-hkgroup { border-left: 2px solid var(--border-2); padding-left: 10px; }
.wb-hkline--rail .wb-hknode { margin-bottom: 6px; }
.wb-hkline--rail .wb-hkloop { position: static; display: block; margin: 0 0 6px; font-size: 10.5px; color: var(--text-3); }
.wb-hkline--rail .wb-hkstack { display: flex; flex-direction: column; gap: 8px; }

/* ── v6 T10：未安装标注(标注型提示,不拦)——badge 黄从既有 token 派生(同 busy 黄先例,决议#9),
   禁新原色;未安装 chip/条目降饱和示意「本机没有」。 ── */
.wb-chip--uninstalled, .transfer__item--uninstalled, .wb-skopt--uninstalled { opacity: .62; }
.wb-chip-badge { flex: none; margin-left: 4px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; border: none; cursor: pointer; background: color-mix(in oklch, var(--red) 52%, var(--green)); color: var(--card); white-space: nowrap; }
span.wb-chip-badge { cursor: default; }
.wb-sk-banner { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, color-mix(in oklch, var(--red) 52%, var(--green)) 14%, var(--card)); border: 1px solid color-mix(in srgb, color-mix(in oklch, var(--red) 52%, var(--green)) 45%, var(--border)); }

/* ── v6 T9：AFK 就绪三灯——绿=既有 --green,未就绪黄=busy 同款派生(决议#9,禁新原色)。 ── */
.afk-rd { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 2px 0 10px; font-size: 12px; color: var(--text-2); }
.rd-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; }
.rd-dot--ok { background: var(--green); }
.rd-dot--no { background: color-mix(in oklch, var(--red) 52%, var(--green)); }
/* ── G2：docker 灯不可用时的「怎么装」引导——独占一行(flex-basis:100%,同 .afk-rd-caveat 纪律),
   决议 #9：不引新原色,文字色 color-mix 从既有 --text-2 派生更淡的次级语义(随明/暗自适应)。 ── */
.afk-rd-howto { flex-basis: 100%; margin: 0; font-size: 11px; line-height: 1.4; color: color-mix(in srgb, var(--text-2) 82%, transparent); }

/* ── v6 T8：凭证卡行——掩码等宽降饱和;行内编辑态与既有 lp-policy 布局同族。 ── */
.sc-row { flex-wrap: wrap; }
.sc-masked { color: var(--text-2); }
/* ── G2：每键「怎么拿」引导——独占一行(flex-basis:100%),沿用 .wb-note 的 --text-3 次级色,无新原色。 ── */
.sc-howto { flex-basis: 100%; margin: 3px 0 0; font-size: 11.5px; }

/* ==== T16：「自动运行(Loop)」卡（lp- 区块）——对照 demo v5 #wbLoopCard：滑杆轨道 fill-2、
   填充 accent（--p 渐变分界）、推荐 ▽ 刻度、超限策略 pill 单选、自主级别 segmented、
   闸门/终止/范围 chips 行。全部走既有 token，无新原色。 ==== */
.wb-loop { margin-top: 14px; }
.lp-mono { font-family: var(--mono); }
.lp-head { row-gap: 4px; }
.lp-head-sub { flex-basis: 100%; font-size: 12px; color: var(--text-3); font-weight: 400; margin-top: 1px; }
.lp-loopsel { width: auto; height: 26px; padding: 0 8px; font-size: 12px; font-family: var(--mono); }
.lp-errors { margin-top: 12px; }
.lp-row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 12px; }
@media (max-width: 720px) { .lp-row3 { grid-template-columns: 1fr; } }
.lp-eg { font-size: 11.5px; color: var(--text-3); margin: 5px 0 0; }
.lp-eg b { color: var(--text-2); font-weight: 600; }
/* 拖拉条组：align-items:start 防止带说明行（.lp-sld-note）的格子把同排另一格拉伸变高 */
.lp-slds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; align-items: start; }
@media (max-width: 720px) { .lp-slds { grid-template-columns: 1fr; } }
/* 验收反馈②-④：滑杆下的一行说明文案（并发上限/inflight 上限「讲清楚」） */
.lp-sld-note { margin: 4px 0 0; }
.lp-sld-top { display: flex; align-items: baseline; gap: 8px; }
.lp-sld-top .wb-flabel { margin: 0; }
.lp-sld-val { margin-left: auto; font-size: 12.5px; font-weight: 700; color: var(--accent); }
.lp-range { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 16px; margin: 8px 0 0; background: transparent; cursor: pointer; }
.lp-range::-webkit-slider-runnable-track { height: 5px; border-radius: 999px; background: linear-gradient(to right, var(--accent) var(--p, 0%), var(--fill-2) var(--p, 0%)); }
.lp-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -5.5px; border-radius: 999px; background: var(--card); border: 1px solid var(--border-2); box-shadow: var(--shadow-2); }
.lp-range::-moz-range-track { height: 5px; border-radius: 999px; background: var(--fill-2); }
.lp-range::-moz-range-progress { height: 5px; border-radius: 999px; background: var(--accent); }
.lp-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 999px; background: var(--card); border: 1px solid var(--border-2); box-shadow: var(--shadow-2); }
.lp-range:focus-visible { outline: none; }
.lp-range:focus-visible::-webkit-slider-thumb { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring-blue); }
.lp-sld-marks { position: relative; height: 16px; margin-top: 2px; }
.lp-sld-reco { position: absolute; top: 0; transform: translateX(-50%); font-size: 10.5px; color: var(--text-3); white-space: nowrap; }
.lp-sld-reco--edge { transform: none; }
/* 超限策略 pill 单选 */
.lp-policy { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding-top: 12px; border-top: 1px dashed var(--border); flex-wrap: wrap; }
.lp-policy .wb-flabel { margin: 0; }
.lp-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.lp-opt { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease, box-shadow .12s ease; }
.lp-opt:hover { border-color: var(--border-2); }
.lp-opt.on, .lp-opt.on:hover { background: var(--accent-t); border-color: var(--accent); color: var(--accent-d); box-shadow: 0 0 0 3px var(--ring-blue); }
/* 自主级别 segmented */
.lp-lv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 2px 0 4px; }
@media (max-width: 720px) { .lp-lv { grid-template-columns: 1fr; } }
.lp-lv-tile { display: flex; flex-direction: column; gap: 2px; padding: 11px 12px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--fill); text-align: left; font: inherit; cursor: pointer; transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
.lp-lv-tile:hover { border-color: var(--border-2); }
.lp-lv-tile.on, .lp-lv-tile.on:hover { background: var(--accent-t); border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring-blue); }
.lp-lv-tile:disabled { opacity: .6; cursor: not-allowed; }
.lp-lv-k { font-size: 13px; font-weight: 750; }
.lp-lv-tile.on .lp-lv-k { color: var(--accent-d); }
.lp-lv-d { font-size: 11.5px; color: var(--text-3); line-height: 1.45; }
.lp-level-err { margin: 8px 0 0; }
/* 闸门 / 终止条件 / 范围 chips 行 */
.lp-saferow { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: start; padding: 10px 0; }
@media (max-width: 720px) { .lp-saferow { grid-template-columns: 1fr; gap: 6px; } }
.lp-saferow + .lp-saferow { border-top: 1px dashed var(--border); }
.lp-saferow:last-child { padding-bottom: 2px; }
.lp-saferow .wb-flabel { margin: 4px 0 0; }
.lp-chip-d { font-family: var(--font); color: var(--text-3); font-size: 11.5px; }
/* 无 loop 空态：教学文案 + 最小登记示例 */
.lp-empty { padding: 10px 0 4px; }
.lp-empty-t { margin: 0 0 4px; font-size: 13px; font-weight: 700; }
/* ==== T7：Loop 卡审阅面重构（空态终端引导 + 字段生产者徽章 + 三方关系条）——交互真相源
   design-demos/v6-config-copilot.html 方案 A。徽章三色直接指派既有 token（agent=accent 三件套、
   sys=fill-2 中性、human=ink 深底铭牌，同 .lp-lv-tile.on 既定 --ink 用法），
   无新原色、无需 color-mix（决议 #9）。 ==== */
.lp-empty-prompt { margin: 12px 0; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--fill); border: 1px dashed var(--border-2); }
.lp-empty-prompt-q { margin: 0 0 10px; font-size: 12.5px; line-height: 1.65; color: var(--text-2); }
.lp-empty-copy { height: 28px; padding: 0 12px; font-size: 12px; }
.lp-empty-note { margin-top: 8px; }
/* 字段生产者徽章：agent 生成 / 系统推导 / 人拍板 / 预留字段零消费 */
.lp-flabel-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.lp-flabel-row .wb-flabel { margin: 0; }
.lp-prov { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border-radius: 6px; font-size: 10.5px; font-weight: 700; white-space: nowrap; flex: none; }
.lp-prov--agent { background: var(--accent-t); color: var(--accent-d); border: 1px solid var(--accent-b); }
.lp-prov--sys { background: var(--fill-2); color: var(--text-2); }
.lp-prov--human { background: var(--ink); color: var(--ink-fg); }
.lp-prov--reserved { background: transparent; color: var(--text-3); border: 1px dashed var(--border-2); }
.lp-saferow-label { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.lp-saferow-body { min-width: 0; }
.lp-fieldnote { margin-top: 6px; }
/* 三方关系条：root 徽章 + change_prefix→匹配 changes 弹层 + phases→阶段 chips */
.lp-rel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lp-rel-root { font-family: var(--mono); font-size: 12px; font-weight: 700; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--fill-2); border-radius: 7px; padding: 4px 9px; }
.lp-rel-root-note { font-size: 11.5px; color: var(--text-3); }
.lp-rel-arrow { color: var(--text-3); font-size: 13px; }
.lp-rel-match { height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease; }
.lp-rel-match:hover { border-color: var(--accent); background: var(--accent-t); color: var(--accent-d); }
.lp-rel-sep { color: var(--border-2); }
.lp-rel-phases-label { font-size: 12px; font-weight: 600; color: var(--text-3); }
.lp-rel-note { flex-basis: 100%; margin-top: 4px; }
.lp-rel-dialog-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; max-height: 320px; overflow-y: auto; }
/* 无动作行的说明（等 agent / 排队）：dt-foot 按钮位上的纯文本 */
.prg-dfoot-note { font-size: 12.5px; color: var(--text-3); }
/* running 行日志区（当前阶段 pane 尾部，经 TaskDetail curStageExtra 插槽挂载） */
.prg-logwrap { margin-top: 10px; border: 1px solid var(--code-border); border-radius: var(--radius-sm); background: var(--code-bg); overflow: hidden; }
.prg-logbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--code-border); }
.prg-loglabel { font-size: 11px; color: var(--text-3); }
.prg-follow { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
.prg-log { margin: 0; padding: 10px; max-height: 200px; overflow: auto; font-size: 11.5px; line-height: 1.6; color: var(--text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.prg-lognote { margin: 0; padding: 6px 10px; border-top: 1px solid var(--code-border); font-size: 11.5px; color: var(--text-3); }
/* 结论式语义徽章（demo badge--green/--red 对位）：绿=证据齐可前进，红=要人裁决（同 spec §1 家族） */
.badge--green { background: var(--green-t); color: var(--green-d); }
.badge--red { display: inline-flex; align-items: center; gap: 5px; background: var(--red-t); color: var(--red-d); }
.badge--red .dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; flex: none; animation: prg-blink 1.3s ease-in-out infinite; }
/* ============================================================
   v6 计划 T11：StepperRail 重写为「流程带」——门徽章 popover + 真实计数气泡 + running 脉冲。
   docs/superpowers/plans/2026-07-11-v6-recommended-implementation.md §T11（不要与本文件其它
   命名空间里孤立出现的「T11」注释混淆——如上面进度视图 dt-tabs 复用那段，那是上一轮 v5 计划
   的编号，跟本轮 v6 计划的 T1-T13 是两套体系）。
   几何沿用本仓已有 .prg-seg（进度视图箭头带，见上方 T10 区块）的 clip-path 卡榫写法，非抄
   design-demos/v6-workbench-flow.html 像素；旧 .wb-step*（卡片式）规则保留不删——本轮只新增
   独立区块，热点文件合并纪律（append-only）不touch其它任务的既有行，旧规则随 T12/T13 后续
   任务收尾时再评估是否清理。颜色一律复用既有 token；running 脉冲光泽沿用 .prg-gloss 的
   color-mix 派生公式（决议 #9，禁新硬编码原色）。
   ============================================================ */
.wb-flow-count {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: var(--fill-2); color: var(--text-2); font-size: 10.5px; font-weight: 800; font-family: var(--mono);
}
.wb-flow-gatewrap { position: relative; display: inline-flex; }
.wb-flow-gate { cursor: pointer; }
.wb-flow-gate:hover, .wb-flow-gate:focus-visible { background: var(--red-b); }
.wb-flow-gatepop {
  position: absolute; top: calc(100% + 6px); right: 0; width: 240px; z-index: 6; text-align: left;
  background: var(--card); border: 1px solid var(--border); border-radius: 11px; box-shadow: var(--shadow-2);
  padding: 10px 12px;
}
.wb-flow-gatepop-t { font-size: 11.5px; font-weight: 700; margin: 0 0 6px; color: var(--text-2); }
.wb-flow-gatepop-row { margin: 0; font-size: 11.5px; color: var(--text-2); line-height: 1.55; }
.wb-flow-gatepop-row + .wb-flow-gatepop-row { margin-top: 5px; }
.wb-flow-gatepop-row b { display: block; color: var(--text); font-weight: 650; }

/* 观察项②：runner 非标准值软校验警告——复用 .wb-note 基底，仅覆写为「警示」色调（决议#9：
   新色一律 color-mix 从既有 token 派生，不硬编码原色）。纯提示语义，无背景块/边框，区别于
   .loop-reject（POST 拒绝的错误块）。 */
.lp-runner-warn { margin: 5px 0 0; color: color-mix(in srgb, var(--red) 68%, var(--text-2)); }

/* ── loop-init L5：草稿审阅（徽章 + 批准/驳回动作行）。决议 #9：新色一律 color-mix 从既有 token
   派生，不硬编码原色——徽章蓝派生自 --accent，批准/驳回钮绿/红派生自 --green/--red（均既有语义
   色）。徽章底座复用 .badge、动作钮底座复用 .btn（本段仅覆写配色，源序在后取胜）；与 .loop-reject
   错误反馈条同一「从 token 派生」纪律。全部 token 皆有明/暗两套，color-mix 随主题自适应。 ── */
.lp-draft-badge { background: color-mix(in srgb, var(--accent) 14%, var(--card)); color: var(--accent-d); }
.lp-draft-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.lp-draft-approve { background: color-mix(in srgb, var(--green) 13%, var(--card)); border: 1px solid color-mix(in srgb, var(--green) 32%, var(--border)); color: var(--green-d); }
.lp-draft-approve:hover { background: color-mix(in srgb, var(--green) 20%, var(--card)); border-color: var(--green); }
.lp-draft-reject { background: color-mix(in srgb, var(--red) 12%, var(--card)); border: 1px solid color-mix(in srgb, var(--red) 30%, var(--border)); color: var(--red-d); }
.lp-draft-reject:hover { background: color-mix(in srgb, var(--red) 18%, var(--card)); border-color: var(--red); }
.lp-draft-err { flex-basis: 100%; margin: 2px 0 0; }

/* ── full-install W1：凭证 per-runner 双灯的诚实 caveat——凭证灯为服务进程视角,终端 doctor 为准(P1-F2)。
   决议 #9：不硬编码新原色——文字色 color-mix 从既有 --text-2 派生更淡的次级语义(随明/暗自适应);
   flex-basis:100% 令 caveat 在 .afk-rd 弹性行里独占一行,与上方双灯分行。双灯本身复用既有
   .rd-dot--ok(var(--green))/.rd-dot--no(color-mix 派生),无新增灯样式。 ── */
.afk-rd-caveat { flex-basis: 100%; margin: 0; font-size: 11px; line-height: 1.4; color: color-mix(in srgb, var(--text-2) 70%, transparent); }

/* ── full-install W3：AFK 失败成因徽章 + 修复命令区（TaskDetail 失败态 .dt-diag / ProgressView
   失败行 .prg-cause）。决议 #9：警示色一律 color-mix 从既有 --red/--green token 派生（明暗两套
   随主题自适应），不硬编码新原色；修复命令区复用既有 .dt-code 底座，本段只补布局壳 + 徽章配色。 ── */
.dt-diag-fix { display: flex; flex-direction: column; gap: 4px; }
.dt-diag-fix-label { font-size: 11px; color: var(--text-3); }
/* ProgressView 失败行短成因提示（小字,紧随失败徽章;纯提示无块,超长省略号收口不撑破行）。 */
.prg-cause { flex: none; font-size: 11px; color: var(--red-d); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14ch; }

/* ── full-install W4：右栏只读「技能齐全度」面（side-card 内；闭 P1-F3/BF10）——前端只读不装，
   引导回终端 pipeline setup/doctor。决议 #9：不新增原色——未装计数用既有 --red-d 派生软警示
   （明暗随主题自适应）；可复制命令块复用 mono + fill 底座，与 .dt-diag-fix 同调，不引入新视觉
   语言。计数/名走既有 .side-card__row/.wb-note，本段只补「命令块 + 警示计数」。 ── */
.skh-n-warn { color: var(--red-d); }
.skh-miss-names { margin-top: 2px; word-break: break-word; }
.skh-guide { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.skh-cmd { align-self: flex-start; max-width: 100%; display: inline-flex; align-items: center; border: 1px solid var(--border); background: color-mix(in srgb, var(--fill) 55%, transparent); border-radius: var(--radius-sm); padding: 5px 10px; cursor: pointer; font: inherit; transition: border-color .14s ease, background .14s ease; }
.skh-cmd:hover { border-color: var(--text-3); background: var(--fill); }
.skh-cmd code { font-family: var(--mono); font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── full-install W2（旅程 P0 断点）：首启三步 checklist（Onboarding no-project）。决议 #9：
   不新增原色——命令块复用 --code-bg / --mono 底座，明暗随主题自适应。前端只读，命令块唯一
   动作是拷回终端。 ── */
.ob-wide { max-width: 520px; }
.ob-steps { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; text-align: left; }
.ob-step { display: flex; gap: 12px; }
.ob-step__n { flex: none; width: 22px; height: 22px; border-radius: 999px; background: var(--ink); color: var(--ink-fg); font-size: 12px; font-weight: 700; line-height: 22px; text-align: center; }
.ob-step__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.ob-step__label { font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
.ob-cmd { display: flex; align-items: center; gap: 8px; padding: 7px 11px; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; }
.ob-cmd__p { flex: none; color: var(--text-3); }
.ob-cmd__code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; color: var(--text); }
.ob-cmd__copy { display: inline-flex; align-items: center; gap: 4px; flex: none; border: 0; background: transparent; color: var(--green); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.ob-cmd__copy:hover { color: var(--green-d); }

/* ── v8-A:nav8 ── */
/* 意见①（design-demos/v8-trellis-encore.html .proj-menu/.pm-* 对位）：项目下拉宽度贴内容
   （max-content，224-300px 夹逼）、圆角 12 + --shadow-3 浮层、行 hover 才现身的注销钮显式化
   （图标 + title/aria-label + 底部脚注说明）。旧 .nav__dropdown* 规则双保留不删（append-only）；
   展开动效在 Nav.tsx（useGSAP + gsap.matchMedia，reduced-motion/无 matchMedia 直显终态）。
   选中态=绿 tint（v8 语言：绿=确认/当前项，蓝 --accent-d 留给计数/信息）。决议 #9：本块零硬编码原色。 */
.nav8-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; width: max-content; min-width: 224px; max-width: 300px; padding: 6px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-3); transform-origin: top left; }
.nav8-row { display: flex; align-items: center; gap: 4px; border-radius: 9px; }
.nav8-row:hover { background: var(--fill); }
.nav8-item { flex: 1; display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px 9px; border: 0; background: transparent; border-radius: 9px; text-align: left; font: inherit; font-size: 13px; color: var(--text-2); cursor: pointer; }
.nav8-dia { flex: none; color: var(--green); font-size: 13px; line-height: 1; }
.nav8-name { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav8-n { margin-left: auto; padding-left: 10px; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12.5px; font-weight: 700; color: var(--accent-d); }
.nav8-row--on .nav8-item { background: var(--green-t); }
.nav8-row--on .nav8-name { color: var(--green-d); }
.nav8-unreg { flex: none; width: 28px; height: 28px; margin-right: 5px; border: 0; background: transparent; border-radius: 8px; display: inline-grid; place-items: center; color: var(--text-3); cursor: pointer; opacity: 0; transition: opacity .14s ease, background .14s ease, color .14s ease; }
.nav8-row:hover .nav8-unreg, .nav8-unreg:focus-visible { opacity: 1; }
.nav8-unreg:hover { background: var(--red-t); color: var(--red-d); }
.nav8-foot { margin: 4px 0 0; padding: 7px 9px 5px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--text-3); }
.nav8-chev { display: inline-block; margin-left: 5px; font-size: 10px; color: var(--text-3); transition: transform .18s ease; }
.nav__project-btn[aria-expanded="true"] .nav8-chev { transform: rotate(180deg); }

/* ── v8-C:dt8 ── */
/* 意见④ TaskDetail 内件（design-demos/v8-trellis-encore.html #drawer 对位：.dw-acts/.diag/
   .conn-card/.hist）：动作置顶条 + 人话报错卡（原文折叠）+「自己上手修」连接命令卡 + 流程级
   历史 hint。旧 .dt-foot/.dt-diag-badge 等 dt- 规则双保留不删；零新原色——红/琥珀/蓝语义全走
   v8 token（--red-* / --amb-* / --accent-*=demo --blue-* 对位，明暗两套自适应），焦点 halo 走
   --ring-blue。 */
.dt8-acts { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; padding: 12px 0; border-bottom: 1px solid var(--border); }
.dt8-acts-btns { display: flex; align-items: center; gap: 8px; }
.dt8-acts-ctx { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 11.5px; color: var(--text-3); }
.dt8-acts-note { font-size: 12px; color: var(--text-3); }
/* 人话报错卡：结论 + 处置指引为主；cancelled 琥珀 tone（人为终止非故障，不红成硬故障）。 */
.dt8-diag { border: 1px solid var(--red-b); background: var(--red-t); border-radius: 11px; padding: 13px 15px; }
.dt8-diag--amb { border-color: var(--amb-b); background: var(--amb-t); }
.dt8-diag-t { font-size: 14px; font-weight: 700; color: var(--red-d); line-height: 1.45; }
.dt8-diag--amb .dt8-diag-t { color: var(--amb-d); }
.dt8-diag-hint { margin: 6px 0 0; font-size: 13px; color: var(--text-2); line-height: 1.6; max-width: 64ch; }
.dt8-diag .dt-diag-fix { margin-top: 10px; }
.dt8-rawfold { margin-top: 11px; }
.dt8-rawfold summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; border-radius: 6px; padding: 2px 4px; }
.dt8-rawfold summary::-webkit-details-marker { display: none; }
.dt8-rawfold summary::before { content: '▸'; font-size: 10px; color: var(--text-3); transition: transform .16s ease; }
.dt8-rawfold[open] summary::before { transform: rotate(90deg); }
.dt8-rawfold summary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring-blue); }
.dt8-rawfold pre { margin: 8px 0 0; padding: 10px 12px; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: 9px; font-family: var(--mono); font-size: 12px; line-height: 1.65; color: var(--text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.dt8-diag-meta { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; color: var(--text-3); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.dt8-diag-meta b { color: var(--text-2); font-weight: 700; }
/* 「自己上手修」连接命令卡：蓝=信息语义；行内值 mono 单行省略，拷贝钮复用 .dt-code-copy。 */
.dt8-conn-card { border: 1px solid var(--accent-b); background: var(--accent-t); border-radius: 11px; padding: 13px 15px; }
.dt8-conn-rows { display: flex; flex-direction: column; gap: 7px; }
.dt8-conn-row { display: flex; align-items: center; gap: 10px; padding: 8px 11px; background: var(--card); border: 1px solid var(--border); border-radius: 9px; }
.dt8-conn-k { flex: none; width: 88px; font-size: 12px; font-weight: 600; color: var(--text-2); }
.dt8-conn-v { flex: 1; min-width: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt8-conn-note { flex: none; font-size: 11px; color: var(--text-3); white-space: nowrap; }
.dt8-conn-src { margin: 9px 0 0; font-size: 11.5px; color: var(--text-3); }

/* ── v8-E:wb8 ── 工作台(意见⑥)：阶段卡横排步骤条 + sheet 页签化 + SkillChain 动态链。
   设计真相源 design-demos/v8-trellis-encore.html #view-workbench（.stages/.stage/.conn/
   .gate-node/.sheet/.stab/.stab-ink/.pane/#skChain/.skconn）。旧 wb-flow-*/wb-step*/wb-* 规则
   双保留不删（append-only 热点文件纪律）；新类一律 wb8- 前缀；颜色全走既有/v8-A token
   （--green*/--red*/--purple*/--ring/--solid-fg/--shadow*），禁新硬编码原色（决议 #9）。 */
/* 阶段卡横排（demo .stages/.stage）——卡=序号圆+名称 mono+chips+微元信息;选中=绿 ring+tint 底 */
.wb8-rail { background: transparent; border-radius: 0; padding: 0; }
.wb8-stages { display: flex; align-items: stretch; gap: 0; width: 100%; overflow-x: auto; padding: 6px 2px 16px; }
.wb8-stage { position: relative; flex: 1 1 0; min-width: 178px; display: flex; background: var(--card); border: 1px solid var(--border); border-radius: 13px; box-shadow: var(--shadow); transition: border-color .15s ease, box-shadow .15s ease; }
.wb8-stage:hover { border-color: var(--border-2); box-shadow: var(--shadow-2); }
.wb8-stage--on { border-color: var(--green); background: color-mix(in srgb, var(--green) 7%, var(--card)); box-shadow: 0 0 0 3px var(--ring), var(--shadow); }
.wb8-hit { position: relative; flex: 1; min-width: 0; display: flex; gap: 11px; align-items: flex-start; text-align: left; padding: 13px 14px 11px; background: transparent; border: none; border-radius: inherit; font: inherit; color: inherit; cursor: pointer; overflow: hidden; }
.wb8-num { flex: none; width: 26px; height: 26px; border-radius: 999px; background: var(--green-t); border: 1px solid var(--green-b); color: var(--green-d); display: grid; place-items: center; font-size: 12.5px; font-weight: 700; font-family: var(--mono); }
.wb8-body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.wb8-t { display: flex; align-items: baseline; gap: 7px; min-width: 0; flex-wrap: wrap; padding-right: 40px; }
.wb8-name { font-size: 13.5px; font-weight: 700; font-family: var(--mono); letter-spacing: -.01em; color: var(--text); }
.wb8-id { font-size: 10.5px; color: var(--text-3); font-family: var(--mono); }
.wb8-sk { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.wb8-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 6px; font-size: 11px; color: var(--text-3); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.wb8-meta i { font-style: normal; color: var(--border-2); }
.wb8-meta span { white-space: nowrap; }
.wb8-badges { position: absolute; top: 8px; right: 10px; display: flex; align-items: center; gap: 4px; z-index: 2; }
/* running 微光扫过承载元素（GSAP 驱动可见性/位移;等强度对位旧 .wb-flow-gloss:color-mix 派生渐变+缺省 opacity:0） */
.wb8-gloss {
  position: absolute; top: 0; bottom: 0; left: 0; width: 46px; opacity: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(105deg, transparent 6%, color-mix(in srgb, var(--green) 42%, transparent) 50%, transparent 94%);
}
/* 段间连接件（demo .conn/.conn.gated/.gate-node）：流动虚线+clip-path 箭头;门后推进边=红+菱形门节点 */
.wb8-conn { flex: none; width: 44px; position: relative; align-self: center; height: 34px; }
.wb8-conn::before { content: ""; position: absolute; left: 4px; right: 9px; top: 16px; height: 2px; background: repeating-linear-gradient(90deg, var(--green) 0 6px, transparent 6px 12px); animation: wb8-flow 1.4s linear infinite; }
.wb8-conn::after { content: ""; position: absolute; right: 2px; top: 12px; width: 6px; height: 10px; background: var(--green); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.wb8-conn--gated::before { background: repeating-linear-gradient(90deg, var(--red) 0 6px, transparent 6px 12px); animation-duration: 2.6s; }
.wb8-conn--gated::after { background: var(--red); }
.wb8-gate-node { position: absolute; left: 50%; top: 17px; transform: translate(-50%, -50%) rotate(45deg); width: 10px; height: 10px; background: var(--red-t); border: 1.6px solid var(--red); border-radius: 2px; }
.wb8-ev { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 1px; max-width: 88px; overflow: hidden; text-overflow: ellipsis; font-size: 9.5px; font-family: var(--mono); color: var(--text-3); white-space: nowrap; }
@keyframes wb8-flow { to { background-position: -12px 0; } }
.wb8-add { flex: none; align-self: stretch; min-width: 104px; margin-left: 10px; display: flex; align-items: center; justify-content: center; padding: 12px; border: 1px dashed var(--border-2); border-radius: 13px; background: transparent; color: var(--text-3); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
.wb8-add:hover:not(:disabled) { background: var(--card); border-color: var(--green-b); color: var(--text-2); }
.wb8-add:disabled { opacity: .55; cursor: not-allowed; }
/* sheet 页签容器（demo .sheet/.sheet-tabs/.stab/.stab-ink/.pane）——主列不再平铺 */
.wb8-sheet { background: var(--card); border: 1px solid var(--border); border-radius: 13px; box-shadow: var(--shadow); overflow: hidden; }
.wb8-tabs { display: flex; align-items: center; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid var(--border); position: relative; overflow-x: auto; }
.wb8-tab { position: relative; padding: 8px 13px 10px; border: none; background: transparent; border-radius: 9px 9px 0 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-3); cursor: pointer; white-space: nowrap; transition: color .14s ease, background .14s ease; }
.wb8-tab:hover { color: var(--text); background: var(--fill); }
.wb8-tab[aria-selected="true"] { color: var(--text); }
.wb8-tab .n { margin-left: 5px; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 11px; color: var(--text-3); }
.wb8-ink { position: absolute; bottom: -1px; left: 0; width: 0; height: 2px; background: var(--green); border-radius: 2px; }
.wb8-sheet-body { position: relative; min-height: 280px; }
.wb8-pane { display: none; padding: 16px 18px; }
.wb8-pane.on { display: block; }
/* 宿主卡进 pane 后卸外层卡壳——sheet 本身已是卡,不叠双层卡框/双份留白;子卡内部结构零改动 */
.wb8-pane > .card, .wb8-pane > .side-card { border: none; box-shadow: none; background: transparent; border-radius: 0; padding: 0; }
.wb8-pane > .wb-loop { margin-top: 0; }
.wb8-pane > .side-card + .side-card, .wb8-pane > .card + .card, .wb8-pane > .side-card + div, .wb8-pane > div + .side-card { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px; }
.wb8-pane > .side-card .side-card__head, .wb8-pane > .side-card .side-card__body { padding-left: 0; padding-right: 0; }
/* pane 内的 Hook 时序线：跟在编辑卡后,分隔线接续（.wb-ed-sec 的卡内上分隔语义在卡外补齐） */
.wb8-pane > .wb-ed-sec { margin-top: 14px; border-top: 1px solid var(--border); }
/* SkillChain 动态链（demo #skChain/.skc/.skn/.skconn）：编号节点紫圆 mono+紫流动虚线连接件 */
.wb-chip.wb8-skc { background: var(--purple-t); border-color: var(--purple-b); color: var(--purple-d); font-family: var(--mono); }
.wb8-skn { flex: none; display: inline-grid; place-items: center; width: 15px; height: 15px; border-radius: 999px; background: var(--purple); color: var(--solid-fg); font-size: 10px; font-weight: 700; font-style: normal; font-family: var(--mono); margin-right: 5px; }
.wb8-skconn { flex: none; display: inline-block; width: 26px; height: 14px; position: relative; margin: 0 2px; }
.wb8-skconn::before { content: ""; position: absolute; left: 2px; right: 7px; top: 6px; height: 2px; background: repeating-linear-gradient(90deg, var(--purple) 0 5px, transparent 5px 10px); animation: wb8-flowsk 1.6s linear infinite; }
.wb8-skconn::after { content: ""; position: absolute; right: 1px; top: 3px; width: 5px; height: 8px; background: var(--purple); clip-path: polygon(0 0, 100% 50%, 0 100%); }
@keyframes wb8-flowsk { to { background-position: -10px 0; } }
/* reduced-motion：流动虚线全部停帧（GSAP 侧由 matchMedia 各自兜,此处兜 CSS 动画） */
@media (prefers-reduced-motion: reduce) {
  .wb8-conn::before, .wb8-skconn::before { animation: none; }
}
/* ── v9-F1:prg9+rail ── 进度统一面(收件箱并入)+ 列车轨进度条。设计真相源
   design-demos/v9-flowdeck.html(.dcard.flow/.need 行体 + .rail 与 .rl- 骨架、.st- 状态类
   R1 列车轨;R2/R3 备选已退役不移植)。旧 prg- 规则双保留(append-only 热点文件纪律);新类一律
   .prg9-/.rl- 前缀;零硬编码原色——全走既有 token(绿红琥珀蓝各系 --green·--red·--amb-t·b·d·
   --accent 与 --ring/--ring-blue/--scrim/--shadow-3),demo 的蓝 token 对位本仓 --accent 系,流光高光以
   color-mix 从 --solid-fg 派生。动效=状态语义:**在跑才流光**(.prg9-rail[data-mode="run"]
   门控)/门=红菱形呼吸(data-mode="gate" 门控)/失败=断轨/取消=琥珀/排队与未达=幽灵虚线轨;
   prefers-reduced-motion 循环全停(块尾停帧规则)。 */
.prg9-stack { display: flex; flex-direction: column; gap: 10px; }
.prg9-row { display: grid; grid-template-columns: 186px minmax(0, 1fr) auto; column-gap: 22px; align-items: center; background: var(--card); border: 1px solid var(--border); border-radius: 13px; box-shadow: var(--shadow); padding: 13px 18px; transition: border-color .15s ease, box-shadow .15s ease; }
.prg9-row:hover { border-color: var(--border-2); box-shadow: var(--shadow-2); }
/* 高亮=「需要你动手」:绿 ring(全站动作色,demo .dcard.need),严重度由判定徽章表达 */
.prg9-row--need { border-color: var(--green-b); box-shadow: 0 0 0 3px var(--ring), var(--shadow); }
.prg9-row--need:hover { border-color: var(--green); box-shadow: 0 0 0 3px var(--ring), var(--shadow-2); }
.prg9-name { border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; font: inherit; font-family: var(--mono); font-size: 13.5px; font-weight: 700; color: var(--text); letter-spacing: -.005em; border-radius: 4px; transition: color .14s ease; }
.prg9-name:hover { color: var(--accent-d); text-decoration: underline; text-underline-offset: 4px; }
.prg9-lead { margin: 0; font-size: 12.5px; color: var(--text-2); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.prg9-ev { height: 20px; padding: 0 7px; font-size: 10.5px; }
.prg9-judge { display: inline-flex; align-items: center; gap: 8px; }
.prg9-acts { display: flex; gap: 6px; }
.prg9-btn { display: inline-flex; align-items: center; gap: 5px; height: 29px; padding: 0 11px; border-radius: 8px; border: 1px solid transparent; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .14s ease, border-color .14s ease, color .14s ease, filter .12s ease; }
.prg9-btn:disabled { opacity: .55; cursor: not-allowed; }
.prg9-btn--go { background: var(--green); color: var(--solid-fg); }
.prg9-btn--go:hover:not(:disabled) { filter: brightness(.94); }
.prg9-btn--neg { background: var(--card); border-color: var(--border); color: var(--text-2); box-shadow: var(--shadow); }
.prg9-btn--neg:hover:not(:disabled) { background: var(--red-t); border-color: var(--red-b); color: var(--red-d); }
/* 判定徽章扩展 tone(绿/红沿既有 .badge--green/.badge--red):蓝=运行中/琥珀=已取消/中性=排队与观察 */
.prg9-bdg { display: inline-flex; align-items: center; gap: 5px; }
.prg9-bdg .dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; flex: none; }
.prg9-bdg--blue { background: var(--accent-t); color: var(--accent-d); }
.prg9-bdg--blue .dot { animation: prg-blink 1.3s ease-in-out infinite; }
.prg9-bdg--amb { background: var(--amb-t); color: var(--amb-d); border: 1px solid var(--amb-b); }
.prg9-bdg--neutral { background: var(--fill-2); color: var(--text-2); border: 1px solid var(--border); }
.prg9-fold { margin: 12px 4px 0; font-size: 12.5px; color: var(--text-3); }
/* ── 列车轨 R1(rl- 骨架:名称在下,节点在上,track 连前一节点) ── */
.prg9-rail { margin: 2px 0; min-width: 0; }
.prg9-rail .rl { list-style: none; margin: 0; padding: 0; display: flex; }
.rl-ph { flex: 1; min-width: 0; position: relative; padding-top: 21px; text-align: center; }
.rl-name { display: block; font-size: 10.5px; line-height: 1.3; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-node { position: absolute; top: 2px; left: 50%; transform: translate(-50%, 0); width: 12px; height: 12px; border-radius: 999px; background: var(--card); border: 1.6px solid var(--border-2); z-index: 1; }
.rl-track { position: absolute; top: 7px; right: calc(50% + 9px); left: calc(-50% + 9px); height: 2.5px; border-radius: 2px; background: var(--fill-2); overflow: hidden; }
.rl-ph:first-child .rl-track { display: none; }
/* 已走过段:绿实轨;流光层缺省停位在段外(**在跑才流动**——动画只挂 data-mode="run" 门控) */
.rl-ph--done .rl-node { background: var(--green); border-color: var(--green); }
.rl-ph--done .rl-track { background: var(--green); }
.rl-ph--done .rl-track::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 36%; border-radius: 2px; background: linear-gradient(90deg, transparent, color-mix(in srgb, white 65%, transparent), transparent); transform: translateX(-130%); will-change: transform; }
.prg9-rail[data-mode="run"] .rl-ph--done .rl-track::after { animation: prg9-railflow 2.3s ease-in-out infinite; animation-delay: calc(var(--i) * .16s); }
@keyframes prg9-railflow { to { transform: translateX(420%); } }
/* 当前段:列车头(蓝点)停靠;在跑时脉冲(同门控) */
.rl-ph--cur .rl-node { width: 15px; height: 15px; top: .5px; background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring-blue); }
.rl-ph--cur .rl-name { color: var(--accent-d); font-weight: 700; }
.rl-ph--cur .rl-track { background: repeating-linear-gradient(90deg, var(--accent) 0 5px, transparent 5px 10px); }
.prg9-rail[data-mode="run"] .rl-ph--cur .rl-node { animation: prg9-trainpulse 1.7s ease-in-out infinite; will-change: transform; }
@keyframes prg9-trainpulse { 50% { transform: translate(-50%, 0) scale(1.22); box-shadow: 0 0 0 7px var(--ring-blue); } }
/* 门=红闸:菱形节点,呼吸环只在 gate 模式启动 */
.rl-ph--gate .rl-node { border-radius: 3px; transform: translate(-50%, 0) rotate(45deg); background: var(--red-t); border-color: var(--red); }
.rl-ph--gate .rl-node::after { content: ""; position: absolute; inset: -7px; border-radius: 6px; border: 1.5px solid var(--red-b); opacity: 0; }
.prg9-rail[data-mode="gate"] .rl-ph--gate .rl-node::after { animation: prg9-gatepulse 2.6s ease-out infinite; }
@keyframes prg9-gatepulse { 0% { opacity: .9; transform: scale(.55); } 70% { opacity: 0; transform: scale(1.15); } 100% { opacity: 0; } }
.rl-ph--gate .rl-name { color: var(--red-d); font-weight: 700; }
.rl-ph--gate .rl-track { background: repeating-linear-gradient(90deg, var(--red) 0 5px, transparent 5px 10px); }
/* 失败=断轨豁口 */
.rl-ph--fail .rl-node { background: var(--red); border-color: var(--red); }
.rl-ph--fail .rl-name { color: var(--red-d); font-weight: 700; }
.rl-ph--fail .rl-track { background: linear-gradient(90deg, var(--red) 0 42%, transparent 42% 58%, var(--red) 58% 100%); }
/* 取消=琥珀(人为终止非故障) */
.rl-ph--cxl .rl-node { background: var(--amb-t); border-color: var(--amb-d); }
.rl-ph--cxl .rl-name { color: var(--amb-d); font-weight: 700; }
.rl-ph--cxl .rl-track { background: var(--amb-b); }
/* 排队/未达=幽灵虚线轨 */
.rl-ph--queue .rl-node { border-style: dashed; border-color: var(--border-2); }
.rl-ph--queue .rl-track { background: repeating-linear-gradient(90deg, var(--border-2) 0 4px, transparent 4px 9px); }
.rl-ph--todo .rl-track { background: repeating-linear-gradient(90deg, var(--border-2) 0 4px, transparent 4px 9px); opacity: .65; }
/* ── 详情抽屉(scrim+右滑;GSAP 驱动入场,CSS 缺省停在场外) ── */
html.prg9-lock { overflow: hidden; }
.prg9-scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); }
.prg9-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 50; width: min(560px, 100%); display: flex; flex-direction: column; background: var(--card); border-left: 1px solid var(--border); box-shadow: var(--shadow-3); transform: translateX(103%); }
.prg9-dw-body { flex: 1; overflow-y: auto; padding: 16px 18px 20px; }
.prg9-dw-body > .card.dt { border: none; box-shadow: none; padding: 0; }
.prg9-dw-body .prg-logwrap { margin-top: 14px; }
/* reduced-motion:列车轨/徽章循环动效全停(入场直达终态由 GSAP matchMedia reduce 分支负责) */
@media (prefers-reduced-motion: reduce) {
  .prg9-rail .rl-track::after, .prg9-rail .rl-node, .prg9-rail .rl-node::after, .prg9-bdg--blue .dot { animation: none !important; }
}
/* ── v9-F1 块尾追加(真机验收 G):need 行 ring 按语义分色 + fail/cxl 行「回终端」命令 chip ──
   「失败就是红框,终止就是土色框」:gate=绿(沿 .prg9-row--need 现状);失败=红 ring;人为终止=
   琥珀 ring。tone 类叠加于 --need 之后(同特异度后写覆盖 border/shadow);halo 一律 color-mix
   从 token 派生,禁 #hex(决议 #9 同款纪律)。 */
.prg9-row--need-fail { border-color: var(--red-b); box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 12%, transparent), var(--shadow); }
.prg9-row--need-fail:hover { border-color: var(--red); box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 12%, transparent), var(--shadow-2); }
.prg9-row--need-cxl { border-color: var(--amb-b); box-shadow: 0 0 0 3px color-mix(in srgb, var(--amb-d) 14%, transparent), var(--shadow); }
.prg9-row--need-cxl:hover { border-color: var(--amb-d); box-shadow: 0 0 0 3px color-mix(in srgb, var(--amb-d) 14%, transparent), var(--shadow-2); }
/* 命令 chip(替代已退役的行内重试/放弃钮):label 人话 + mono 命令体,点击=拷贝+toast;
   浅底描边披样对位 dt8-conn 命令行,hover 走 accent 系提示可点。 */
.prg9-cmdchip { display: inline-flex; align-items: center; gap: 7px; height: 29px; max-width: 360px; padding: 0 11px; border-radius: 8px; border: 1px dashed var(--border-2); background: var(--fill-2); font: inherit; font-size: 12px; font-weight: 600; color: var(--text-2); cursor: pointer; white-space: nowrap; transition: border-color .14s ease, background .14s ease, color .14s ease; }
.prg9-cmdchip:hover { border-color: var(--accent-b); background: var(--accent-t); color: var(--accent-d); }
.prg9-cmdchip .prg9-cc { font-size: 11.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }

/* ── v9-H:prg9 tabs+groups ── 进度页状态 sheet 页签(全部/等你动手/运行中/等待中,demo
   v9-flowdeck .deck-tabs/.stab/#deckInk 对位)+ 聚合语境项目分组组头(demo .pgroup/.pg-h)+
   行 workflow/调度标识(demo .badge outline 全称 workflow chip/.schip)+ 行体 v2(真机反馈:
   标题行内联 chips,列车轨整宽,动作在轨道右侧)。页签形制参照 wb8 sheet 页签但进度自持一套
   类名(.prg9t-/.prg9g-/.prg9s-/.prg9v2- 前缀,不复用 wb8 前缀类);零硬编码原色,全走既有 token。 */
.prg9t-tabs { position: relative; display: flex; align-items: center; gap: 2px; margin: 2px 0 16px; border-bottom: 1px solid var(--border); padding: 0 2px; overflow-x: auto; }
.prg9t-tab { position: relative; padding: 8px 13px 10px; border: none; background: transparent; border-radius: 9px 9px 0 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-3); cursor: pointer; white-space: nowrap; transition: color .14s ease, background .14s ease; }
.prg9t-tab:hover { color: var(--text); background: var(--fill); }
.prg9t-tab[aria-selected="true"] { color: var(--text); }
.prg9t-n { margin-left: 5px; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 11px; color: var(--text-3); }
.prg9t-ink { position: absolute; bottom: -1px; left: 0; width: 0; height: 2px; background: var(--green); border-radius: 2px; }
/* 项目分组:组头=folder 图标+项目名(mono)+件数胶囊+右延细线;组内行栈同 prg9-stack 间距。 */
.prg9g-group { min-width: 0; }
.prg9g-head { display: flex; align-items: center; gap: 8px; margin: 10px 0 10px; font-size: 13px; font-weight: 650; color: var(--text); }
.prg9g-group:first-child .prg9g-head { margin-top: 0; }
.prg9g-head > svg { color: var(--text-3); flex: none; }
.prg9g-name { font-family: var(--mono); letter-spacing: -.005em; }
.prg9g-n { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 11.5px; color: var(--text-3); font-weight: 700; background: var(--fill-2); border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; }
.prg9g-rule { flex: 1; height: 1px; background: var(--border); }
.prg9g-stack { display: flex; flex-direction: column; gap: 10px; }
/* 行标识:workflow chip=mono outline 形(全称,不缩写);调度 chip 中性=⌨ 终端,--sbx 蓝 tint=▦ 沙箱。 */
.prg9s-tags { display: flex; align-items: center; gap: 5px; flex-wrap: nowrap; }
.prg9s-wf { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--border); background: transparent; font-family: var(--mono); font-size: 10.5px; font-weight: 600; color: var(--text-2); white-space: nowrap; }
.prg9s-schip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 6px; border: 1px solid var(--border); background: var(--fill); font-size: 10.5px; font-weight: 600; color: var(--text-2); white-space: nowrap; }
.prg9s-schip--sbx { background: var(--accent-t); border-color: var(--accent-b); color: var(--accent-d); }
/* 行体 v2(真机反馈):标题行内联——名称+track/workflow/调度 chip+时间同行,右端判定徽章;
   列车轨整宽独占第二行左侧,动作在轨道右侧垂直居中。旧 186px 三列 grid(.prg9-head/-mid/-side)
   停用退役,规则本体双保留不删(append-only);本组后写覆盖 .prg9-row 的 grid 布局。 */
.prg9-row { display: block; padding: 12px 18px; }
.prg9v2-top { display: flex; align-items: center; gap: 9px; min-width: 0; flex-wrap: wrap; }
.prg9v2-time { font-size: 11.5px; color: var(--text-3); font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.prg9v2-sp { flex: 1; }
.prg9v2-body { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 24px; align-items: center; margin-top: 8px; }
.prg9v2-mid { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.prg9v2-mid .prg9-rail { margin: 0; }
.prg9v2-acts { align-items: center; }

/* ── #2 归档折叠行「展开」真交互(demo↔生产残余差异清单)：静态「N 个已归档」文案改可点击
   toggle;展开区复用 prg9-stack 同款纵向间距;只读行灰化——降对比度 + 轻降饱和,零新原色,
   全走既有 --text-2/--text-3 token(禁 color-mix 派生新色以外的硬编码,同本文件既有纪律)。 */
.prg9-fold-toggle { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; padding: 0; margin: 0; font: inherit; font-size: 12.5px; color: var(--text-3); cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--text-3) 45%, transparent); text-underline-offset: 3px; transition: color .14s ease; }
.prg9-fold-toggle:hover { color: var(--text-2); }
.prg9-archived-stack { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.prg9-row--archived { opacity: .6; filter: saturate(.7); }
.prg9-row--archived .prg9-name--ro,
.prg9-row--archived .prg9-name--ro:hover { color: var(--text-3); cursor: default; text-decoration: none; }
`
