# Issue #43：free/default 阶段 Skill 强制契约设计

## 背景与已证实缺口

default Workflow 的七个 step 目前都编译为 `skills: []`，而 Track 的
`policyProfile.skills.matrix` 同时被用于两件语义不同的事：

1. 是否叠加 manifest 中按 Track profile 声明的领域 Skill；
2. Hook 与 transition 是否存在任何 mandatory Skill 要求。

`free` Track 的 `matrix=false` 本意是关闭领域叠加，但
`effective-skill-resolver.ts` 因此同时把 required/available slots 解析为空。结果是
free/default 可以绕过当前阶段 Skill receipt；与此同时，AFK bundle、artifact producer、doctor、
manifest 注释和 `skills/tenon/SKILL.md` 又各自保留了不同的 free profile 解释。这是同一契约被多个
消费者重建造成的行为漂移。

本次调用链检查确认：CLI 与 Server transition 已共享 `resolveRequiredSkillSlots`；Hook 使用
`resolveAvailableSkillSlots`；AFK preparation 仍从 `skill_bundle_id` 直接调用 profile resolver；
artifact register 对 `matrix=false` 还有专用 fallback；doctor 只扫描 manifest 表；router 则把
`matrix=false` 当成注入抑制信号。修复必须先统一 resolver 语义，再让各消费者只选 required、
available 或 presentation 投影，不能继续各自猜测。

## 决策

把有效 Skill 合同显式分成两层：

- **Workflow phase requirements**：default Workflow 每个 step 在 `skills` 中声明且仅声明对应的
  `tenon-<phase>`。这是 Workflow 自有、随 workflow snapshot 冻结的 hard requirement，不受 Track
  matrix 开关影响。
- **Track matrix overlay**：manifest 的 `mandatory_skills` / `recommended_skills` 描述 profile
  Skill 集。只有 `trackOverlay.matrix=true` 才把它们作为自动编排/出口要求合并；free profile 仍作为
  artifact producer 与显式 AFK bundle 的命名 allowlist，但不能凭此重新开启自动 overlay。

有效 resolver 使用稳定顺序合并并去重：

```text
phase slots   = capability.steps[current].requiredSkillIds
overlay hard  = matrix ? manifest.mandatory[current][profile] : []
overlay all   = matrix ? mandatory + recommended : []

required      = dedupe(phase slots + overlay hard)
available     = dedupe(phase slots + overlay all)
explicit      = dedupe(phase slots + selected profile mandatory/recommended)
```

custom Workflow 保持 `step-declared` 语义：required/available 都只来自冻结 step DAG，不读取 default
phase 映射或 manifest overlay。

default phase 声明固定为：

| step | Workflow hard requirement |
| --- | --- |
| open | `tenon-open` |
| explore | `tenon-explore` |
| spec | `tenon-spec` |
| build | `tenon-build` |
| verify | `tenon-verify` |
| ship | `tenon-ship` |
| archive | `tenon-archive` |

## 消费者接线

### Hook

Hook 先从统一 resolver 取得 required 与 available slots。当前请求命中 declared slot 时继续保持顺序
解锁；请求未声明的可选 Skill 时，只以当前 Workflow-owned phase slots 作为前置，避免把 Track
mandatory overlay 扩大成所有 optional Skill 的新依赖。这样 `tenon` 根入口仍是精确豁免，当前
`tenon-<phase>` 可作为第一个合法调用，而任何 overlay/可选 Skill 都不能在遗漏阶段入口时绕过 Hook。
证据仍只统计本次进入 step 之后、同 Change 与当前 phase scope 的 receipt。

### Transition（CLI + Server）

两条 transition 入口继续只调用 `resolveRequiredSkillSlots`。free/default 因而至少要求当前
`tenon-<phase>`；matrix-enabled Track 要求 phase slot 加原 manifest mandatory overlay。review、
document、guard 与 current-visit receipt 的既有锁和事务边界不变。

### AFK admission / preparation

default AFK bundle 不能再只有 `stepId + profileId`。捕获的 execution coordinate 必须携带冻结
effective Skill capability，并把 workflow plan 输入纳入 TOCTOU digest。bundle resolver 使用同一个
显式 profile 合并原语：phase slots 总是进入待物化快照，`skill_bundle_id` 选择显式 bundle profile，
但不会改变 Hook/transition 的 matrix 开关。
找不到当前 phase Skill 内容时 preparation 以既有结构化 reason 拒绝，不创建 sandbox、不收费；
custom 仍只物化自身 step DAG。

### Artifact、router 与 doctor

