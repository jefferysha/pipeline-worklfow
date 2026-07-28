# Dashboard UI/UX 系统化优化 Verify 失败报告（第 1 轮）

## 结论

冻结目标 `a101dddcb79c2263fe691c1661b0be5316571d14` 未通过 Verify，必须返回 Build 修复，
不得进入 Ship。聚合结果为 Critical 0 / High 1 / Medium 3；未接受任何偏差。

## 冻结边界

- 基线：`origin/main` / `15fe619b2885b928dd27be9668cca6b0ee903c57`
- `build_sha`：`a101dddcb79c2263fe691c1661b0be5316571d14`
- Reviewer、E2E、视觉轨前后 HEAD 与 Dashboard 文件指纹一致。
- Verify 期间真实工作区仅存在 `build-complete` 生成的 Tenon canonical state；实现、测试、dist
  与截图没有被各轨改写。

## 四轨结果

| 轨道 | 结果 | 覆盖与证据 |
| --- | --- | --- |
| 独立 Reviewer | FAIL | 全量审查 `origin/main...build_sha` 的 75 个文件、调用方、OpenSpec、设计、计划、测试、dist 与截图 |
| E2E | FAIL | 从 `git archive build_sha` 建立隔离快照，以真实 CLI 启动 Dashboard，覆盖桌面/移动、主题、键盘、状态、reduced-motion 与回归分支 |
| Codex CLI | 降级且未形成最终判定 | 首次受 trusted-directory 阻断，第二次因 1,915,312 字符 diff 超过 1,048,576 输入限制；第三次完成完整文件读取、定向测试、构建一致性与调用方检查，但运行时反复出现 model cache 错误且未收束，人工终止。其沙箱内 `test:web` 仅因 `listen EPERM 127.0.0.1` 失败；主线程同一冻结实现已实际通过 967 项 |
| 视觉 Reviewer | PASS | 1200×870 浅色、390×844 深色/reduced-motion；Critical 0 / High 0 / Medium 0 |

## 聚合 findings

### HIGH — Dashboard 全域规格未完整实现

delta spec 使用 Dashboard-wide MUST，覆盖语义 token、主题一致性、所有交互控件和弹层的键盘语义、
GSAP 清理，以及表单、按钮、卡片、表格、对话框和提示区域的完整状态反馈；冻结实现只交付
SolutionView 页内导航与共享 Button。计划仍要求功能域切片持续至 OpenSpec 满足，但 Build tasks
已全部收口。修复策略：返回 Build，以有限任务补齐可验证的全域基础契约和代表性功能域状态，
不通过收窄规格掩盖原目标。

### MEDIUM — 设计文档与 hash 状态实现不一致

技术设计声明“不新增监听器、常驻状态”和“导航不触发 React 状态更新”，实现实际增加
`currentSection` 与 `hashchange` listener。实现具备卸载清理，本身没有生命周期缺陷；需要修订设计、
ADR 与计划，准确记录 URL hash 状态机、监听器边界和清理策略，并依法重新登记/read/review。

### MEDIUM — 共享 Button 消费者回归证据不足

移动规则影响 `default/sm/lg/icon/icon-sm/icon-lg`，但相邻测试只断言 default，浏览器主要覆盖
SolutionView 的 `lg`。需要补完整尺寸矩阵测试，并覆盖至少一个 Workbench/Dialog 的 sm、icon 与
disabled 真实消费者窄屏状态。

### MEDIUM — 移动 primary rail 不满足本 Change 的全域可访问性规格

390px 真实 Dashboard 中 5 个 primary rail 按钮和 settings 按钮高度均为 34px；settings 的唯一
文字在窄屏被 `display:none`，且没有 `aria-label`，所以 accessible name 为空。修复策略：移动端
将高频 rail 目标提升至 44px，为 settings 添加稳定双语 accessible name，并补键盘/浏览器回归。

## 已通过的目标行为

- SolutionView：7 个链接和 7 个真实目标、`aria-labelledby`、`aria-current="location"`、
  未知 hash 回归、listener cleanup、横向滚动、44px 目标与 reduced-motion 均通过。
