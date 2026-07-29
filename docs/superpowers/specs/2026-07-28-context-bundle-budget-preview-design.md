# Context Bundle 预算预览技术设计

## 用户结果

用户在 Tenon Dashboard 的 Change 详情抽屉中选择目标阶段和一次性预算后，可以在真正执行
handoff 前确认：

- document policy 会选中哪些 ledger-bound 文档；
- 每项采用 `full`、`summary` 或 `reference` 哪种物化模式；
- 源文档与物化内容各占多少 UTF-8 bytes；
- 当前预算是否足够，以及缺文档、文件漂移或预算不足时怎样恢复。

预览必须与 `tenon handoff --bundle` 使用同一编译路径。它是只读诊断，不修改 Change、
document ledger、默认预算或任何配置，也不把受治理文档正文返回浏览器。

## 事实与不重复边界

### 固定上游证据

- Tre&#108;lis 默认分支 `main` 和最新稳定语义 tag `v0.6.9` 同指
  `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`。GitHub latest Release API 在
  2026-07-28 返回 404，因此本轮明确回退 tag。Issue #441 和 PR #456 证明：上下文预算若分散
  在多个宿主入口，会出现平台漂移；超限后保留 path/size/reason 能显著提高可解释性。
- Com&#101;t 默认分支 `master` 固定为 `2945693e4061c369be0d400ed2999a66fa87c680`；GitHub
  `releases/latest` 返回并标记 `prerelease=false` 的 `0.4.0-beta.9` 固定为
  `84038b0d6b7c185b233f0f36b294ae74dd9121d0`，而严格 SemVer 不含 prerelease 的最新版本是
  `0.3.9` / `053f76d8ac6aaa499b1d3f8752cb5637fc4fb914`。beta.9 的 snapshot include/exclude 与
  `max_files`、`max_total_bytes`、`max_duration_ms` 表明预算应在任务启动前可审计并 fail closed。

详细来源分别记录在同日 Tre&#108;lis 与 Com&#101;t research 文档。本 Change 不复制上游代码，也不引入
Tre&#108;lis 的自动索引降级或 Com&#101;t 的 snapshot 文件选择配置。

### Tenon 当前基线

- `packages/kernel/src/compress/context-bundle.ts` 已提供确定性 `context-bundle/v1`、UTF-8 byte
  预算和 aggregate digest。
- `packages/cli/src/commands/handoff.ts` 私有 `compileBundle` 已实现 policy 选取、ledger SHA-256
  校验、模式选择和默认 `120_000` bytes，但 server 与 Dashboard 无法复用。
- `openspec/specs/context-bundle-handoff/spec.md` 已冻结硬预算、缺失/漂移 fail-closed 与 CLI
  向后兼容语义。
- 开放 PR、远端 `codex/*`、本机 worktree、活跃 Change、BACKLOG、GOAL 和近期提交中没有
  Context Bundle Dashboard 预览。正在进行的 `host-target-plan-dashboard` 覆盖 Com&#101;t 最新
  `platform target` 方向，本轮明确避开；安装鉴权和 Dashboard 视觉改造也不在本轮范围。

因此新增的是“把已有可信编译事实变成共享应用服务与可操作的 Dashboard 预检闭环”，不是第二套
bundle 格式或重复的视觉面板。

## 约束与非目标

- 保持 Node 22、npm workspace、现有 DDD 包边界和 CLI 输出兼容。
- server 只能读取机器注册表中的 anchored root，并在读前后验证 root 身份。
- Change、phase、相对路径、ledger digest 和预算都由共享层校验；前端不能重算业务规则。
- GET 端点不写文件，不创建 `.pipeline`，不缓存或持久化 preview budget。
- 不返回 `content`，不引入新运行时依赖，不调用模型，不改变真实 handoff 默认预算。
- 不重构进度页视觉体系，不接管其他 worktree 的 host target、安装或 UI overhaul 范围。

