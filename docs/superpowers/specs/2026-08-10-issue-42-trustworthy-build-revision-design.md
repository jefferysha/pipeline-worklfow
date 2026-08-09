# Issue #42：可信 Build Revision 技术设计

## 背景与用户结果

当前 `verify-pass` 依赖 `build-head-unchanged`，但运行时把三种高风险情况当作可跳过：

1. `build_sha` 是空串或字面 `null` 时直接通过；
2. Git HEAD / workspace fingerprint 能力缺失或返回空值时记为 `skipped`，实际 transition 仍可通过；
3. 非空值只与当前 HEAD 或 workspace fingerprint 比较，无法证明它属于当前 repository、当前
   worktree，或确由进入本次 Verify visit 的 Build transition 捕获。

Issue #42 的结果是：所有 Verify success 入口在无法证明“当前验证对象就是当前项目、当前 worktree、
当前 Build visit 的真实 revision”时统一失败关闭；同一事实通过 CLI、HTTP、snapshot/SSE、AFK 与
Dashboard 投影，安全修复只能回到 Build 重建并重新捕获。

## 固定约束与非目标

- GitHub #42 的 Acceptance、Measurement 与 cross-mode matrix 是最终验收标准；父 roadmap #41
  只提供交互优先的方向。
- 保留状态字段名 `build_sha` 与 Workflow guard 名 `build-head-unchanged`，避免扩大 state / Workflow
  schema；其语义升级为“可信 Build revision token”，不再承诺裸 Git SHA。
- 不新增依赖，不修改 canonical state/ledger/review receipt 的人工写入规则，不提供 backfill。
- 不设计 #47 的完整 remediation tracker；本轮只提供稳定 code、reason、hash 与唯一安全修复语义。
- 不合并 PR、不发布版本、不修改已安装 Tenon 插件。

## 影响面与现有调用链

| 边界 | 当前事实 | #42 责任 |
| --- | --- | --- |
| kernel policy | default `build-complete` 运行 `freeze-build-sha`；`verify-pass` 运行 `build-head-unchanged` | 捕获 token；任何不可信结果为 typed hard blocker |
| custom Workflow | governed lifecycle 只按固定 step 名注入；普通 custom 仅消费显式 guard/action | 以 `build_sha` output→input 语义注入捕获；除显式失败回退外的 Verify-like 出口注入 trust guard |
| canonical state | `WorkflowRunRepository.transact()` 在一把锁内规划、commit、生成 immutable TransitionRecord | assessment 在同一锁内核对当前 state 与 validated transition head；拒绝零 mutation |
| CLI/server transition | 共用 `TransitionApplication`，adapter 只映射结果 | 透传同一 structured blocker；CLI 与 HTTP 不复制判定 |
| snapshot/SSE | server 从 kernel `readinessByTransition` 生成同一 snapshot，SSE 发送 snapshot | blocker DTO 原样包含 code/reason/remediation/hash |
| AFK | authoritative branch barrier + trusted verifier gate 决定 merge/paused；`automation_cause` 已投影到 server/SSE/Dashboard | 缺失、非法或 revision subject 漂移统一写入相同 blocker code 与 remediation |
| Dashboard | 严格 decode readiness；Progress 目前把 blocker 降成 `guard:*` / `capability:*` | 严格接收新 blocker，展示稳定 code、reason、唯一修复动作；AFK cause 同口径 |

## 方案比较

| 方案 | 优点 | 失败面 | 结论 |
| --- | --- | --- | --- |
| A. 仅把现有 skipped 改为 failed | 改动最小，旧裸 SHA 不变 | 无法拒绝其他 project/worktree，也无法阻止 `tenon set build_sha` 伪造来源 | 拒绝 |
| B. 新增多个 state 字段或可变 sidecar 保存归属 | reason 可直接读取，展示容易 | 扩大 closed state schema、N-1 canonical 兼容与并发提交面；sidecar 与 state 易撕裂 | 拒绝 |
| C. 在现有 `build_sha` 保存单一 typed token，并用 immutable transition head 证明捕获 | 不改 state schema；旧 runtime 对新 token 安全拒绝；project/worktree/revision 可分别判定；来源与 CAS 同锁 | 旧裸 SHA 必须回 Build 重建；需要同步 Review candidate 与所有投影 decoder | **采用** |

## 决策

### Build revision token

canonical 字面量为：

```text
build:v1:<git|workspace>:<revision_hash>:<repository_hash>:<worktree_hash>
```

三个 hash 都是 64 位小写十六进制 SHA-256，并使用不同 domain separator：

- `revision_hash`：`branch|worktree` 对当前 Git object ID 做 hash；`in-place` 对当前
  `workspace:sha256:<digest>` 基线做 hash；
- `repository_hash`：对物理 Git common directory 身份做 hash；
- `worktree_hash`：对当前物理 top-level / Git directory 组合做 hash。

token 不含裸路径、prompt 或 credential。Review attempt 将 token 再映射为既有
`sha256:<64 hex>` candidate fingerprint，避免扩大 review-attempt wire regex。

### 捕获与证明

