# Dashboard UI/UX 系统化优化 Verify 失败报告（第 2 轮）

## 结论

冻结目标 `eabfb33f7e07de7f09b562c144941e115d1789b7` 未通过 Verify，必须返回 Build，
不得进入 Ship。聚合结果为 Critical 0 / High 2 / Medium 4 / Low 2；未接受偏差。

本轮已按用户最终定位仅验收 1024–1920px 电脑端，旧的手机端 finding 未复用。

## 冻结与不变性

- 基线：`origin/main` / `15fe619b2885b928dd27be9668cca6b0ee903c57`
- `build_sha`：`eabfb33f7e07de7f09b562c144941e115d1789b7`
- 三个只读 agent 前后 HEAD 相同；主仓 `git status --porcelain=v1` 指纹始终为
  `d7be9b1c4ff4897adbd5c5bce017bb9a4da7d8747e23622a92f0be74281b1767`。
- Verify 期间没有实现、配置、生成物或截图写入主仓；本报告是唯一新增治理产物。

## 四轨结果

| 轨道 | 结果 | 证据 |
| --- | --- | --- |
| 独立 Reviewer | FAIL | 完整审查 `origin/main...build_sha`、冻结 spec、调用方、生成 dist 与测试；C/H/M/L = 0/2/2/1 |
| E2E | PASS | `git archive` 隔离副本，真实 CLI 启动 18932/18933；覆盖 1024/1200/1440、主题、键盘、空态、受控 500、恢复与 reduced-motion |
| Codex CLI | 降级 | 完整 diff 2,055,007 字符超过 1,048,576 限制；缩窄至源码与 spec 后因本机 model cache 异常长期不收束，65,212 tokens 后中止，未形成判定 |
| 视觉 Reviewer | FAIL | 隔离副本真实浏览器；C/H/M/L = 0/0/2/1 |

## 聚合 findings

### HIGH — Dashboard-wide 状态语义未闭环

冻结 spec 要求所有可达交互与 loading/error/empty/disabled/success 分支具有一致语义。Reviewer
确认 `App.tsx` 的部分动态 loading 仍是普通段落，不可达项目错误没有 alert/status/retry，
error flash 仍统一使用 `role=status`。现有浏览器证据只覆盖 Solution、zero-project 与 snapshot
首屏错误，不能证明 Dashboard-wide MUST。

### HIGH — 冻结 overlap 场景不可满足

PR #5 仍为 OPEN，且与冻结候选重叠 App、Nav、i18n、Solution、token 与 dist。冻结 spec 的
THEN 要求“选择无冲突文件或等待”，而本轮实际选择继续同文件实现并记录合并风险。当前实现与
冻结场景语义不一致，必须回 Spec 将用户持续执行授权、独立回滚和禁止 force push 的真实策略写准，
不能只在 proposal 中解释。

### MEDIUM — 非模态设置浮层不应形成全局焦点困笼

`Nav.tsx` 将 `aria-modal=false` 的设置浮层做成 Tab/Shift+Tab 困笼。背景仍可被鼠标操作，
与 Radix Dialog 叠加时两个 document keydown 可能处理同一次 Escape 并破坏焦点返回。应保留
初始焦点、Escape 与关闭后返回，但让非模态 Tab 顺序自然离开浮层，或改为真正模态实现。

### MEDIUM — 顶层 GSAP tween 缺少清理

`App.tsx` 在普通 `useEffect` 中调用 `toastIn`，没有持有 tween/context 并在 effect cleanup
中 revert/kill。全局 reduced-motion CSS 不能替代 GSAP tween 与 inline style 清理。

### MEDIUM — 零项目页面缺少顶级标题

视觉轨确认 `[data-testid=onboard-no-project]` 只有 H2“还没有注册任何项目”，整个主内容没有 H1，
屏幕阅读器按 heading 导航时缺少页面级标题。

### MEDIUM — 两个复制控件目标与名称不足

`onboard-copy` 与 `onboard-copy-doctor` 实测高度均为 14.656px，低于 WCAG 2.5.8 的 24px
最小目标；可访问名称都只有“复制”，在控件列表中无法区分要复制 `tenon init` 还是
`tenon doctor`。

### LOW

- system theme listener 实现配对正确，但相邻测试尚未断言切离 system 或卸载后
  `removeEventListener`。
- Overview 在 1024/1200/1440 下仍为约 4850/4217/4169px，卡片节奏略重复；sticky 章节导航
  已缓解定位，不阻断本轮。

## 通过项

- E2E 确认三档电脑端根宽与视口一致，无根级横向溢出；7 个章节链接与 7 个真实 target 完整。
- system/light/dark 三态、系统主题实时变化、章节键盘定位、hash、`aria-current`、设置初始焦点、
  Escape 与焦点返回均通过。
- reduced-motion 下 CSS transition、transform、scroll behavior 与 inline style 终态通过。
- 真实零项目 API、受控 snapshot 500、`role=alert`、`aria-live=assertive`、重试恢复与干净主路径
  console 均有真实运行证据。
- 移动专项已撤销；冻结 diff 未新增 44px/touch 规则，6 张手机截图已删除。
- dist 入口指向存在的当前 CSS/JS 资产；`git diff --check` 通过。

## 逐文件 Spec 回读

