# 任务

## 立项

- [x] 记录入口 Skill 漂移、影响范围和非目标。
- [x] 建立从 simple 升级到 default 的机器可读依赖链。

## 调研

- [x] 核对主入口 Skill、doctor 合约、Agent 规则生成链和发布 inventory。
- [x] 复现并定位旧插件 hook 与当前 Tenon Skill 根并存导致的来源拒绝。
- [x] 形成单一入口决策、ADR 与可审计设计结论。

## 规格

- [x] 更新三项 capability delta spec 与可执行实施计划。
- [x] 明确入口存在性、生成规则新鲜度和安装态 doctor 验收标准。
- [x] 明确宿主插件唯一性与外部参考名称零残留的机器验收标准。
- [x] 增加 Dashboard 显式项目选择 capability，并把无选择/失效选择/URL/API 行为写入规格与计划。
- [x] 为 host mutation 增加 before/desired/third-state 对账要求，并定义旧 pending WAL 的
  fail-closed 迁移边界。
- [x] 为 Dashboard transaction id 增加健康、pidfile、WAL、adopt/stop 的端到端身份要求。
- [x] 将持续授权的 Change/session 边界、撤销、拒绝优先和 exact-event delegated receipt 写入规格。
- [x] 明确 `requirements-changed` 后 ADR 必须由当前 `tenon-spec` 诚实重登记，禁止旧 producer、
  `--backfill` 或手改 ledger。
- [x] 将 Build 全量收敛审查、Verify 全量冻结复核、全部轨一次性聚合与回退重置写入
  `plugin-runtime` delta、ADR、设计和实施计划。

## 实现

- [x] 在身份真相源声明 `entrySkill`，生成 TypeScript 与 Codex managed block 两类投影。
- [x] 将 doctor、根 Agent 规则和 Codex adapter 统一到 `tenon:tenon`，不保留第二入口。
- [x] 增加宿主插件身份冲突诊断与仓库路径/正文名称卫生回归。
- [x] 将产品版本推进到 1.0.1，更新中英文发布说明并重建所有发行产物。
- [x] 将 setup/update 重构为“候选激活 → 新会话证明 → 官方管理器清理”的持久化迁移事务，并对库存、
  清理、验证和发布失败全部 fail closed。 (build)
- [x] 加固产品身份生成、Agent 哨兵块、Codex adapter marker 和入口 Skill 路径边界。 (build)
- [x] 规范化 `normal-chat-routing` 主规格的 OpenSpec 1.6 Purpose，并通过隔离归档演练。 (build)
- [x] 消除公开发行 bundle 中的退役身份文本并补全发行资产零残留门禁。 (build)
- [x] 重构 Dashboard 项目上下文为 `none | selected(root)` 单一真相源，删除首项目、可达项目和
  localStorage 的隐式选择；以失败优先回归覆盖 URL、视图与 per-root API。 (build)
- [x] 收紧 active-host inventory/doctor、Claude scope 与原子收敛 receipt，使用新鲜 session proof
  和严格 decoder 对所有外部失败关闭。 (build)
- [x] 加固 adapter marker 顺序与 first-party entry Skill 唯一性门禁。 (build)
- [x] 将 Dashboard 项目选择迁入独立 model，并由跨项目 snapshot 提供准确 workflow 摘要，覆盖
  不可达 root 与无选择项目总览。 (build)
- [x] 将 convergence receipt 纳入候选激活与 Dashboard readiness 的同一补偿事务，失败后不残留
  指向已回滚 release 的证据。 (build)
- [x] 建立带跨进程锁的逐 scope 可恢复宿主收敛；正确处理 Claude managed scope，并在删除
  project/local 前证明同 scope Tenon 替代。 (build)
- [x] 将 Doctor 的 native/static/unavailable 来源改为可判别状态，非原生 adapter/manual 安装
  使用静态发现，原生库存故障继续 fail closed。 (build)
- [x] 将 workflow contract 改为逐 Change 冻结投影，保留 lowered nonempty guard 语义，并对
  aggregate decoder 实施图结构与键集合的严格边界校验。 (build)
- [x] 区分 Dashboard 用户导航的 `pushState` 与自动规范化的 `replaceState`，真实点击项目后
  browser Back 必须返回无选择项目总览。 (build)
- [x] 将 default workflow 识别改为结构语义判断，克隆或反序列化的默认规则缺失 Verify 三轨时
  必须准确显示缺失证据，不得误判为等待用户决策。 (build)
