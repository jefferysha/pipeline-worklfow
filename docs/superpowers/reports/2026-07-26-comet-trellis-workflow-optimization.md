# Comet / Trellis 工作流深度对比与 pipeline-lite 优化结果

日期：2026-07-26  
Change：`comet-trellis-workflow-analysis`  
隔离方式：独立 Git worktree

## 执行结论

Comet、Trellis 和 pipeline-lite 解决的是同一类问题的不同层：

- Comet 把 OpenSpec 当作 WHAT 的规范系统，把 Superpowers 当作 HOW 的执行方法库，并通过
  phase prompt、handoff package、run state、checkpoint 和 archive 把两者串起来。
- Trellis 不直接依赖 OpenSpec 或 Superpowers；它把相似思想固化成项目内的长期 spec、
  task 临时文档、角色上下文模板、workspace session 和 finish/journal 流程。
- pipeline-lite 的优势是证据治理更强：phase/event、document ledger、producer/read receipt、
  review receipt 和 hash drift 都有机器检查。原来的弱点主要在消费体验：交互门依赖窄短语、
  pending 时连调查也被封、Skill 安装可能产生重复发现根、下一阶段虽有全文 read receipt，
  但缺少正式、可预算、可复验的输入包。

本次没有照搬另一个工作流引擎，而是在 pipeline-lite 的 ledger 与 phase guard 上增加编译式
消费层，并修正交互与安装边界：

1. 自然语言 contextual approval，拒绝/修改语义优先。
2. pending gate 下允许严格只读动作，写入、转换、未知命令继续 fail closed。
3. 插件源码只维护一棵 canonical `skills/`；native root 和 static project projection 互斥。
4. 安全清理仅限插件拥有且仍指向 canonical source 的旧链接；真实目录、外来链接和内容冲突保留并报错。
5. `pipeline handoff --bundle --target <phase>` 从 document ledger 编译确定性的
   `context-bundle/v1`，携带 lineage、用途、物化模式、预算和聚合摘要。

## 一、三套系统如何把规格和方法嵌进每一步

| 阶段目的 | Comet | Trellis | pipeline-lite 优化后 |
| --- | --- | --- | --- |
| 入口与澄清 | OpenSpec change/artifact DAG 组织 WHAT；phase prompt 调 OpenSpec Skill | session bootstrap 注入最小地图，task 目录承接临时需求 | Open phase 用 OpenSpec proposal/design/tasks，Skill evidence 绑定当前 visit |
| 深设计 | 生成 OpenSpec→Superpowers handoff，再运行 brainstorming | plan/research/design 分层落盘，configure-context 预编译角色输入 | Superpowers design + ADR 仍是 HOW；ledger 记录 producer/hash |
| 实施计划与构建 | writing-plans、TDD、debug、review；run state 和 task checkpoint 恢复 | 主会话调度角色 Agent，角色按固定顺序读取 task/spec/context | plan/tasks 驱动 Build；Context Bundle 为 Build 编译精确输入 |
| 验证 | verification-before-completion；大改时重新关联 OpenSpec | check 可自修，但没有同等强度的独立持久验证事件 | Verify 是独立 review phase，冻结 baseline、verification report、exact event receipt |
| 收敛归档 | OpenSpec delta 合并主真相；Superpowers 文档加生命周期元数据 | 稳定知识提升进长期 spec，task 归档，workspace 写 journal | Ship 应用 delta spec，Archive 保留 ledger、reads、review 和验证谱系 |

关键差异不是“有没有 Markdown”，而是谁拥有语义：

- OpenSpec 文档拥有需求与行为契约。
- Superpowers 文档拥有设计推理、实施步骤和验证方法。
- phase/run state 拥有执行位置与恢复点。
- ledger/receipt 拥有“哪个版本被谁生产、被哪个阶段实际读过”的证明。
- Context Bundle 只拥有下一消费者的派生视图，不成为第四套真相源。

## 二、产出文档怎么管理

### Comet

