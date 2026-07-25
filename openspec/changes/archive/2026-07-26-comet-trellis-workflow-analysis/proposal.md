# 提案

## 目标

系统分析 Comet 与 Trellis 如何把 OpenSpec 和 Superpowers 嵌入工作流各阶段，重点覆盖技能触发、阶段门禁、产物治理与跨阶段上下文传递，并与本仓 `pipeline-lite` 的当前机制逐项对照，形成可落地的改进建议。

## 范围

- 基于 Comet、Trellis 的官方仓库、官方文档和可核验实现进行研究。
- 分析 OpenSpec / Superpowers 在每一步的调用位置、依赖关系、文档生命周期、读取与交接机制。
- 对照本仓当前状态机、Skill DAG、document ledger、review receipt、breadcrumb 与上下文恢复路径。
- 给出按收益、风险和实施顺序排序的改进方案，并在后续 Spec 定义首个可验证实现切片。
- 精确研究对象固定为 Comet Classic `rpamis/comet@84038b0d...` 与
  Trellis `mindfold-ai/Trellis@12e279a...`；Trellis 不直接依赖 OpenSpec/Superpowers，
  其价值在于原生重写后的上下文管理模型。
- 采用双层治理：默认轻量，风险命中时自动升级到强治理，两层共享同一工作流、
  文档 ledger、Context Bundle 和 receipt 模型。

## 非目标

- 不自动恢复或修改现有 `trellis-style-documentation-site` Change。
- 不在证据不足时推断 Comet / Trellis 的内部行为。
- 不在本次研究中发布、部署或修改外部仓库。
- 不照搬 Comet/Trellis，不削弱当前 exact-event review、文档摘要、Skill/read receipt
  和受控回退。
- 不让自然语言语义分类直接绕过生产、破坏性、费用或外部副作用硬门。

## 验收信号

- 形成包含来源链接、实现证据、逐阶段对照表、关键差距和优先级路线图的中文研究报告。
- 每个主要结论可追溯到本地代码或上游一手来源；事实、推断与建议明确分开。
- 改进项能映射到本仓具体模块、契约、测试和迁移风险。
- 下一阶段正式输入可由系统编译为带路径、原因、摘要、预算和 lineage 的 Context Bundle。
- “可以”“继续，按照你的推荐”等绑定当前问题的明确回复可产生结构化确认；
  混合表达只解锁已授权动作，已知只读工具不被 interaction marker 阻断。
- pipeline-lite 只维护一份 canonical Skill 内容；原生安装只有一个 Selected Skill Root，
  不再同时向项目 `.agents/skills` 安装同名 Skill，重复/冲突来源可诊断且不会覆盖用户文件。
