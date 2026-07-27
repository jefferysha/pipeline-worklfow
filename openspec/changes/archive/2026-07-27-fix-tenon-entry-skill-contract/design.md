# 设计

## 初始假设

已确认主编排入口只有一个机器可验证标识：插件 namespace 为 `tenon`，Skill id 为 `tenon`，
Codex 调用形式为 `tenon:tenon`。入口 id 进入 `product/identity.json`；doctor 直接消费生成的
TypeScript 身份，Codex AGENTS managed block 与静态 adapter 消费同一生成模板。身份门禁逐字验证
这些投影并确认 `skills/tenon/SKILL.md` 存在；仓库卫生门禁同时拒绝外部参考项目名称。

Dashboard 项目上下文采用显式和状态：`none | selected(root)`。机器注册表只提供可选择候选，
不能决定当前选择。URL 中经过登记校验的 `root` 或用户点击项目是仅有的选择来源；URL 无 `root`、
偏好失效、项目被移除时统一回到 `none`。`none` 不读历史 localStorage、不选 `projects[0]`，
不调用受项目约束 API，并把只能在单项目下运行的视图导向项目总览空态。

managed release 的宿主步骤采用 desired-state reconciliation，而不是把“命令调用次数”误当成
事务提交。WAL 在任何外部 mutation 前持久化规范化 before inventory、desired postcondition 与
replay policy；恢复先重新观察权威 inventory：已满足 desired 时只补 journal，仍精确等于 before
时才允许执行，其他状态一律 indeterminate。Dashboard 进程身份额外携带可选 transaction id：
release 事务只能收养/停止与当前 transaction id 精确一致的服务，普通启动没有该字段。

持续授权只来自共享 prompt classifier 的显式用户意图，并绑定当前 Change 与 host session。授权
不会跳过 Skill、OpenSpec 文档读取、guard 或 review request；它只允许在这些证据全部成立后为
同一 phase/event 写 delegated acknowledgement，且可撤销、不可跨 Change 继承。

Build→Verify 使用两层收敛而不是反复窄审。Build 在冻结候选前对当前完整 diff、全部受影响契约、
失败路径和发行门禁做一次 pre-Verify convergence review，只有
`pre_verify_review_result=pass` 才能 `build-complete`。Verify 仍对冻结基线做独立三轨复核，但
Reviewer brief 必须覆盖完整 diff；各轨全部结束后一次性聚合所有 severity findings，再决定
`verify-pass` 或 `verify-fail`。回退后字段重置为 pending，重试既回归旧 findings 也重审完整 diff。

## 风险

- 修改不完整会让源码检查通过但新安装仍出现缺 Skill。
- 只改 doctor 会掩盖 AGENTS 真实引用错误。
- 版本发布后若未重装 managed runtime，本机会继续运行旧包。
- 宿主若仍启用另一个工作流插件，其 hook 可能先于 Tenon 拒绝正确的 Skill 来源。
- 若只在 URL effect 删除 `root`，而选择模型或工作台仍回退首个项目，隐式上下文会从另一条路径复发。
- 若失效深链静默改指首个项目，用户会在错误仓库执行治理动作。
- 若只记录 host command 的 `started/completed`，命令成功但 completed journal 写失败时会重复外部
  mutation；必须以权威 inventory 对账，不能把“命令大概率幂等”当保证。
- 若 Dashboard 所有权只比较 release/stateScope/PID，并发启动的同 release 服务可能被误判为本事务
  所有；必须以 transaction id 建立不可混淆身份。
- 若持续授权只存在于自然语言提示或旧会话记忆，会跨 Change 泄漏或绕过 review；必须以 canonical
  Change-bound authority 与精确 receipt 证明。
- 若 Build 只修上一轮 findings 就立即冻结、Verify Reviewer 又只收到窄 brief，问题会逐轮暴露并
  制造低效回环；必须让 Build 先全量收敛、Verify 等待所有独立轨并一次性汇总。

## 待验证问题

- `AGENTS.md` 的 Tenon 静态块由哪个模板或生成器负责，如何建立零漂移断言？
- doctor 的 Codex contract skill 集是否应直接从发布 inventory 派生？
- 1.0.1 更新后，唯一 Selected Skill Root 是否能在无项目投影时全绿？
- 安装与 doctor 如何证明当前宿主只启用一个 Tenon 工作流插件身份？
- Dashboard 无 `root`、失效 `root`、项目移除和浏览器前进/后退是否都保持显式选择语义？
- 旧 canonical revision 缺少 `pre_verify_review_result` 时如何精确补默认值而不放宽任意缺字段？

## Explore 结论

- 选择身份源驱动的确定性生成方案，不采用字符串补丁或兼容 alias。
- 原生安装继续以 immutable selected runtime 为唯一 Skill 根。
- 宿主安装态以插件管理器 inventory 为权威；冲突插件必须先由宿主卸载，Tenon 不直接改写宿主私有 cache。
- 版本控制路径与正文不得包含外部参考项目名称，检查范围由仓库卫生测试统一维护。
- 当前旧 `.agents/skills` 是被忽略的历史投影，已移动到废纸篓；产品不自动删除未知用户目录。
- Dashboard 不把注册顺序、首个可达项目或 localStorage 历史偏好当作选择授权；无显式选择时
  URL 保持无 `root`，项目型页面展示选择入口，只有用户选择后才访问 per-root API。
- 宿主 mutation 采用 before/desired/observed-after 三点对账；恢复只在“未开始”与“已完成”可证明
  时前进，第三状态失败关闭。外部命令调用次数不承诺 exactly-once，但可证明不会重复非幂等效果。
- Dashboard transaction id 贯穿启动、健康、pidfile、WAL 与停止检查；无 id 的普通服务永远是
  preexisting/unmanaged，不属于 release 事务。
- 持续授权使用共享分类器和 Change-bound canonical authority；拒绝/修改优先于批准，撤销立即恢复
  常规交互门，delegated review 仍要求精确 phase/event 与完整证据。
- default workflow 的 Build 出口增加全量收敛 review guard；Reviewer agent 固定 brief 改为完整
  diff + 全契约审查，Verify 只有在所有并行轨完成并合并 findings 后才能作一次结论。
- 详细状态、备选方案与错误处理见
  `docs/superpowers/specs/fix-tenon-entry-skill-contract-design.md` 和
  `docs/adr/fix-tenon-entry-skill-contract.md`。
