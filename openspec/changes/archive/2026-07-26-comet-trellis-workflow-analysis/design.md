# 设计

## Explore 结论

- Comet 的精确对象是 `rpamis/comet` Classic。它直接把 OpenSpec 作为 WHAT、
  Superpowers 作为 HOW、Comet 作为 CONTROL，并提供内容寻址 handoff、task checkpoint
  与 Skill snapshot。
- Trellis 的精确对象是 `mindfold-ai/Trellis`。它不直接集成 OpenSpec/Superpowers，
  而是用 task capsule、role JSONL、固定读取顺序、上下文预算和 session pointer
  重写了相同思想。
- pipeline-lite 的状态、document/Skill/read evidence、回退与 exact-event review 更强，
  但缺少正式 Context Bundle、typed lineage、task checkpoint、风险分层和细粒度动作门。
- 选定“治理内核 + 编译式上下文层”，不引入第二个 workflow engine。
- 用户已确认默认轻量、风险自动升级；高风险降级仅允许带理由的 audited override。
- 用户已确认自然语言按当前问题语义识别；混合表达按动作范围授权，低置信度才询问，
  只读研究不被 interaction marker 阻断。
- 用户要求整个插件只维护和安装一份 Skill。选定仓库 `skills/` 为唯一内容源、不可变插件
  payload 为唯一运行根；原生插件与项目 `.agents/skills` 兼容投影不得同时暴露同名 Skill。

## 目标模型

```text
Workflow + Track + Risk + Document/Skill/Review policy
                         ↓ compile
              EffectiveWorkflowPlan
                         ↓
Skill/phase output → Artifact Graph → Context Bundle → next phase/role
                         ↓
        IntentDecision + ActionEffect gate
```

完整字段、阶段矩阵、失败行为、实施切片与验收策略见：

- `docs/superpowers/specs/2026-07-25-comet-trellis-workflow-analysis-design.md`
- `docs/adr/2026-07-25-comet-trellis-context-bundle.md`

## 风险

- 上游项目快速演进：研究报告固定 tag/commit，并将事实、推断、建议分开。
- 语义分类误批准：绑定 exact pending question/change/phase/event，冲突与低置信度
  不批准，外部/破坏性动作保留硬门。
- 风险模型过度升级：每个 Risk Signal 必须可解释、可测试，并建立 light 基线路径。
- Context Bundle 变成第二真相源：只允许由 ledger + effective plan 派生，禁止手改。
- 当前 managed runtime 与 canonical schema 已出现解析漂移：Spec 必须纳入 schema version
  与 capability negotiation。

## Spec 必须回答

- P0 是只实现仓库内 deterministic + context-aware classifier，还是同时引入宿主结构化
  分类接口；接口失败时的 confidence 阈值和公开错误语义是什么？
- `ActionEffect` 由工具注册表、命令解析还是组合 policy 提供，未知工具如何 fail closed？
- Artifact Graph/Context Bundle 的 canonical schema、CAS、迁移与事务边界是什么？
- 风险信号哪些是硬升级、哪些可 override；哪些安全边界永不可降级？
- session/worktree binding 与现有 `.pipeline-active`、host sidecar 如何兼容迁移？
- 原生/静态 adapter 如何检测互斥、怎样只清理由 ownership manifest 证明的旧软链，以及
  Selected Skill Root/digest 如何被 registry、evidence 与 AFK snapshot 共同消费？
