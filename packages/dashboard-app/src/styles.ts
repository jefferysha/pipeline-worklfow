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
.nav { display: flex; align-items: center; gap: 18px; padding: 10px 20px; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.nav__brand { font-weight: 700; color: var(--text); font-size: 14px; white-space: nowrap; }
.nav__primary { display: flex; gap: 2px; }
.nav__item { position: relative; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 7px; cursor: pointer; transition: color .14s ease, background .14s ease; }
.nav__item:hover { color: var(--text); }
.nav__item--active { background: var(--green-t); color: var(--green); font-weight: 700; }
.nav__badge { display: inline-block; margin-left: 6px; min-width: 17px; padding: 0 5px; height: 17px; line-height: 17px; text-align: center; font-size: 10.5px; font-weight: 700; font-family: var(--mono); color: var(--red-d); background: var(--red-t); border-radius: 9px; }
.nav__group { position: relative; }
.nav__dropdown { position: absolute; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; min-width: 150px; padding: 4px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: 0 6px 16px rgba(10,22,14,.14); z-index: 20; }
.nav__dropdown-item { border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 13px; text-align: left; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.nav__dropdown-item:hover { color: var(--text); background: var(--fill); }
.nav__dropdown-item--active { background: var(--green-t); color: var(--green); font-weight: 700; }
.nav__project { position: relative; }
.nav__project-btn { border: 1px solid var(--border); background: transparent; color: var(--text-2); font: inherit; font-size: 12.5px; font-family: var(--mono); padding: 4px 10px; border-radius: 7px; cursor: pointer; transition: border-color .14s ease; }
.nav__project-btn:hover { border-color: var(--text-3); }
.nav__project-label { font-size: 12.5px; font-family: var(--mono); color: var(--text-2); padding: 4px 2px; }
.nav__tools { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nav__tool { border: 1px solid var(--border); background: transparent; color: var(--text-2); border-radius: 7px; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 12.5px; transition: border-color .14s ease, color .14s ease; }
.nav__tool:hover { border-color: var(--text-3); color: var(--text); }
.nav__conn { color: var(--text-3); font-size: 10px; }
.nav__conn--on { color: var(--green); }

/* ── 视图头 / 提示 ── */
.view__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view__title { margin: 0; font-size: 18px; color: var(--text); }
.view__subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--text-3); }
.view__count { font-size: 12.5px; color: var(--green); font-weight: 700; white-space: nowrap; font-family: var(--mono); }
.view__note { padding: 20px; color: var(--text-3); font-size: 13px; }
.view__note--error { color: var(--red); }

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

/* ── 看板：分组（--ink 铭牌）+ 列井 ── */
.board__group { margin-bottom: 22px; }
.board__group:last-child { margin-bottom: 4px; }
.board__group-head { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; background: var(--ink); color: var(--ink-fg); border-radius: var(--radius-sm); padding: 7px 12px; }
.board__group-caret { border: 0; background: transparent; color: var(--ink-fg); padding: 0 2px; font-size: 11px; cursor: pointer; }
.board__group-name { font-weight: 700; font-family: var(--mono); font-size: 13px; }
.board__group-meta { font-size: 12px; opacity: .75; }
.board__group-error { margin: 0 0 10px; padding: 8px 11px; border-radius: 7px; background: var(--red-t); color: var(--red); font-size: 11.5px; font-weight: 600; }
.board__scroll { overflow-x: auto; padding-bottom: 4px; }
.board__grid { display: grid; grid-template-columns: repeat(7, minmax(126px, 1fr)); gap: 9px; align-items: start; }
.board__col { background: var(--fill); border-radius: var(--radius); padding: 8px; display: flex; flex-direction: column; min-height: 108px; }
.board__col--target { outline: 2px solid var(--green); outline-offset: -2px; background: var(--green-t); }
.board__col-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 2px 9px; }
.board__col-name { font-family: var(--mono); font-weight: 600; color: var(--text); font-size: 11.5px; }
.board__col-count { font-family: var(--mono); font-size: 11px; color: var(--text-3); min-width: 18px; text-align: center; }
.board__col-body { display: flex; flex-direction: column; gap: 7px; }
.board__card { position: relative; padding: 8px 10px; cursor: grab; display: flex; flex-direction: column; gap: 0; }
.board__card:hover { border-color: var(--green); }
.board__card--gate { border: 1.5px solid var(--red); }
.board__card--gate:hover { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-t); }
.board__card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.board__card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--border); font-size: 11px; color: var(--text-3); }
.board__card .qk { margin-top: 7px; }
.board__col-empty { text-align: center; color: var(--text-3); font-size: 11.5px; opacity: .55; padding: 10px 0; }
.board__fold { text-align: center; color: var(--text-3); font-size: 11.5px; padding: 10px 6px; border-radius: var(--radius-sm); border: 1px dashed var(--border); }

