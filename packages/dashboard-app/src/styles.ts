/**
 * 全局样式（内联字符串，CSP 自足——零外部字体/CDN/图片）。深浅色自适应：
 *   · 默认浅色；@media (prefers-color-scheme: dark) 跟随系统；
 *   · [data-theme="dark"] / [data-theme="light"] 用户显式切换覆盖系统（两向皆胜）。
 */
export const GLOBAL_CSS = `
:root {
  --bg: #f7f7f8; --surface: #ffffff; --sunken: #f0f0f2;
  --ink: #17171a; --ink-soft: #3a3a40; --ink-mute: #74747c;
  --line: #e2e2e6; --accent: #2f6feb; --accent-soft: #e7f0ff;
  --danger: #c0392b; --danger-soft: #fdecea; --gate: #b8860b; --gate-soft: #fdf3d7;
  --ok: #2e7d32; --ok-soft: #e8f5e9; --radius: 10px; --radius-sm: 6px; --shadow: 0 1px 2px rgba(0,0,0,.06);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f11; --surface: #1a1a1e; --sunken: #141417;
    --ink: #f2f2f4; --ink-soft: #c9c9cf; --ink-mute: #8a8a93;
    --line: #2b2b31; --accent: #5b8def; --accent-soft: #1c2a44;
    --danger: #e07b6f; --danger-soft: #3a1f1c; --gate: #e0b34c; --gate-soft: #3a2f12;
    --ok: #6fbf73; --ok-soft: #17301c; --shadow: 0 1px 2px rgba(0,0,0,.4);
  }
}
:root[data-theme="light"] {
  --bg: #f7f7f8; --surface: #ffffff; --sunken: #f0f0f2;
  --ink: #17171a; --ink-soft: #3a3a40; --ink-mute: #74747c;
  --line: #e2e2e6; --accent: #2f6feb; --accent-soft: #e7f0ff;
  --danger: #c0392b; --danger-soft: #fdecea; --gate: #b8860b; --gate-soft: #fdf3d7;
  --ok: #2e7d32; --ok-soft: #e8f5e9;
  --shadow: 0 1px 2px rgba(0,0,0,.06);
}
:root[data-theme="dark"] {
  --bg: #0f0f11; --surface: #1a1a1e; --sunken: #141417;
  --ink: #f2f2f4; --ink-soft: #c9c9cf; --ink-mute: #8a8a93;
  --line: #2b2b31; --accent: #5b8def; --accent-soft: #1c2a44;
  --danger: #e07b6f; --danger-soft: #3a1f1c; --gate: #e0b34c; --gate-soft: #3a2f12;
  --ok: #6fbf73; --ok-soft: #17301c;
  --shadow: 0 1px 2px rgba(0,0,0,.4);
}
* { box-sizing: border-box; }
body { margin: 0; }
.app { min-height: 100vh; background: var(--bg); color: var(--ink-soft); font-family: var(--font); display: flex; flex-direction: column; }
.main { flex: 1; padding: 20px; max-width: 1200px; width: 100%; margin: 0 auto; }

.nav { display: flex; align-items: center; gap: 20px; padding: 10px 20px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 10; }
.nav__brand { font-weight: 700; color: var(--ink); font-size: 15px; }
.nav__primary { display: flex; gap: 4px; }
.nav__item { position: relative; border: 0; background: transparent; color: var(--ink-mute); font: inherit; font-size: 14px; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
.nav__item--active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav__badge { display: inline-block; margin-left: 6px; min-width: 18px; padding: 0 5px; height: 18px; line-height: 18px; text-align: center; font-size: 11px; font-weight: 700; color: #fff; background: var(--accent); border-radius: 9px; }
.nav__group { position: relative; }
.nav__dropdown { position: absolute; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; min-width: 140px; padding: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.12); z-index: 20; }
.nav__dropdown-item { border: 0; background: transparent; color: var(--ink-mute); font: inherit; font-size: 14px; text-align: left; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.nav__dropdown-item--active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav__tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.nav__tool { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 8px; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 13px; }
.nav__conn { color: var(--ink-mute); font-size: 10px; }
.nav__conn--on { color: var(--ok); }

.view__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view__title { margin: 0; font-size: 20px; color: var(--ink); }
.view__subtitle { margin: 4px 0 0; font-size: 13px; color: var(--ink-mute); }
.view__count { font-size: 13px; color: var(--accent); font-weight: 600; white-space: nowrap; }
.view__note { padding: 20px; color: var(--ink-mute); font-size: 14px; }
.view__note--error { color: var(--danger); }

.empty { max-width: 460px; margin: 8vh auto; text-align: center; padding: 40px 32px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.empty__mark { font-size: 34px; color: var(--ink-mute); margin-bottom: 12px; }
.empty__title { margin: 0 0 8px; font-size: 18px; color: var(--ink); }
.empty__desc { margin: 0 0 18px; font-size: 14px; color: var(--ink-mute); line-height: 1.6; }

.inbox__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 14px 16px; }
.inbox__card .card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.card__name { font-weight: 600; color: var(--ink); font-size: 15px; }
.card__reason { margin: 8px 0; font-size: 13px; color: var(--ink-soft); }
.card__meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--ink-mute); }
.card__track { font-family: var(--mono); }

.badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.badge--phase { background: var(--accent-soft); color: var(--accent); }
.badge--gate { background: var(--gate-soft); color: var(--gate); }
.badge--pending { background: var(--sunken); color: var(--ink-mute); }

.board__grid { display: grid; grid-template-columns: repeat(7, minmax(150px, 1fr)); gap: 12px; overflow-x: auto; align-items: start; }
.board__col { background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px; display: flex; flex-direction: column; min-height: 120px; }
.board__col--target { border-color: var(--accent); background: var(--accent-soft); }
.board__col-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.board__col-name { font-weight: 600; color: var(--ink); font-size: 13px; }
.board__col-count { background: var(--line); color: var(--ink-soft); border-radius: 999px; min-width: 18px; text-align: center; padding: 0 6px; font-size: 12px; font-weight: 700; }
.board__col-body { display: flex; flex-direction: column; gap: 8px; }
.board__card { padding: 8px 10px; cursor: grab; display: flex; flex-direction: column; gap: 4px; }
.board__col-empty { text-align: center; color: var(--ink-mute); font-size: 12px; opacity: .6; padding: 8px 0; }

.tabs { display: flex; gap: 4px; }
.tab { border: 1px solid var(--line); background: var(--surface); color: var(--ink-mute); border-radius: 8px; padding: 5px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.tab--active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.settings__panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
.settings__h2 { margin: 0 0 6px; font-size: 16px; color: var(--ink); }
.settings__desc { margin: 0 0 14px; font-size: 13px; color: var(--ink-mute); }
.settings__note { margin: 0 0 14px; font-size: 12px; color: var(--gate); }
.axis { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.axis__row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--sunken); border-radius: 8px; }
.axis__phase { font-weight: 600; color: var(--ink); min-width: 60px; }
.axis__arrow { color: var(--ink-mute); }
.axis__targets { color: var(--ink-soft); font-size: 13px; }
.matrix__scroll { overflow-x: auto; }
.matrix { border-collapse: collapse; width: 100%; font-size: 12px; }
.matrix th, .matrix td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
.matrix th { background: var(--sunken); color: var(--ink-mute); text-transform: uppercase; letter-spacing: .04em; }
.matrix__phase { font-weight: 600; color: var(--ink); white-space: nowrap; }
.matrix__skills { margin: 0; padding-left: 16px; }
.matrix__none { color: var(--ink-mute); }

.footer { padding: 14px 20px; border-top: 1px solid var(--line); display: flex; align-items: center; gap: 16px; }
.footer__ver { margin-left: auto; font-size: 12px; color: var(--ink-mute); font-family: var(--mono); }
.advanced { flex: 1; }
.advanced__summary { cursor: pointer; font-size: 13px; color: var(--ink-mute); font-weight: 600; }
.advanced__body { padding: 12px 0 0; }
.advanced__desc { font-size: 12px; color: var(--ink-mute); margin: 0 0 10px; }
.advanced__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.advanced__item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.advanced__name { color: var(--ink-soft); min-width: 130px; }
.advanced__when { color: var(--ink-mute); font-size: 12px; }

.btn { border: 0; background: var(--accent); color: #fff; border-radius: 8px; padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn--ghost { background: var(--surface); color: var(--ink-soft); border: 1px solid var(--line); }
.btn--danger { background: var(--danger); }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.dialog__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--surface); border-radius: var(--radius); padding: 22px; max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,.24); }
.dialog__title { margin: 0 0 8px; font-size: 16px; color: var(--ink); }
.dialog__desc { margin: 0 0 18px; font-size: 13px; color: var(--ink-soft); line-height: 1.6; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; }

.flash { padding: 10px 20px; font-size: 13px; }
.flash--toast { background: var(--accent-soft); color: var(--accent); }
.flash--error { background: var(--gate-soft); color: var(--danger); }

/* ── 表单控件（此前全仓库零样式，raw browser default）── */
.input, .select {
  font: inherit; font-size: 14px; color: var(--ink); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 12px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.input::placeholder { color: var(--ink-mute); }
.input:focus-visible, .select:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.select { cursor: pointer; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ink-soft); font-weight: 600; }
.field .input, .field .select { font-weight: 400; }

/* ── workflow 编辑器 —— 列表页（GOAL E8）── */
.workflow-editor__list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.workflow-editor__item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; transition: border-color .15s ease, transform .15s ease; }
.workflow-editor__item:hover { border-color: var(--accent); }
.workflow-editor__open { border: 0; background: transparent; padding: 0; font: inherit; font-size: 15px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; }
.workflow-editor__open-mark { color: var(--accent); font-size: 15px; line-height: 1; }
.workflow-editor__new { display: flex; gap: 8px; margin-top: 4px; }
.workflow-editor__new .input { flex: 1; }

/* ── workflow 编辑器 —— 顶层/钻入画布（GOAL E8）── */
.workflow-canvas { display: flex; flex-direction: column; gap: 12px; }
.workflow-canvas__toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 34px; }
.workflow-canvas__crumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-mute); padding: 4px 4px 4px 0; }
.workflow-canvas__crumb-current { font-weight: 600; color: var(--ink); }
.workflow-canvas__spacer { flex: 1; }
.workflow-canvas__status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; }
.workflow-canvas__status--ok { background: var(--ok-soft); color: var(--ok); }
.workflow-canvas__status--error { background: var(--danger-soft); color: var(--danger); }
.workflow-canvas__stage { position: relative; height: 520px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--sunken); }
.workflow-canvas__stage .react-flow__renderer,
.workflow-canvas__stage .react-flow { background: transparent; }

/* xyflow 主题化（仅覆盖视觉属性，不碰 xyflow 自身的定位/拖拽/命中测试逻辑） */
.workflow-canvas__stage .react-flow__node {
  padding: 8px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--line);
  background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600;
  box-shadow: var(--shadow); width: auto; transition: border-color .15s ease, box-shadow .15s ease;
}
.workflow-canvas__stage .react-flow__node.selected,
.workflow-canvas__stage .react-flow__node:focus-visible {
  border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
}
.workflow-canvas__stage .react-flow__handle { width: 8px; height: 8px; background: var(--ink-mute); border: 2px solid var(--surface); }
.workflow-canvas__stage .react-flow__handle:hover { background: var(--accent); }
.workflow-canvas__stage .react-flow__edge-path { stroke: var(--ink-mute); stroke-width: 1.5; }
.workflow-canvas__stage .react-flow__edge.selected .react-flow__edge-path,
.workflow-canvas__stage .react-flow__edge:hover .react-flow__edge-path { stroke: var(--accent); stroke-width: 2; }
.workflow-canvas__stage .react-flow__edge-text { font: inherit; font-size: 11px; fill: var(--ink-soft); }
.workflow-canvas__stage .react-flow__edge-textbg { fill: var(--sunken); }
.workflow-canvas__stage .react-flow__controls { box-shadow: var(--shadow); border-radius: var(--radius-sm); overflow: hidden; }
.workflow-canvas__stage .react-flow__controls-button { background: var(--surface); border-bottom: 1px solid var(--line); fill: var(--ink-soft); }
.workflow-canvas__stage .react-flow__controls-button:hover { background: var(--sunken); }
.workflow-canvas__stage .react-flow__attribution { display: none; }

/* 详情侧栏——画布舞台内右侧滑出的检查器面板（GSAP 负责滑入/滑出，见 WorkflowCanvas.tsx） */
.step-detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(320px, 86%); z-index: 5;
  display: flex; flex-direction: column; gap: 16px; padding: 18px; overflow-y: auto;
  background: var(--surface); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgba(0,0,0,.08);
}
.step-detail-panel__head { display: flex; align-items: center; justify-content: space-between; }
.step-detail-panel__title { margin: 0; font-size: 15px; color: var(--ink); }
.step-detail-panel__section { display: flex; flex-direction: column; gap: 8px; }
.step-detail-panel__section h4 { margin: 0; font-size: 12px; font-weight: 700; color: var(--ink-mute); text-transform: uppercase; letter-spacing: .04em; }
.step-detail-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.step-detail-panel__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; background: var(--sunken); border-radius: var(--radius-sm); font-size: 13px; color: var(--ink-soft); }
.step-detail-panel__row-name { font-family: var(--mono); color: var(--ink); }

/* 图标按钮（列表行的次级操作，如"删除"/"移除"——常驻但弱化，避免每行都摆一个满宽按钮） */
.btn--icon { background: transparent; border: 1px solid transparent; color: var(--ink-mute); border-radius: var(--radius-sm); padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; transition: color .15s ease, border-color .15s ease, background .15s ease; }
.btn--icon:hover { color: var(--danger); border-color: var(--line); background: var(--sunken); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
@media (max-width: 720px) {
  .board__grid { grid-template-columns: repeat(7, minmax(140px, 1fr)); } .main { padding: 14px; }
  .step-detail-panel { width: 100%; }
}
`
