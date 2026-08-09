# 技术设计

## 背景

Issue #46 的冻结实现 `6cf44730294aa51e06fa4c5ac509e198214c4568` 在正式 Review 2/2 后留下三项 MEDIUM 阻断，治理提交 `5f93fd84f6f984c16d55df2eac65caa4f5159958` 原样记录了 attempt `1b9862f4-f32b-4f88-9a95-ceba7e4128d7`。本 Change 从该治理提交继续，不修改旧 Change、失败报告或 Review 计数，只修复 #66 明确列出的 replay、authorization sidecar 与 compatibility contract。

用户结果是：同一 interaction journey 的终态不能被非法核心事件静默污染；review acknowledgement/transition 只能消费与当前 canonical decision state 绑定、物理读取稳定的 sidecar；旧 receipt 无法证明 binding 时必须安全拒绝并提供显式恢复路径。最终仍保留 #46 已通过的 event identity、append-only store、stale rejection、resume metrics、scorecard 与隐私边界。

## 证据与边界

- `packages/kernel/src/interaction/replay.ts` 在 known-code 过滤之后遇到 `terminalBeforeEvent`，除重复成功 resume 外直接 `continue`，因此非法 request/ack/effect/resume/operation failure 没有 `malformed-order`。
- `packages/kernel/src/state/review-gate-binding.ts` 以 `lstat(target)` 证明一次路径状态，随后通过新的 `readFile(target)` 无界打开，无法把授权决定绑定到同一物理文件。
- `packages/kernel/src/state/document-path.ts` 已提供 `O_NOFOLLOW | O_NONBLOCK`、`max + 1` 有界 fd 读取、parent realpath、target `dev/ino/size/mtimeNs/ctimeNs` 前后 fence 与严格 UTF-8；sidecar 可以在 state adapter 内复用，无需新依赖或跨包抽象。
- `packages/cli/src/commands/review.integration.test.ts` 已证明 legacy pending/approved receipt 缺 binding 时 fail closed，并证明 fresh request 可以原子重建；旧 proposal/delta 却仍承诺 canonical review 行为完全兼容。
- `openspec/specs/interaction-and-skill-provenance/spec.md` 只要求 exact receipt，尚未声明 sidecar schema、可信读取、legacy recovery；`interaction-observability` 也尚未进入 main spec。

## 领域与数据流

```text
InteractionEventV1[]
  -> kernel/interaction/replay.ts
  -> terminal-order diagnostics
  -> scorecard verifier（公式与 event identity 不变）

review request（持 Change lock）
  -> canonical receipt mutation
  -> atomic .pipeline-review-gate-binding.json

acknowledge / transition
  -> bounded O_NOFOLLOW open of the sidecar
  -> physical identity + canonical-byte proof
  -> binding matches current canonical state ? allow : fail closed
```

Replay 仍归 kernel interaction 纯领域层；sidecar 仍归 kernel state persistence adapter；CLI 只编排 request/acknowledge/transition，不复制解析或安全规则。没有 Dashboard/server API 或 package dependency 变化。

## 决策

### Replay terminal contract

终态定义保持现有语义：被拒绝的 review acknowledgement、失败的 effect/operation，以及首次合法 `resume.validated(success)`。在 envelope anchor、物理顺序与时间检查之后，任何已识别 core event 若出现在终态之后，只有“journey 已 valid resume 且本事件也是完整已知 codes 的 `resume.validated(success)`”可作为幂等重复继续；其余事件必须同时写入全局和 journey-local `malformed-order`，标记 `journeyHasMalformedOrder`，且不得再执行该事件的 request/ack/effect/resume 语义。

终态检查应位于 unknown extension-code 的成功语义跳过之前：未知 namespaced code 仍进入 `unclassified_codes`，但它包装的 core event 不能绕过 terminal-order fence。允许的幂等 resume 仍保留第一次 `validResumeAt`，不增加 completion，也不改变 scorecard 数值；一旦出现非法 terminal-after-core，既有 valid completion 必须失效。

### Canonical review sidecar contract