## 方案比较

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| server 调 CLI 子进程并解析 JSON | 改动少 | 文本错误不稳定、进程开销、root/cwd 边界隐式、难返回安全摘要 | 拒绝 |
| server 复制 CLI 的 ledger→bundle 逻辑 | 快速 | 策略分叉，重现 Tre&#108;lis 多入口漂移问题 | 拒绝 |
| kernel 提取共享 ledger compiler，CLI/server 适配 | 单一规则源、可注入 fs、typed error、CLI 兼容 | 需要迁移测试和明确 DTO | 采用 |

## 决策

### 共享应用服务

新增 storage-agnostic kernel `ledger-context-bundle` 用例，输入为可信项目 root、Change、
source phase、target phase、预算，以及显式 `ledgerRepository` / `sourceReader` ports；Node
ledger、pathname/inode guard 与 legacy `HandoffFs` 接缝只存在于独立 CLI adapter。输出：

- 原有完整 `ContextBundleV1`，供 CLI 继续原样序列化；
- 与 bundle inputs 同序的 `sourceBytes` / `materializedBytes` 统计和 UI-neutral 的稳定 domain
  `reasonCode`，供 server 生成安全摘要。

服务复用现有 document policy、ledger reader、压缩器和 `compileContextBundle`。文档原因、
稳定 reason code 与 materialization mode 从 CLI 私有常量迁入共享层。CLI 继续序列化既有中文
`reason`，不把 `reasonCode` 写入 `context-bundle/v1`；kernel 不依赖 Dashboard 翻译命名空间，
Dashboard 用显式 domain-token → i18n-key 映射做 zh/en 本地化。

共享层定义稳定 `LedgerContextBundleError`：

| code | 语义 | HTTP |
| --- | --- | --- |
| `CONTEXT_BUNDLE_INVALID_REQUEST` | 非法 Change/phase/budget | 400 |
| `CONTEXT_BUNDLE_STATE_CORRUPT` | canonical revision、连续性或 UTF-8 损坏 | 409 |
| `CONTEXT_BUNDLE_LEDGER_MISSING` | Change 无 document ledger | 409 |
| `CONTEXT_BUNDLE_DOCUMENT_MISSING` | 必读 kind 未登记或文件缺失 | 409 |
| `CONTEXT_BUNDLE_DOCUMENT_STALE` | 文件 SHA 与 ledger 不同 | 409 |
| `CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED` | required records/source 超过固定资源边界 | 413 |
| `CONTEXT_BUNDLE_BUDGET_EXCEEDED` | 物化内容超过预算 | 422 |
| `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE` | runtime 无 fd-relative traversal（server capability） | 501 |

错误同时保留稳定 code、用户可读 message 和可选 preview metadata。不得靠解析中文错误文本映射
协议。预算错误在共享层计算所有已验证输入的摘要后返回 `422 + preview`；它仍是 fail-closed，
但用户可以据此调大一次性预算。

### 只读 API

新增：

```text
GET /api/context-bundle/preview
  ?root=<registered-root>
  &change=<safe-name>
  &target=<canonical-phase>
  &budgetBytes=<positive-safe-integer>
```

成功为 `200 { ok: true, preview }`；预算不足为
`422 { ok: false, code, error, preview }`；其他错误为稳定 error envelope。`preview` 只含：

- schemaVersion、change、from、to、tier、aggregateDigest；
- `budget.maxBytes`、`budget.usedBytes`、`fits`;
- 每项 kind、path、digest、reason、reasonCode、mode、sourceBytes、materializedBytes。

端点先用 `workflowRootForRequest` 取注册 root anchor，再校验 Change 和 canonical state，读前后都
`assertWorkflowRootAnchor`。canonical state 的 JSON、UTF-8、digest 或连续性损坏统一映射为安全
`CONTEXT_BUNDLE_STATE_CORRUPT`，且不继续读取 ledger/source。端点不返回
`ContextBundleInputV1.content`。

### Dashboard 交互

在 `ProgressDrawer` 中挂一个独立 `ContextBundlePreview`，避免扩大抽屉已有职责：

1. 打开抽屉时，从当前阶段的下一个 canonical phase 作为可见默认 target；API 仍要求显式 target。
2. 默认预算显示 `120000`，用户可在正整数边界内改动；预算只保存在组件 state。
3. mount、target 改变或提交预算时进入 loading；成功显示占用条和输入列表。
4. `open` 仍作为合法 target，因其 policy reads 为空时显示真实 empty state；缺失 mandatory
   文档绝不伪装为空。
