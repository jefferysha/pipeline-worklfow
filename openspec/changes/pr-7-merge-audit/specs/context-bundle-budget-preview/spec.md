# Context Bundle 预算预览增量规格

## ADDED Requirements

### Requirement: CLI 与预览 SHALL 复用同一 ledger-bound 编译服务

系统 SHALL 在 kernel 提供单一共享编译服务，按目标 canonical phase 的 document policy 选择输入、
读取 document ledger、校验源文件 SHA-256，并以确定性顺序生成 `context-bundle/v1`。CLI
`tenon handoff --bundle` 与 server 预览 SHALL 调用该服务；adapter 和 Dashboard 不得复制
policy、reason、materialization mode 或预算算法。

共享服务 SHALL 保持既有 `context-bundle/v1`、CLI 默认 `120000` bytes、非 bundle handoff 与
错误退出兼容，并额外生成不进入 bundle wire schema 的 `sourceBytes`、`materializedBytes` 和稳定
`reasonCode` preview metadata。

#### Scenario: CLI 与 API 使用相同输入

- **GIVEN** 同一 Change、from、target、ledger、源文件和预算
- **WHEN** CLI 编译 bundle 且 server 生成预览
- **THEN** 输入顺序、kind、path、digest、reason、mode、used bytes 与预算结果一致
- **AND** CLI `context-bundle/v1` wire shape 保持兼容

#### Scenario: 目标阶段没有 required reads

- **WHEN** target 的 policy required reads 为空
- **THEN** 编译成功返回零输入和 `usedBytes=0`
- **AND** 不把真实 policy-empty 误报成 ledger 缺失

### Requirement: Server preview SHALL 只读且绑定可信 registered root

server SHALL 提供 `GET /api/context-bundle/preview`，显式要求 registered `root`、安全 `change`、
canonical `target` 与正安全整数 `budgetBytes`。端点 SHALL 经过统一 Host guard，并在读取 Change
前通过 registered root fd/inode/realpath 锚和逐层 `O_NOFOLLOW` 目录/文件 fd 绑定真实目录项。

只有运行时能从已打开目录 fd 做相对遍历时，server SHALL 读取 canonical state、ledger 和源文件；
不支持的平台 SHALL 在读取 Change 内容前返回 501
`CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`。该能力失败不影响可信本地 CLI handoff。

#### Scenario: 注册项目成功预览

- **GIVEN** root 已注册且 Change、ledger、required 文档和 digest 有效
- **WHEN** 客户端请求足够预算的 canonical target
- **THEN** server 返回 200、`ok:true` 和 `context-bundle-preview/v1`
- **AND** `sideEffects` 为 `none`
- **AND** Change state、ledger 与项目文件逐字节不变

#### Scenario: Root 或 Change 在读取期间换位

- **WHEN** registered root 或 Change 目录被 symlink、rename 或 inode 换位
- **THEN** server fail closed
- **AND** 不读取或返回替换目标内容

#### Scenario: 平台缺少可信遍历能力

- **GIVEN** root anchor 没有可遍历目录 fd path
- **WHEN** 请求预览
- **THEN** server 在读 canonical state 前返回 501 和稳定 capability code
- **AND** 响应不含 root 绝对路径、文档 path 或正文

### Requirement: 预览读取 SHALL 有独立资源上限并验证 canonical 完整性

server preview SHALL 在物化预算之外固定最多 64 条 required records、单文件最多 262144 source
bytes、合计最多 1048576 source bytes，并以 `maxBytes + 1` 有界读取检测读取中增长。canonical
current、immutable twin、直接 predecessor、TransitionRecord、digest、effects 和 UTF-8 任一损坏
SHALL 返回 `CONTEXT_BUNDLE_STATE_CORRUPT`，且不继续读取 ledger/source。

ledger/source SHALL 只接受 root 内非 symlink 普通文件、fatal UTF-8、合法相对 path 和匹配 digest。
低 materialized budget 不得绕过 record/source 资源上限。

#### Scenario: Canonical predecessor 或 TransitionRecord 损坏