- artifact register 对 matrix-enabled Track 消费 available slots；对 `matrix=false` 的显式文档生产
  继续消费“phase + named profile allowlist”。这保留主规格中 free Verify 可由
  `verification-before-completion` 登记报告的既有合同，但该 allowlist 不参与 Hook/transition。
- router 的 `matrix=false` 只抑制 Track overlay 注入；Tenon 入口根据 default step 派发 phase Skill 的
  行为不受影响。
- doctor 从编译后的 default Workflow 收集 phase-required Skill，再与 manifest mandatory overlay
  一起核验打包/安装齐全度；输出明确区分 Workflow phase requirements 与 Track overlays。

## 兼容与迁移

- PM/frontend/backend 的原 mandatory/recommended 顺序保留，只在最前面增加既有文档已要求调用的
  `tenon-<phase>`；不删除或重排领域 overlay。
- free/default 的 Hook/transition 只保留 Workflow phase requirement；free profile 仅在显式 artifact
  producer 或 bundle 选择面可用，不构成自动 overlay 或 exit requirement。
- custom Workflow、simple 内建 Workflow 和其 step DAG 不读取 default phase 映射。
- phase Skill 是 Workflow-owned snapshot 内容。历史 Change 的冻结 snapshot 不被静默改写；新合同从
  本版本新建的 default Change 开始冻结。若未来需要迁移历史 snapshot，必须走独立、显式迁移方案，
  不在运行时按 workflow 名补丁式注入。
- 不新增 canonical state 字段，不改变 receipt schema、review receipt 或 ledger ABI。

## 并发与失败边界

- Hook reconciliation 和 transition 校验继续在同一 Change lock/current-visit 分段内执行；新增合并是
  纯函数，不引入第二写者或新锁序。
- AFK coordinate 的 capability 与 digest 同时捕获并在 governance→ledger 固定锁序下复核；任何
  workflow/manifest/track 输入变化继续归类为 policy-changed 并重入 admission。
- resolver、snapshot 或 manifest 损坏沿既有 fail-loud/fail-closed 路径处理；不得因 phase/overlay
  某一层解析失败而降级为空合同。

## 备选方案

1. **只删除 resolver 的 `matrix=false` 早退**：会让 free profile 重新成为领域矩阵，并继续混淆
   phase ownership 与 Track ownership；拒绝。
2. **在 Hook、transition、AFK 各自硬编码七个 Skill**：能快速封堵单点，但产生三份策略与新的漂移；
   拒绝。
3. **把 phase Skill 放进 manifest `_all`**：可覆盖旧 snapshot，但把 Workflow-owned 行为移到 Track
   表，且会绕过冻结合同；拒绝。
4. **Workflow phase requirements + 可选 Track overlay**：复用已有 capability、snapshot 和 resolver
   seam，语义最窄且可机械验证；采用。

## 验收与可观测性

| Acceptance | 证据 |
| --- | --- |
| resolver 分层 | kernel 单测覆盖 free、matrix-enabled、custom、顺序与去重 |
| Hook 无绕过 | 真实 Hook/CLI integration：free/default 未读 phase Skill 时 overlay 与未声明 Skill 均拒绝；读取后放行 |
| transition 无绕过 | CLI 与 Server 负例：free/default 缺 current-visit receipt 均拒绝，补 receipt 后通过 |
| AFK 无绕过 | default bundle/admission 负例：phase Skill 缺失无法物化；显式 profile 也不能产生无 phase 的 bundle |
| custom 保持 | custom DAG dependency、undeclared Skill 与 bundle 回归全绿 |
| 标准 Track 保持 | PM/frontend/backend required/available 仍含原 overlay，且 phase Skill 在首位 |
| 合同防漂移 | default workflow codegen freshness、doctor 派生、docs contract check、release bundle freshness 全绿 |

完整最终门只在实现稳定后执行一次；实现中仅运行上述定向测试。浏览器与 UI E2E 不适用，因为本次
没有 Dashboard 或用户界面变更。

```coverage
touches:
L1_api:      filled -> resolver required/available 与 AFK coordinate/bundle 输入契约
L2_data:     filled -> frozen Workflow phase Skill capability 与 manifest overlay
L3_rules:    filled -> #决策 与 #消费者接线
L4_state:    filled -> current-visit Hook/transition 与 AFK admission/preparation
L5_errors:   filled -> #并发与失败边界
L6_security: filled -> receipt scope、snapshot freeze、AFK TOCTOU 均保持 fail closed
L7_perf:     filled -> resolver 为有界纯函数；AFK coordinate 在既有 Change lock 内增加有界 manifest/Track 读取，不新增锁或写者
L8_deps:     filled -> kernel、CLI、server、automation、generated default、doctor、Skills、docs
L10_terms:   filled -> Workflow phase requirement、Track matrix overlay、current-visit receipt
```
