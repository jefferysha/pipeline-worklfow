# Dashboard UI/UX overhaul 第三次 Verify 报告（失败）

## 结论

- Change：`dashboard-ui-ux-overhaul-automation`
- Track：`frontend`
- 冻结 SHA：`d308742ca660fd974f8c856c2b8cd5c24b9463a7`
- 结论：**FAIL**
- 聚合严重度：Critical 0 / High 0 / Medium 2 / Low 1
- 决策：返回 Build 修复，不接受偏差；最终产品定位仍为 1024–1920px 电脑端。

Reviewer 轨确认两项 Medium 尚未闭环：真实共享 Dialog 与非模态设置叠层时，同一个 Escape
可能关闭两层；toast tween 在运行中切换 `prefers-reduced-motion` 时不会立即清理并直达终态。
视觉轨通过，测试/构建与主要桌面浏览器场景通过，但不能抵消 Reviewer 的阻断结论。

## 冻结与零输出屏障

- 主工作区前后 HEAD：
  `d308742ca660fd974f8c856c2b8cd5c24b9463a7`
- 主工作区 status fingerprint 前后：
  `32b44334d272c42ed7e6fd421de64b51e0dd142b3bb3a91ee003ae17e4d872a4`
- 主规格 digest 前后：
  `8fb0fac777c1d342eee56c6e70f69d7a2f44be1ce5393ac5c7a55cf1a749fa21`
- Reviewer、E2E、视觉和主线隔离演练均未写共享实现、配置、生成物或截图；本报告是轨道聚合后
  唯一写入仓库的 Verify 产物。

## 四轨结果

### 轨 1：Reviewer Agent — FAIL

覆盖 `origin/main...d308742c` 的完整冻结 diff、Change 文档、delta spec、源码、测试、dist 与
1024/1200/1440 桌面证据；上轮两项 High 及 Onboarding/主题测试问题均已闭环。

| Severity | Finding | 修复要求 |
| --- | --- | --- |
| Medium | `Nav.tsx` 的 document Escape listener 只检查 `defaultPrevented`；真实 `shared/Dialog.tsx` listener 注册更晚且不消费事件。设置先打开、再打开模态 Dialog 时，同一个 Escape 可能先关闭设置，再关闭 Dialog。现有测试只人工预设 `preventDefault()`，没有挂载真实 Dialog。 | Nav 在存在上层 `aria-modal=true` Dialog 时忽略 Escape，并增加真实叠层回归测试；或由模态层在更早阶段消费事件。 |
| Medium | `toastIn` 只在创建瞬间读取 `prefers-reduced-motion`。App 已在更新/卸载时 `kill()`，但 tween 运行中切换 reduce 不会立即终止并设置可见终态。 | 使用 `gsap.matchMedia()` 或等价媒体监听返回可清理 handle，补运行中媒体变化测试。 |

Reviewer 轨严重度：Critical 0 / High 0 / Medium 2 / Low 0。

### 轨 2：隔离 E2E — 部分完成项 PASS，整体不构成通过

隔离副本：`/private/tmp/tenon-verify-d308742.X15pvC/repo`

- 定向 Vitest：
  `npx vitest run --config packages/dashboard-app/vitest.config.ts
  packages/dashboard-app/src/App.test.tsx
  packages/dashboard-app/src/designSystem.test.tsx
  packages/dashboard-app/src/shared/motion.test.tsx
  packages/dashboard-app/src/shell/Nav.test.tsx
  packages/dashboard-app/src/shell/Onboarding.test.tsx`
  → 5 files / 99 tests passed。
- 全新副本首次 `npm run typecheck:web` 因 workspace dist 类型声明尚未构建而失败；执行
  `npm run build` 后重跑通过。这是构建顺序前置，不是源码类型错误。
- `npm run test:web` → 52 files / 992 tests passed。
- `npm run build` → passed；Vite 2006 modules，只有既有 >500k chunk warning。
- 1024 浅色：目标标题/H1、7 个 section、键盘导航、设置自然 Shift+Tab、Escape/focus return、
  system light→dark→light 与无 overflow 通过。
- 1200 system 深色 + reduced-motion：唯一 `aria-current`、0 running animations、
  `scroll-behavior=auto`、无 overflow/console/page error 通过。
- 1440 显式浅色与真实零项目：唯一 H1、两个包含完整命令的 24px 复制按钮、无 overflow/error
  通过。
- 因本轮已有确定阻断后要求停止非必要重复，隔离 E2E agent 未执行受控 500→重试恢复分支；
  Build 冻结前真实浏览器证据覆盖过该分支，但本项不冒充本轮隔离 E2E 通过。

日志与截图清单：
`/private/tmp/tenon-verify-d308742.X15pvC/final-evidence.txt`。