/* ── 盖章确认（转换成功，motion.ts stampConfirm 驱动）── */
.stamp { position: absolute; right: 8px; top: -9px; background: var(--green); color: #ffffff; font-size: 10.5px; font-weight: 800; border-radius: 999px; padding: 3px 9px; transform: rotate(-7deg); box-shadow: 0 2px 8px rgba(20,90,50,.35); pointer-events: none; white-space: nowrap; }

/* ── tabs（设置页等；活跃态=--ink 铭牌）── */
.tabs { display: flex; gap: 6px; }
.tab { border: 1px solid var(--border); background: var(--card); color: var(--text-2); border-radius: var(--radius-sm); padding: 6px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: border-color .14s ease; }
.tab:hover { border-color: var(--green); }
.tab--active { background: var(--ink); color: var(--ink-fg); border-color: var(--ink); }
.settings__panel { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
.settings__h2 { margin: 0 0 6px; font-size: 16px; color: var(--text); }
.settings__desc { margin: 0 0 14px; font-size: 12.5px; color: var(--text-3); }
.settings__note { margin: 0 0 14px; font-size: 12px; color: var(--text-3); }
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
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.dlg-cli { background: var(--fill); border: 1px dashed var(--border); border-radius: 7px; padding: 8px 11px; font-family: var(--mono); font-size: 11px; color: var(--text-3); overflow-x: auto; white-space: nowrap; }

.flash { padding: 10px 20px; font-size: 12.5px; font-weight: 700; }
.flash--toast { background: var(--green); color: #ffffff; }
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

/* ── workflow 编辑器 —— 列表页 ── */
.workflow-editor__list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.workflow-editor__item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; transition: border-color .14s ease; }
.workflow-editor__item:hover { border-color: var(--green); }
.workflow-editor__open { border: 0; background: transparent; padding: 0; font: inherit; font-size: 13px; font-weight: 600; font-family: var(--mono); color: var(--text); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; }
.workflow-editor__open-mark { color: var(--green); font-size: 14px; line-height: 1; }
.workflow-editor__new { display: flex; gap: 8px; margin-top: 4px; }
.workflow-editor__new .input { flex: 1; }

/* ── workflow 编辑器 —— 画布（点阵网格底 + xyflow 主题化）── */
.workflow-canvas { display: flex; flex-direction: column; gap: 12px; }
.workflow-canvas__toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 34px; }
.workflow-canvas__crumb { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-3); padding: 4px 4px 4px 0; }
.workflow-canvas__crumb-current { font-weight: 700; color: var(--text); font-family: var(--mono); }
.workflow-canvas__spacer { flex: 1; }
.workflow-canvas__status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.workflow-canvas__status--ok { background: var(--green-t); color: var(--green); }
.workflow-canvas__status--error { background: var(--red-t); color: var(--red); }
.workflow-canvas__stage { position: relative; height: 520px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background-color: var(--bg); background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 22px 22px; }
.workflow-canvas__stage .react-flow__renderer,
.workflow-canvas__stage .react-flow { background: transparent; }
.workflow-canvas__stage .react-flow__node {
  padding: 9px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--border);
  background: var(--card); color: var(--text); font: inherit; font-family: var(--mono); font-size: 12.5px; font-weight: 700;
  width: auto; transition: border-color .14s ease, box-shadow .14s ease;
}
.workflow-canvas__stage .react-flow__node.selected,
.workflow-canvas__stage .react-flow__node:focus-visible {
  border-color: var(--green); box-shadow: 0 0 0 3px var(--green-t);
}
.workflow-canvas__stage .react-flow__node .badge { margin-left: 7px; }
.workflow-canvas__stage .react-flow__handle { width: 8px; height: 8px; background: var(--text-3); border: 2px solid var(--card); }
.workflow-canvas__stage .react-flow__handle:hover { background: var(--green); }
.workflow-canvas__stage .react-flow__edge-path { stroke: var(--green); stroke-width: 1.5; }
.workflow-canvas__stage .react-flow__edge.selected .react-flow__edge-path,
.workflow-canvas__stage .react-flow__edge:hover .react-flow__edge-path { stroke: var(--green); stroke-width: 2.5; }
.workflow-canvas__stage .react-flow__edge-text { font: inherit; font-family: var(--mono); font-size: 10px; fill: var(--text-3); }
.workflow-canvas__stage .react-flow__edge-textbg { fill: var(--bg); }
.workflow-canvas__stage .react-flow__controls { border: 1px solid var(--border); border-radius: 7px; overflow: hidden; box-shadow: none; }
.workflow-canvas__stage .react-flow__controls-button { background: var(--card); border-bottom: 1px solid var(--border); fill: var(--text-2); }
.workflow-canvas__stage .react-flow__controls-button:hover { background: var(--fill); }
.workflow-canvas__stage .react-flow__attribution { display: none; }