选择复用 `readOptionalBoundedRegularTextFile`，设 `MAX_REVIEW_GATE_BINDING_BYTES = 16 * 1024`。读取必须证明：

1. parent 是同一物理目录且 realpath 未漂移；
2. target 通过 `O_NOFOLLOW | O_NONBLOCK` 打开且为普通文件；
3. 打开前后 path 与 fd 的 `dev/ino/size/mtimeNs/ctimeNs` 一致；
4. 读取层最多物化 `max + 1` bytes，oversize/growth 在解析前拒绝；
5. 内容是严格 UTF-8、闭合 shape 的 JSON；解析后的 `ReviewGateBinding` 重新 `JSON.stringify` 加单个换行后必须与原字节完全一致。

最后一项把 duplicate keys、字段重排、额外空白、trailing bytes 与其他多义编码统一视为 ambiguous/non-canonical。当前 writer 已输出该 canonical byte shape，不需要迁移；missing 返回 `undefined`，其他物理/编码/shape 错误抛出稳定、无内容泄漏的错误。authorization 调用方将 `undefined` 或错误都视为不授权。

为产生确定性的 race 证据，`readReviewGateBinding` 可以接收与现有 bounded reader 相同的可选 `BoundedFileHandleReader` seam；默认仍是真实 fd reader，生产签名保持向后兼容。测试在 read window 内执行 same-inode mutation、path replacement、symlink replacement、growth 或 disappearance，并断言拒绝，不依赖概率性竞态循环。

### Legacy compatibility 与恢复

拒绝自动迁移 sidecar-less legacy receipt。缺少旧 request 时刻的可信 decision-state digest，不能从当前 state 反推此前 approval 的授权事实；任何自动 backfill 都会把“现在看起来一致”误当成“当时已被确认”。

- legacy pending/approved receipt 缺 sidecar、sidecar 非 canonical、超限或物理不稳定：`acknowledge` 与 `transition` fail closed。
- 恢复必须由相同 exact phase/event 的 fresh `review request` 在 Change lock 下完成：写入新的有序 `review_requested_at`、pending receipt 与 atomic canonical sidecar，再重新 acknowledge。
- interaction projection 缺失或损坏不参与该授权判断；不新增启动时 migration、compatibility flag 或 bypass。
- 为显式修复 #46 的批准契约漂移，本 Change 在任何 worker/实现写入前使用官方 `requirements-changed` 语义完成 Spec 再登记与 review；不得在 Build 修改已登记的 compatibility semantics。

## 可执行验收矩阵

| 范围 | 正常证据 | 负向/竞态证据 | 不得回归 |
| --- | --- | --- | --- |
| replay | 正常四事件 journey、幂等成功 resume | 每种 terminal 后的 request/suppressed/ack/effect/resume/operation failure；unknown extension 包装的 core event | append-only identity、首次 resume 时间、scorecard 数值 |
| sidecar reader | canonical writer round-trip、missing 为无 binding | symlink、目录/非普通文件、oversize、growth、same-inode mutation、path/symlink replacement、disappearance、坏 UTF-8/JSON/shape、duplicate key/非 canonical bytes | digest/run/phase/event matching 与 atomic writer |
| CLI recovery | fresh request -> acknowledge -> exact transition | legacy pending/approved 无 binding、corrupt/oversize/symlink binding 的 acknowledge/transition 均拒绝 | stale rejection、missing interaction projection 不影响 canonical auth |
| delivery | affected tests、build、architecture/comments、bundle/oracle/OpenSpec gates | exact dist freshness 与 tracked docs diff | 无 UI/browser、无新依赖、无本机插件更新 |

## Worker 边界与验收责任

根代理在 Build 前冻结本设计、delta specs 与测试矩阵，然后且仅然后派发一个 `agent_type=luna_worker`。Worker 可修改：

