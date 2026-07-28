# Dashboard UI/UX 系统化优化验证报告（失败）

> Change：`dashboard-ui-ux-overhaul`
> 冻结构建：`e734b4be27fa89ac0a4f86344f10df09bdb9ad9e`
> 对比基线：`2d103e330f847e003ff5909097d892f5722cca04`
> 当前结论：失败，必须回到 Build 修复后重新冻结并全量验证

## 结论

冻结提交没有发现 Critical 或 High，但聚合后仍有 10 项 Medium/未通过验证项。按照
`tenon-verify` 的全量聚合规则，任一 Medium 均不得进入 Ship。本轮不在 Verify 修改实现，
将通过 `verify-fail` 返回 Build，修复全部问题后重新执行 Standards、Spec、E2E 与视觉全量审查。

## 验证身份与冻结边界

- 页面标题：`Tenon Dashboard`
- 生产实例项目 root：
  `/Users/a1234/.codex/worktrees/pipeline-worklfow-dashboard-ui-ux`
- 目标 Change：`dashboard-ui-ux-overhaul`
- 目标 phase：`verify`
- 冻结 SHA：
  `e734b4be27fa89ac0a4f86344f10df09bdb9ad9e`
- 三条有效轨开始/结束时真实 worktree 状态一致；截图、日志、隔离构建和 OpenSpec 演练均在
  `/private/tmp`，没有写回冻结实现、配置或生成物。

## 工程与行为证据

在保留权限和 symlink 的隔离副本中运行：

| 命令或检查 | 结果 |
| --- | --- |
| `npm run build` | exit 0 |
| `npm run typecheck:web` | 完整 build 后 exit 0 |
| `npm run test:web` | exit 0；51 files / 969 tests |
| `npm run check:comments` | exit 0 |
| `npm run check:architecture` | exit 0；扫描 615 个生产文件 |
| `git diff --check HEAD^ HEAD` | exit 0 |
| 新增代码视觉硬编码扫描 | 0 条命中 |
| 新鲜构建产物与冻结提交产物逐字节比较 | PASS |
| `/api/health`、`/api/snapshot` | exit 0；title/root/Change/phase/build_sha 身份正确 |

隔离副本首次在尚无 workspace 生成产物时直接执行 `npm run typecheck:web` 为 exit 2；完整
`npm run build` 生成前置产物后，同一 typecheck 为 exit 0。该首次结果保留为环境顺序证据，
不记为源码回归。

浏览器矩阵覆盖 1440×900、1024×768、390×844、320×700、明暗主题、Projects、Progress、
AFK、Workbench、Machine、设置面板、键盘、reduced motion、AFK 空态、离线、snapshot 错误与
加载态。64 项中 62 PASS、2 FAIL：

1. `390:focus-visible`：采集元素均标为可见，但聚合断言失败；在修复产品焦点/skip-link 问题后
   必须同时复核断言逻辑。
2. `reduced:nodes-final`：节点已为 `opacity:1`、`visibility:visible`、identity matrix，但严格断言
   未接受 identity matrix；必须修复或校准该验收断言后重跑，不在本轮擅自改判。

证据目录：
`/private/tmp/tenon-dashboard-verify-artifacts.Nht0tq/`，包含 21 张截图与
`browser-results.json`。唯一控制台网络错误来自故意中断 SSE 的异常场景。

## 独立代码审查

Reviewer 审查了冻结区间 94 个文件：33 个生产源码、7 个测试、5 个构建产物、9 个
设计/OpenSpec 文档和 40 个治理记录。全部治理 JSON/JSONL 可解析，文档摘要与冻结内容一致，
dist HTML 引用的 CSS/JS 存在，未发现新增危险 HTML/eval、`any`、外部请求、新依赖、裸色或
禁止缓动。

结论：FAIL；无 Critical/High，6 个 Medium。

## 真实视觉审查

视觉轨在生产实例上覆盖五个一级页面、四个视口、明暗主题、hover/focus/active/disabled 与
reduced motion。正常页面 SVG 均来自 Lucide，文档身份正确，浏览器 console 无产品错误。

证据目录：`/private/tmp/tenon-visual-verify.1o30Z1/`。初始和结束 Git 指纹完全一致。

结论：FAIL；无 Critical/High，4 个 Medium。

## 聚合 findings

### M1：320–359px 下 Overview 入口不可达

- `packages/dashboard-app/src/shell/Nav.tsx:72`
- `packages/dashboard-app/src/shell/Nav.test.tsx:56`

