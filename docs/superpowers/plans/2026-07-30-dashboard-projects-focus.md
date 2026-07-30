---
change: dashboard-projects-focus-20260730
design-doc: docs/superpowers/specs/2026-07-30-dashboard-projects-focus-design.md
---

# Dashboard Projects 桌面聚焦实现计划

## 目标与边界

在 Projects 功能域内交付 basename/root 检索、四态状态聚焦、全局计数、当前结果摘要、
键盘 roving tabs 与可恢复零结果。只覆盖 1024–1920px 电脑端；不修改 Snapshot、API、项目发现、
公共状态或手机端契约，不增加依赖。

技术 prototype 不适用：真实生产 Dashboard 已确认现有 `ProjectRow` 事实、列表分区、动画触发条件、
主题和键盘基础能力；方案只做确定的域内纯派生与组件组合，没有待验证的数据、运行时或依赖未知项。

## Phase 1：Tracer bullet——纯模型贯穿 Projects

### Task 1：先锁定查询、状态与计数契约

- 新增 `packages/dashboard-app/src/shell/projectsFocusModel.test.ts`，覆盖 basename/root 大小写与空白、
  `all | attention | running | unreachable` 谓词、全局计数、查询与聚焦组合。
- 新增 `packages/dashboard-app/src/shell/projectsFocusModel.ts`，导出 `ProjectFocus`、
  `countProjectFocus` 与 `selectFocusedProjects`；只消费 `ProjectRow`，保持 O(n) 且无副作用。
- 运行：`npm run test:web -- --run packages/dashboard-app/src/shell/projectsFocusModel.test.ts`。

### Task 2：贯穿一个可见 happy path

- 新增 `packages/dashboard-app/src/shell/ProjectsFocusToolbar.tsx`，先实现搜索输入、状态 tabs 与结果摘要。
- 修改 `packages/dashboard-app/src/shell/ProjectsView.tsx`，接入模型并让查询命中可达项目这一条路径可用，
  同时保持默认无条件列表输出与现有 GSAP 依赖不变。
- 修改 `packages/dashboard-app/src/shell/ProjectsView.test.tsx`，先证明输入 basename 后只显示匹配项目。
- 运行：`npm run test:web -- --run packages/dashboard-app/src/shell/ProjectsView.test.tsx`。

此处建议 /clear：tracer bullet 已贯穿 component → state/model → existing snapshot render，可独立复核再继续。

## Phase 2：完整交互与不可达呈现

### Task 3：补齐键盘和恢复路径

- 在 `ProjectsFocusToolbar.tsx` 实现 ArrowLeft/ArrowRight/Home/End roving focus、搜索 Escape、
  清除条件与搜索焦点恢复。
- 在 `ProjectsView.test.tsx` 覆盖 tab 焦点/选中同步、Escape 保留状态、零结果清除与焦点回归。
- 验证每次只有选中 tab 的 `tabIndex=0`，结果摘要使用 `role=status`、`aria-live=polite`。
- 运行：`npm run test:web -- --run packages/dashboard-app/src/shell/ProjectsView.test.tsx`。

### Task 4：保持默认分区，揭示筛选后的不可达行

- 新增 `packages/dashboard-app/src/shell/ProjectsUnreachableSection.tsx`，把既有不可达分区提取为独立组件；
  默认保留折叠按钮，查询命中或 `unreachable` 聚焦时直接展示只读行。
- 修改 `ProjectsView.tsx` 组合筛选后的 need/rest/unreachable rows，并在零结果时呈现可恢复空态。
- 保持不可达项目 `role=group`、`aria-disabled=true`，不提供虚假的项目打开动作。
- 运行：`npm run test:web -- --run packages/dashboard-app/src/shell/ProjectsView.test.tsx packages/dashboard-app/src/shell/projectsFocusModel.test.ts`。

此处建议 /clear：完整交互、默认兼容和异常恢复已闭环，可在文案与视觉收尾前单独审查。

## Phase 3：文案、视觉与生产验证

### Task 5：补齐中英文和桌面视觉层级

- 修改 `packages/dashboard-app/src/i18n/translations.ts` 的 `projects.*` 中英文键段，加入搜索 label/placeholder、
  四态标签、结果摘要、清除动作和零结果说明。
- 工具栏只使用既有语义 token、Lucide、focus ring 与短 transition；1024px 起允许合理换行，
  不压缩项目身份和健康摘要，不新增手机端布局或触控要求。
- 不对逐键输入或状态切换新增 GSAP；保留既有集合指纹驱动的入场动画和 reduced-motion 分支。
- 运行：`npm run typecheck:web`。

### Task 6：自动化与真实浏览器验证

- 运行：
  - `npm run test:web -- --run packages/dashboard-app/src/shell/projectsFocusModel.test.ts packages/dashboard-app/src/shell/ProjectsView.test.tsx`
  - `npm run typecheck:web`
  - `npm run test:web`
  - `npm run build:web`
- 在标题为 `Tenon Dashboard`、URL 为目标端口、项目 root 为本 worktree 的真实生产 Dashboard 验收：
  1024×768、1200×870、1440×900、1920×1080；System/Light/Dark；键盘 tablist；搜索成功；
  零结果清除；不可达只读；离线提示；reduced-motion。
- 每档检查 `scrollWidth === clientWidth`；不得运行或声称手机端验收。

此处建议 /clear：build 证据完整后冻结 SHA，进入 Verify，不再混入实现变更。

## 兼容性、回滚与交付

- 默认 `all + 空查询` 是兼容锚点：既有分区、排序、项目打开、同名 worktree 身份与不可达折叠必须不变。
- 当前分支基于 PR #21 的同轮 Skill receipt 修复；以其远端分支作为 stacked PR base，明确依赖关系，
  不把依赖提交算入本批 UI 范围。PR #21 合并后按普通方式更新 base，禁止 force push。
- 回滚只需撤销域内模型、工具栏、不可达分区提取、ProjectsView 接线和对应 i18n/test 变更；
  无数据库、API、持久化或依赖回滚。
- Ship 前 PR 说明必须列出设计目标、前后差异、目标组件、可访问性、动效策略、Tenon Change/phase、
  实际测试、四档桌面浏览器证据、依赖 #21、风险和回滚。