- [x] 将候选 Dashboard 激活建模为可补偿 session；ready evidence 提交失败时必须停止候选并按
  既有 release 是否存在准确恢复，禁止端口清理兜底。 (build)
- [x] 收紧跨项目 snapshot decoder：Change phase 必须属于冻结 workflow steps，同项目同 fingerprint
  的结构必须唯一，冲突时整体 fail closed。 (build)
- [x] 由 kernel 的 canonical track predicate 语义生成条件 guard 所需输出；不适用的
  `field-nonempty` / `output-present` 不得投影成当前 Change 的必需输出。 (build)
- [x] 将不可变 workflow plan 结构与逐 Change/Track 有效执行投影拆成两个契约；同一 fingerprint
  的合法 Track 差异不得被 decoder 拒绝，进度、收件箱与自动运行必须逐 Change 求值。 (build)
- [x] 将 Dashboard 评审就绪契约提升为逐 Change/step/event 投影；default 直接消费 canonical
  event policy，自定义流程消费 step + edge guards，多出口按可达 event 独立求值且不再合并。 (build)
- [x] 将 `labelByStep` 纳入 workflow 属性表精确键集合校验，缺失或多余 step key 均在 snapshot
  decoder 边界失败关闭。 (build)
- [x] 重构项目总览移动端项目行布局，390px 视口完整展示摘要、运行统计和进入按钮且无页面级横向
  溢出，不得使用全局裁切兜底。 (build)
- [x] 将逐 event Dashboard readiness 改为 kernel canonical guard 的结构化求值结果，完整保留
  `field-equals`、`field-in`、`file-exists`、`build-head-unchanged` 和非字段 guard 语义；
  server 无法判定时失败关闭，前端不得以“字段非空”替代 guard 通过。 (build)
- [x] 将 setup/update 的宿主 marketplace mutation、候选解析、runtime 激活、Dashboard readiness
  与 convergence receipt 纳入同一个逐 scope 跨进程事务锁，禁止分段锁定。 (build)
- [x] 为宿主收敛事务增加 durable write-ahead journal 和逐阶段幂等恢复/精确补偿，覆盖进程在
  host mutation、runtime 激活、Dashboard ready、receipt 提交前后崩溃的所有窗口。 (build)
- [x] 将 host mutation 拆为带 transaction id、前后 inventory checkpoint 与恢复对账的 durable
  子步骤；所有宿主命令与 candidate journal 提交窗口必须幂等。 (build)
- [x] 将 Dashboard 服务身份、启动/复用来源和事务 ownership/adoption 纳入 WAL；崩溃恢复必须能
  精确停止或恢复真实服务，不得只持有探测子进程。 (build)
- [x] 将 convergence receipt 改为 transaction id 幂等提交，重复恢复不得重写时间戳、复活旧
  cleanup-pending 或破坏现有 session proof。 (build)
- [x] 为 snapshot 增加版本化滚动兼容投影；仅计算当前 step 可达 event，并按 root/请求周期缓存
  昂贵 capability，瞬时失败必须成为 blocker 而非让整个项目离线。 (build)
- [x] 在 canonical workflow validator 拒绝同一步重复 event，统一 runtime、server 与 decoder
  语义并提供迁移诊断。 (build)
- [x] 修复不可达项目超长 basename 在 390px 下与“读不到”状态重叠的问题。 (build)
- [x] 将持续授权意图统一到共享 prompt classifier，并用生成式交互契约约束全部治理 Skill；
  自主模式下例行安全默认不得再强制用户输入。 (build)
- [x] 用失败优先测试证明 host command 成功但 completed journal 丢失时当前会重放，并实现
  before/desired/third-state 权威 inventory 对账；旧不完整 WAL 不得自动重放。 (build)
- [x] 扩展 living-document contract，让 requirements-changed 的 Spec 可由真实 `tenon-spec`
  重登记 ADR；随后受控回 Spec 更新 ADR 并重建后续读取证据。 (build)
- [x] 将 setup/update 每个 mutation 的可序列化 postcondition、observation 与 replay policy 纳入
  durable journal，拆分 codec/domain policy/coordinator 职责并满足文件长度门。 (build)
- [x] 将 managed transaction id 贯穿 Dashboard 启动环境、health、pidfile、WAL、
  inspect/adopt/stop；普通或其他事务服务不得被接管。 (build)