/* ── 详情侧栏（画布右滑面板）── */
.step-detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(320px, 86%); z-index: 5;
  display: flex; flex-direction: column; gap: 14px; padding: 16px; overflow-y: auto;
  background: var(--card); border-left: 1px solid var(--border); box-shadow: -10px 0 24px rgba(15,25,18,.10);
}
.step-detail-panel__head { display: flex; align-items: center; justify-content: space-between; }
.step-detail-panel__title { margin: 0; font-size: 13.5px; color: var(--text); font-family: var(--mono); font-weight: 700; }
.step-detail-panel__section { display: flex; flex-direction: column; gap: 7px; }
.step-detail-panel__section h4 { margin: 0; font-size: 10.5px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: .03em; }
:root[data-theme="dark"] .step-detail-panel__section h4 { color: var(--green); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .step-detail-panel__section h4 { color: var(--green); } }
.step-detail-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.step-detail-panel__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 9px; background: var(--fill); border-radius: 6px; font-size: 11.5px; color: var(--text-2); }
.step-detail-panel__row-name { font-family: var(--mono); color: var(--text); font-weight: 600; }
.gd-form { display: flex; gap: 7px; align-items: center; }
.gd-form .select { flex: 1; }
.gd-form .gd-n { width: 64px; }

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

/* ── AFK 工作台 ── */
.afk-split { display: flex; gap: 14px; align-items: stretch; }
.afk-list { flex: 0 0 280px; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.afk-enq { display: flex; gap: 7px; }
.afk-enq .input { flex: 1; min-width: 0; }
.afk-item { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 11px; cursor: pointer; font: inherit; color: inherit; text-align: left; display: flex; flex-direction: column; gap: 6px; transition: border-color .14s ease, box-shadow .14s ease; }
.afk-item:hover { border-color: var(--green); }
.afk-item.is-active { border: 1.5px solid var(--green); box-shadow: 0 0 0 3px var(--green-t); }
.afk-item.is-failed { border-color: var(--red); }
.afk-itemtop { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.afk-itemmeta { font-size: 11px; color: var(--text-3); }
.afk-state { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
.afk-state--run { background: var(--green-t); color: var(--green); }
.afk-state--queue { background: var(--fill); color: var(--text-3); }
.afk-state--fail { background: var(--red-t); color: var(--red-d); }
.afk-state--pause { background: var(--fill); color: var(--text-2); border: 1px dashed var(--border); }
.afk-detail { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.afk-dhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.afk-dtitle { margin: 0; font-size: 15px; color: var(--text); font-family: var(--mono); font-weight: 700; }
.afk-dactions { display: flex; gap: 8px; }
.afk-dmeta { display: flex; gap: 16px; font-size: 11.5px; color: var(--text-3); flex-wrap: wrap; }
.afk-dmeta b { color: var(--text-2); font-weight: 600; font-family: var(--mono); }
.afk-loghead { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.afk-log { background: #10150f; color: #cde3cf; border-radius: var(--radius-sm); padding: 12px 14px; font-family: var(--mono); font-size: 11px; line-height: 1.7; overflow-x: auto; margin: 0; border: 1px solid var(--border); }
:root[data-theme="dark"] .afk-log { background: #0c110d; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .afk-log { background: #0c110d; } }
@media (max-width: 720px) { .afk-split { flex-direction: column; } .afk-list { flex: 1; } }

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
.loop-reject { margin: 0; padding: 8px 11px; border-radius: 7px; background: var(--red-t); color: var(--red); font-size: 11.5px; font-weight: 600; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
@media (max-width: 720px) {
  .board__grid { grid-template-columns: repeat(7, minmax(140px, 1fr)); } .main { padding: 14px; }
  .step-detail-panel { width: 100%; }
}
`
