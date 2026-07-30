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

## 第二次冻结 Verify

### 结论

- 冻结构建基线：`185f0a0d602b5a5f5a16cdcb41876e592e2ccdd7`
- 基线 tree：`9e1a5b86dbe661b854d9ba6be5d0e0dc3249b786`
- 上游基线：`ef728bf63f6902251e87fb9495a3dfafe10e42b7`
- Track：`frontend`（full preset，前后端共享契约）
- 结论：**FAIL**
- 聚合结果：0 Critical、0 High、3 Medium；必须一次性返回 Build 修复。

### Reviewer 轨

独立 reviewer 逐项审查 117 个冻结变更路径及所有受影响 capability，结论 **FAIL**：

1. **Medium — Machine 将兼容只读误报为损坏。**
   `packages/dashboard-app/src/machine/MachineView.tsx` 对所有 `ok=false` 项目生成
   `Project cannot be read: unknown error` 后提前跳过。兼容只读项目没有普通 `error`，且仍有
   可读 sibling；该逻辑既错误描述状态，也隐藏 sibling 的 automation 风险。
2. **Medium — 第 101 个兼容问题关闭整个恢复入口。**
   `packages/server/src/snapshot.ts` 把 issue overflow 写入自由文本 `error`；Dashboard 随后按
   普通 corruption 将项目判为不可导航，使已经返回的 100 个结构化 issue、刷新路径与可读 sibling
   全部不可访问。应使用有界结构化截断元数据，同时保持 compatibility-only 项目可导航。

除上述两项外，kernel typed error、decoder 顺序、DTO 脱敏、strict boundary、Progress/AFK/
Workbench 写能力、公共契约、生成资产和治理证据均未发现额外 Critical/High/Medium。

### E2E 轨

独立 E2E 轨严格使用冻结提交与仓库外隔离副本，结果 **PASS**：

- 真实 `http://127.0.0.1:18932` 健康检查通过；snapshot 精确返回一个
  `future-state` 兼容 issue 和可读 `readable-state`，issue 字段闭集且不泄露路径；
- kernel/server 64/64，Dashboard 242/242，共 306/306 定向测试通过，0 跳过；
- 干净 clone 初次因缺少 workspace 构建产物而失败；在隔离副本构建 kernel/server 后原命令通过；
- `typecheck:web` 在隔离副本通过；
- 前后真实 HEAD、working diff、cached diff、status 与 `openspec/specs` digest 精确一致；
- 日志：`/tmp/tenon-verify-e2e-hard.MrUATJ/`。

### Codex CLI 轨

只读 `codex exec` 在开始审查前被账户用量上限拒绝：

`You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Aug 5th, 2026 12:09 PM.`

该轨按 Verify Skill 的外部异常降级处理；没有生成 PASS/FAIL，也没有修改仓库。独立 reviewer 与
E2E 轨仍完整执行，Codex 外部额度问题不得误记为代码失败或绿色。

### Visual / browser 轨

独立 visual agent 作为唯一浏览器所有者，使用受控浏览器对真实生产 Dashboard 完成矩阵，结论
**FAIL**：

3. **Medium — 英文 503 恢复路径泄漏中文服务端错误。**
   locale 为英文时，snapshot 503 显示原始 `快照获取失败（503）`，且唯一恢复按钮仍是升级语义
   `Refresh after updating`，没有网络错误对应的重试标签。

其余浏览器证据通过：

- `1440×900`、`1024×768` 均确认标题 `Tenon Dashboard`、目标 root、
  `future-state` 的 2 > 1 升级要求与可读 `readable-state`；
- compatibility 状态没有 create/transition/cancel/stop 控件，AFK DOM 为 0，且没有
  `/api/automation` 或 `/api/afk` 请求；
- 中英文 notice、Tab → Shift+Tab → Tab → Enter、2px 可见 focus ring、禁用的
  `Refreshing status…` 加载态、空态、503 与恢复均已覆盖；
- 两个桌面尺寸横向 overflow 为 0；对比度最低 5.84:1；console/page error 为 0；
- 六张截图与结构化证据：`/tmp/tenon-version-status-visual/`。

### OpenSpec 与冻结完整性

- OpenSpec 1.6.0；
- `show --deltas-only` 返回 4 条 ADDED requirement，Change strict validate 1/1 通过；
- 隔离副本 archive rehearsal 成功，`specsUpdated=true`、added=4；应用后主 capability strict
  validate 1/1 通过；
- 真实 `openspec/specs` 聚合 digest 前后保持
  `ee9ec373b59cc4648f05e744fe1a53c9a48612cbdbce099f0979c7f254c9b2f8`；
- 冻结 HEAD、tree、working/cached diff 和 status 在全部轨前后保持一致。

### 第二次返工清单

1. Machine 只在普通 `project.error` 存在时输出 unreadable 风险；兼容只读项目继续检查可读 sibling。
2. overflow 使用有界结构化元数据，不借自由文本 `error` 破坏 compatibility-only 导航；补 101 项
   server → decoder → selection/UI 回归。
3. 英文网络错误不得展示中文 server 文案，提供与网络失败匹配的双语 retry 入口。
4. 修复后重新冻结新 SHA，并重新运行完整 Reviewer、E2E、Codex 降级判定与真实浏览器矩阵。