- `packages/kernel/src/interaction/replay.ts`、`replay.test.ts`；
- `packages/kernel/src/state/review-gate-binding.ts` 及新建/受影响的同目录测试；
- `packages/cli/src/commands/review.integration.test.ts` 与确有必要的 review/transition tests；
- 受影响的 `docs/CONTRACT.md`、`docs/TEST-REALITY.md`、本 Change OpenSpec/docs 和由官方脚本生成的 tracked dist。

Worker 不得改变 event schema/scorecard 公式、重构无关 state adapter、修改 Dashboard/server API、更新依赖、本机插件或 #46 Change，不得自审、判定 Review 通过、扩大范围或再委派。Worker 定向测试后停写并回传文件/命令证据；根代理逐项 code review、决定 finding 严重度、冻结 `build_sha`、执行最多两次正式 Review 和最终完整门。

## 备选方案

| 方案 | 优点 | 阻断 | 结论 |
| --- | --- | --- | --- |
| 从当前 canonical state 自动补 legacy binding | 表面兼容旧 receipt | 无法证明原 approval 对应的 decision state，可能授权 stale receipt | 拒绝 |
| 缺 binding 时配置化兼容/bypass | 减少恢复步骤 | 产生两套授权真相与环境依赖，测试难以证明 fail closed | 拒绝 |
| strict sidecar + fresh exact request | 可恢复、可审计、授权事实重新产生 | 旧 pending/approved receipt 需要重发 request | 采用 |
| 为 sidecar 自建新安全 reader | 局部封装直观 | 重复 `document-path` 已验证的 fd/path fence，增加漂移 | 拒绝，复用现有原语 |
| canonical state 内新增 binding 字段 | 单文件 canonical | 扩大 schema/迁移和公共状态契约，超出 bounded remediation | 拒绝 |

## 风险

- 16 KiB 上限或 canonical bytes 若与 writer 不一致会拒绝合法 receipt；以 writer round-trip 与旧候选 fixture 证明，恢复路径始终是 fresh request。
- 仅增加全局 diagnostic 而未增加 journey-local diagnostic 会让 scorecard 局部投影不一致；测试必须同时断言两处。
- terminal check 放错到 anchor/time 校验之前可能隐藏更早的 state discontinuity；保持先通用 continuity、再 terminal fence、最后成功语义。
- 测试若依赖真实调度竞态会出现假绿/抖动；使用现有 reader seam 做确定性 mutation，并保留至少一个 CLI filesystem integration 测试。
- `packages/cli/dist/tenon.mjs` 与 `packages/server/dist/dashboard.mjs` 都可能内联 kernel reader；只能通过现有 build/bundle 生成并执行 freshness/smoke，禁止手改。
- 完整门成本高；Worker 和根代理先用定向测试收敛，稳定产品候选只跑一次完整门，纯测试/docs 修订不重复全仓。

## Assumptions / Decision Log

1. #66 已明确授权 canonical fail-closed 行为，且不要求透明消费无法证明的 legacy approval。
2. 当前 sidecar writer 的 canonical 输出是单行 `JSON.stringify(binding)` 加 `\n`；任何其他编码可由 fresh request 恢复，因此不需要宽松 parser。
3. 浏览器 QA 不适用：本 Change 无 Dashboard UI、server route 或用户可见交互改动。
4. 外部 library/search 不适用：实现只复用仓库内已测试的 bounded file primitive，不新增依赖。
5. #46 Review 2/2、attempt、branch 和 failure report 永久只读；#66 的 Review 预算独立从 0/2 开始。

```coverage
touches: auth, canonical-state, interaction-observability, file-persistence, compatibility
L1_api:      filled -> #canonical-review-sidecar-contract
L2_data:     filled -> #canonical-review-sidecar-contract
L3_rules:    filled -> #replay-terminal-contract, #legacy-compatibility-与恢复
L4_state:    filled -> #领域与数据流, #replay-terminal-contract
L5_errors:   filled -> #可执行验收矩阵
L6_security: filled -> #canonical-review-sidecar-contract, #legacy-compatibility-与恢复
L7_perf:     filled -> #canonical-review-sidecar-contract
L8_deps:     filled -> #领域与数据流, #备选方案
L10_terms:   filled -> #领域与数据流
```