`max-[360px]:hidden` 隐藏唯一 `nav-overview`，五个底栏入口不包含 Overview。设计要求把移动品牌
入口移入顶部，而不是删除。修复后必须保持 ≥44×44px 触控目标并新增 320px 可达性测试。

### M2：primary/focus/selection 与 success/green 仍混用

- `packages/dashboard-app/src/workbench/StepperRail.tsx:140`
- `packages/dashboard-app/src/workbench/TrackSettings.tsx:59`
- `packages/dashboard-app/src/shell/Onboarding.tsx:45`

当前阶段、输入焦点和复制操作仍使用 green。交互、选中和焦点必须改用 accent/primary/ring；
green 仅用于成功、健康和完成状态，并增加静态回归检查。

### M3：明暗主题存在 WCAG AA 文本对比度失败

- `packages/dashboard-app/src/index.css:23`
- `packages/dashboard-app/src/shell/Onboarding.tsx:45`
- `packages/dashboard-app/src/workbench/LoopCard.tsx:157`
- `packages/dashboard-app/src/workbench/TimelineHookRows.tsx:80`
- `packages/dashboard-app/src/progress/ProgressToolbar.tsx:73`
- `packages/dashboard-app/src/workbench/TimelineStageStrip.tsx:67`

浅色 `#16a34a` 对白色约 3.30:1、对 code 背景约 3.10:1；暗色白字对 `#6d9bfb` 约 2.72:1，
均低于普通小字号文字 4.5:1。需要 success foreground 和 accent foreground 语义 token，并为
明暗主题添加自动对比度测试。

### M4：i18n 资源仍把字符当作图标形状

- `packages/dashboard-app/src/i18n/translations.ts:229,241-242,508`
- `packages/dashboard-app/src/i18n/translations.ts:1480,1488-1489,1746`

`✓`、`→`、`↩` 在实际 UI 中承担通过、前进和打回图标作用；复制状态已在浏览器中实际复现。
应从翻译文本移除这些图形字符，由消费组件结构化渲染 Lucide。`失败 ×{n}` 的 `×` 是次数记号，
可作为普通文本保留。

### M5：Lucide 线宽未统一为 1.75

- `packages/dashboard-app/src/shared/Dialog.tsx:168`
- `packages/dashboard-app/src/shared/TaskDocumentsSection.tsx:45`
- `packages/dashboard-app/src/shared/TaskDetail.tsx:305,338`

部分新增 Lucide 使用默认 2px 或显式 2px。应通过共享包装或显式属性统一
`strokeWidth={1.75}`，并扩展 Dialog、TaskDetail 和文档状态测试。

### M6：动态反馈状态缺少语义 role

- `packages/dashboard-app/src/progress/ProgressView.tsx:505-515`
- `packages/dashboard-app/src/shell/ProjectsView.tsx:248`
- `packages/dashboard-app/src/App.tsx:277,295,307,309`
- `packages/dashboard-app/src/workbench/WorkbenchHeader.tsx:54-63`

错误、加载、空态和保存结果未完整使用 `role="alert"`、`role="status"` 或匹配的
`aria-live`。需要按状态紧迫性补齐语义并增加状态切换测试。

### M7：Machine 在 320px 产生文档级横向溢出

- `packages/dashboard-app/src/machine/MachineView.tsx:202,211,219-225`

实测 `clientWidth=320`、`scrollWidth=365`；风险队列和“打开项目”按钮右缘超出视口，底部导航
随文档变宽。应允许内容收缩/换行并保持操作可见，新增 320px 文档宽度断言。

### M8：缺少跳到主内容的键盘入口

- `packages/dashboard-app/src/App.tsx:211-214`

首次 Tab 直接进入 rail，必须遍历完整导航才能到主内容，`main` 也没有稳定锚点。应添加只在
focus 时可见的 skip link 和 `main` id，并验证桌面/移动焦点顺序。

### M9：390px focus-visible 浏览器断言失败

现有结果中的各元素可见标识与聚合结论不一致。修复 M8 后需要核对焦点环是否被裁切、目标是否
真实可见，并修正断言的聚合逻辑；在此之前不得把该项视为通过。

### M10：reduced-motion 最终态断言失败

实际节点已是可见最终态，但验收器没有接受 CSS identity matrix。需要让断言同时接受
`none` 和等价 identity matrix，并重跑所有 reduced-motion 场景；本轮保留 FAIL。

## Codex CLI 轨降级

只读 Codex CLI 使用完整 `2d103e3...e734b4b` diff 启动，但输入为 1,981,743 字符，超过
1,048,576 字符上限，进程 exit 1，错误为：

