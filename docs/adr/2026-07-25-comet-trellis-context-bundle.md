# ADR：在治理内核上增加编译式上下文层

状态：Accepted for specification  
日期：2026-07-25  
Change：`comet-trellis-workflow-analysis`

## 背景

pipeline-lite 已能证明文档由允许的 Skill 产生、当前内容摘要是什么、下一 phase 是否读取过，
并能把人工 review 绑定到确切 transition event。这些是 Comet 和 Trellis 都没有完整具备的
治理能力，不应被替换。

但现有实现仍依赖 phase Skill 手工读取累计文档，handoff 没有进入 transition，artifact 与
document ledger 缺少 lineage，Build 没有任务级 checkpoint。与此同时，确认 hook 使用固定
短语枚举，interaction marker 会拦截已知只读动作。本次研究中，“继续，按照你的推荐”和只读
研究被拦截，证明这不是理论风险。

Comet Classic 提供了 OpenSpec 源文件到 Superpowers 设计执行的内容寻址 handoff、
checkpoint 和 Skill snapshot；Trellis 提供了按角色编译的上下文清单、固定读取顺序、
上下文预算与 session-scoped task pointer。二者的治理强度均不足以直接替换当前内核。

## 决策

保留 pipeline-lite 的七阶段 canonical DAG、OpenSpec 生命周期、Skill/document/read
证据、回退边和 exact-event review receipt。

在其上增加一个编译式上下文层：

1. 将 Workflow、Track、文档、Skill、review、风险和预算策略编译为不可变
   `EffectiveWorkflowPlan`。
2. 将现有 document ledger 扩展为带 typed lineage 的 `Artifact Graph`。
3. transition 前为确切目标 phase/role 编译内容寻址的 `Context Bundle`，并把 bundle
   digest 纳入读取与推进 guard。
4. Build 增加 task checkpoint，mandatory Skill 增加受信任内容 snapshot。
5. 使用同一个模型支持 `light` 与 `strong` 两档；风险自动升级，高风险降级只允许带理由、
   可审计的显式 override，硬安全边界不可 override。
6. 将自然语言 `IntentDecision` 与工具 `ActionEffect` 分开。确认绑定当前问题/选项/
   Change/phase/event；只读动作不被 pending interaction 一刀切阻塞。
7. 将 canonical session binding 纳入 worktree identity，并增加 runtime schema/capability
   negotiation。
8. pipeline-lite 的 `skills/` 是唯一内容源，安装后只允许一个 Selected Skill Root。原生
   插件安装不得再向项目 `.agents/skills` 投递同名 Skill；静态兼容投影与原生插件互斥。
   同 ID 不同 digest 直接 fail closed，旧的 ownership-proven 重复链接只能通过显式迁移收敛。

## 用户确认的交互语义

- “可以”“继续，按照你的推荐”“按推荐方案”在存在唯一当前问题且无冲突约束时，可选择
  推荐项并产生结构化 receipt。
- 拒绝或修改范围不解锁冲突动作。
- “继续，但先别改代码”只批准不违反约束的动作；只读研究继续，代码写入仍受限。
- 低置信度只澄清一次，不要求用户背诵固定口令。
- 自然语言确认不是全局授权，不能批准另一 Change、phase、event 或外部副作用。

## 备选方案

### 只修短语列表

拒绝。它能修复当前例句，却无法覆盖新表达、混合约束、跨问题绑定和不同语言，也没有解决
只读工具被阻塞。

### 直接采用 Comet Classic

拒绝。会削弱 current-visit evidence、exact-event review 和 first-class 回退，并引入另一套
宏观阶段模型。

### 直接采用 Trellis

拒绝。其 Context manifest 值得借鉴，但缺少内容摘要绑定、细粒度状态和完整 review/evidence
语义。

### 建设独立的轻量工作流引擎

拒绝。会让轻量与强治理的文档、状态、UI 和迁移路径永久分叉。

## 结果

正面结果：

- 每一步的输入、输出、producer、consumer 和 digest 可追溯；
- 下一阶段获得有界、角色化上下文，不再依赖整段对话或累计全文扫描；
- 普通工作保持轻量，风险任务自动获得完整治理；
- 用户自然表达可以被理解，且权限仍绑定精确上下文；
- 长 Build、插件升级、会话切换和多 worktree 更容易安全恢复。
- Skill 的维护、安装、发现、证据和 snapshot 都指向同一 canonical 身份，不再因为重复安装
  选中不同版本。

成本：

- ledger、transition、hooks、session、runtime schema、CLI/API/UI 和安装包需要分阶段迁移；
- bundle 与风险编译规则必须成为新的兼容契约；
- 语义分类需要确定性回归集、低置信度 fallback 和审计投影。
- 原生/静态 adapter 的兼容行为需要迁移；现有用户自有同名 Skill 不会自动删除。

风险与缓解：

- 语义分类误批准：精确绑定 pending question，冲突/低置信度不批准，高风险动作仍保留硬门。
- 风险模型过度升级：每个升级信号可解释、可测试，普通路径有轻量回归基线。
- bundle 变成另一套真相源：它只能由 ledger + effective plan 派生，不接受手工编辑。
- schema 漂移：显式版本与 capability negotiation，旧 runtime fail loud 且不得部分写入。
- 重复 Skill 清理误删用户内容：只处理 ownership manifest 能证明由 pipeline-lite 创建的软链，
  普通目录和不同来源一律保留并报冲突。