- **WHEN** current、immutable、direct predecessor 或引用的 TransitionRecord 缺失、篡改或不连续
- **THEN** server 返回 409 `CONTEXT_BUNDLE_STATE_CORRUPT`
- **AND** 不回退 legacy YAML 或读取 ledger

#### Scenario: Source 超过固定上限

- **WHEN** record 数、单文件或累计 source bytes 超限
- **THEN** server 返回 413 `CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED`
- **AND** 在超限正文的无界读取、哈希或压缩前停止
- **AND** 响应只含安全 metric/limit/actual/相对 path

### Requirement: Preview DTO 与错误 SHALL 可机器判定且不泄露正文

成功 preview SHALL 只含 schema、sideEffects、change/from/to/tier、document count、预算、有效
aggregate digest，以及每项 kind、相对 path、digest、reason、reasonCode、mode、sourceBytes 和
materializedBytes；不得含 `content`。

共享服务 SHALL 使用稳定错误码区分 invalid request、state corrupt、ledger missing、document
missing、document stale、resource limit 与 budget exceeded。server SHALL 分别映射
400/409/409/409/409/413/422；平台 capability failure 为 501。浏览器响应不得包含底层 errno、
绝对路径或正文。

#### Scenario: 必读文档缺失或漂移

- **WHEN** required kind 未登记、源文件缺失或 SHA-256 与 ledger 不同
- **THEN** server 返回对应 409 稳定 code 和安全恢复动作
- **AND** 不返回 partial success 或 aggregate digest

#### Scenario: 预算不足

- **WHEN** 已验证输入的 materialized bytes 超过请求预算
- **THEN** server 返回 422 `CONTEXT_BUNDLE_BUDGET_EXCEEDED`
- **AND** 附带不含正文和 aggregate digest 的 safe preview
- **AND** state、ledger、默认预算和项目配置不变

### Requirement: Dashboard SHALL 提供完整、可访问且无竞态的预览状态

Dashboard SHALL 在 Change 进度抽屉显示 target、正整数预算、提交动作和结果，默认 target 为当前
canonical phase 的下一 phase、默认预算为 120000。custom step 下入口仍可见且默认 target 为
`open`。组件 SHALL 区分 idle、loading、success、policy-empty、budget-error 和其他 error，
支持原地 retry。

target、budget、Change 或抽屉生命周期变化时，旧请求 SHALL 被取消或失效，不能覆盖最新状态。表单
SHALL 支持可见 label、Tab、Enter、focus-visible、响应式、明暗主题、中英文和 reduced-motion。
一次性 target/budget 不得持久化。

#### Scenario: 快速切换与键盘提交

- **WHEN** 用户快速切换 target 或编辑预算
- **THEN** 旧响应不会覆盖最后一次请求
- **WHEN** 用户在预算输入按 Enter
- **THEN** 触发与提交按钮相同的预览

#### Scenario: 错误恢复

- **WHEN** API 返回 budget、missing、stale、network 或 capability error
- **THEN** Dashboard 按稳定 code 显示本地化原因和可执行恢复动作
- **AND** 用户无需刷新整个 Dashboard 即可 retry

### Requirement: Context Bundle preview 与 Verify evidence SHALL 在 Dashboard 共存

最新 main 的 Verify evidence composer 与 Context Bundle preview SHALL 同时保留。Verify phase
抽屉 SHALL 同时呈现预算预览和 evidence composer；body portal、父抽屉关闭、Escape、focus restore、
draft/route 保留和滚动 ownership 不得互相破坏。

`packages/dashboard-app/src/api/client.ts` SHALL 同时导出两组 API facade/type；生成的 Dashboard、
server 和 CLI 资产 SHALL 来自最终合并源码。

#### Scenario: Verify 抽屉同时使用两个工具

- **GIVEN** 当前 Change 处于 Verify
- **WHEN** 用户打开进度抽屉
- **THEN** 预算预览与 evidence composer 均可达
- **AND** 操作 composer 不关闭或重置父抽屉的预算预览
- **AND** 操作预算预览不丢失 composer draft、route 或 focus ownership