`freeze-build-sha` 不再自行拼接可选 Git/workspace 能力，而只消费必需的
`captureBuildRevision` capability：

1. 根据 `isolation` 选择 Git object ID 或 workspace fingerprint；缺失、空值、非法值立即抛出 typed
   capture blocker；
2. 读取当前 repository/worktree physical identity；任一不可证明即拒绝；
3. 生成 canonical token，作为该 transition 的 `build_sha` effect；
4. `WorkflowRunRepository` 在原有锁和同一次 commit 中生成 immutable TransitionRecord。

Verify assessment 除解析 token 和重算当前三类 hash 外，还调用 validated transition-head reader：

- canonical current 的 `build_sha` 必须与 guard 输入相同；
- head record 的 `to` 必须是 current Verify-like step；
- record 必须且只能有一个 `build_sha` effect，`to` 等于当前 token；
- record/run/revision continuity 仍由现有 digest anchor 与 bounded legacy walk 验证。

因此普通 state set、ledger edit、backfill、producer spoof 或无关 receipt 都不能制造 provenance。

### Custom Workflow 语义

不再只按 `build` / `verify` / `ship` 固定名称推断 #42：

- 一个 step 声明 `build_sha` output，且目标 step 声明 `build_sha` input 时，进入边自动继承
  `freeze-build-sha`；
- 一个 step 声明 `build_sha` input 时，其所有不含 `mark-verification-failed` 的出口自动继承
  `build-head-unchanged`；
- 显式 `mark-verification-failed` 的回退边保持可恢复，不要求成功 revision；它同时清空旧 token；
- 显式重复声明通过 merge/de-dup 维持幂等。

这让 arbitrary step id 的 custom Workflow 获得同一不变量；没有 Verify-like `build_sha` input 的短
Workflow 不受影响。built-in / free / custom track 不改变该安全不变量。

## 关键业务规则

1. `build_sha` 缺失、`null`、多个候选拼接、非 canonical token或 kind 与 isolation 不一致都拒绝。
2. revision、repository、worktree 任一 hash 漂移分别返回稳定 reason；不能把归属漂移降成普通 HEAD
   mismatch。
3. assessment capability 缺失、identity/canonical read 失败或 guard evaluator 抛错都转换为同一
   hard blocker，不得 `skipped` 或 allow。
4. provenance 缺失、head 不属于当前 Verify visit、effect 不唯一或与 state 不一致都拒绝。
5. 有效 token 的重复 assessment 与 readiness projection 必须幂等；同一真实输入重复捕获得到相同 token。
6. 拒绝发生在 `WorkflowRunRepository.transact()` commit 前，state、TransitionRecord、history、receipt
   都保持不变。
7. blocker code、remediation 由 kernel 常量单源导出；adapter 只选择传输格式。
8. 任何 observability 只发 state/revision hash 和闭集 reason，不输出路径、prompt、credential 或异常原文。

## 状态机与并发边界

```text
Build --capture trusted token + atomic TransitionRecord--> Verify visit
  │                                                    │
  │ capture unavailable                               ├─ missing/null/malformed/ambiguous
  └─ typed blocker; zero mutation                     ├─ revision/project/worktree drift
                                                       ├─ provenance/state mismatch
                                                       └─ capability/evaluation unavailable
                                                            │
                                                            └─ blocker; zero mutation

Verify --mark-verification-failed; clear token--> Build --rebuild/capture--> Verify
Verify --trusted assessment + exact review receipt--> Ship
```

实际 transition 在 repository 锁内读取 state、assessment 和 head；snapshot/SSE 是只读预测，若并发写
导致传入 state 与重新读取的 canonical digest 不同，短暂返回 `state-stale` blocker，下一次 snapshot
自然收敛，绝不把竞态窗口宣称 ready。

## Blocker 与投影契约

统一 code：`verify-build-revision-untrusted`。

统一 remediation id：`return-to-build-and-capture-current-revision`。

reason 闭集：

```text
missing | null | ambiguous | malformed | isolation-mismatch |
capability-unavailable | provenance-missing | provenance-mismatch |
state-stale | revision-stale | project-mismatch | worktree-mismatch | evaluation-error
```

typed blocker 至少包含：

```text
kind, code, reason, remediation, stateHash, revisionHash
```

`stateHash` / `revisionHash` 为带 `sha256:` 前缀的隐私安全摘要；无法取得时使用明确缺席，不回显原始
候选或异常。CLI stderr、transition HTTP 409、snapshot/SSE readiness、AFK RunRecord / `automation_cause`
和 Dashboard 均消费此 code/remediation。AFK 继续用 authoritative branch barrier 作为 raw verifier
subject，但缺失/非法 barrier 或 subject revision mismatch 映射为同一 blocker code；其他 workflow /
attempt / change 归属错误仍保留更具体的 verifier subject blocker。

## 跨模式验收矩阵