### 轨 3：Codex CLI — 降级

对排除二进制 dist/PNG 后的 372,966-byte 完整文本 diff 启动 Codex CLI 审查，运行期间出现：

`failed to renew cache TTL: missing field supports_reasoning_summaries`

进程持续无最终 PASS/FAIL，人工中止；日志：
`/private/tmp/dashboard-ui-ux-codex-review-d308.log`。本轨按 Tenon 的缺失/异常降级规则记录，
不覆盖 Reviewer 的 FAIL。

### 轨 4：视觉 — PASS

冻结副本 `/private/tmp/tenon-verify-d308742.FhdIjg`：

- 1024 light、1200 system dark reduced、1440 dark 均无横向溢出。
- 零项目唯一 H1 已修；复制按钮均为 54×24px，名称包含各自完整命令，focus-visible 清晰。
- overview 章节 hash/`aria-current`/sticky target、浅深色 token、对比度、Lucide 图标、
  reduced-motion、错误态 alert 与重试焦点均通过。
- Critical 0 / High 0 / Medium 0 / Low 1。
- Low：1024 下 Overview 仍偏长、卡片节奏略重复；sticky 章节导航已缓解，不阻断。

截图：`/private/tmp/tenon-d308742-*.png`。

## OpenSpec 隔离演练

隔离副本：`/private/tmp/dashboard-verify-d308.wmbd0p`

- `npx openspec show dashboard-ui-ux-overhaul-automation --json --deltas-only` → passed。
- `npx openspec validate dashboard-ui-ux-overhaul-automation --strict` → passed。
- `npx openspec archive dashboard-ui-ux-overhaul-automation --yes --json` → passed。
- archive 产出的
  `openspec/specs/dashboard-ui-ux-system/spec.md` 运行
  `npx openspec validate dashboard-ui-ux-system --type spec --strict` → passed，
  SHA-256 为 `5f143e1b96720582f2b6362d6711ddd5b28ee8f7756b30ff42516b83fbb1629c`。
- 全仓 `--specs --strict` 另有 7 个既有 capability 失败；本 Change 新生成的 capability 单独严格
  验证通过，真实主规格目录 digest 保持不变。

## 逐文件 capability 回读

以下分组覆盖 `git diff --name-only origin/main...d308742c` 的全部 170 个文件；组内每个文件均已
对照 `dashboard-ui-ux-system` delta spec 回读，Tenon 状态/证据文件同时对照
`document-evidence-contract` 与 `interaction-and-skill-provenance` 主规格。

| 改动文件组 | 对照 capability | 已回读 |
| --- | --- | --- |
| `packages/dashboard-app/src/App*`、`shell/Nav*`、`shell/Onboarding*`、`solution/*` | `dashboard-ui-ux-system` | ✓ |
| `packages/dashboard-app/src/components/ui/*`、`shared/motion*`、`index.css`、`i18n/translations.ts` | `dashboard-ui-ux-system` | ✓ |
| `packages/dashboard-app/dist/**` | `dashboard-ui-ux-system` 发布资产场景 | ✓ |
| `docs/ux/shots/dashboard-ui-ux-overhaul-automation/**`、`docs/superpowers/reports/evidence/**` | `dashboard-ui-ux-system` 浏览器证据场景 | ✓ |
| proposal/design/tasks/delta spec、ADR、计划、审计、REVIEW、失败报告 | `dashboard-ui-ux-system` + Change 文档契约 | ✓ |
| `.pipeline-run/pre-verify-review/**`、`.pipeline-run/revisions/**`、`.pipeline-transitions/**` | `interaction-and-skill-provenance` | ✓ |
| `.pipeline*.json`、`.pipeline*.jsonl`、`.pipeline.yaml` | `document-evidence-contract` | ✓ |

## 未验证项与剩余风险

- 未执行第三次隔离受控 500→重试恢复；本轮已因 Reviewer finding 失败，修复后必须重新完整执行。
- Codex CLI 未产出结论；修复后重试，若仍异常则继续按降级规则如实记录。
- PR #5 仍为开放且有同文件重叠；Ship 只能普通 push/rebase，不得 force push，PR 必须如实标注
  重叠和回滚风险。

## 回 Build 任务

1. 先以真实共享 Dialog 叠层测试复现 Escape 双关闭，再让非模态设置忽略上层模态 Escape。
2. 先以媒体条件切换测试复现运行 tween 未终止，再用可清理的 `gsap.matchMedia()` handle 修复。
3. 重跑定向、typecheck、全量 web 测试、全仓 build 与 1024/1200/1440 桌面浏览器验收。
4. 重新冻结并执行第四次完整 Reviewer、E2E、Codex（或诚实降级）、视觉和 OpenSpec 轨。