`Input exceeds the maximum length of 1048576 characters`

按照 `tenon-verify` 的降级约定，该轨不作为额外产品失败；独立 Reviewer、E2E 和视觉三轨均已
完整运行，且已经给出明确 FAIL。

## OpenSpec 隔离应用演练

真实工作区：

- `openspec show dashboard-ui-ux-overhaul --json --deltas-only`：exit 0。
- `openspec validate dashboard-ui-ux-overhaul --strict`：exit 0。
- 演练前后 `openspec/specs/**/spec.md` SHA-256 摘要完全一致。
- 演练前后 `git status --porcelain=v1 -uall` 完全一致。

隔离副本 `/private/tmp/tenon-verify-dashboard-ui-ux.i96dEz/repo`：

- `openspec archive dashboard-ui-ux-overhaul --yes --json`：exit 0。
- 应用 8 条新增 requirement，`specsUpdated=true`。
- `openspec validate dashboard-ui-ux-system --type spec --strict`：exit 0。

隔离副本的 `openspec validate --all --strict` 同时报告 12 个通过、12 个既有无关规格失败。
这些失败不由本 Change 引入，也不把它们描述为通过；本 Change 的目标规格已单独 strict validate
通过。

## 逐文件 capability 回读

以下覆盖表由
`git diff --name-only 2d103e330f847e003ff5909097d892f5722cca04...e734b4be27fa89ac0a4f86344f10df09bdb9ad9e`
生成并逐组回读。组内每个实际改动文件均已映射：

| 改动文件或完整文件组 | capability spec | 回读 |
| --- | --- | --- |
| `docs/adr/2026-07-28-dashboard-ui-ux-overhaul.md` | `dashboard-ui-ux-system` | ☑ |
| `docs/research/2026-07-28-dashboard-ui-ux-audit.md` | `dashboard-ui-ux-system` | ☑ |
| `docs/superpowers/plans/2026-07-28-dashboard-ui-ux-overhaul.md` | `dashboard-ui-ux-system` | ☑ |
| `docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-design.md` | `dashboard-ui-ux-system` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/{proposal.md,design.md,tasks.md,REVIEW.md}` | `dashboard-ui-ux-system` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/specs/dashboard-ui-ux-system/spec.md` | `dashboard-ui-ux-system` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-document-locale.json` | `document-evidence-contract` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-documents.json` | `document-evidence-contract` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-history.jsonl` | `interaction-and-skill-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-run/current.json` | `dashboard-execution-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-run/pre-verify-review/*.json`（15 个冻结文件） | `dashboard-execution-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-run/revisions/*.json`（15 个冻结文件） | `dashboard-execution-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-transitions/*.json`（3 个冻结文件） | `interaction-and-skill-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-workflow-governance.json` | `interaction-and-skill-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline-workflow-plan.json` | `dashboard-execution-provenance` | ☑ |
| `openspec/changes/dashboard-ui-ux-overhaul/.pipeline.yaml` | `dashboard-execution-provenance` | ☑ |
| `packages/dashboard-app/dist/index.html` 与 `dist/assets/*`（4 个增删构建资产） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/App.tsx`、`App.test.tsx`、`index.css`、`i18n/translations.ts` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/shell/{Icon.test,Nav.test,Nav,ProjectsView}.tsx`（4 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/shared/{Dialog,Icon,PageHeader.test,PageHeader,TaskDetail,TaskDocumentsSection}.tsx`（6 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/progress/*`（冻结 diff 中 7 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/afk/AfkView.tsx` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/machine/MachineView.tsx` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/workbench/*`（冻结 diff 中 17 个文件） | `dashboard-ui-ux-system` | ☑ |

Reviewer 对上述 94 个实际文件逐一完成冻结对象审查；未把 Verify 阶段尚未提交的治理记录混入
产品 diff。

## 未覆盖与残余风险

- 未执行会改变真实状态的创建 Change、提交决策、真实 AFK 或重新探测操作。
- 未做 Firefox/Safari、真实屏幕阅读器人工验收或基线像素差分。
- 当前冻结数据没有 pass/failed badge 实例；相关字符图标由静态消费链和其他实际状态复现证明。
- Vite 主 bundle 仍有既有大 chunk 警告，本 Change 没有新增大型依赖。

## 回退决定

持续授权下采用安全默认值：修复，不接受偏差。下一步通过精确的 `verify-fail` review receipt
回到 Build，一次性修复 M1–M10，重跑 pre-Verify 两轴审查，重新提交并冻结新的 `build_sha`，
随后再次完整执行本报告全部轨道和 OpenSpec 演练。
