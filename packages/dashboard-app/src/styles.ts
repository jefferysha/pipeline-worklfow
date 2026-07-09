/**
 * 全局样式（内联字符串，CSP 自足——零外部字体/CDN/图片）。设计语言：「工票车间」
 * （spec：docs/superpowers/specs/2026-07-09-dashboard-redesign-design.md §1）——
 * 白纸双色功能语义：绿=流水线在跑/正向操作，朱红=需要人出面（复核门/回退/删除/错误），
 * 深绿铭牌=结构性分组头；等宽字体承担全部 id/数字；票根虚线是唯一装饰元素。
 * 深浅色自适应三段式（机制沿用）：
 *   · 默认浅色；@media (prefers-color-scheme: dark) 跟随系统；
 *   · [data-theme="dark"] / [data-theme="light"] 用户显式切换覆盖系统（两向皆胜）。
 */
export const GLOBAL_CSS = `
:root {
  --bg: #ffffff; --surface: #ffffff; --well: #f2f6f3;
  --ink: #191c1a; --ink-soft: #3b423d; --ink-mute: #5b625d;
  --line: #dfe5e0; --plate: #1f4d33; --plate-fg: #f2f7f3;
  --green: #23854f; --green-soft: #e3f2e8;            /* oklch(0.60 0.158 150) 系 */
  --verm: #c23a26; --verm-soft: #fae3de;              /* oklch(0.55 0.19 30) 系 */
  --gate-bg: #c23a26; --gate-fg: #ffffff;
  --ok: #23854f; --ok-soft: #e3f2e8; --danger: #c23a26; --danger-soft: #fae3de;
  --run: #23854f; --focus: #1f4d33;
  --radius: 10px; --radius-sm: 8px; --radius-lg: 12px;
  --shadow: none; --shadow-dialog: 0 14px 40px rgba(10,22,14,.25);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #131a15; --surface: #131a15; --well: #1a231d;
    --ink: #e9efe9; --ink-soft: #c2cbc4; --ink-mute: #96a099;
    --line: #2c372f; --plate: #245c3c; --plate-fg: #eaf4ec;
    --green: #4dbb82; --green-soft: rgba(77,187,130,.15);
    --verm: #e56a54; --verm-soft: rgba(229,106,84,.16);
    --gate-bg: #b6402c; --gate-fg: #ffffff;
    --ok: #4dbb82; --ok-soft: rgba(77,187,130,.15); --danger: #e56a54; --danger-soft: rgba(229,106,84,.16);
    --run: #4dbb82; --focus: #6fcf9a;
    --shadow-dialog: 0 14px 40px rgba(0,0,0,.5);
  }
}
:root[data-theme="light"] {
  --bg: #ffffff; --surface: #ffffff; --well: #f2f6f3;
  --ink: #191c1a; --ink-soft: #3b423d; --ink-mute: #5b625d;
  --line: #dfe5e0; --plate: #1f4d33; --plate-fg: #f2f7f3;
  --green: #23854f; --green-soft: #e3f2e8;
  --verm: #c23a26; --verm-soft: #fae3de;
  --gate-bg: #c23a26; --gate-fg: #ffffff;
  --ok: #23854f; --ok-soft: #e3f2e8; --danger: #c23a26; --danger-soft: #fae3de;
  --run: #23854f; --focus: #1f4d33;
  --shadow-dialog: 0 14px 40px rgba(10,22,14,.25);
}
:root[data-theme="dark"] {
  --bg: #131a15; --surface: #131a15; --well: #1a231d;
  --ink: #e9efe9; --ink-soft: #c2cbc4; --ink-mute: #96a099;
  --line: #2c372f; --plate: #245c3c; --plate-fg: #eaf4ec;
  --green: #4dbb82; --green-soft: rgba(77,187,130,.15);
  --verm: #e56a54; --verm-soft: rgba(229,106,84,.16);
  --gate-bg: #b6402c; --gate-fg: #ffffff;
  --ok: #4dbb82; --ok-soft: rgba(77,187,130,.15); --danger: #e56a54; --danger-soft: rgba(229,106,84,.16);
  --run: #4dbb82; --focus: #6fcf9a;
  --shadow-dialog: 0 14px 40px rgba(0,0,0,.5);
}
* { box-sizing: border-box; }
body { margin: 0; }
.app { min-height: 100vh; background: var(--bg); color: var(--ink-soft); font-family: var(--font); font-size: 13px; line-height: 1.45; display: flex; flex-direction: column; }
.main { flex: 1; padding: 20px; max-width: 1200px; width: 100%; margin: 0 auto; }

/* ── 导航 ── */
.nav { display: flex; align-items: center; gap: 18px; padding: 10px 20px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 10; }
.nav__brand { font-weight: 700; color: var(--ink); font-size: 14px; white-space: nowrap; }
.nav__primary { display: flex; gap: 2px; }
.nav__item { position: relative; border: 0; background: transparent; color: var(--ink-mute); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 7px; cursor: pointer; transition: color .14s ease, background .14s ease; }
.nav__item:hover { color: var(--ink); }
.nav__item--active { background: var(--green-soft); color: var(--green); font-weight: 700; }
.nav__badge { display: inline-block; margin-left: 6px; min-width: 17px; padding: 0 5px; height: 17px; line-height: 17px; text-align: center; font-size: 10.5px; font-weight: 700; font-family: var(--mono); color: var(--gate-fg); background: var(--verm); border-radius: 9px; }
.nav__group { position: relative; }
.nav__dropdown { position: absolute; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; min-width: 150px; padding: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: 0 6px 16px rgba(10,22,14,.14); z-index: 20; }
.nav__dropdown-item { border: 0; background: transparent; color: var(--ink-mute); font: inherit; font-size: 13px; text-align: left; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.nav__dropdown-item:hover { color: var(--ink); background: var(--well); }
.nav__dropdown-item--active { background: var(--green-soft); color: var(--green); font-weight: 700; }
.nav__project { position: relative; }
.nav__project-btn { border: 1px solid var(--line); background: transparent; color: var(--ink-soft); font: inherit; font-size: 12.5px; font-family: var(--mono); padding: 4px 10px; border-radius: 7px; cursor: pointer; transition: border-color .14s ease; }
.nav__project-btn:hover { border-color: var(--ink-mute); }
.nav__project-label { font-size: 12.5px; font-family: var(--mono); color: var(--ink-soft); padding: 4px 2px; }
.nav__tools { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nav__tool { border: 1px solid var(--line); background: transparent; color: var(--ink-soft); border-radius: 7px; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 12.5px; transition: border-color .14s ease, color .14s ease; }
.nav__tool:hover { border-color: var(--ink-mute); color: var(--ink); }
.nav__conn { color: var(--ink-mute); font-size: 10px; }
.nav__conn--on { color: var(--ok); }

/* ── 视图头 / 提示 ── */
.view__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view__title { margin: 0; font-size: 18px; color: var(--ink); }
.view__subtitle { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-mute); }
.view__count { font-size: 12.5px; color: var(--green); font-weight: 700; white-space: nowrap; font-family: var(--mono); }
.view__note { padding: 20px; color: var(--ink-mute); font-size: 13px; }
.view__note--error { color: var(--verm); }

/* ── 空态（教学式 onboarding 复用同族）── */
.empty { max-width: 460px; margin: 8vh auto; text-align: center; padding: 30px 32px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); }
.empty__mark { width: 42px; height: 42px; border-radius: var(--radius); background: var(--plate); color: var(--plate-fg); font-size: 20px; line-height: 42px; margin: 0 auto 14px; font-weight: 700; }
.empty__title { margin: 0 0 8px; font-size: 17px; color: var(--ink); }
.empty__desc { margin: 0 0 18px; font-size: 12.5px; color: var(--ink-mute); line-height: 1.7; }

/* ── 卡片基元 ── */
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; transition: border-color .14s ease, box-shadow .14s ease; }
.card__name { font-weight: 600; color: var(--ink); font-size: 12.5px; font-family: var(--mono); }
.card__reason { margin: 8px 0 0; font-size: 12.5px; color: var(--ink-soft); }
.card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 11px; color: var(--ink-mute); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
.card__track { font-size: 10.5px; color: var(--ink-mute); background: var(--well); border-radius: 4px; padding: 1px 6px; }

/* ── 徽章语义（spec §1.3：实底徽章=等复核；phase 胶囊=中性；运行=绿点绿字）── */
.badge { display: inline-block; font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
.badge--phase { background: var(--well); color: var(--ink); border: 1px solid var(--line); font-family: var(--mono); font-weight: 600; }
.badge--gate { background: var(--gate-bg); color: var(--gate-fg); }
.badge--pending { background: var(--well); color: var(--ink-mute); }
.badge--run { background: transparent; color: var(--run); padding-left: 0; }
.g-phase { display: inline-block; font-family: var(--mono); font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--well); color: var(--ink); border: 1px solid var(--line); white-space: nowrap; }
.wf-label { font-family: var(--mono); font-size: 10.5px; color: var(--ink-mute); }

/* ── 工票行（收件箱/列表类视图的行基元）── */
.ticket-row { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 9px 12px; flex-wrap: wrap; transition: border-color .14s ease, box-shadow .14s ease; }
.ticket-row:hover { border-color: var(--green); }
.ticket-row--gate { border: 1.5px solid var(--verm); }
.ticket-row--gate:hover { border-color: var(--verm); box-shadow: 0 0 0 3px var(--verm-soft); }
.ticket-row__time { font-size: 11px; color: var(--ink-mute); }
.ticket-row__spacer { flex: 1; }
.inbox__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }

/* ── 快捷转换按钮（看板卡 hover 浮现 / 收件箱行常驻）── */
.qk { display: flex; gap: 6px; }
.qk__btn { font-size: 11.5px; font-weight: 700; padding: 4px 11px; border-radius: 6px; border: 1px solid var(--green); background: var(--surface); color: var(--green); cursor: pointer; font-family: var(--font); white-space: nowrap; transition: background .14s ease; }
.qk__btn:hover { background: var(--green-soft); }
.qk__btn--back { border-color: var(--verm); color: var(--verm); }
.qk__btn--back:hover { background: var(--verm-soft); }
.qk__btn:disabled { opacity: .45; cursor: not-allowed; }

/* ── 看板：分组（深绿铭牌）+ 列井 ── */
.board__group { margin-bottom: 22px; }
.board__group:last-child { margin-bottom: 4px; }
.board__group-head { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; background: var(--plate); color: var(--plate-fg); border-radius: var(--radius-sm); padding: 7px 12px; }
.board__group-caret { border: 0; background: transparent; color: var(--plate-fg); padding: 0 2px; font-size: 11px; cursor: pointer; }
.board__group-name { font-weight: 700; font-family: var(--mono); font-size: 13px; }
.board__group-meta { font-size: 12px; opacity: .75; }
.board__group-error { margin: 0 0 10px; padding: 8px 11px; border-radius: 7px; background: var(--verm-soft); color: var(--verm); font-size: 11.5px; font-weight: 600; }
.board__scroll { overflow-x: auto; padding-bottom: 4px; }
.board__grid { display: grid; grid-template-columns: repeat(7, minmax(126px, 1fr)); gap: 9px; align-items: start; }
.board__col { background: var(--well); border-radius: var(--radius); padding: 8px; display: flex; flex-direction: column; min-height: 108px; }
.board__col--target { outline: 2px solid var(--green); outline-offset: -2px; background: var(--green-soft); }
.board__col-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 2px 9px; }
.board__col-name { font-family: var(--mono); font-weight: 600; color: var(--ink); font-size: 11.5px; }
.board__col-count { font-family: var(--mono); font-size: 11px; color: var(--ink-mute); min-width: 18px; text-align: center; }
.board__col-body { display: flex; flex-direction: column; gap: 7px; }
.board__card { padding: 8px 10px; cursor: grab; display: flex; flex-direction: column; gap: 0; }
.board__card:hover { border-color: var(--green); }
.board__card--gate { border: 1.5px solid var(--verm); }
.board__card--gate:hover { border-color: var(--verm); box-shadow: 0 0 0 3px var(--verm-soft); }
.board__card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.board__card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--line); font-size: 11px; color: var(--ink-mute); }
.board__card .qk { margin-top: 7px; }
.board__col-empty { text-align: center; color: var(--ink-mute); font-size: 11.5px; opacity: .55; padding: 10px 0; }
.board__fold { text-align: center; color: var(--ink-mute); font-size: 11.5px; padding: 10px 6px; border-radius: var(--radius-sm); border: 1px dashed var(--line); }

/* ── 盖章确认（转换成功，motion.ts stampConfirm 驱动）── */
.stamp { position: absolute; right: 8px; top: -9px; background: var(--green); color: #ffffff; font-size: 10.5px; font-weight: 800; border-radius: 999px; padding: 3px 9px; transform: rotate(-7deg); box-shadow: 0 2px 8px rgba(20,90,50,.35); pointer-events: none; white-space: nowrap; }

/* ── tabs（设置页等；活跃态=深绿铭牌）── */
.tabs { display: flex; gap: 6px; }
.tab { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: var(--radius-sm); padding: 6px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: border-color .14s ease; }
.tab:hover { border-color: var(--green); }
.tab--active { background: var(--plate); color: var(--plate-fg); border-color: var(--plate); }
.settings__panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
.settings__h2 { margin: 0 0 6px; font-size: 16px; color: var(--ink); }
.settings__desc { margin: 0 0 14px; font-size: 12.5px; color: var(--ink-mute); }
.settings__note { margin: 0 0 14px; font-size: 12px; color: var(--ink-mute); }
.axis { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.axis__row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--well); border-radius: var(--radius-sm); }
.axis__phase { font-weight: 700; color: var(--ink); min-width: 60px; font-family: var(--mono); font-size: 12px; }
.axis__arrow { color: var(--ink-mute); }
.axis__targets { color: var(--ink-soft); font-size: 12.5px; font-family: var(--mono); }
.matrix__scroll { overflow-x: auto; }
.matrix { border-collapse: collapse; width: 100%; font-size: 12px; }
.matrix th, .matrix td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
.matrix th { background: var(--well); color: var(--ink-mute); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
.matrix__phase { font-weight: 700; color: var(--ink); white-space: nowrap; font-family: var(--mono); }
.matrix__skills { margin: 0; padding-left: 16px; }
.matrix__none { color: var(--ink-mute); opacity: .6; }
.sk { display: inline-block; font-family: var(--mono); font-size: 10.5px; background: var(--green-soft); color: var(--green); border-radius: 5px; padding: 2px 7px; margin: 1px 3px 1px 0; font-weight: 600; }
.sk--add { background: transparent; border: 1px dashed var(--line); color: var(--ink-mute); cursor: pointer; }
.sk--add:hover { border-color: var(--green); color: var(--green); }

/* ── 页脚 / Advanced ── */
.footer { padding: 14px 20px; border-top: 1px solid var(--line); display: flex; align-items: center; gap: 16px; }
.footer__ver { margin-left: auto; font-size: 11.5px; color: var(--ink-mute); font-family: var(--mono); }
.advanced { flex: 1; }
.advanced__summary { cursor: pointer; font-size: 12.5px; color: var(--ink-mute); font-weight: 600; }
.advanced__summary:hover { color: var(--ink); }
.advanced__body { padding: 12px 0 0; }
.advanced__desc { font-size: 12px; color: var(--ink-mute); margin: 0 0 10px; }
.advanced__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.advanced__item { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
.advanced__name { color: var(--ink-soft); min-width: 130px; }
.advanced__when { color: var(--ink-mute); font-size: 12px; }

/* ── 按钮家族 ── */
.btn { border: 0; background: var(--green); color: #ffffff; border-radius: var(--radius-sm); padding: 8px 16px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: filter .14s ease; }
.btn:hover { filter: brightness(1.08); }
.btn--ghost { background: var(--surface); color: var(--ink-soft); border: 1px solid var(--line); font-weight: 600; }
.btn--ghost:hover { filter: none; border-color: var(--ink-mute); color: var(--ink); }
.btn--danger { background: var(--verm); }
.btn--verm-ghost { background: transparent; color: var(--verm); border: 1px solid var(--verm); font-weight: 700; }
.btn--verm-ghost:hover { filter: none; background: var(--verm-soft); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--icon { background: transparent; border: 1px solid transparent; color: var(--ink-mute); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; transition: color .14s ease, border-color .14s ease, background .14s ease; }
.btn--icon:hover { color: var(--verm); border-color: var(--line); background: var(--well); }

/* ── 对话框 / toast ── */
.dialog__backdrop { position: fixed; inset: 0; background: rgba(12,20,14,.38); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 20px 22px; width: min(420px, 92%); box-shadow: var(--shadow-dialog); }
.dialog__title { margin: 0 0 6px; font-size: 15px; color: var(--ink); font-weight: 700; }
.dialog__desc { margin: 0 0 16px; font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.dlg-cli { background: var(--well); border: 1px dashed var(--line); border-radius: 7px; padding: 8px 11px; font-family: var(--mono); font-size: 11px; color: var(--ink-mute); overflow-x: auto; white-space: nowrap; }

.flash { padding: 10px 20px; font-size: 12.5px; font-weight: 700; }
.flash--toast { background: var(--green); color: #ffffff; }
.flash--error { background: var(--verm); color: #ffffff; }

/* ── 表单控件（含错误态语义）── */
.input, .select {
  font: inherit; font-size: 12.5px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.input::placeholder { color: var(--ink-mute); }
.input:focus-visible, .select:focus-visible { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.input--error { border-color: var(--verm); }
.input--error:focus-visible { border-color: var(--verm); box-shadow: 0 0 0 3px var(--verm-soft); }
.select { cursor: pointer; }
.field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--ink-soft); font-weight: 600; }
.field .input, .field .select { font-weight: 400; }
.field__label { font-size: 10.5px; font-weight: 700; color: var(--plate); text-transform: uppercase; letter-spacing: .03em; }
:root[data-theme="dark"] .field__label { color: var(--green); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .field__label { color: var(--green); } }
.field__error { font-size: 11px; color: var(--verm); font-weight: 600; }
.field__hint { font-size: 11px; color: var(--ink-mute); font-family: var(--mono); font-weight: 400; }

/* ── workflow 编辑器 —— 列表页 ── */
.workflow-editor__list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.workflow-editor__item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; transition: border-color .14s ease; }
.workflow-editor__item:hover { border-color: var(--green); }
.workflow-editor__open { border: 0; background: transparent; padding: 0; font: inherit; font-size: 13px; font-weight: 600; font-family: var(--mono); color: var(--ink); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; }
.workflow-editor__open-mark { color: var(--green); font-size: 14px; line-height: 1; }
.workflow-editor__new { display: flex; gap: 8px; margin-top: 4px; }
.workflow-editor__new .input { flex: 1; }

/* ── workflow 编辑器 —— 画布（点阵网格底 + xyflow 主题化）── */
.workflow-canvas { display: flex; flex-direction: column; gap: 12px; }
.workflow-canvas__toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 34px; }
.workflow-canvas__crumb { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-mute); padding: 4px 4px 4px 0; }
.workflow-canvas__crumb-current { font-weight: 700; color: var(--ink); font-family: var(--mono); }
.workflow-canvas__spacer { flex: 1; }
.workflow-canvas__status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.workflow-canvas__status--ok { background: var(--green-soft); color: var(--green); }
.workflow-canvas__status--error { background: var(--verm-soft); color: var(--verm); }
.workflow-canvas__stage { position: relative; height: 520px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background-color: var(--bg); background-image: radial-gradient(var(--line) 1px, transparent 1px); background-size: 22px 22px; }
.workflow-canvas__stage .react-flow__renderer,
.workflow-canvas__stage .react-flow { background: transparent; }
.workflow-canvas__stage .react-flow__node {
  padding: 9px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--line);
  background: var(--surface); color: var(--ink); font: inherit; font-family: var(--mono); font-size: 12.5px; font-weight: 700;
  width: auto; transition: border-color .14s ease, box-shadow .14s ease;
}
.workflow-canvas__stage .react-flow__node.selected,
.workflow-canvas__stage .react-flow__node:focus-visible {
  border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft);
}
.workflow-canvas__stage .react-flow__node .badge { margin-left: 7px; }
.workflow-canvas__stage .react-flow__handle { width: 8px; height: 8px; background: var(--ink-mute); border: 2px solid var(--surface); }
.workflow-canvas__stage .react-flow__handle:hover { background: var(--green); }
.workflow-canvas__stage .react-flow__edge-path { stroke: var(--green); stroke-width: 1.5; }
.workflow-canvas__stage .react-flow__edge.selected .react-flow__edge-path,
.workflow-canvas__stage .react-flow__edge:hover .react-flow__edge-path { stroke: var(--green); stroke-width: 2.5; }
.workflow-canvas__stage .react-flow__edge-text { font: inherit; font-family: var(--mono); font-size: 10px; fill: var(--ink-mute); }
.workflow-canvas__stage .react-flow__edge-textbg { fill: var(--bg); }
.workflow-canvas__stage .react-flow__controls { border: 1px solid var(--line); border-radius: 7px; overflow: hidden; box-shadow: none; }
.workflow-canvas__stage .react-flow__controls-button { background: var(--surface); border-bottom: 1px solid var(--line); fill: var(--ink-soft); }
.workflow-canvas__stage .react-flow__controls-button:hover { background: var(--well); }
.workflow-canvas__stage .react-flow__attribution { display: none; }

/* ── 详情侧栏（画布右滑面板）── */
.step-detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(320px, 86%); z-index: 5;
  display: flex; flex-direction: column; gap: 14px; padding: 16px; overflow-y: auto;
  background: var(--surface); border-left: 1px solid var(--line); box-shadow: -10px 0 24px rgba(15,25,18,.10);
}
.step-detail-panel__head { display: flex; align-items: center; justify-content: space-between; }
.step-detail-panel__title { margin: 0; font-size: 13.5px; color: var(--ink); font-family: var(--mono); font-weight: 700; }
.step-detail-panel__section { display: flex; flex-direction: column; gap: 7px; }
.step-detail-panel__section h4 { margin: 0; font-size: 10.5px; font-weight: 700; color: var(--plate); text-transform: uppercase; letter-spacing: .03em; }
:root[data-theme="dark"] .step-detail-panel__section h4 { color: var(--green); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .step-detail-panel__section h4 { color: var(--green); } }
.step-detail-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.step-detail-panel__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 9px; background: var(--well); border-radius: 6px; font-size: 11.5px; color: var(--ink-soft); }
.step-detail-panel__row-name { font-family: var(--mono); color: var(--ink); font-weight: 600; }
.gd-form { display: flex; gap: 7px; align-items: center; }
.gd-form .select { flex: 1; }
.gd-form .gd-n { width: 64px; }

/* ── tap 流量查看器（Advanced 折叠面板内）── */
.traffic { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.traffic__note { margin: 0; font-size: 11px; color: var(--ink-mute); font-family: var(--mono); }
.traffic__loading { margin: 0; font-size: 12px; color: var(--ink-mute); }
.traffic__empty { margin: 0; font-size: 12px; color: var(--ink-mute); opacity: .75; }
.traffic__error { margin: 0; font-size: 11.5px; color: var(--verm); font-weight: 600; }
.traffic__sessions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.traffic__session-btn { display: flex; align-items: center; gap: 10px; width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 10px; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color .14s ease; }
.traffic__session-btn:hover { border-color: var(--green); }
.traffic__session-btn.is-selected { border: 1.5px solid var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.traffic__client { font-family: var(--mono); font-weight: 600; color: var(--ink); font-size: 12px; }
.traffic__count { font-size: 11px; color: var(--ink-mute); font-family: var(--mono); }
.traffic__status { margin-left: auto; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--well); color: var(--ink-mute); }
.traffic__status--active { background: var(--green-soft); color: var(--green); }
.traffic__records { margin: 0; padding: 10px 12px 10px 32px; background: var(--well); border: 1px dashed var(--line); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 11px; line-height: 1.7; color: var(--ink-soft); overflow-x: auto; }
.traffic__record { white-space: nowrap; }

/* ── AFK 工作台 ── */
.afk-split { display: flex; gap: 14px; align-items: stretch; }
.afk-list { flex: 0 0 280px; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.afk-enq { display: flex; gap: 7px; }
.afk-enq .input { flex: 1; min-width: 0; }
.afk-item { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 9px 11px; cursor: pointer; font: inherit; color: inherit; text-align: left; display: flex; flex-direction: column; gap: 6px; transition: border-color .14s ease, box-shadow .14s ease; }
.afk-item:hover { border-color: var(--green); }
.afk-item.is-active { border: 1.5px solid var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.afk-item.is-failed { border-color: var(--verm); }
.afk-itemtop { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.afk-itemmeta { font-size: 11px; color: var(--ink-mute); }
.afk-state { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
.afk-state--run { background: var(--green-soft); color: var(--green); }
.afk-state--queue { background: var(--well); color: var(--ink-mute); }
.afk-state--fail { background: var(--gate-bg); color: var(--gate-fg); }
.afk-state--pause { background: var(--well); color: var(--ink-soft); border: 1px dashed var(--line); }
.afk-detail { flex: 1; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.afk-dhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.afk-dtitle { margin: 0; font-size: 15px; color: var(--ink); font-family: var(--mono); font-weight: 700; }
.afk-dactions { display: flex; gap: 8px; }
.afk-dmeta { display: flex; gap: 16px; font-size: 11.5px; color: var(--ink-mute); flex-wrap: wrap; }
.afk-dmeta b { color: var(--ink-soft); font-weight: 600; font-family: var(--mono); }
.afk-loghead { font-size: 11px; color: var(--ink-mute); font-family: var(--mono); }
.afk-log { background: #10150f; color: #cde3cf; border-radius: var(--radius-sm); padding: 12px 14px; font-family: var(--mono); font-size: 11px; line-height: 1.7; overflow-x: auto; margin: 0; border: 1px solid var(--line); }
:root[data-theme="dark"] .afk-log { background: #0c110d; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .afk-log { background: #0c110d; } }
@media (max-width: 720px) { .afk-split { flex-direction: column; } .afk-list { flex: 1; } }

/* ── Loop 治理面板 ── */
.loop-row { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 6px; }
.loop-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 6px; border-radius: 6px; }
.loop-line:hover { background: var(--well); }
.loop-caret { color: var(--ink-mute); font-size: 11px; }
.loop-level { font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--plate); color: var(--plate-fg); white-space: nowrap; }
.loop-level__tag { font-weight: 400; opacity: .8; }
.loop-ready { font-size: 11.5px; color: var(--ink-mute); }
.loop-ready b { color: var(--green); font-family: var(--mono); }
.loop-detail { padding: 4px 8px 10px 28px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.loop-band { margin: 0; font-size: 11.5px; color: var(--ink-mute); }
.loop-reject { margin: 0; padding: 8px 11px; border-radius: 7px; background: var(--verm-soft); color: var(--verm); font-size: 11.5px; font-weight: 600; }

:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
@media (max-width: 720px) {
  .board__grid { grid-template-columns: repeat(7, minmax(140px, 1fr)); } .main { padding: 14px; }
  .step-detail-panel { width: 100%; }
}
`