| 维度 | 适用路径 | 必须证明 |
| --- | --- | --- |
| interactive + default | CLI/server `TransitionApplication` | 缺失/非法/漂移/错误归属拒绝，合法 token 通过 |
| interactive + custom | arbitrary step id 的 `build_sha` output→input | 自动捕获/guard；失败回退仍可达 |
| AFK + default/custom | authoritative barrier + verifier gate + settlement | 不可信 revision 不 merge，stable cause/remediation 投影 |
| built-in/free/custom track | 同一 kernel invariant | track predicate 不绕过 revision trust |
| API + SSE | `/api/snapshot` 与 stream 同一 DTO | exact blocker 字段一致，无 raw path/secret |
| Dashboard Progress/AFK | strict decoder + view model | 同 code/reason/remediation，可操作但不 backfill |

## 文件所有权与实施边界

唯一 `luna_worker` 可修改以下实施面，主代理不与其并发写代码：

- `packages/kernel/src/workflow/**`、必要的 `packages/kernel/src/workspace/**`、kernel exports/tests；
- `packages/cli/src/**`、`packages/server/src/**`、`packages/automation/src/**`；
- `packages/dashboard-app/src/**` 与对应 tests/i18n；
- `docs/CONTRACT.md`、default workflow 使用文档、`docs/TEST-REALITY.md` 的事实同步；
- 由正式 build 生成的 `packages/{cli,server,dashboard-app}/dist/**`。

非目标：worker 不修改本 Change 的 `.pipeline*`、document ledger、review receipt、OpenSpec phase 状态，
不 commit/push/建 PR，不安装插件，不改用户 PNG，不自行 review 或给最终 PASS。

## 验收与测试拆解

| #42 标准 | 最小证据 |
| --- | --- |
| missing/null/ambiguous/stale/other project/worktree 全拒绝 | token parser/assessment table unit + default/custom transition zero-mutation integration |
| valid success + retry idempotent | capture/parse/recompute unit；同 input 重复 readiness；合法 default/custom transition |
| CLI/server/SSE/AFK/Dashboard 一致 | adapter contract tests、snapshot/SSE equality、AFK settlement/admission、Dashboard strict decoder/render |
| 无伪造旁路 | `tenon set`/旧裸 SHA/错误 TransitionRecord effect/无关 receipt negative tests |
| Measurement=0 | 所有 Verify success planning 共享同一 guard；无 capability 时 actual transition 也拒绝 |
| privacy-safe events | recursive key/value tests只允许 code/reason/remediation/hash；不含 path/prompt/token/credential |

中途只跑受影响包的定向 Vitest/typecheck。实现稳定且正式 code review finding 清零后，主代理只执行一次
完整最终门：kernel/CLI/server/automation/Dashboard tests、type/build、architecture、default-workflow
freshness、release bundle freshness/smoke，以及 Docker 不可用时诚实记录的容器 E2E skip。

## Assumptions / Decision Log

- 选择 full 预设，因为变化横跨 kernel、automation、server public DTO、Dashboard 与 tracked bundles。
- 旧裸 SHA / workspace baseline 没有 project/worktree/provenance 证明，升级后必须安全回 Build；不提供迁移
  backfill。这是 P0 fail-closed 的预期兼容策略，不是数据损坏。
- physical path 只在本机 capture/assessment 内使用并立即 hash；若 repository 移动，旧 token 视为
  worktree/project 漂移并要求重建。
- custom Workflow 的失败出口以标准 `mark-verification-failed` action 显式表达；没有该 action 的未知
  出口按 success-like 处理并要求 trust guard，选择安全优先。
- Docker 当前不可用不阻塞纯 admission/settlement 证据；真实 container E2E 必须标为环境 skip，不能伪绿。

## Grill 自检

| 质问 | 所有者 / 证据 | 假设为假时 | 落点 |
| --- | --- | --- | --- |
| 谁能声明 revision 可信？ | kernel capture capability + repository transaction；不是 CLI 字符串 | capability 缺失即 blocker | #捕获与证明 |
| 谁证明 token 属于本次 Verify？ | validated canonical transition head 与唯一 `build_sha` effect | head/effect 不符即 provenance blocker | #捕获与证明 |
| custom 名称不同怎么办？ | Workflow IR 的 `build_sha` output/input 与 rollback action | 无语义声明则安全拒绝，不猜 step 名 | #Custom-Workflow-语义 |
| snapshot 与 transition 会竞态吗？ | transition 锁内；snapshot 交叉核对 state digest | 短暂 `state-stale`，不宣称 ready | #状态机与并发边界 |
| AFK 是否可用自报 SHA 绕过？ | 现有 authoritative branch barrier + boundary-verified result | 缺失/不匹配统一 paused，不 merge | #Blocker-与投影契约 |
| Dashboard 会不会复制判定？ | strict decode kernel/server DTO，只渲染 | 非法 DTO 整体拒绝 | #影响面与现有调用链 |

```coverage
touches: verification, workflow, automation, api
L1_api:      filled -> #Blocker-与投影契约
L2_data:     filled -> #Build-revision-token
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机与并发边界
L5_errors:   filled -> #Blocker-与投影契约
L6_security: filled -> #关键业务规则
L7_perf:     filled -> #状态机与并发边界
L8_deps:     waived -> 不新增依赖，复用 Node-22、Git 与现有 kernel seam
L10_terms:   filled -> CONTEXT.md
```
