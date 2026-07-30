# `canonical-state-version-status-20260730` Verify 失败报告

## 结论

- 冻结构建基线：`fb47fda23605aa50c340b712b09b681afb278b1f`
- 基线 tree：`094557033fb349a025dffae509eda4b07b0ca1c5`
- 上游基线：`ef728bf63f6902251e87fb9495a3dfafe10e42b7`
- Track：`frontend`（full preset，前后端共享契约）
- 结论：**FAIL**
- 决策：通过精确 `verify-fail` 返回 Build，修复混合项目把可读 Change 隐藏的 High。

## 独立 reviewer 轨

独立 reviewer 对冻结基线的 88 个变更路径做了只读审查，结论 **FAIL**。

### High — 混合项目在 Dashboard 隐藏可读 Changes

server 按规格返回 `ok=false`、可读 `changes` 和 `compatibilityIssues`，但 Dashboard 的
`progressModel.ts` 与 `workflowModel.ts` 会跳过整个 `!ok` 项目；`projectsModel.ts` 和
`ProjectsView.tsx` 又把它归入不可进入的“读不到”区域。

结果是：

- 带显式 root 的 URL 能显示升级 notice，却看不到同项目中的可读 Change；
- 正常 Projects 导航不能进入该项目；
- 当前 App 回归只覆盖“零个可读 Change + 一个兼容问题”，未覆盖共存路径。

这违反增量规格“可读 Change 继续出现在 `changes`”以及设计中的共存模型。修复必须加入
progress、workflow rules、project rows、Projects 导航和 App shell 的混合项目回归。

审查其余结论：包边界、typed error 判断顺序、路径脱敏 DTO、optional 滚动兼容、双语文案、
generated bundles 与 codec 500 行门禁均未发现额外 Critical/High/Medium/Low。

## E2E 轨

独立 E2E 轨严格只读，结果 **PASS**：

- kernel + server 定向测试：62/62；
- Dashboard decoder/component/Progress/App 定向测试：137/137；
- 真实服务快照确认目标 Change 位于 Verify，`build_sha` 精确匹配冻结 SHA；
- 前后 HEAD、tree、status 与 diff stat 一致，`git diff --check` 通过；
- 日志：`/tmp/tenon-verify-e2e.K0Z7RS/`。

绿测同时证明当前测试覆盖没有捕获 reviewer 的混合项目语义缺口。

## Codex 轨

启动了只读 `codex exec`，它读取冻结工作区并完成源码、生成物、治理 JSON 与定向测试检查：

- kernel/server 62/62；
- Dashboard 完整套件 70 files、1221/1221；
- `typecheck:web` 通过；
- `git diff --check` 通过。

该进程因本机 Codex model cache schema 警告及不可用的嵌套 thread/subagent 等待持续输出，
225,331 tokens 后仍未形成最终 PASS/FAIL，故主动终止。该轨按 Verify Skill 的异常降级处理，
不得登记为通过，也不能覆盖 reviewer 的 FAIL。

## Visual / browser 轨

独立 visual agent 未发现必需的 in-app Browser，只发现用户 Chrome；按 Browser Skill 没有擅自
切换或接管。它只读确认：

- PID 21761 是本 worktree 的生产 Dashboard bundle；
- `/` 为 200 且标题是 `Tenon Dashboard`；
- `/api/snapshot` 为 200，包含目标 root 与目标 Change；
- notice 使用语义化原生按钮、装饰图标隐藏和可见 focus 样式。

该独立轨未执行 viewport、fixture、双语、加载、空态、503、键盘、溢出与 console 矩阵，因此
判定 **BLOCKED**。Build 阶段已有同一实现的浏览器证据，但修复后 Verify 必须以新的冻结基线重跑，
并用“一个可读 Change + 一个未来版本 issue”的混合 fixture 覆盖本次 High。

## OpenSpec Verify

- OpenSpec 1.6.0；
- 当前 Change 严格校验通过，共 4 条 added requirements；
- 隔离副本 `/tmp/canonical-state-openspec.6fqOiC` 中 archive rehearsal 成功：
  `specsUpdated=true`、4 added，应用后的 capability 严格校验通过；
- 真实 `openspec/specs` 聚合 digest 前后保持
  `ee9ec373b59cc4648f05e744fe1a53c9a48612cbdbce099f0979c7f254c9b2f8`。

## 修复后必须新增的失败优先回归

1. `selectProgress` 保留含 compatibility issue 项目中的可读 Change。
2. `workflowRulesFromSnapshot` 保留上述 Change 的规则。
3. Projects row 可进入且同时表达兼容问题，不把整个项目归为不可达。
4. App 从 Projects 进入混合项目后同时展示 notice 与可读 Change。
5. Verify 浏览器 fixture 同时包含一个可读 Change 与一个未来版本 issue。

## 未验证项与风险

- 本报告是失败报告，不满足 `verify-pass`。
- 独立 visual 与 Codex 轨均未形成 PASS。
- 当前冻结基线不能进入 Ship；必须经精确 `verify-fail` 返回 Build 后修复并重新冻结。