- 1200×870 与 390×844 均无根级水平溢出；移动横向导航聚焦末项后
  `scrollLeft 0 → 262.5`，Enter 激活目标。
- 主题切换真实改变 card 色值并同步 localStorage；console、page error、request failure 与 4xx 为 0。
- disabled 生产 Button 为 44px、`cursor: not-allowed`、`opacity: .6`，点击无副作用。
- 视觉轨测得关键文本对比度 5.75–13.79、蓝色 eyebrow 6.66、浅色主 CTA 5.02。

## 测试与命令

- 定向 Vitest：2 files / 10 tests passed。
- `npm run typecheck:web`：passed。
- 主线程 `npm run test:web`：51 files / 967 tests passed。
- `npm run build:web`：passed；`npm run build`：passed。
- `git diff --check`：passed。
- 既有非失败噪声：Vite >500kB chunk warning，以及未修改域的 React `act(...)` 与 GSAP target warnings。

## Step 1.5 — exhaustive changed-file → capability mapping

以下互斥路径组完整覆盖 `git diff --name-only origin/main...build_sha` 的 75 个文件；每组均已逐项
回读 `openspec/changes/dashboard-ui-ux-overhaul-automation/specs/dashboard-ui-ux-system/spec.md`
并对照冻结 diff。FAIL 表示 capability 整体尚未满足，不表示该组每个文件自身均存在缺陷。

| 精确路径组 | 数量 | capability | 结果 |
| --- | ---: | --- | --- |
| `packages/dashboard-app/src/solution/{SolutionSectionNav.tsx,SolutionView.tsx,SolutionView.test.tsx,solutionModel.ts}` | 4 | `dashboard-ui-ux-system` | PASS |
| `packages/dashboard-app/src/components/ui/{button.tsx,button.test.tsx}` | 2 | `dashboard-ui-ux-system` | FAIL：消费者矩阵证据不足 |
| `packages/dashboard-app/dist/index.html`、`packages/dashboard-app/dist/assets/{index-BE-58ERT.css,index-CJG6YsIV.css,index-DL4AiWHY.js}` | 4 | `dashboard-ui-ux-system` | PASS：与冻结源码重建一致 |
| `docs/adr/**`、`docs/research/**`、`docs/superpowers/plans/**`、`docs/superpowers/specs/**`、`docs/ux/shots/dashboard-ui-ux-overhaul-automation/**` | 10 | `dashboard-ui-ux-system` | FAIL：设计陈述漂移 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/{proposal.md,design.md,tasks.md,REVIEW.md,specs/**,.pipeline-document-locale.json,.pipeline-documents.json,.pipeline-history.jsonl,.pipeline-workflow-governance.json,.pipeline-workflow-plan.json,.pipeline.yaml,.pipeline-run/**,.pipeline-transitions/**}` | 55 | `dashboard-ui-ux-system` 与 Change 治理契约 | FAIL：全域规格未闭环 |
| **合计** | **75** | | **FAIL** |

## Step 1.6 — OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`。
- 真实工作区 `openspec show dashboard-ui-ux-overhaul-automation --json --deltas-only`：exit 0，
  识别 6 个 ADDED requirements。
- `openspec validate dashboard-ui-ux-overhaul-automation --strict`：exit 0。
- 隔离副本：`/private/tmp/dashboard-ui-ux-verify.D6nj5h/repo`，从冻结提交建立。
- 副本内 `openspec archive dashboard-ui-ux-overhaul-automation --yes`：exit 0，创建
  `openspec/specs/dashboard-ui-ux-system/spec.md`；随后
  `openspec validate dashboard-ui-ux-system --strict`：exit 0。
- 真实主规格集合演练前后 digest 均为
  `8fb0fac777c1d342eee56c6e70f69d7a2f44be1ce5393ac5c7a55cf1a749fa21`，未被 Verify 修改。

## 决策记录

持续自主模式采用安全默认值“修复”，不接受偏差。下一轮 Build 必须先修复全部 High/Medium，
更新设计事实与任务，再重新运行 pre-Verify、冻结新的 `build_sha`；随后四轨必须同时回归本轮
findings 并重新全量审查，而不是只做定向复查。
