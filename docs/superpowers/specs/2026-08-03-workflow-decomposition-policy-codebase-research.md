# Workflow Decomposition / Interaction Policy 代码库调研

日期：2026-08-03
范围：Workflow definition codec/schema、冻结 WorkflowRun plan/fingerprint、track/skill/project/run 授权、continuous/AFK admission、Server API/DTO。
限制：本轮只做代码调研，不修改实现、canonical state 或 OpenSpec。

## 结论摘要

### 已确认事实

1. Workflow definition 是闭集 codec：当前顶层只有 `name`、`openspecContract`、`documentContract`、`steps`；解析、序列化、编译和 IR 都要同步扩展，任何只改类型或只改 YAML 的方案都会被现有未知键门禁拒绝。证据：`packages/kernel/src/workflow/types.ts:146-157`、`packages/kernel/src/workflow/parse.ts:372-413`、`packages/kernel/src/workflow/serialize.ts:150-161`、`packages/kernel/src/workflow/compile.ts:77-113`、`packages/kernel/src/workflow/ir.ts:159-165`。
2. WorkflowRun 已冻结完整 Workflow IR，并把完整 IR 纳入 `effective-workflow-plan-v1` 指纹；因此政策字段进入 IR 后自然会影响新 run 的 fingerprint。旧 V1/V2 snapshot 则必须有显式兼容路径，否则补默认值会造成历史 fingerprint 漂移。证据：`packages/kernel/src/workflow/effective-plan.ts:15-92`、`packages/kernel/src/workflow/effective-plan.ts:158-186`、`packages/kernel/src/workflow/effective-plan.ts:237-290`、`packages/kernel/src/state/workflow-plan-snapshot.ts:38-87`。
3. Track 的 automation/skill/coverage 是运行时 overlay，设计上不属于 workflow fingerprint；Workflow policy 应是 workflow-owned frozen ceiling，不应把可变 track/run grant 混进 definition fingerprint。证据：`packages/kernel/src/workflow/effective-plan.ts:15-28`、`packages/kernel/src/workflow/effective-plan.ts:189-234`。
4. 当前 automation opt-in 只交集 `enabled`、track `automationEligible` 和 queued/default opt-in；还没有检查 frozen workflow interaction policy。权威 admission 在 scheduler reserve 前后完成 governance、ledger、skill bundle、budget 和 run policy binding，而 CLI/queue gate 不是安全边界。证据：`packages/automation/src/queue/gate.ts:36-81`、`packages/automation/src/queue/gate.test.ts:35-56`、`packages/automation/src/admission/loop-admission-types.ts:1-16`、`packages/automation/src/admission/loop-admission-service.ts:174-223`、`packages/automation/src/admission/loop-admission-service.ts:233-383`。
5. Continuous authority 是严格绑定 Change、host session 和 review scope 的交互委托元数据，不是 privilege boundary；它明确不得跳过证据、guard、验证、外部/发布授权。缺失或畸形会回退普通交互门禁。证据：`packages/cli/src/continuousAuthority.ts:1-22`、`packages/cli/src/continuousAuthority.ts:42-89`、`packages/cli/src/hooks/interaction-authority.sh:1-9`、`packages/cli/src/hooks/interaction-authority.sh:30-98`、`packages/cli/src/hooks/interactive-skill-gate.sh:91-146`。
6. Server 已有安全的 Workflow definition 读写边界和 frozen Change snapshot；定义 GET 返回 `WorkflowDef`，Change snapshot 的 `workflowRules` 只投影步骤/转移/gate/label/output，尚未投影这两类政策。证据：`packages/server/src/workflows.ts:127-279`、`packages/server/src/serverGetRoutes.ts:224-281`、`packages/server/src/serverPostGovernanceRoutes.ts:237-307`、`packages/server/src/workflowSnapshot.ts:27-76`、`packages/server/src/types.ts:30-63`、`packages/server/src/types.ts:98-114`。

### 推断与假设

- 假设这两项政策是 workflow 全局语义，而不是单个 step 的局部语义；因此最兼容的落点是 `WorkflowDef` 顶层同级字段。
- 假设“有效权限交集”需要一个有限、可审计的 action/capability vocabulary。当前代码只有 automation level、path allow/deny、human transition gates 和 skill bundle，并不存在可直接复用的完整 branch/PR/external/production/cost 权限集合。
- 假设 `afk` 表示允许进入 AFK transport/admission，而不是自动获得更多副作用权限；实际动作仍受每一层 capability 和既有 gates 约束。

## 建议的数据模型与兼容插入点

### 1. Definition / codec

建议增加两个互不嵌套的、显式版本化顶层对象：

```yaml
decomposition_policy:
  version: v1
  mode: off # off | suggest | auto-safe | require-review
  allowed_targets: [] # work-item | child-pipeline；缺省为空
interaction_policy:
  version: v1
  mode: interactive # interactive | recommended-defaults | afk
```