5. 预算不足显示 warning、required/available 和同序输入摘要；缺失/漂移显示错误与 retry。
6. `<form>` 支持 Enter 提交；select、number input、submit、retry 均有可见 label、焦点和
   键盘路径。请求使用递增 request id/abort，旧响应不能覆盖新选择。
7. 中英文 key 对称；组件只渲染服务端事实，不自行判断 mode、bytes 或修复命令。

## 数据与状态流

```text
ProgressDrawer
  -> ContextBundlePreview(target, budget)
  -> GET preview(root, change, target, budgetBytes)
  -> registered root anchor + canonical state
  -> shared ledger context compiler
     -> effective document policy
     -> document ledger + source SHA verification
     -> deterministic materialization + byte stats
     -> ContextBundle v1 hard-budget compiler
  -> safe metadata DTO (never content)
  -> idle | loading | success | empty | budget-error | error
```

组件状态只在当前抽屉生命周期内存在。关闭抽屉会取消请求；重新打开恢复默认 target/budget，不产生
持久化或跨 Change 泄漏。

## 关键业务规则

1. CLI 与 API 必须调用同一个共享服务；不得在 adapter 层复制 policy、reason 或 mode 映射。
2. ledger 不存在、mandatory kind 未登记、文件缺失、SHA 漂移都 fail closed。
3. `usedBytes` 只计算物化 content；`sourceBytes` 单独命名，避免把压缩前后大小混为一谈。
4. `reference` 的 `materializedBytes` 为 0；重复 path 仍按 kind/path 顺序显示。
5. 预算不足不得产生有效 bundle aggregate digest，但可返回不带 aggregate digest 的 preview 摘要。
6. preview budget 不改变 CLI 缺省 `120_000`，也不落 state、ledger 或配置。
7. server 永不把文档正文发给 Dashboard。

## 状态机

```text
idle -> loading -> success
                -> empty
                -> budget-error
                -> error

success | empty | budget-error | error
  -- target/change/budget submit/retry --> loading
```

任一请求完成前若输入变化，旧响应必须被忽略。`empty` 仅代表目标 policy 的 required reads 为空；
缺数据属于 error。

## 红队自检与保守结论

| 质疑 | 证据与失败后果 | 决策 |
| --- | --- | --- |
| 谁保证 Dashboard 和 CLI 一致？ | Tre&#108;lis PR #456 表明多入口复制会漂移 | 共享 kernel service；测试同 fixture 比较 CLI/API |
| 预算错误为什么还能带 preview？ | 无摘要时用户只能盲调；但不能把失败伪装 200 | 422 且 `ok:false`，只附安全 metadata |
| root 被替换或 Change 穿越怎么办？ | server 已有 inode/realpath anchor 契约 | 复用 anchor，Change 严格 safe id，读前后复核 |
| API 是否泄露文档？ | CLI bundle 含正文，直接透传会扩大读取面 | DTO 明确丢弃 content，只回 digest/path/bytes/reason |
| 空态是否掩盖异常？ | mandatory kind 缺失是治理故障 | 仅 policy reads 为空才 empty；其余 typed error |
| 默认 next phase 会不会改变 workflow？ | 它只是 UI 初值 | API 参数始终显式，用户可选择，且不写 state |
| 抽屉与其他 UI 分支冲突怎么办？ | 有独立 Dashboard overhaul worktree | 新组件单文件挂载，不改导航、tokens 或视觉体系 |

## Assumptions / Decision Log

- 用户已对 exact Change 授予持续执行；低风险取舍采用可逆默认并在此记录，不把未再次提问伪装成
  用户选择。
- 采用 `422 + preview`，同时返回 `sourceBytes` 与 `materializedBytes`。
- UI 预选下一 canonical phase，但保留可见 select；允许显式选择 `open` 覆盖真实空态。
- typed domain errors 属于共享服务，server 只做 HTTP 映射。
- Build 红队审查纠正了“有限 kinds 等于有限 records”的错误假设：server reader 以目录/file fd
  绑定 registered root，固定 `64 records / 262144 bytes per file / 1048576 bytes total`，
  并在读正文前 fail closed；用户 materialized budget 不能替代资源边界。