`git diff --name-only origin/main...eabfb33f` 共 132 个文件，已逐项按下列完整路径组回读；每组内
每个匹配文件均对照
`openspec/changes/dashboard-ui-ux-overhaul-automation/specs/dashboard-ui-ux-system/spec.md`：

| 改动文件（完整路径组） | capability | 结果 |
| --- | --- | --- |
| `docs/adr/2026-07-28-dashboard-ui-ux-overhaul-automation-explore.md` | dashboard-ui-ux-system | finding：overlap 决策与冻结场景不一致 |
| `docs/research/2026-07-28-dashboard-ui-ux-overhaul-automation-audit.md` | dashboard-ui-ux-system | 已回读；历史移动证据不计最终验收 |
| `docs/superpowers/{plans,reports,specs}/2026-07-28-dashboard-ui-ux-overhaul-automation*` | dashboard-ui-ux-system | 已回读；第 2 轮报告记录失败 |
| `docs/ux/shots/dashboard-ui-ux-overhaul-automation/*.png`（9 个电脑端交付文件） | dashboard-ui-ux-system | 已回读；桌面证据有效 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/.pipeline-document-locale.json`、`.pipeline-documents.json`、`.pipeline-history.jsonl`、`.pipeline-run/current.json`、`.pipeline-workflow-governance.json`、`.pipeline-workflow-plan.json`、`.pipeline.yaml` | workflow governance + dashboard-ui-ux-system | 已回读；仅 canonical 证据 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/.pipeline-run/pre-verify-review/000000-*` 至 `000033-*`（34 个） | workflow governance | 已回读；生成 review 快照 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/.pipeline-run/revisions/000000-*` 至 `000033-*`（34 个） | workflow governance | 已回读；生成 revision 快照 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/.pipeline-transitions/000001-*` 至 `000011-*`（11 个） | workflow governance | 已回读；生成 transition 快照 |
| `openspec/changes/dashboard-ui-ux-overhaul-automation/{REVIEW.md,design.md,proposal.md,tasks.md}` 与 `specs/dashboard-ui-ux-system/spec.md` | dashboard-ui-ux-system | finding：状态与 overlap 两条需修订/实现 |
| `packages/dashboard-app/dist/assets/{index-CJG6YsIV.css,index-DGjxN4O8.css,index-DV750WXl.js,index-wu6Z6rvd.js}`、`dist/index.html` | dashboard-ui-ux-system | 已回读；当前入口资产存在 |
| `packages/dashboard-app/src/App.tsx`、`App.test.tsx` | dashboard-ui-ux-system | finding：状态语义、GSAP cleanup、theme cleanup 测试 |
| `packages/dashboard-app/src/components/ui/{badge,button,dialog,dropdown-menu,input,select,table,tabs,tooltip}.tsx`、`button.test.tsx`、`designSystem.test.tsx` | dashboard-ui-ux-system | 已回读；共享状态与 reduced-motion 基线通过 |
| `packages/dashboard-app/src/{index.css,i18n/translations.ts}` | dashboard-ui-ux-system | 已回读；token 与中英文主题文案通过 |
| `packages/dashboard-app/src/shell/{Nav.tsx,Nav.test.tsx,Onboarding.tsx}` | dashboard-ui-ux-system | finding：非模态焦点、H1、复制控件名称/尺寸 |
| `packages/dashboard-app/src/solution/{SolutionSectionNav.tsx,SolutionView.tsx,SolutionView.test.tsx,solutionModel.ts}` | dashboard-ui-ux-system | 已回读；章节语义、hash 与 cleanup 通过 |

## OpenSpec 隔离应用演练

- `openspec show dashboard-ui-ux-overhaul-automation --json --deltas-only`：exit 0。
- `openspec validate dashboard-ui-ux-overhaul-automation --strict`：exit 0。
- 隔离副本：`/private/tmp/dashboard-ui-ux-verify2.cguZiF`，由冻结 SHA 的 `git archive` 建立。
- 副本执行 `openspec archive dashboard-ui-ux-overhaul-automation --yes --json`：exit 0，
  `specsUpdated=true`，added 6。
- 副本执行 `openspec validate dashboard-ui-ux-system --type spec --strict`：exit 0。
- 额外的 `openspec validate --all --strict` 为 exit 1，原因是冻结仓库中 12 个与本 Change 无关的
  活跃 change/spec 本身无效；本 Change 应用后的 `dashboard-ui-ux-system` 主规格单独 strict
  validate 已通过，因此未把无关失败伪装成本 Change 失败。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 前后均为
  `8fb0fac777c1d342eee56c6e70f69d7a2f44be1ce5393ac5c7a55cf1a749fa21`，未写真实主规格。

## 下一轮修复范围

1. 以 `requirements-changed` 返回 Spec，写准 overlap 场景，并把“完整状态反馈”约束到实际可达、
   可验证的 Dashboard shell 与本轮共享原语消费者，或补齐剩余可达状态语义。
2. Build 修复非模态设置焦点策略、GSAP cleanup、零项目 H1、复制按钮名称/目标，以及 theme
   listener cleanup 测试。
3. 重新运行全量构建、52 文件前端测试、1024/1200/1440 浏览器验收和全部四轨，不复用本轮结果。