必须同一变更覆盖：

- `WorkflowDef`：`packages/kernel/src/workflow/types.ts:146-157`
- parser/serializer：`packages/kernel/src/workflow/parse.ts:372-413`、`packages/kernel/src/workflow/serialize.ts:150-161`
- closed-key compiler/deep freeze：`packages/kernel/src/workflow/compile.ts:77-113`、`packages/kernel/src/workflow/compile.ts:363-400`
- compiled IR：`packages/kernel/src/workflow/ir.ts:159-165`
- shared validation：`packages/kernel/src/workflow/validate.ts:130-142`

兼容默认值应在 compile boundary 统一规范化为 `decomposition=off + allowed_targets=[]`、`interaction=interactive`；未知 version、mode、target、额外键、重复 target 一律拒绝。Codec 必须保留 serialize→parse 深等价，现有生产 fixture 也有往返覆盖：`packages/kernel/src/workflow/serialize.test.ts:45-87`。

### 2. Frozen plan / fingerprint / snapshot

建议把规范化后的两项政策作为 `EffectiveWorkflowPlan` 的 workflow-owned 字段，并随 Workflow IR 一起深冻结。新 plan 使用新的 fingerprint schema tag（例如 `effective-workflow-plan-v2`），新增 `WorkflowPlanSnapshotV3`，显式保存规范化政策。

不要让 V1/V2 snapshot 经“补默认值后的新算法”重新验旧 hash。兼容读取应先按 snapshot version 使用旧算法校验原 fingerprint，再将安全默认政策投影为只读运行语义；新 run 只写 V3。仓库已经有 V1 legacy 与 V2 self-contained snapshot 的先例和测试：`packages/kernel/src/workflow/effective-plan.test.ts:67-100`。

保持现有不可变 sidecar 语义：同一路径不同内容拒绝、run id/fingerprint 必须一致、state commit 前先落 governance sidecar。证据：`packages/kernel/src/state/workflow-plan-snapshot.ts:90-150`、`packages/kernel/src/state/store.ts:446-467`、`packages/kernel/src/workflow/workflow-run-repository.ts:85-147`。

### 3. 权限交集

建议不要给枚举建立“越大越有权”的总序；改为具名谓词，逐项取交集：

```text
effective(action) = platformSafety(action)
                 && skillCapability(action)
                 && projectOrTrackPolicy(action)
                 && frozenWorkflowCeiling(action)
                 && exactRunGrant(action)
```

Fail-closed 规则：任一层缺失、未知、过期、identity/fingerprint 不匹配均视为 `false`。`suggest` 只生成建议；`auto-safe` 只允许交集内、无外部副作用的目标；`require-review` 可生成候选 DAG，但执行前必须经 exact event review；`afk` 只令 `canEnterAfk=true`，不能隐式令 branch/PR/merge/external/production/cost 等动作变真。

现有 skill resolution 会把 default workflow 的 manifest/track profile 与 custom workflow 的 step-declared skills 分开解析；新权限模型不可把“没有 skill bundle”解释为全权。证据：`packages/kernel/src/workflow/effective-skill-resolver.ts:36-58`、`packages/kernel/src/workflow/effective-skill-resolver.ts:78-105`、`packages/kernel/src/workflow/effective-skill-resolver.ts:135-175`。

## Continuous 与 AFK 的边界

### Continuous

Frozen `interaction_policy` 是 ceiling；continuous authority 是 exact Change + exact host session 的短期 run grant。建议映射如下：

- workflow=`interactive`：continuous 不得升级到 recommended defaults。
- workflow=`recommended-defaults`：只有严格有效的 continuous/run grant 才能免去普通、可逆选择的重复询问；无效即回退 interactive。
- workflow=`afk`：continuous 仍不能代替 AFK enqueue/admission，也不能代替外部副作用授权。

现有 delegated review 只承认 exact pending event，不能跨 event 或跨 session 复用：`packages/cli/src/commands/review.ts:264-330`。

### AFK admission

建议在两处检查同一纯函数决定：

1. queue/CLI 层做早期 UX 拒绝；
2. `LoopAdmissionService.reserve` 的权威 admission 再检查 frozen workflow policy、track eligibility、explicit queue/run grant、policy epoch、skill bundle、budget，任一失败不产生可执行 context。

权威检查应通过专用只读 `RunAutomationAuthorityPort` 读取已冻结 snapshot/fingerprint，而不是重读可变 YAML。要遵守现有 lock ordering：不要在 governance→ledger 临界区内再取 Change lock；可利用 snapshot 不可变性在 reserve 前捕获，在 bind 前后校验 identity/version，不一致则补偿关闭 reservation。现有 run-level `AutomationPolicy` 已按 `policy_version` 不可变绑定，可作为模式：`packages/kernel/src/workflow/workflow-run-repository.ts:243-285`。

