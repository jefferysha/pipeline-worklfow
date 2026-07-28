# Dashboard UI/UX overhaul 第四次 Verify 报告（失败）

## 结论

- Change：`dashboard-ui-ux-overhaul-automation`
- Track：`frontend`
- 冻结 SHA：`7179e7612ea44cb6504092b803c0dedc16a3991c`
- 结论：**FAIL**
- 聚合严重度：Critical 0 / High 1 / Medium 1 / Low 3
- 决策：返回 Build 修复，不接受偏差；产品定位仍为 1024–1920px 电脑端，不增加手机端工作。

Reviewer、隔离 E2E 与 OpenSpec 演练均通过，但真实桌面项目列表暴露出一个高风险可区分性问题：
多个 worktree 共享相同 basename 时，可见项目名和 accessible name 完全相同，用户无法确认将进入
哪个 workspace。单项目零 change 页面同时缺少一级标题。两项在 `origin/main` 已存在，但本 Change
的目标是系统化优化整个电脑端 Dashboard，不能用“既有问题”抵消真实验收失败。

## 冻结与零输出屏障

- 主工作区前后 HEAD：
  `7179e7612ea44cb6504092b803c0dedc16a3991c`
- 主工作区 status fingerprint 前后：
  `c90e5c2245a64d3f794a4df72cede2ebc6f5be6aacf3c104d87814906284cc54`
- 主规格 digest 前后：
  `8fb0fac777c1d342eee56c6e70f69d7a2f44be1ce5393ac5c7a55cf1a749fa21`
- Reviewer、E2E、视觉、Codex CLI 与 OpenSpec 演练均未写共享实现、配置、生成物或截图；本报告和
  本轮任务修订是轨道聚合后的 Verify 产物。

## 四轨结果

### 轨 1：Reviewer Agent — PASS

Reviewer 对 `origin/main...7179e761` 的 189 个文件进行了完整复审，不是只看末次提交。

- Critical 0 / High 0 / Medium 0 / Low 2。
- App flash timeout/tween、system theme listener、Nav 非模态设置、真实共享 Dialog Escape、
  SolutionView 章节导航和 GSAP 动态 reduced-motion 生命周期均闭环。
- 隔离副本 `npm run test:web`：52 files / 996 tests passed。
- 隔离 `npm run build:web` 通过，重建后的 `index.html`、`index-CT2X1EJx.js` 和
  `index-DnZ1mCZ2.css` 与提交产物逐字节 SHA-256 一致。
- Low 仅为既有 React `act(...)`/GSAP 测试警告噪音，以及 1024px 下 Overview 内容较长；
  sticky 章节导航已降低后者的定位成本。

### 轨 2：隔离 E2E — PASS

隔离副本：`/private/tmp/tenon-verify-7179e761.wJFNAv/repo`

- 定向 Vitest：
  `App.test.tsx`、`designSystem.test.tsx`、`motion.test.tsx`、`Nav.test.tsx`、
  `Onboarding.test.tsx` → 5 files / 103 tests passed。此前“94”预期已过期，冻结 SHA 的真实数量
  为 103。
- `npm run build`、`npm run typecheck:web` 均通过。
- `npm run test:web` → 52 files / 996 tests passed；仅既有 warning。
- OpenSpec show 与 Change strict validate 通过。
- 从隔离 dist 启动真实 Dashboard，1024/1200/1440、浅/深/system、键盘、设置焦点、
  reduced-motion、根级无水平溢出与真实零项目空态均通过。
- 受控真实边界：
  `/api/snapshot` 首次 500 且 SSE 中断 → assertive alert 与“重试加载” →
  第二次 200 → 错误消失并恢复真实零项目 H1；请求序列、错误/恢复截图和日志均已保存。
- 隔离仓结束 status 为空；共享工作区前后指纹一致。

证据根目录：`/private/tmp/tenon-verify-7179e761.wJFNAv`。

### 轨 3：Codex CLI — 降级

Codex CLI 以 read-only sandbox 审查完整冻结 diff，完成源码、调用方、GSAP、dist、CI freshness 和
证据文件检查，未发现服务端安全或高危回归。CLI 的 `npm run typecheck:web` 通过；只读沙箱内
Vitest 因 Vite 需要创建临时 config timestamp 文件而以 `EPERM` 停在启动前，未冒充测试通过。

运行期间持续出现：

`failed to renew cache TTL: missing field supports_reasoning_summaries`

CLI 长时间未形成最终严重度结论后人工中止。本轨按 Tenon 的异常降级规则记录；独立 Reviewer 和
隔离 E2E 已提供正式代码与测试结论，但不能覆盖视觉轨的 FAIL。

### 轨 4：真实桌面视觉 — FAIL

目标服务 `http://127.0.0.1:18836` 已确认：

