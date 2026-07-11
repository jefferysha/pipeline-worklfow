/**
 * 全局样式（内联字符串，CSP 自足——零外部字体/CDN/图片）。设计语言：「OpenAI 配色 × Trellis 布局」
 * （spec：docs/superpowers/specs/2026-07-09-openai-trellis-restyle-design.md §1；
 *  视觉真相源：design-demos/v4-openai-trellis.html，实现与 spec 冲突时以该 v4 文件为准）——
 * Cod Gray 近黑×白单色骨架，蓝 --accent 是唯一 emotive 签名色（激活态/选中行/链接/聚焦环/推进钮）；
 * 绿/红一律降饱和小面积 tint（*-t 底 *-d 字），仅承担语义（绿=pass/成功，红=复核门/回退/错误），
 * 不再有任何结构性角色；紫色全线退役。主按钮 --btn-bg 蓝实底白字（禁黑实底），次按钮 ghost；
 * --ink/--ink-fg 专用于「brand 块」（导航品牌位/分组头/激活 tab/loop 等级铭牌等深色填充块）；
 * mono 仅用于 id/路径/sha/JSON/字段名，其余一律 sans。
 * 深浅色自适应三段式（机制沿用）：
 *   · 默认浅色；@media (prefers-color-scheme: dark) 跟随系统；
 *   · [data-theme="dark"] / [data-theme="light"] 用户显式切换覆盖系统（两向皆胜）。
 */