- 第二轮红队审查确认 Darwin/Node 的 `/dev/fd/<directory>` 不可遍历，词法 pathname 的前后
  inode 检查无法排除同权限 swap-back。安全默认是：仅在 anchor 提供可遍历 fd path 时执行预览；
  否则在读取 Change 内容前返回 `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`。Linux Dashboard
  保留完整成功能力，CLI handoff 继续使用现有受信任本地工作区模型。
- Linux reader 把请求开始捕获的 Change `dev/ino` 传入每次 canonical state、ledger 与
  Change-local source lookup；普通目录换位即使不是 symlink 也在读取前失败。server 以
  `maxBytes + 1` 有界循环读取 file fd，累计剩余额度在下一次 reader 调用前传入。
- document ledger 自身使用独立 16 MiB transport cap，超限按 ledger unavailable fail closed；
  它不占用也不冒充 `totalSourceBytes`，required record count 仍由共享服务按 64 条执行。
- canonical state 的 malformed/invalid UTF-8/revision linkage 错误使用独立
  `CONTEXT_BUNDLE_STATE_CORRUPT`，server 响应不透出底层异常或绝对路径。
- `reasonCode` 使用 UI-neutral、闭合集合的 domain token；Dashboard 显式映射 i18n key，不按
  document kind 推导 reason 规则。
- custom workflow 的当前 step 只需是安全 id；target 仍必须是 canonical phase。Dashboard 在
  custom step 默认预览 `open`，不隐藏入口。
- 不引入缓存。文档规模受既有 bundle budget 约束，预览请求由用户打开抽屉/提交触发。
- Build 若发现要改变现有 `context-bundle/v1` 字节契约或 document policy 语义，必须以
  `requirements-changed` 回退 Spec，而不是在实现中覆盖决策。

## 术语

- **源字节（source bytes）**：ledger 路径当前文件的 UTF-8 byte 长度。
- **物化字节（materialized bytes）**：按 `full`/`summary` 生成并实际参与 hard budget 的内容长度。
- **安全预览（safe preview）**：不含文档正文、只含可解释 metadata 的 API DTO。
- **真实空态（policy-empty）**：目标阶段的 policy 没有 required reads，不等于文档缺失。
- **预算失败摘要（budget failure preview）**：编译失败后用于解释 required bytes 的 metadata，
  不是可消费 Context Bundle。

## 验证策略

- kernel：顺序、bytes、empty、missing ledger/kind/file、stale、duplicate reference、typed
  budget error 和原有 aggregate digest。
- CLI：既有参数、JSON/text、错误文案与 exit code 回归；同 fixture 与共享服务结果一致。
- server：非法 root/Change/phase/budget、root/Change inode 漂移、65 records、累计/单文件上限、
  fstat 后增长的有界读取、missing/stale、422 preview、200 success/empty、响应不含 `content`。
- Dashboard：成功、loading、empty、budget error、missing/stale error、retry、快速切换竞态、
  Enter 提交、label/focus 和 zh/en 完整性。
- 真实浏览器：先在 Darwin 唯一端口确认 501 capability error 与无绝对路径，再在 Linux 容器
  Dashboard 确认 title/目标 Change，覆盖成功、低预算 422、`open` 空态、临时 missing fixture、
  retry、键盘提交和窄屏。
- 全仓：定向测试后运行 `typecheck:web`、`test:web`、`build:web`、`build`、`npm test` 及受影响
  hooks/adapters/skills/bundle 门禁。

```coverage
touches:
L1_api:      filled -> #只读-API
L2_data:     filled -> #数据与状态流
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #红队自检与保守结论
L6_security: filled -> #约束与非目标
L7_perf:     filled -> #Assumptions--Decision-Log
L8_deps:     waived -> 不新增运行时依赖，复用 kernel/server/Dashboard 现有模块
L10_terms:   filled -> #术语
```