Comet 将文档分为 OpenSpec artifacts、Superpowers specs/plans/reports 与 runtime state。
frontmatter 和 change identity 负责关联；source set SHA-256 约束 handoff 完整性；Build 用
checkpoint 把长任务恢复从“重读所有聊天”降到“读取当前 task 的持久状态”。Archive 负责把
delta 合并进 OpenSpec，并为 Superpowers 文档补生命周期信息。

优点是 OpenSpec 与 Superpowers 的职责边界清楚，阶段脚本会主动装配上下文。风险是部分
“必须调用 Skill”仍是 prompt 级要求，人工确认与 exact transition 的持久绑定弱于
pipeline-lite，且压缩文档和当前实现曾出现语义漂移。

### Trellis

Trellis 用四个平面管理文档：

1. workflow/Skills/Hooks/Agents 是产品管理平面；
2. `.trellis/spec/` 是长期项目知识；
3. `.trellis/tasks/<task>/` 是任务临时知识；
4. `.trellis/workspace/<developer>/` 是开发者 session 与恢复状态。

角色上下文由配置提前选取，执行时按固定顺序读；Finish 把稳定知识提升到长期 spec，再归档
task 并写 journal。这个模型对“谁下一步读什么”非常直观，但缺少 pipeline-lite 已有的
逐文档 producer/read receipt、内容漂移 guard 和 exact review event。

### pipeline-lite

pipeline-lite 的 canonical 文档仍由 OpenSpec change 目录和 Superpowers 文档承载；
document ledger 记录 kind/path/SHA-256/producer，phase read receipt 绑定 visit identity。
文件变化会让旧 read receipt 失效，错误 producer 不能登记，transition 与 check 使用同一
证据谓词。这比单纯依赖路径、frontmatter 或上下文模板更适合作为治理底座。

本次新增的单一 Skill 根规则把“方法库本身”也纳入一致性治理：

- 发布包只维护 `skills/` 一份内容；
- Claude 与 Codex manifest 都指向同一 `./skills/`；
- 原生宿主选中插件 root 时不再创建项目 `.agents/skills` 副本；
- 只有缺少原生 root 的静态宿主才建立一个兼容投影；
- `pipeline doctor` 区分相同内容的 `duplicate-projection` 与不同内容的
  `shadow-conflict`，后者失败关闭；
- `verify-skills.sh` 拒绝插件包内任何位于 canonical `skills/` 外的 `SKILL.md`。

## 三、怎么把上一步喂给下一步

三套方案可抽象成三种交接方式：

1. Comet：phase script 生成 handoff package，结合 source hash 和 checkpoint。
2. Trellis：configure-context 提前选择路径，角色按固定顺序读取。
3. pipeline-lite 原实现：按 phase 文档合同执行全文 `document read` 并写 hash receipt。

原实现的证据强，但消费单位太粗；只读 receipt 能证明“读过”，不能独立表达为什么需要它、
应该全文还是摘要、预算是否足够，也不能把输入集合交给另一个执行器复验。

`context-bundle/v1` 将两者合并：

```text
document contract
  -> authoritative ledger records
  -> verify each recorded SHA-256 against disk
  -> stable kind/path ordering
  -> full | summary | reference materialization
  -> explicit UTF-8 byte budget
  -> aggregate SHA-256
  -> downstream phase/role
```

Bundle 每项包含 `kind`、`path`、`digest`、`reason`、`mode` 和可选 `content`。proposal、
tasks、delta spec 默认全文；设计、ADR、计划等默认确定性摘要；同一路径被多个 kind 引用时
只物化一次，其余为 reference。缺文件、digest 漂移、非法路径、重复 slot 和超预算全部拒绝，
不会静默喂入旧内容。

Bundle 是可再生成的派生物，不写回 canonical 文档，不替代 `document read` 和 phase guard。
因此它改善下一阶段的上下文质量，但不削弱 pipeline-lite 已有的证据强度。

## 四、交互门为什么不再要求固定回复

问题的根因不是缺少更多同义词，而是把“识别用户意图”和“判断当前动作风险”混成一个布尔门。
本次拆成两个维度：

- PromptIntent：确认、拒绝/修改、普通信息；拒绝和新增约束优先。
- ActionEffect：只读、写入/转换、未知；只读白名单严格，shell 含重定向、分号或未知命令即不视为只读。

