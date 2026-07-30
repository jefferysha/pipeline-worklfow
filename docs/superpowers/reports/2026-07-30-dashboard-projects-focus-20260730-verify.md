# Dashboard Projects 桌面聚焦验证报告

## 结论

本轮冻结基线 `ccbfe80f06aa431d98c4e32e69393a28c1cefb88` 的 Verify 结论为 **FAIL**。
CRITICAL 0、HIGH 0；聚合去重后仍有 4 个 MEDIUM 和 1 个 LOW。按 Tenon 规则回退 Build 修复，
不得把本报告用于 `verify-pass`。

## 冻结基线与范围

- Change：`dashboard-projects-focus-20260730`
- 分支：`codex/dashboard-projects-focus-20260730`
- worktree：`/Users/a1234/.codex/worktrees/b632/pipeline-worklfow`
- build SHA：`ccbfe80f06aa431d98c4e32e69393a28c1cefb88`
- 目标：Projects 域内搜索、状态聚焦、结果反馈、键盘操作与不可达项目呈现
- 明确不包含：手机端验收、API、Snapshot 契约、持久化、生产部署

## 四轨结果

### Reviewer Agent：FAIL

完整回读冻结提交的 53 个文件：7 个源码/i18n/测试文件、5 个生成 bundle、8 个设计/OpenSpec
文档、33 个 Tenon 状态与收据文件。

- MEDIUM：搜索 `<label>` 同时包裹输入框和清除按钮，清除按钮可能被错误纳入输入标签语义。
- MEDIUM：筛选项使用 `tablist/tab`，但不存在 `tabpanel`、`aria-controls` 或等价受控内容关系。
- LOW：实现计划仍引用不可被 Dashboard Vitest 发现的 `.test.ts`，实际文件为 `.test.tsx`。
- 查询谓词、全局计数、不可达揭示、Escape/清除恢复、GSAP 触发边界、安全边界和生成资产引用
  未发现其他问题。

### E2E / 自动化轨：PASS

隔离副本 `/tmp/dashboard-projects-frozen.Ix3WlF/repo` 检出精确冻结 SHA：

- `npm ci`：PASS；报告 7 个既有依赖 advisory（5 moderate、1 high、1 critical），本批未改依赖，
  本轨未评估可利用性。
- 定向 Projects 测试：PASS，2 files / 28 tests。
- 首次 `npm run typecheck:web`：因新副本缺少 `@tenon/kernel`、`@tenon/server` 生成类型而失败；
  `npm run build` PASS 后重跑：PASS。
- `npm run test:web`：PASS，69 files / 1,214 tests。
- 真实仓库前后指纹一致：HEAD、tracked diff SHA-256
  `1163ba9a261aaaf6193cd90de50f5221290c38c5c6a583739ee1bc532d3a8648`、staged diff 与
  untracked 文件均未漂移。
- 信息项：Vite 主 chunk 897.72 kB，超过既有 500 kB advisory 阈值。

### Codex CLI 轨：DEGRADED

`codex login status` 已确认 ChatGPT 登录，但完整冻结 diff 包含生成资产，共 2,185,083 字符，
超过 Codex `turn/start` 的 1,048,576 字符上限，进程退出 1。该轨未产生有效审查结论，按
`tenon-verify` 的缺失/异常降级规则记录，不将其伪报为独立 PASS；Reviewer 与 E2E 仍覆盖完整冻结靶。

### 视觉轨：FAIL

冻结代码与仓外截图只读审查：

- MEDIUM：不可达行整体 `opacity-70`，小字号 `text-text-3` 混合后估算对比度不足。
- MEDIUM：筛选器错误使用不完整 tab 语义，与 Reviewer finding 合并为同一修复项。
- MEDIUM（证据一致性）：`1024-dark-empty.png` 仍显示两个清除 X，而冻结源码/dist 只有一个
  自定义按钮，截图与冻结产物不一致。
- MEDIUM（证据覆盖）：冻结截图未展示实际不可达只读行，也没有 1200 与 1920 两档截图。
- 层级、间距、最大宽度、明暗 token、字体职责、空态单一主动作和搜索焦点通过；未发现渐变、
  emoji、模板化装饰或动画滥用。

## 逐文件 capability 回读

`git diff-tree --no-commit-id --name-only -r ccbfe80f…` 返回 53 个文件，全部逐项归组回读：

| 文件组 | 文件数 | 对应规范 | 结果 |
| --- | ---: | --- | --- |
| `packages/dashboard-app/src/**` | 7 | `openspec/specs/dashboard-ui-ux-system/spec.md` | 已回读；发现上述语义与对比度问题 |
| `packages/dashboard-app/dist/**` | 5 | `openspec/specs/dashboard-ui-ux-system/spec.md` | 已回读；引用闭合 |
| ADR、设计、计划、proposal、delta、tasks、REVIEW | 8 | 主规范 + Change delta | 已回读；计划扩展名需修正 |
| `.pipeline*`、pre-verify review、revisions、transitions | 33 | Tenon 治理证据 | 已回读；身份与事件链一致 |

## OpenSpec 隔离应用演练

- OpenSpec：1.6.0
- 真实主规范演练前/后摘要均为
  `ac489b1f42b1ceaf65c8598ecd1fe5807b239ea71363bbf1dd2c96a713494581`，未被 Verify 修改。
- `openspec show ... --json --deltas-only`：成功，1 个 ADDED requirement、7 个 scenarios。
- `openspec validate dashboard-projects-focus-20260730 --strict`：PASS。
- 隔离副本 `/tmp/dashboard-projects-focus-archive.TAJgfW`：
  `openspec archive ... --yes` 成功，主规范摘要从 `ac489b…` 变为 `ba0aa2…`；
  `openspec validate dashboard-ui-ux-system --strict`：PASS。
- 演练时 Change 尚有 5 个未来 phase task，CLI 因 `--yes` 明确提示后继续；真实归档必须等所有
  phase task 完成，并在 Archive 使用官方 Tenon 流程。

## 浏览器证据与限制

主浏览器轨曾运行 1024×768、1200×870、1440×900、1920×1080，并检查
`scrollWidth === clientWidth`、System/Light/Dark、键盘、成功/空态/不可达、离线/重连。
但提交给冻结视觉轨的仓外截图只有 1024 与 1440，且其中一张与冻结产物不一致，因此本轮证据不合格。
浏览器工具未提供 prefers-reduced-motion 模拟；reduced-motion 仅由组件集成测试证明。
未运行手机端验收。

## 回退 Build 修复清单

1. 把搜索标签改为显式 `htmlFor/id`，令 input 与清除按钮成为同级控件。
2. 把筛选器改为 `aria-pressed` 按钮组并保留 roving 键盘行为。
3. 去掉不可达行整体透明度，使用能满足可读性的语义文本层级。
4. 修正规划文档中的 `.test.tsx` 路径。
5. 重建生产资产，重新运行全量验证，重新冻结 SHA。
6. 从新冻结产物重新采集 1024、1200、1440、1920，以及不可达行和关键主题/状态截图。