- [x] 补齐持续授权的 Change 隔离、拒绝/修改优先、撤销与 exact-event delegated review 回归，
  继续复用单一共享 classifier。 (build)
- [x] 修复首次 Verify 独立审查发现的治理缺口：持续授权升级为 Change + host-session 双绑定，
  completed host checkpoint 恢复重新观察权威 inventory，Dashboard inspect 可观察任意 identity
  但只按精确事务归属，重复/disabled host inventory 与非 requirements-changed ADR 更新均
  fail closed；全部先以失败测试复现再转绿。 (build)
- [x] 修复第二次 Verify 独立审查发现的剩余缺口：否定、质疑、引用和元语言包裹的持续授权短语
  fail closed；managed-host desired proof 精确绑定 marketplace source/root、source type 与既有
  plugin root；ADR 在当前冻结 policy 和无 policy 调用下都只允许 requirements-changed visit
  重登记。新增测试先红后绿，并重跑完整 Build 门禁。 (build)
- [x] 修复第三次 Verify 独立审查发现的剩余缺口：持续授权采用保守肯定识别并对未知否定、条件、
  引用和元语言失败关闭；空 marketplace inventory 的登记结果必须证明官方 remote type、origin
  与 Git revision；Spec ADR 重登记只信任 canonical current revision 绑定的不可变
  `requirements-changed` TransitionRecord，不再采信兼容 history 投影。新增测试先红后绿，
  并重跑完整 Build 与发行门禁。 (build)
- [x] 修复第四次 Verify 独立审查发现的剩余缺口：持续授权改为封闭肯定语法，否定前后缀不得
  通过删除已知短语后被误判为授权；marketplace 登记必须证明当前 HEAD 精确等于冻结的官方
  `refs/heads/main`；Spec ADR 重登记允许 `requirements-changed` transition 后当前 visit 的合法
  canonical set revision，同时继续绑定不可变 transition record。新增测试先红后绿，并重跑
  完整 Build 与发行门禁。 (build)
- [x] 在 canonical state 末尾追加 `pre_verify_review_result` 并提供精确旧 revision 兼容；
  default Build guard 只在 pass 时冻结，`spec-complete` / `requirements-changed` /
  `verify-fail` 进入新实现 visit 时重置 pending。 (build)
- [x] 把 Build pre-Verify 全 diff/全契约/全发行门禁审查和 Verify 全 frozen diff、全轨完成后
  一次性聚合写入 phase Skill 与 `tenon-reviewer` 固定 brief，并覆盖 freshness/bundle 回归。 (build)
- [x] 修复第五次 Verify 一次性聚合发现的剩余 Medium：统一 companion 缺失为 `pending`
  失败关闭；宿主命令在 fresh desired-state proof 后以 success 控制流程，原非零结果只保留
  WAL 诊断，并覆盖首次执行与 completed recovery。 (build)
- [x] 将 repo-zero-output 固化为所有 Tenon Build→Verify 的全局冻结契约：会写 tracked 产物的
  验证在冻结前或隔离副本运行，Reviewer/E2E/视觉输出强制写仓库外，Critical/High/Medium
  必须在 Build 一次性收敛。 (build)
- [x] 修复第六次 Verify 一次性聚合的两个 Medium：Dashboard 初始 snapshot 失败显示可重试错误
  并在成功后恢复；`document-v1` 自定义 workflow 允许 owner=spec 的 ADR 首次合法登记，同时保留
  `openspec-v1` living ADR 的 requirements-changed 门。 (build)

## 验证

- [x] 运行新的 host reconcile、Dashboard transaction identity、持续授权聚焦测试，并确认故障注入矩阵通过。
- [x] 运行身份/仓库卫生/架构/注释/生成物门禁、完整构建和全量测试。
- [x] 在隔离副本应用全部 delta（含 `plugin-runtime`），严格校验且真实主规格 digest 不变。
- [x] 在独立候选端口复验未选项目、来源隔离、事务 Dashboard ownership 与普通 Dashboard 不被接管。

## 交付

- [x] 提交并推送修复，通过远端 CI。
- [x] 发布并验证 `v1.0.1` GitHub Release 与 Pages。
- [x] 从最终插件更新本机 managed runtime，在 18765 复验 URL、项目来源隔离并确认 doctor 无入口 Skill 红黄项。

## 归档

- [x] 归档 Change，清理临时状态并确认工作区、远端和运行时一致。
