# 架构决策记录

## 背景

Tenon 1.0 发布后，插件 inventory 的真实入口是 `tenon`，但 doctor 和 Codex 静态规则分别保留
`pipeline` 与 `tenon:pipeline`。这证明“全局替换字符串”没有建立可持续的入口身份所有权。

## 决策

把根入口 Skill 纳入 `product/identity.json` 的版本化产品身份。TypeScript 消费方直接导入生成常量，
Markdown/shell 消费方读取由同一生成器生成的 Codex managed block。身份门禁验证入口目录、完整
Codex 引用、AGENTS 投影和 adapter 消费链。

不提供旧入口 alias；原生安装也不创建项目 `.agents/skills` 投影。
宿主安装态必须由官方插件 inventory 证明只有一个 Tenon 工作流插件身份；冲突项只能经宿主插件
管理器卸载，不由 Tenon 直接改写私有 cache。仓库身份检查同时拒绝外部参考项目名称进入受版本
控制的路径和正文。

宿主 mutation 使用 desired-state reconciliation。每个外部命令执行前必须把规范化
before inventory、可序列化 desired postcondition 与 replay policy 原子写入 WAL；命令返回后
再次采集 observed-after，只有权威 inventory 证明 desired 成立才可提交步骤。恢复结果严格限定为：

1. 当前 observation 已满足 desired：不再执行命令，只补写 completed checkpoint；
2. 当前 observation 与 before 精确相等：允许执行一次，再观察并证明 desired；
3. 其他状态：标记 indeterminate 并失败关闭，不执行 mutation、runtime 激活或猜测性补偿。

旧 pending WAL 若缺少 before、desired 或 replay policy，不具备安全重放证明，必须返回
indeterminate。stdout、stderr 与命令 result 只保留为有界诊断信息，不能作为外部 mutation 已提交
的事实。

受管 Dashboard 的 transaction id 是 release 事务所有权标识，并贯穿 managed start options、
`TENON_MANAGED_TRANSACTION_ID` 进程环境、Server health、pidfile、WAL 与
inspect/adopt/stop。release 事务只能收养或停止 transaction id 与当前 WAL 精确一致的 Dashboard。
普通 `tenon dashboard` 不生成 transaction id，永远不属于 release 事务；同 release/state scope
的其他事务服务也必须保持 preexisting，无法区分时返回 indeterminate。不得继续用 before/after
snapshot、端口、PID 或 release id 的组合猜测事务所有权。

持续授权只是一项绑定精确 Change 与 host session 的、可撤销且可审计的 authority。拒绝、修改或
撤销意图优先于批准短语；authority 不跨 Change 或 session 继承。它不能替代真实 Skill、
OpenSpec document ledger/read receipt、guard、verification 或 review request，只能在这些证据
已经满足后，为同一 phase 与 exact event 写入 delegated acknowledgement。

ADR 属于 requirements-changed 回环中的 living document。只有当前 Spec visit 已真实调用的
`tenon-spec` 可以重新登记新 digest；旧 producer、旧 read receipt、`--backfill` 和手改 ledger
均不能证明新版本。重新登记后，后续 phase 必须重新读取该精确版本。

Build→Verify 采用可机检的双层收敛。canonical state 在末尾追加
`pre_verify_review_result`，初始及每次 `spec-complete` / `requirements-changed` /
`verify-fail` 后为 `pending`。Build 必须对完整 diff、全部受影响 capability、失败路径与发行门禁
完成一次 pre-Verify convergence review 并设为 `pass`，否则 `build-complete` guard 拒绝冻结。
Verify 的独立 Reviewer 仍审冻结基线，且必须覆盖完整 diff；Reviewer、E2E、Codex/视觉等适用轨
全部结束后才能一次性聚合 findings 并判定。重试不能只回归已知问题，必须同时重新覆盖完整 diff。

新字段按 `FIELD_ORDER` 末尾追加；canonical codec 只接受“精确缺少这一尾字段”的上一版本形状并
补 `pending`，不得把任意缺字段泛化为默认值。为使真实 v1.0.0 rollback 不仅可读、还可继续合法
mutation，schemaVersion=1 canonical 与 YAML projection 都保持旧字段闭集；逻辑值存入不可变
companion，其内容摘要由 `opaqueTail` anchor 纳入 revision `stateDigest`。当前 runtime 从
companion 恢复逻辑值；旧 writer 不产生新 companion 时，新 runtime 对该 revision 按 `pending`
失败关闭。

## 备选方案

- 手工同步 doctor、AGENTS 和 adapter：拒绝，缺少机械证明。
- 在发布包补 `skills/pipeline` alias：拒绝，会形成第二入口和兼容债务。
- doctor 只检查任意 Skill 数量：拒绝，不能证明 normal-chat 的精确入口。
- 只在 Verify Skill 文案提醒“尽量全审”：拒绝，无法阻止 Build 未收敛就冻结。
- 用窄 repair brief 加快单轮审查：拒绝，会把相邻缺口推迟到下一轮；重试必须“已知回归 + 全 diff”。

## 后果

- 后续品牌或入口调整只需修改身份源并重新生成，漂移会在 CI 和 Release 前失败。
- 新安装、新会话和静态 adapter 都调用 `tenon:tenon`；CLI 仍唯一为 `tenon`。
- 冲突宿主插件会成为 doctor 红项，避免旧 hook 静默劫持当前 Skill。
- 外部研究只作为阶段输入，不进入最终发行仓库的路径、正文或产品身份。
- host command 成功但 completed journal 丢失时，恢复依赖权威 desired state，不会盲目重放。
- 无 before/desired 的旧 WAL 与第三 inventory 状态会显式进入 indeterminate，需要诊断后重试。
- 普通或其他 transaction 的 Dashboard 不会被当前 release 收养或停止；旧健康响应可读但无事务所有权。
- delegated review receipt 仍保持 Change/session/phase/event 的精确边界，撤销后恢复人工确认。
- Build 未通过全量收敛 review 时无法冻结候选；Verify 必须等待所有适用轨完成后一次性给出结论。
- 上一版本 canonical state 可按精确尾字段兼容迁移，损坏或其他缺字段仍失败关闭。
- ADR 新 digest 会使旧 read receipt 失效，Build、Verify、Ship 与 Archive 必须重建读取证据。
- 历史 archive/ledger 保持不可变；旧本地投影由 ownership-safe 人工迁移，不被产品代码强删。