因此在 exact project 存在 pending receipt 时，“可以”“同意”“按推荐”“继续，按照你的推荐”
都能形成 contextual approval；“不同意”“继续，但先别改代码”不会误解锁。即使仍在等待确认，
agent 也可以运行 `rg`、`git diff --check`、`pipeline status`、`pipeline document status`
等调查命令，不会再因无法读取状态而自锁。任何写操作和 transition 仍需对应 receipt。

## 五、相对原方案的改进与保留项

| 能力 | 修改前 | 本次结果 | 后续建议 |
| --- | --- | --- | --- |
| Review 确认 | 窄短语，容易要求“确认继续” | 上下文自然确认；拒绝/修改优先 | 后续可把 intent 合同数据化并扩展宿主测试 |
| Pending 调查 | gate 近似全拦 | 严格只读放行，副作用继续拦截 | 维护小而可审计的命令语法，不做猜测执行 |
| Skill 安装 | native root 与项目投影可能同时发现 | 选中一个 root；安全迁移；冲突诊断 | 发布 CI 保持包内单树验证 |
| 文档读取 | 全文 read receipt，证据强但消费粗 | ledger-bound Context Bundle v1 | P2 接 custom workflow step inputs/outputs |
| 长 Build 恢复 | phase breadcrumb，缺 task checkpoint | 本次未扩展 | P3 增加 task-level checkpoint 与 Skill snapshot |
| 多执行器/session | repo 候选与 host binding 已分层 | 本次保持 | P4 将 bundle 接入 dispatch，强化 session-scoped resume |

## 六、不建议照搬的部分

- 不引入第二套 task/spec 真相树；OpenSpec 和现有 ledger 已经是更强底座。
- 不把所有 phase prompt 复制成另一套引擎；避免 phase、guard、document contract 双写。
- 不把摘要文件当 canonical 文档；摘要算法或预算变化时必须可无损重编译。
- 不扫描历史插件 cache 猜 Skill root；只接受宿主明确选中的 root。
- 不为消除重复而删除未知用户目录或外来链接；冲突应保留现场并 fail closed。
- 不把“持续自主执行”解释成绕过 review/验证/发布授权。

## 七、实现与验证证据

主要实现面：

- 自然确认与 ActionEffect：`hooks/prompt-intent.sh`、`hooks/confirm-clear-prompt.sh`、
  `hooks/gate.sh`
- 单一 Skill root：`adapters/codex/install.sh`、`packages/cli/src/commands/doctor-skills.ts`、
  `tools/verify-skills.sh`
- Worktree evidence：`packages/cli/src/codexProjectIdentity.ts`、
  `packages/cli/src/codexTranscriptEvidence.ts`
- Context Bundle：`packages/kernel/src/compress/context-bundle.ts`、
  `packages/cli/src/commands/handoff.ts`
- 使用合同：`docs/usage/cli-reference.md`、`skills/pipeline-build/SKILL.md`、
  `skills/pipeline-verify/SKILL.md`

Build 局部验证：

- Hook suite：446 passed，0 failed。
- Adapter suite：267 passed，0 failed。
- Doctor Skill discovery：40 passed。
- Context Bundle + legacy handoff：25 passed。
- Worktree Skill receipt：34 passed。
- Kernel/CLI TypeScript build：通过。
- `verify-skills.sh`：canonical path、两个 host manifest、registry 与包内单一
  `SKILL.md` 内容树全部通过。

全量 Verify 结果将在独立 verification report 中登记，避免把 Build 时的局部测试冒充最终结论。

## 研究依据

逐段一手源码证据、版本边界和链接索引见：

- `docs/superpowers/specs/2026-07-25-comet-workflow-research.md`
- `docs/superpowers/specs/2026-07-25-trellis-workflow-research.md`
- `docs/superpowers/specs/2026-07-25-pipeline-lite-current-state-research.md`
- `docs/superpowers/specs/2026-07-25-comet-trellis-workflow-analysis-design.md`
- `docs/adr/2026-07-25-comet-trellis-context-bundle.md`