## Server API / DTO 建议

最小兼容路径：

- `/api/workflows/:name` 继续返回配置态 policies；共享 `decodeWorkflowDef` 保持 unknown-key fail-closed。
- 在 frozen Change snapshot 的 `WorkflowRulesSnapshot`（或一个同级 `workflowPolicy` DTO）增加 `decompositionPolicy`、`interactionPolicy`，数据只来自 bound `EffectiveWorkflowPlan`，不重读 live YAML。
- DTO 清楚区分 `configured/frozen policy` 与运行时 `effective grants`；不要把 track/run mutable grants 标成 workflow policy。
- 本 Change 不增加 Dashboard editor，也不增加新的 policy mutation endpoint。已有整份 WorkflowDef POST 是否允许改这两个字段，需要产品决定；无论如何写入必须继续走共享 compiler、track registry lock 和原子 rename。

只读 status 可复用 exact Change root/trust/fingerprint 门禁；现有 definition-status endpoint 只报告 frozen/current fingerprint，可保持窄职责：`packages/server/src/workflowDefinitionStatus.ts:8-46`、`packages/server/src/serverWorkflowDefinitionStatusRoutes.ts:34-92`。

## Fail-closed 检查表

| 情况 | 必须结果 |
| --- | --- |
| 老 definition 无政策字段 | compile 为 `off` + `interactive` |
| 未知 version/mode/target/额外键 | definition 编译失败，不保存 |
| 老 V1/V2 snapshot | 旧算法验旧 hash；仅投影安全默认，不重写 |
| snapshot identity/fingerprint 不符 | run resolve/admission 拒绝 |
| track 不允许 automation | 即使 workflow=`afk` 也拒绝 |
| workflow 不是 `afk` | 即使 queued/default opt-in 也拒绝 AFK |
| continuous authority 缺失/畸形/跨 session | 回退 interactive |
| skill capability 或 run grant 缺失 | 对应 action=false |
| policy epoch/bundle/budget 在 admission 中漂移 | 不生成 context，按既有 pause/compensation 处理 |
| live YAML 与 frozen run 不同 | 当前 run 继续 frozen semantics；status 只报告 drift |

## 测试影响面

- Kernel codec：两个 policy 的全枚举 round-trip、缺省兼容、未知键/version/mode/target、deep freeze。
- Effective plan：政策改变必改新 fingerprint；track overlay 改变不改 workflow fingerprint；V1/V2 legacy hash 可读；V3 自包含且篡改拒绝。
- State/repository：snapshot immutable、run binding exact、旧 run 不被 live definition 改写。
- Continuous：exact session 生效；缺失、陈旧、跨 Change/跨 session 回退 interactive；不得授权 AFK。
- Automation：所有组合覆盖 `enabled × trackEligible × workflowAfk × explicitGrant × bundle × budget`；queue 早拒绝与 authoritative reserve 决定一致。
- Server：raw definition policies、frozen snapshot policies、trusted root、未知 DTO 字段和 live/frozen drift。

## 开放问题

1. `allowed_targets` 是否应进入 v1；若不进入，`auto-safe` 对 `work-item` 与 `child-pipeline` 的边界由谁定义？
2. `require-review` 是“允许自动生成 DAG、执行前审查”，还是“连 DAG 创建都要审查”？对应的 exact transition event 是什么？
3. 权限 vocabulary v1 需要覆盖哪些动作：仅 decomposition/AFK，还是同时纳入 branch、PR、merge、external API、production、cost？
4. 已存在的 Workflow definition POST 是否允许编辑 policies，还是本阶段只允许代码/文件配置并仅提供只读 API？
5. 旧 V1/V2 run 的安全默认是否固定为 `off + interactive`，以及是否允许显式迁移为 V3（建议默认不原地迁移）？

## Requirements-changed addendum（2026-08-04）

本文件记录 2026-08-03 Explore 时的只读调研事实；第 102 行“不增加 Dashboard editor”和上述开放问题已被后续明确需求与 Spec 决策取代，不应继续作为实现约束。当前已冻结结论是：

- Dashboard 在本 Change 内通过现有完整 Workflow definition GET/POST 提供策略编辑闭环，不新增 policy-only mutation endpoint。
- decomposition 使用顶层 `mode/target/strategy/max_items/max_depth/auto_when/ask_when`；interaction 保持独立顶层对象。
- strategy、conditions 与 limits 的 exact closed vocabulary 以当前 OpenSpec delta 和 design_doc 为准。
- legacy V1/V2 固定只读投影 `off + interactive`，不原地重写；权限 vocabulary 覆盖 decomposition、AFK、filesystem、branch/PR/merge、external/publication、production、cost、credentials 与 irreversible actions。