- title 为 `Tenon Dashboard`；
- 资源为 `index-CT2X1EJx.js` / `index-DnZ1mCZ2.css`；
- Overview 唯一 H1 为“让 coding agents 按可验证流程交付”；
- 1024/1200/1440 的主路径、明暗/system、键盘设置、Dialog、disabled、error 和
  reduced-motion 均无根级水平溢出或非预期 console/page error。

阻断项：

| Severity | Finding | 证据与修复要求 |
| --- | --- | --- |
| High | 真实项目页 12 个可达项目中，9 行 basename 都是 `pipeline-worklfow`；可见名与 `aria-label="打开项目 pipeline-worklfow 的进度"` 完全相同，只有 native `title` 隐藏了不同 root。鼠标、键盘和读屏用户不能在执行前区分 worktree，可能进入错误 workspace。 | `ProjectsView.tsx` 的 `rowId`、可见标签和 `projects.open_aria` 都只使用 `row.basename`；`origin/main` 同样存在。必须显示紧凑而可辨的 root/父路径，并让 accessible name 包含唯一 workspace 身份，增加同 basename 回归测试。 |
| Medium | 单项目零 change 页面只有 H2“这个项目还没有 change”，整页没有 H1。 | `Onboarding.tsx` 的 `no-change` 分支仍使用 H2；`origin/main` 同样存在。该分支是完整主内容页，必须提供唯一 H1，并增加相邻测试。 |
| Low | ProjectsView 的 snapshot loading 只是普通文本，没有 `role=status` / live region。 | 将加载文案升级为 polite status，并锁定相邻测试。 |

截图：

- `/private/tmp/tenon-7179e76-projects-1440-dark.png`
- `/private/tmp/tenon-7179e76-empty-no-change-1200-light.png`
- `/private/tmp/tenon-7179e76-loading-1024-system-light-reduced.png`
- `/private/tmp/tenon-7179e76-error-1200-dark-reduced.png`

## OpenSpec 隔离演练

隔离副本：`/private/tmp/dashboard-verify4-openspec.8eMMDi/repo`

- `npx openspec show dashboard-ui-ux-overhaul-automation --json` → passed。
- `npx openspec validate dashboard-ui-ux-overhaul-automation --strict` → passed。
- `npx openspec archive dashboard-ui-ux-overhaul-automation --yes` → passed。
- archive 生成的 `dashboard-ui-ux-system` 单独 strict validate → passed，SHA-256：
  `5f143e1b96720582f2b6362d6711ddd5b28ee8f7756b30ff42516b83fbb1629c`。
- 全仓 `--specs --strict` 仍有 7 个既有 capability 失败；本 Change 新 capability 单独通过，
  真实主规格 digest 保持不变。

## 逐文件 capability 回读

以下分组覆盖 `git diff --name-only origin/main...7179e761` 的全部 189 个文件；组内文件已对照
`dashboard-ui-ux-system` delta spec 回读，Tenon 状态/证据文件同时对照
`document-evidence-contract` 与 `interaction-and-skill-provenance` 主规格。

| 改动文件组 | 对照 capability | 已回读 |
| --- | --- | --- |
| `packages/dashboard-app/src/App*`、`shell/Nav*`、`shell/Onboarding*`、`solution/*` | `dashboard-ui-ux-system` | ✓ |
| `packages/dashboard-app/src/components/ui/*`、`shared/motion*`、`index.css`、`i18n/translations.ts` | `dashboard-ui-ux-system` | ✓ |
| `packages/dashboard-app/dist/**` | `dashboard-ui-ux-system` 发布资产场景 | ✓ |
| `docs/ux/shots/**`、`docs/superpowers/reports/evidence/**` | `dashboard-ui-ux-system` 浏览器证据场景 | ✓ |
| proposal/design/tasks/delta spec、ADR、计划、审计、REVIEW、四次失败报告 | `dashboard-ui-ux-system` + Change 文档契约 | ✓ |
| `.pipeline-run/**`、`.pipeline-transitions/**` | `interaction-and-skill-provenance` | ✓ |
| `.pipeline*.json`、`.pipeline*.jsonl`、`.pipeline.yaml` | `document-evidence-contract` | ✓ |

## 回 Build 任务

1. 以两个相同 basename、不同 root 的项目测试复现不可区分行；为桌面列表增加可见 root/父路径，
   让 accessible name 使用唯一 workspace 身份，同时避免 test id 冲突。
2. 将单项目零 change 空态提升为唯一 H1，并为 ProjectsView loading 增加 polite status。
3. 重跑定向测试、typecheck、全量 web 测试、全仓 build 和真实 1024/1200/1440 电脑端浏览器验收。
4. 重新冻结并执行第五次完整 Reviewer、E2E、Codex（或诚实降级）、视觉和 OpenSpec 轨。