export const GLOBAL_CSS = `
:root {
  --bg: #f7f7f5; --card: #ffffff; --fill: #f2f2ef; --fill-2: #ececea;
  --border: #e4e4e0; --border-2: #d2d2cc;
  --text: #0d0d0d; --text-2: #40403c; --text-3: #6a6a62;
  --accent: #0b6cff; --accent-d: #0a5ce0; --accent-t: #eaf2ff; --accent-b: #c5daff;
  --green: #1f9d51; --green-d: #187339; --green-t: #e9f6ee; --green-b: #c8e8d2;
  --red: #d92d20; --red-d: #b42318; --red-t: #fdf0ee; --red-b: #f3cfc9;
  --ink: #0d0d0d; --ink-fg: #ffffff; --ink-hover: #2e2e2c;
  --btn-bg: #0b6cff; --btn-fg: #ffffff; --btn-hover: #0a5ce0;
  --code-bg: #f6f6f4; --code-border: #e4e4e0;
  --shadow: 0 1px 2px rgba(0,0,0,.04); --shadow-2: 0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --ring: rgba(11,108,255,.13);
  --radius: 12px; --radius-sm: 8px;
  --nav-offset: 64px; /* nav 实际高(约 41-45px) + 20px 呼吸——.side-col sticky top 对齐用，改 .nav 高度需同步此值 */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0d; --card: #171717; --fill: #1e1e1d; --fill-2: #262624;
    --border: #262626; --border-2: #3a3a37;
    --text: #f2f2f0; --text-2: #c9c9c4; --text-3: #94948d;
    --accent: #4d94ff; --accent-d: #7fb2ff; --accent-t: rgba(77,148,255,.13); --accent-b: rgba(77,148,255,.38);
    --green: #3fb950; --green-d: #55c368; --green-t: rgba(63,185,80,.13); --green-b: rgba(63,185,80,.35);
    --red: #e5534b; --red-d: #f2867e; --red-t: rgba(229,83,75,.14); --red-b: rgba(229,83,75,.40);
    --ink: #f2f2f2; --ink-fg: #0d0d0d; --ink-hover: #d8d8d5;
    --btn-bg: #2b7fff; --btn-fg: #ffffff; --btn-hover: #4d94ff;
    --code-bg: #111110; --code-border: #2a2a28;
    --shadow: 0 1px 2px rgba(0,0,0,.35); --shadow-2: 0 2px 6px rgba(0,0,0,.35);
    --ring: rgba(77,148,255,.20);
  }
}
:root[data-theme="light"] {
  --bg: #f7f7f5; --card: #ffffff; --fill: #f2f2ef; --fill-2: #ececea;
  --border: #e4e4e0; --border-2: #d2d2cc;
  --text: #0d0d0d; --text-2: #40403c; --text-3: #6a6a62;
  --accent: #0b6cff; --accent-d: #0a5ce0; --accent-t: #eaf2ff; --accent-b: #c5daff;
  --green: #1f9d51; --green-d: #187339; --green-t: #e9f6ee; --green-b: #c8e8d2;
  --red: #d92d20; --red-d: #b42318; --red-t: #fdf0ee; --red-b: #f3cfc9;
  --ink: #0d0d0d; --ink-fg: #ffffff; --ink-hover: #2e2e2c;
  --btn-bg: #0b6cff; --btn-fg: #ffffff; --btn-hover: #0a5ce0;
  --code-bg: #f6f6f4; --code-border: #e4e4e0;
  --shadow: 0 1px 2px rgba(0,0,0,.04); --shadow-2: 0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --ring: rgba(11,108,255,.13);
}
:root[data-theme="dark"] {
  --bg: #0d0d0d; --card: #171717; --fill: #1e1e1d; --fill-2: #262624;
  --border: #262626; --border-2: #3a3a37;
  --text: #f2f2f0; --text-2: #c9c9c4; --text-3: #94948d;
  --accent: #4d94ff; --accent-d: #7fb2ff; --accent-t: rgba(77,148,255,.13); --accent-b: rgba(77,148,255,.38);
  --green: #3fb950; --green-d: #55c368; --green-t: rgba(63,185,80,.13); --green-b: rgba(63,185,80,.35);
  --red: #e5534b; --red-d: #f2867e; --red-t: rgba(229,83,75,.14); --red-b: rgba(229,83,75,.40);
  --ink: #f2f2f2; --ink-fg: #0d0d0d; --ink-hover: #d8d8d5;
  --btn-bg: #2b7fff; --btn-fg: #ffffff; --btn-hover: #4d94ff;
  --code-bg: #111110; --code-border: #2a2a28;
  --shadow: 0 1px 2px rgba(0,0,0,.35); --shadow-2: 0 2px 6px rgba(0,0,0,.35);
  --ring: rgba(77,148,255,.20);
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
.nav__group { position: relative; }
.nav__dropdown { position: absolute; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; min-width: 190px; padding: 4px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: 0 6px 16px rgba(10,22,14,.14); z-index: 20; }
.nav__dropdown-item { border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 13px; text-align: left; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.nav__dropdown-item:hover { color: var(--text); background: var(--fill); }
/* 激活=蓝纪律（spec §1：蓝 accent 专属激活/选中，绿全线降级为纯语义 tint）——此前误用 --green-t/--green。 */
.nav__dropdown-item--active { background: var(--accent-t); color: var(--accent); font-weight: 700; }
.nav__dropdown-dia { color: var(--text-3); }
.nav__dropdown-count { margin-left: 6px; font-family: var(--mono); font-weight: 700; color: var(--accent-d); }
/* 项目项 + 「注销…」入口同一行（评审 P2-13）：注销钮常态透明，行 hover/自身 focus 才现身。 */
.nav__dropdown-row { display: flex; align-items: stretch; }
.nav__dropdown-row .nav__dropdown-item { flex: 1; }
.nav__dropdown-unreg { flex: none; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 11px; padding: 6px 8px; margin: 0 2px; border-radius: 6px; cursor: pointer; opacity: 0; transition: opacity .14s ease, color .14s ease, background .14s ease; }
.nav__dropdown-row:hover .nav__dropdown-unreg,
.nav__dropdown-unreg:focus-visible { opacity: 1; }
.nav__dropdown-unreg:hover { color: var(--red-d); background: var(--red-t); }
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
.view__count { font-size: 12.5px; color: var(--green); font-weight: 700; white-space: nowrap; font-family: var(--mono); }
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
.side-card__row-icon { color: var(--text-3); display: inline-flex; flex: none; }
.side-card__row-label { flex: 1; min-width: 0; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-card__row-label--mono { font-family: var(--mono); font-size: 12.5px; }
.side-card__row-value { font-family: var(--mono); font-size: 14px; font-weight: 750; color: var(--accent-d); flex: none; }
/* 产物/文件行：图标 + 上下两行（字段名 + 路径值）+ 拷贝钮（v4 .file-row）。 */
.side-card__file { display: flex; align-items: center; gap: 9px; padding: 8px 0; }
.side-card__file + .side-card__file { border-top: 1px solid var(--border); }
.side-card__file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.side-card__file-key { font-family: var(--mono); font-size: 10.5px; color: var(--text-3); }
.side-card__file-val { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-card__copy { flex: none; border: 0; background: transparent; color: var(--text-3); cursor: pointer; padding: 3px; border-radius: 5px; display: inline-flex; }
.side-card__copy:hover { color: var(--text); background: var(--fill); }
/* 生成配置 JSON 预览（v4 .code；--code-bg/--code-border token 首次真正被消费）。 */
.side-card__code { padding: 10px 14px 14px; }
.side-card__code pre { margin: 0; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: var(--radius-sm); padding: 11px 13px; font-family: var(--mono); font-size: 11.5px; line-height: 1.6; color: var(--text-2); overflow-x: auto; white-space: pre; }

/* ── 空态（教学式 onboarding 复用同族）── */
.empty { max-width: 460px; margin: 8vh auto; text-align: center; padding: 30px 32px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
.empty__mark { width: 42px; height: 42px; border-radius: var(--radius); background: var(--ink); color: var(--ink-fg); font-size: 20px; line-height: 42px; margin: 0 auto 14px; font-weight: 700; }
.empty__title { margin: 0 0 8px; font-size: 17px; color: var(--text); }
.empty__desc { margin: 0 0 18px; font-size: 12.5px; color: var(--text-3); line-height: 1.7; }

/* ── 卡片基元 ── */
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px 14px; transition: border-color .14s ease, box-shadow .14s ease; }
.card__name { font-weight: 600; color: var(--text); font-size: 12.5px; font-family: var(--mono); }
.card__reason { margin: 8px 0 0; font-size: 12.5px; color: var(--text-2); }
.card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 11px; color: var(--text-3); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.card__track { font-size: 10.5px; color: var(--text-3); background: var(--fill); border-radius: 4px; padding: 1px 6px; }

/* ── 徽章语义（spec §1：gate 徽章=red-t 底 red-d 字 tint；phase 胶囊=中性 fill；运行=透明底绿字）── */
.badge { display: inline-block; font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
.badge--phase { background: var(--fill); color: var(--text); border: 1px solid var(--border); font-family: var(--mono); font-weight: 600; }
.badge--gate { background: var(--red-t); color: var(--red-d); }
.badge--pending { background: var(--fill); color: var(--text-3); }
.badge--run { background: transparent; color: var(--green); padding-left: 0; }
.g-phase { display: inline-block; font-family: var(--mono); font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--fill); color: var(--text); border: 1px solid var(--border); white-space: nowrap; }
.wf-label { font-family: var(--mono); font-size: 10.5px; color: var(--text-3); }

/* ── 工票行（收件箱/列表类视图的行基元）── */
.ticket-row { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 9px 12px; flex-wrap: wrap; transition: border-color .14s ease, box-shadow .14s ease; }
.ticket-row:hover { border-color: var(--green); }
.ticket-row--gate { border: 1.5px solid var(--red); }
.ticket-row--gate:hover { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-t); }
.ticket-row__time { font-size: 11px; color: var(--text-3); }
.ticket-row__spacer { flex: 1; }
.inbox__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }

/* ── 快捷转换按钮（看板卡 hover 浮现 / 收件箱行常驻）── */
.qk { display: flex; gap: 6px; }
.qk__btn { font-size: 11.5px; font-weight: 700; padding: 4px 11px; border-radius: 6px; border: 1px solid var(--accent); background: var(--card); color: var(--accent); cursor: pointer; font-family: var(--font); white-space: nowrap; transition: background .14s ease; }
.qk__btn:hover { background: var(--accent-t); }
.qk__btn--back { border-color: var(--red); color: var(--red); }
.qk__btn--back:hover { background: var(--red-t); }
.qk__btn--ghost { border-color: var(--border); color: var(--text-2); }
.qk__btn--ghost:hover { background: transparent; border-color: var(--text-3); color: var(--text); }
.qk__btn:disabled { opacity: .45; cursor: not-allowed; }

/* ── 行内证据 chips（Task 7，评审 P0-1：gateEvidence 复用，收件箱行内即时可见）── */
.ev { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex-basis: 100%; margin-top: 2px; }
.ev__chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-family: var(--mono); border: 1px solid var(--border); background: var(--fill); color: var(--text-2); white-space: nowrap; }
.ev__chip--pass { background: var(--green-t); color: var(--green-d); border-color: var(--green-b); }
.ev__chip--fail { background: var(--red-t); color: var(--red-d); border-color: var(--red-b); }
.ev__chip--pending { background: transparent; border-style: dashed; color: var(--text-3); }
button.ev__chip--neutral { cursor: pointer; }
button.ev__chip--neutral:hover { border-color: var(--border-2); color: var(--text); background: var(--card); }

/* ── 收件箱行的键盘焦点环 / 展开态（j/k 移动焦点环、点开详情卡）── */
.ticket-row.kbd-focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.ticket-row--open { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
.ticket-row--open:hover { border-color: var(--accent); }

/* ── change 详情卡（Task 7，评审 P0-1 核心交付件；视觉基准 v4-openai-trellis.html「change 详情」段，
   历史区除外——spec §5 登记，待 history 读端点）；Task 9 看板复用同一组件，样式不与 InboxView 耦合。 ── */
.detail { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); margin-top: 10px; padding: 0 16px; }
.detail__head { display: flex; align-items: center; gap: 9px; padding: 13px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.detail__close { margin-left: auto; }
.detail__sec { padding: 14px 0; border-bottom: 1px solid var(--border); }
.detail__sec:last-of-type { border-bottom: none; }
.detail__sec-h { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; color: var(--text-3); }
.detail__sec-h b { font-size: 12.5px; font-weight: 700; color: var(--text); }
.detail__why { margin: 0 0 12px; font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
.detail__grid { display: flex; flex-wrap: wrap; gap: 8px; }
.detail__field { flex: 1; min-width: 148px; background: var(--fill); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.detail__field-key { font-size: 10.5px; color: var(--text-3); font-family: var(--mono); }
.detail__field-value { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; font-family: var(--mono); color: var(--text-2); }
.detail__field-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail__field--pass .detail__field-value { color: var(--green-d); }
.detail__field--fail .detail__field-value { color: var(--red-d); }
.detail__field--pending .detail__field-value { color: var(--text-3); font-weight: 400; }
.detail__copy { flex: none; margin-left: auto; border: 0; background: transparent; color: var(--text-3); cursor: pointer; display: inline-flex; padding: 3px; border-radius: 5px; }
.detail__copy:hover { color: var(--text); background: var(--card); }
.detail__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 13px 0; }

/* T18 死 CSS 清理登记：.board__*（含 board-col-shake keyframes 与两处 media query 分支）
   随 BoardView 退役删除——全仓 tsx 零消费。 */
/* 名单挂载时播 motion.ts foldOpen——这层本身不做 CSS 动画，只是 foldOpen 的 GSAP height
   补间需要一个稳定的挂载目标。 */
.fold-body { margin-top: 6px; }

/* ── 盖章确认（转换成功，motion.ts stampConfirm 驱动）── */
.stamp { position: absolute; right: 8px; top: -9px; background: var(--green); color: #ffffff; font-size: 10.5px; font-weight: 800; border-radius: 999px; padding: 3px 9px; transform: rotate(-7deg); box-shadow: 0 2px 8px rgba(20,90,50,.35); pointer-events: none; white-space: nowrap; }

/* ── tabs（设置页等；活跃态=--ink 铭牌）── */
.tabs { display: flex; gap: 6px; }
.tab { border: 1px solid var(--border); background: var(--card); color: var(--text-2); border-radius: var(--radius-sm); padding: 6px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: border-color .14s ease; }
.tab:hover { border-color: var(--green); }
.tab--active { background: var(--ink); color: var(--ink-fg); border-color: var(--ink); }
/* T18 死 CSS 清理登记：.settings__* 4 条随 SettingsView 退役删除——全仓 tsx 零消费。 */
.axis { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.axis__row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--fill); border-radius: var(--radius-sm); }
.axis__phase { font-weight: 700; color: var(--text); min-width: 60px; font-family: var(--mono); font-size: 12px; }
.axis__arrow { color: var(--text-3); }
.axis__targets { color: var(--text-2); font-size: 12.5px; font-family: var(--mono); }
.matrix__scroll { overflow-x: auto; }
.matrix { border-collapse: collapse; width: 100%; font-size: 12px; }
.matrix th, .matrix td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: top; }
.matrix th { background: var(--fill); color: var(--text-3); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
.matrix__phase { font-weight: 700; color: var(--text); white-space: nowrap; font-family: var(--mono); }
.matrix__skills { margin: 0; padding-left: 16px; }
.matrix__none { color: var(--text-3); opacity: .6; }
.sk { display: inline-block; font-family: var(--mono); font-size: 10.5px; background: var(--green-t); color: var(--green); border-radius: 5px; padding: 2px 7px; margin: 1px 3px 1px 0; font-weight: 600; }
.sk--add { background: transparent; border: 1px dashed var(--border); color: var(--text-3); cursor: pointer; }
.sk--add:hover { border-color: var(--green); color: var(--green); }

/* ── 技能穿梭框（设置 · 矩阵单元编辑，评审 P1-10 后半，Task 16）：双栏 available/chosen +
   搜索框，此前 .modal / .split 零 CSS 规则裸渲染在此收口。宽度受 Dialog 固定
   width:min(420px,92%) 约束（Dialog 不接受宽度覆盖），条目用省略号防溢出、title 属性兜底
   全名。条目点击即移动为主交互，拖拽保留为增强——不另设选中态类之外的强调色，直接靠
   .transfer__item--chosen 修饰符区分已选条目。 ── */
.transfer__search { display: block; width: 100%; margin: 4px 0 0; font: inherit; font-size: 12.5px; color: var(--text); background: var(--fill); border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px; transition: border-color .14s ease, box-shadow .14s ease; }
.transfer__search::placeholder { color: var(--text-3); }
.transfer__search:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
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
.btn--verm-ghost { background: transparent; color: var(--red); border: 1px solid var(--red); font-weight: 700; }
.btn--verm-ghost:hover { filter: none; background: var(--red-t); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--icon { background: transparent; border: 1px solid transparent; color: var(--text-3); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; transition: color .14s ease, border-color .14s ease, background .14s ease; }
.btn--icon:hover { color: var(--red); border-color: var(--border); background: var(--fill); }

/* ── 对话框 / toast ── */
.dialog__backdrop { position: fixed; inset: 0; background: rgba(12,20,14,.38); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; width: min(420px, 92%); box-shadow: var(--shadow-2); }
.dialog__title { margin: 0 0 6px; font-size: 15px; color: var(--text); font-weight: 700; }
.dialog__desc { margin: 0 0 16px; font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
.dialog__desc--danger { color: var(--red); font-weight: 700; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.dlg-cli { background: var(--fill); border: 1px dashed var(--border); border-radius: 7px; padding: 8px 11px; font-family: var(--mono); font-size: 11px; color: var(--text-3); overflow-x: auto; white-space: nowrap; }

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
.field__hint { font-size: 11px; color: var(--text-3); font-family: var(--mono); font-weight: 400; }

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

/* ── Loop 治理面板 ── */
.loop-row { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 6px; }
.loop-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 6px; border-radius: 6px; }
.loop-line:hover { background: var(--fill); }
.loop-caret { color: var(--text-3); font-size: 11px; }
.loop-level { font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--ink); color: var(--ink-fg); white-space: nowrap; }
.loop-level__tag { font-weight: 400; opacity: .8; }
.loop-ready { font-size: 11.5px; color: var(--text-3); }
.loop-ready b { color: var(--green); font-family: var(--mono); }
.loop-detail { padding: 4px 8px 10px 28px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.loop-band { margin: 0; font-size: 11.5px; color: var(--text-3); }
/* 预算行（Task 13，评审 P1-6）：轨道中性底，填充色随 usedRatio 语义变化（>0.8 红，否则绿）。 */
.loop-budget { display: flex; flex-direction: column; gap: 5px; width: 240px; max-width: 100%; }
.loop-budget__track { height: 6px; border-radius: 999px; background: var(--fill); overflow: hidden; }
.loop-budget__fill { height: 100%; border-radius: 999px; background: var(--green); transition: width .2s ease; }
.loop-budget__fill--warn { background: var(--red); }
.loop-budget__label { margin: 0; font-size: 11.5px; color: var(--text-3); font-family: var(--mono); }
.loop-budget__label--none { font-family: var(--font); font-style: italic; }
/* 就绪构成行：dimensions[] 逐项 ✓/✗（Task 13）。 */
.loop-dims { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px 14px; }
.loop-dim { font-size: 11.5px; color: var(--text-3); display: inline-flex; align-items: center; gap: 4px; }
.loop-dim__mark { font-weight: 700; }
.loop-dim--pass .loop-dim__mark { color: var(--green); }
.loop-dim--fail .loop-dim__mark { color: var(--red); }
/* 熔断说明块：区别于 loop-reject（POST 拒绝反馈）——同色底但语义是"解释+出口"，非错误。 */
.loop-tripped { margin: 0; padding: 8px 11px; border-radius: 7px; background: var(--red-t); color: var(--red-d); font-size: 11.5px; line-height: 1.5; }
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
.wb-steps { display: flex; align-items: stretch; overflow-x: auto; padding: 3px 1px; }
.wb-step { position: relative; overflow: hidden; flex: none; min-width: 148px; max-width: 200px; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px 12px 11px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); font: inherit; color: inherit; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.wb-step:hover { border-color: var(--border-2); }
.wb-step--on, .wb-step--on:hover { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring), var(--shadow); }
.wb-step--on::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 42px; background: linear-gradient(var(--accent-t), transparent); pointer-events: none; }
/* 预演点亮态（GSAP 预演驱动）：进行中蓝、终点绿——沿 spec §1 蓝=进行/绿=完成的语义分工。 */
.wb-step--live { border-color: var(--accent); }
.wb-step--live-g { border-color: var(--green); }
.wb-step > * { position: relative; }
.wb-step-top { display: flex; align-items: center; gap: 8px; width: 100%; margin-bottom: 7px; min-height: 22px; }
.wb-step-num { width: 22px; height: 22px; border-radius: 999px; background: var(--fill-2); display: grid; place-items: center; font-size: 11.5px; font-weight: 700; color: var(--text-2); font-family: var(--mono); flex: none; }
.wb-step--on .wb-step-num { background: var(--accent); color: var(--btn-fg); }
.wb-step-gate { margin-left: auto; }
.wb-step-name { font-size: 15px; font-weight: 700; line-height: 1.25; color: var(--text); }
.wb-step-id { font-size: 11.5px; color: var(--text-3); margin-top: 1px; font-family: var(--mono); }
.wb-step-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 5px; margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--border); width: 100%; font-size: 11px; color: var(--text-3); }
.wb-step-meta span { white-space: nowrap; }
.wb-step-meta i { font-style: normal; color: var(--border-2); }
.wb-step-sk { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 6px; width: 100%; }
.wb-skc { display: inline-block; max-width: 124px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border-radius: 6px; background: var(--fill); border: 1px solid var(--border); font-size: 11px; color: var(--text-2); font-family: var(--mono); }
.wb-skc-n { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
/* 卡间连接件：转换事件名 + 箭头 */
.wb-link { flex: none; align-self: center; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0 6px; color: var(--border-2); }
.wb-link-ev { font-size: 11px; color: var(--text-3); white-space: nowrap; font-family: var(--mono); }
.wb-link svg { display: block; }
.wb-step--add { flex: none; min-width: 104px; margin-left: 12px; display: flex; align-items: center; justify-content: center; padding: 12px; border: 1px dashed var(--border-2); border-radius: var(--radius); background: transparent; color: var(--text-3); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease; }
.wb-step--add:hover { background: var(--card); color: var(--text-2); }
.wb-step--add:disabled { opacity: .55; cursor: not-allowed; }
.wb-step--add:disabled:hover { background: transparent; color: var(--text-3); }
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
.wb-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
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
.wb-pv-flow { overflow-x: auto; padding: 8px 0 6px; }
.wb-pv-track { position: relative; display: flex; align-items: center; width: max-content; min-width: 100%; padding: 4px 0; }
.wb-pv-node { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--fill); font-size: 12px; font-weight: 600; color: var(--text-2); transition: background .3s ease, border-color .3s ease, color .3s ease; }
.wb-pv-node.lit { background: var(--accent-t); border-color: var(--accent); color: var(--accent-d); }
.wb-pv-node.lit-g { background: var(--green-t); border-color: var(--green); color: var(--green-d); }
.wb-pv-line { flex: none; width: 16px; height: 2px; border-radius: 2px; background: var(--border-2); transition: background .3s ease; }
.wb-pv-line.lit { background: var(--accent); }
.wb-pv-gdot { display: inline-block; width: 6px; height: 6px; border-radius: 999px; background: var(--red); }
.wb-pv-dot { position: absolute; left: 0; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 999px; background: var(--accent); opacity: 0; pointer-events: none; box-shadow: 0 0 0 3px var(--ring); }
.wb-play { display: block; width: 100%; margin: 4px 0 12px; text-align: center; }

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
/* 筛选条：项目下拉多选 × 状态计数 chips */
.prg-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: -4px 0 18px; }
.prg-fdiv { width: 1px; height: 16px; background: var(--border-2); flex: none; }
.prg-dd { position: relative; }
.prg-ddbtn { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 600; background: var(--card); border: 1px solid var(--border); color: var(--text-2); box-shadow: var(--shadow); cursor: pointer; transition: background .12s ease, border-color .12s ease; }
.prg-ddbtn:hover, .prg-ddbtn[aria-expanded="true"] { background: var(--fill); border-color: var(--border-2); }
.prg-ddval { color: var(--text); }
.prg-ddcaret { font-size: 9px; color: var(--text-3); }
.prg-ddmenu { position: absolute; left: 0; top: calc(100% + 6px); min-width: 180px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-2); padding: 6px; z-index: 45; }
.prg-ddopt { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: var(--radius-sm); font-size: 13px; color: var(--text-2); cursor: pointer; }
.prg-ddopt:hover { background: var(--fill); }
.prg-ddopt input { width: 14px; height: 14px; margin: 0; accent-color: var(--accent); flex: none; }
.prg-ddfoot { margin-top: 4px; padding: 7px 10px 4px; border-top: 1px solid var(--border); }
.prg-ddclear { border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 600; color: var(--accent); padding: 0; cursor: pointer; }
.prg-ddclear:hover { color: var(--accent-d); }
/* 状态计数 chips（五态字典 + 全部；选中 = accent 描边 + accent-t 底） */
.prg-schips { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.prg-schip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 600; background: var(--card); border: 1px solid var(--border); color: var(--text-2); box-shadow: var(--shadow); cursor: pointer; transition: background .12s ease, border-color .12s ease, color .12s ease; }
.prg-schip:hover { background: var(--fill); border-color: var(--border-2); }
.prg-schip.on, .prg-schip.on:hover { background: var(--accent-t); border-color: var(--accent); color: var(--accent-d); box-shadow: none; }
.prg-schip .n { font-weight: 600; color: var(--text-3); }
.prg-schip.on .n { color: var(--accent-d); }
.prg-sdot { width: 6px; height: 6px; border-radius: 999px; flex: none; }
.prg-sdot--gate { background: var(--red); }
/* 「等 agent」点 = busy 同款派生黄（同一语义家族：既不是红门也不是绿完成） */
.prg-sdot--agent { background: var(--red); background: color-mix(in oklch, var(--red) 52%, var(--green)); }
.prg-sdot--running { background: var(--accent); }
.prg-sdot--queued { background: var(--text-3); }
.prg-sx { font-size: 11px; font-weight: 700; line-height: 1; color: var(--red); font-style: normal; }
/* 分组：整组一张卡（.card 缺省内边距清零，行自己控制），轻量组头 + 分隔线行 */
.prg-group { padding: 0; overflow: hidden; margin-bottom: 14px; }
.prg-ghead { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--border); background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.prg-ghead:hover { background: color-mix(in srgb, var(--fill) 55%, transparent); }
.prg-ghead__name { font-size: 12.5px; font-weight: 600; letter-spacing: .02em; }
.prg-ghead__meta { font-size: 12px; color: var(--text-3); }
.prg-ghead__caret { margin-left: auto; font-size: 10px; color: var(--text-3); transition: transform .15s ease; }
.prg-group--closed .prg-ghead { border-bottom-color: transparent; }
.prg-group--closed .prg-ghead__caret { transform: rotate(-90deg); }
/* 行：分隔线行，~64px，hover --fill（点行展开 = T11） */
.prg-row + .prg-row { border-top: 1px solid var(--border); }
.prg-row__main { display: grid; grid-template-columns: 210px minmax(0, 1fr) 230px; gap: 16px; align-items: center; min-height: 64px; padding: 6px 16px; transition: background .12s ease; }
.prg-row__main:hover { background: var(--fill); }
.prg-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.prg-name__t { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* chevron 铰接箭头带：clip-path 四态段（长 workflow 名 max-width + ellipsis 防溢出） */
.prg-flow { display: flex; align-items: center; min-width: 0; }
.prg-seg { position: relative; flex: 1 1 0; min-width: 0; max-width: 170px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0 10px 0 15px; clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%); }
.prg-seg + .prg-seg { margin-left: -7px; }
.prg-seg:first-child { clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%); padding-left: 12px; }
.prg-seg:last-child { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 9px 50%); padding-right: 12px; }
.prg-seg__t { font-family: var(--mono); font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.prg-seg--past { background: var(--green-t); color: var(--green-d); }
.prg-seg--cur { background: var(--accent); color: var(--btn-fg); }
.prg-seg--fail { background: var(--red); color: var(--btn-fg); }
.prg-seg--fut { background: var(--fill); color: var(--text-3); }
/* 行 hover 底为 --fill 时，未来段换 --fill-2 保住箭形轮廓 */
.prg-row__main:hover .prg-seg--fut { background: var(--fill-2); }
/* 未到达的复核门段：右上角 6px 红点 */
.prg-seg--gate::after { content: ""; position: absolute; top: 3px; right: 13px; width: 6px; height: 6px; border-radius: 999px; background: var(--red); }
/* 验收反馈②-①：执行中段常驻区分——比普通 .prg-seg--cur 更亮的 color-mix 派生底色 +
   内描边，不依赖动画也能看出「在执行」（reduced-motion 下光泽层保持透明，这条底色/描边
   是唯一线索，必须常驻）；叠加在 .prg-seg--cur 之上（渲染时两类同时挂载）。 */
.prg-seg--run { background: color-mix(in oklch, var(--accent) 70%, var(--btn-fg) 30%); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--btn-fg) 60%, transparent); }
/* 执行中段：光泽扫过条（GSAP x 位移 repeat:-1；无 GSAP / reduced-motion 时保持透明）。
   验收反馈②-①强化：峰值不透明度 45%→75%、宽度 42px→64px，扫过时更醒目；常驻区分见上条。 */
.prg-gloss { position: absolute; top: 0; bottom: 0; left: 0; width: 64px; opacity: 0; pointer-events: none; background: linear-gradient(105deg, transparent 8%, color-mix(in srgb, var(--btn-fg) 75%, transparent) 50%, transparent 92%); }
/* 状态徽章 + 快捷钮 */
.prg-state { display: flex; align-items: center; justify-content: flex-end; gap: 8px; white-space: nowrap; }
.prg-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; white-space: nowrap; background: var(--fill); color: var(--text-2); }
.prg-badge__dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; flex: none; }
.prg-badge--gate { background: var(--red-t); color: var(--red-d); }
.prg-badge--failed { background: var(--red-t); color: var(--red-d); }
.prg-badge--running { background: var(--accent-t); color: var(--accent-d); }
.prg-badge--gate .prg-badge__dot, .prg-badge--running .prg-badge__dot { animation: prg-blink 1.3s ease-in-out infinite; }
@keyframes prg-blink { 50% { opacity: .3; } }
.prg-btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--card); font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease; }
.prg-btn:hover { border-color: var(--text-3); color: var(--text); }
.prg-btn--danger { background: var(--red-t); border-color: var(--red-b); color: var(--red-d); }
.prg-btn--danger:hover { border-color: var(--red); color: var(--red-d); }
.prg-caret { color: var(--text-3); font-size: 10px; line-height: 1; transform: rotate(-90deg); transition: transform .15s ease; }
/* 空态 + 底部说明 */
.prg-empty { padding: 26px 16px; text-align: center; font-size: 12.5px; color: var(--text-3); border: 1px dashed var(--border-2); border-radius: var(--radius); margin-bottom: 18px; }
.prg-foot { margin-top: 14px; font-size: 12.5px; color: var(--text-3); }
@media (max-width: 720px) {
  /* 窄屏：三列网格退化为纵排，箭头带独占一行保住可读性 */
  .prg-row__main { grid-template-columns: 1fr; gap: 8px; padding: 10px 16px; }
  .prg-state { justify-content: flex-start; }
}
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
.dtl-node--cur { background: var(--btn-bg); box-shadow: 0 0 0 3px var(--accent-b); }
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
.dt-field--wide { grid-column: 1 / -1; }
.dt-fk { font-size: 10.5px; color: var(--text-3); font-family: var(--mono); overflow-wrap: anywhere; }
.dt-fv { font-size: 12px; color: var(--text); overflow-wrap: anywhere; }
.dt-fv--copy { display: inline; padding: 0; border: 0; background: transparent; font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text); cursor: pointer; text-align: left; transition: color .12s ease; }
.dt-fv--copy:hover { color: var(--accent-d); }
.dt-field--pass .dt-fv { color: var(--green-d); font-weight: 700; }
.dt-field--fail .dt-fv { color: var(--red-d); font-weight: 700; }
.dt-field--miss { background: transparent; border-style: dashed; }
.dt-field--miss .dt-fv { color: var(--text-3); }
.dtl-err { font-family: var(--mono); color: var(--red-d); }
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
/* 底部动作条（按钮由宿主注入） */
.dt-foot { display: flex; align-items: center; gap: 9px; padding: 12px 0 13px; border-top: 1px solid var(--border); }
.dt-foot-l { font-family: var(--mono); font-size: 11.5px; color: var(--text-3); }
.dt-foot-btns { margin-left: auto; display: flex; gap: 8px; }
/* 形态 B（dt-tabs 阶段 sheet，进度行内展开 T11 复用）——demo v5 dt-tabs/dt-pane 对位，全走既有 token */
.dt-tabs { display: flex; align-items: center; gap: 5px; overflow-x: auto; padding: 3px; margin: -3px -3px 9px; }
.dt-tab { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 25px; padding: 0 9px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--fill); border: 1px solid var(--border); color: var(--text-3); cursor: pointer; transition: background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease; }
.dt-tab:hover { background: var(--fill-2); color: var(--text-2); }
.dt-tab .tfx { font-size: 10.5px; line-height: 1; }
.dt-tab--done { color: var(--text-2); }
.dt-tab--done .tfx { color: var(--green); }
.dt-tab--cur, .dt-tab--cur:hover { background: var(--btn-bg); border-color: var(--btn-bg); color: var(--btn-fg); }
.dt-tab--fail, .dt-tab--fail:hover { background: var(--red); border-color: var(--red); color: var(--btn-fg); }
.dt-tab.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); color: var(--text); }
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
.wb-arr { color: var(--text-3); font-size: 13px; line-height: 1; }
.wb-chip--ghost { opacity: .55; border-style: dashed; }
.wb-sk-actions { display: flex; align-items: center; gap: 8px; padding-top: 9px; }
.wb-sk-err { margin: 8px 0 0; }
.wb-skpanel { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: var(--shadow-2); padding: 12px; }
.wb-skp-h { font-size: 12.5px; font-weight: 700; margin-bottom: 9px; }
.wb-skp-h .hint { font-weight: 400; color: var(--text-3); margin-left: 6px; font-size: 12px; }
.wb-skp-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 11px; }
.wb-skopt { height: 26px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease, box-shadow .12s ease; }
.wb-skopt:hover { border-color: var(--border-2); }
.wb-skopt.on, .wb-skopt.on:hover { border-color: var(--accent); background: var(--accent-t); color: var(--accent-d); box-shadow: 0 0 0 3px var(--ring); }
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
.lp-range:focus-visible::-webkit-slider-thumb { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
.lp-sld-marks { position: relative; height: 16px; margin-top: 2px; }
.lp-sld-reco { position: absolute; top: 0; transform: translateX(-50%); font-size: 10.5px; color: var(--text-3); white-space: nowrap; }
.lp-sld-reco--edge { transform: none; }
/* 超限策略 pill 单选 */
.lp-policy { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding-top: 12px; border-top: 1px dashed var(--border); flex-wrap: wrap; }
.lp-policy .wb-flabel { margin: 0; }
.lp-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.lp-opt { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--fill); font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease, box-shadow .12s ease; }
.lp-opt:hover { border-color: var(--border-2); }
.lp-opt.on, .lp-opt.on:hover { background: var(--accent-t); border-color: var(--accent); color: var(--accent-d); box-shadow: 0 0 0 3px var(--ring); }
/* 自主级别 segmented */
.lp-lv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 2px 0 4px; }
@media (max-width: 720px) { .lp-lv { grid-template-columns: 1fr; } }
.lp-lv-tile { display: flex; flex-direction: column; gap: 2px; padding: 11px 12px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--fill); text-align: left; font: inherit; cursor: pointer; transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
.lp-lv-tile:hover { border-color: var(--border-2); }
.lp-lv-tile.on, .lp-lv-tile.on:hover { background: var(--accent-t); border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
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
.lp-empty-yaml { margin: 10px 0 0; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--code-bg); border: 1px solid var(--code-border); font-family: var(--mono); font-size: 11.5px; line-height: 1.6; color: var(--text-2); overflow-x: auto; }
/* ==== T7：Loop 卡审阅面重构（空态终端引导 + 字段生产者徽章 + 三方关系条）——交互真相源
   design-demos/v6-config-copilot.html 方案 A。徽章三色直接指派既有 token（agent=accent 三件套、
   sys=fill-2 中性、human=ink 深底铭牌，同 .lp-lv-tile.on/.tab--active 既定 --ink 用法），
   无新原色、无需 color-mix（决议 #9）。上方 .lp-empty-yaml 随本次空态改版成为死代码
   （EMPTY_EXAMPLE 常量已删），按热点文件「只追加不改既有行」纪律不删，登记供后续清理。 ==== */
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
/* ==== T11：进度行展开详情 + 动作接线 + running 行日志区 ——对照 demo v5 进度段
   .prg-row--open/.prg-detail/.prg-dfoot/.prg-logwrap，全部走既有 token，无新原色。 ==== */
.prg-row__main { cursor: pointer; }
.prg-row--open .prg-caret { transform: rotate(0deg); }
/* 行内展开的详情面：--fill 底与行区分；内嵌 TaskDetail 卡去掉自己的卡壳（贴面不叠框） */
.prg-detail { background: var(--fill); border-top: 1px solid var(--border); padding: 2px 16px 12px; }
.prg-detail .dt { background: transparent; border: 0; box-shadow: none; padding: 0; }
/* --fill 底上字段格/未选中 tab 换 --card 底保住轮廓（demo prg-detail 同款覆写） */
.prg-detail .dt-field { background: var(--card); }
.prg-detail .dt-field--miss { background: transparent; }
.prg-detail .dt-tab:not(.dt-tab--cur):not(.dt-tab--fail) { background: var(--card); }
.prg-detail .dt-tab:not(.dt-tab--cur):not(.dt-tab--fail):hover { background: var(--fill-2); }
/* 动作条主按钮（放行/重试）：--btn-bg 蓝实底白字（视觉纪律：主按钮禁黑实底） */
.prg-btn--primary { background: var(--btn-bg); border-color: var(--btn-bg); color: var(--btn-fg); }
.prg-btn--primary:hover { border-color: var(--btn-bg); color: var(--btn-fg); opacity: .9; }
.prg-btn:disabled { opacity: .55; cursor: not-allowed; }
/* 无动作行的说明（等 agent / 排队）：dt-foot 按钮位上的纯文本 */
.prg-dfoot-note { font-size: 12.5px; color: var(--text-3); }
/* running 行日志区（当前阶段 pane 尾部，经 TaskDetail curStageExtra 插槽挂载） */
.prg-logwrap { margin-top: 10px; border: 1px solid var(--code-border); border-radius: var(--radius-sm); background: var(--code-bg); overflow: hidden; }
.prg-logbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--code-border); }
.prg-loglabel { font-size: 11px; color: var(--text-3); }
.prg-follow { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
.prg-log { margin: 0; padding: 10px; max-height: 200px; overflow: auto; font-size: 11.5px; line-height: 1.6; color: var(--text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.prg-lognote { margin: 0; padding: 6px 10px; border-top: 1px solid var(--code-border); font-size: 11.5px; color: var(--text-3); }
/* ==== T9 收件箱 v5（ibx- 区块）—— master-detail：左行列表 + 右 356px sticky 详情。
   对照 design-demos/v5-progress-workbench.html 收件箱段；全部走既有 token，无新原色。
   选中态 = accent 描边 + ring（同 demo .ibx-row--on）；焦点环沿既有 .kbd-focus outline。 ==== */
.ibx-grid { display: grid; grid-template-columns: minmax(0, 1fr) 356px; gap: 20px; align-items: start; }
.ibx-side { position: sticky; top: 76px; min-width: 0; }
.ibx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ibx-row { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 11px 14px; cursor: pointer; transition: background .12s ease, border-color .12s ease, box-shadow .12s ease; }
.ibx-row:hover { background: var(--fill); }
.ibx-row--on { background: var(--accent-t); border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
.ibx-row--on:hover { background: var(--accent-t); }
.ibx-row.kbd-focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.ibx-r1 { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.ibx-name { font-family: var(--mono); font-size: 13.5px; font-weight: 600; color: var(--text); }
.ibx-wf { font-size: 12px; color: var(--text-3); font-family: var(--mono); }
.ibx-sp { flex: 1; }
.ibx-time { font-size: 12px; color: var(--text-3); font-family: var(--mono); flex: none; }
.ibx-lead { margin-top: 7px; font-size: 13px; color: var(--text-2); line-height: 1.55; }
.ibx-r2 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
/* 结论式语义徽章（demo badge--green/--red 对位）：绿=证据齐可前进，红=要人裁决（同 spec §1 家族） */
.badge--green { background: var(--green-t); color: var(--green-d); }
.badge--red { display: inline-flex; align-items: center; gap: 5px; background: var(--red-t); color: var(--red-d); }
.badge--red .dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; flex: none; animation: prg-blink 1.3s ease-in-out infinite; }
/* 动作条按钮（TaskDetail dt-foot-btns 内，宿主注入）：不折行 + 收窄到 sm 尺寸 */
.ibx-act { white-space: nowrap; padding: 6px 12px; font-size: 12px; }
/* Esc 收起后的占位卡 */
.ibx-collapsed-in { padding: 34px 18px; text-align: center; font-size: 12.5px; color: var(--text-3); line-height: 2; }
@media (max-width: 900px) {
  /* 窄屏：右栏详情下沉为纵排（sticky 失去意义） */
  .ibx-grid { grid-template-columns: 1fr; }
  .ibx-side { position: static; }
}
`
