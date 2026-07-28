# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 系统必须用独立闭集契约编排不可信验证草稿

kernel 必须提供与可信 `VerificationResult` 分离的纯
`VerificationEvidenceDraft` 校验与格式化能力。输入必须显式包含 `zh-CN` 或
`en` locale，以及 1–12 条按用户顺序排列的 evidence entry。entry 仅允许：

- `kind`: `command`、`browser`、`review`、`other`；
- `title`: 非空 UTF-8 文本，最多 240 bytes；
- `status`: `passed`、`failed`、`skipped`；
- `command`: 仅 `kind=command` 可选，最多 2,000 bytes；
- `result`: `passed`/`failed` 必填，最多 4,000 bytes；
- `skipReason`: `skipped` 必填，最多 2,000 bytes。

未知字段、未知 enum、NUL、非法控制字符、孤立 surrogate、超限值和不合法字段组合必须失败关闭。
CRLF 必须规范为 LF；合法中文、emoji、Tab 和换行必须保真。验证最多返回 20 条有序错误，每条包含稳定
machine code 和 field path；更多错误必须用 overflow 标志表达，不得无限扩张响应。

#### Scenario: 通过、失败和跳过条目都被诚实表示

- **WHEN** 输入包含带 result 的 passed/failed 条目，以及只带 skipReason 的 skipped 条目
- **THEN** 校验成功并保留输入顺序
- **AND** 不从“存在 command”或“存在条目”推断通过

#### Scenario: 结果与跳过原因互斥

- **WHEN** skipped 条目同时携带 result，或 passed/failed 条目缺少 result 或携带 skipReason
- **THEN** 校验失败并返回指向对应字段的稳定错误

#### Scenario: 空输入和超限输入失败关闭

- **WHEN** entries 为空、超过 12 条，或任一字段/最终输出超过预算
- **THEN** 不返回看似有效的 Markdown
- **AND** 返回有界、可定位的 validation error

#### Scenario: 合法 Unicode 和换行被规范保留

- **WHEN** title/result 包含合法中文、emoji、Tab 或 CRLF
- **THEN** CRLF 规范为 LF，其余内容保真
- **AND** NUL、孤立 surrogate 或不安全控制字符被拒绝

### Requirement: 格式化输出必须确定、可审查且不能伪造结构

格式化器必须只从通过校验的 canonical copy 生成 Markdown，不读盘、不写盘、不取时间或环境状态。
相同 canonical input 和 locale 必须得到逐字节相同、UTF-8 不超过 32 KiB 的输出。输出必须包含本地化的
“仅为草稿、未执行、未保存、不改变 Verify gate”声明，固定字段/段落/换行顺序，并保留 entry 输入顺序。
title/result/reason 必须按各自 Markdown 语境转义；command 必须使用能包住输入中最长 backtick run 的
自适应 fence，从而不能由输入额外创建 heading、list、fence、HTML comment 或 verdict。

#### Scenario: 同一输入产生稳定输出

- **WHEN** 相同规范化 DTO 和 locale 被重复格式化
- **THEN** 两次 Markdown 逐字节相等
- **AND** 不含时间戳、随机 ID 或服务端环境信息

#### Scenario: Markdown 特殊字符不能注入证据结构

- **WHEN** title、result 或 command 包含 heading、list、backtick fence、HTML comment 或多行文本
- **THEN** 这些值仍只出现在本 entry 的值语境
- **AND** 不能创建额外 entry、status 或草稿边界

#### Scenario: locale 显式决定读者文本

- **WHEN** 同一 entries 分别使用 `zh-CN` 和 `en`
- **THEN** 结构与事实相同，读者标签分别使用中文和英文
- **AND** locale 不依赖服务端进程环境或隐式浏览器状态

### Requirement: Dashboard API 必须在既有本地安全边界内无状态生成

server 必须提供 `POST /api/verification-evidence/compose`，请求为
`{ root, locale, entries }`。该端点必须位于现有 POST router 后，复用 loopback Host、Bearer token、
`application/json`、64 KiB body limit 与 workflow registered-root anchor 校验。成功响应必须为
`{ ok: true, markdown, entryCount }`。validation 失败必须返回 HTTP 400 与
`{ ok:false, code:"verification_evidence_invalid", error, details }`；未注册/漂移 root 和通用安全错误
保持现有兼容状态码与 envelope。

端点必须无状态：不得读取用户路径、执行 command、记录 request body、写 verification report/document
ledger/canonical state，或触发 transition。

#### Scenario: 受信 root 成功生成

- **WHEN** 有效 token、Host、content type、registered root 与合法 DTO 提交到端点
- **THEN** 返回 200、确定 Markdown 与真实 entryCount
- **AND** 项目文件、Change 状态和 document ledger 均不改变

#### Scenario: 不可信 root 或请求被既有守卫拒绝

- **WHEN** root 未注册/已漂移，或 Host/token/content type 不合法
- **THEN** 端点按现有安全契约返回 4xx
- **AND** kernel formatter 不被用来扩大文件或状态访问权限

#### Scenario: API 返回机器可定位错误

- **WHEN** DTO 字段组合、enum、Unicode 或预算不合法
- **THEN** 返回 `verification_evidence_invalid`
- **AND** details 只包含有界 code/path 信息，不把不可信输入反射为 HTML

### Requirement: Dashboard 必须提供 Verify-only 完整编排交互

Change detail 的 document evidence 区域必须仅在 `phase=verify` 时显示“编排验证证据”入口。入口必须打开
现有 accessible `Dialog`，清楚说明输出只生成、不执行、不保存、不改变 gate。编辑器必须提供真实空态、
添加/删除 entry、kind/status、title、command 与 status-specific result/skipReason 控件；当前 Dashboard
locale 必须显式传给 API。

空态不得发请求。提交期间必须显示 loading 并防重复提交；server validation/network failure 必须以内联
error/live feedback 呈现且保留草稿；成功后必须显示只读 Markdown 与复制操作。clipboard 成功和失败必须
分别反馈，失败时只读文本仍可手工选择。所有可见文案必须提供中英文翻译。

#### Scenario: 非 Verify 阶段不出现入口

- **WHEN** Change phase 为 open、explore、spec、build、ship 或 archive
- **THEN** document evidence 区域不渲染 composer 入口

#### Scenario: 空态添加并生成成功

- **WHEN** Verify 用户打开空编辑器、添加合法条目并提交
- **THEN** 显示 loading 后渲染 server 返回的 Markdown
- **AND** 请求只发送一次并携带当前 locale

#### Scenario: 失败后保留可修复草稿

- **WHEN** server 返回 validation error 或网络失败
- **THEN** dialog 保持打开、输入不丢失且错误可被辅助技术感知
- **AND** 用户修复后可重试

#### Scenario: 复制成功和失败都诚实反馈

- **WHEN** clipboard 写入成功
- **THEN** 使用现有 toast 显示成功
- **WHEN** clipboard API 缺失或拒绝
- **THEN** 显示失败反馈且保留可选择的只读 Markdown

#### Scenario: 键盘路径完整

- **WHEN** 用户仅使用键盘打开和操作 dialog
- **THEN** 初始焦点进入 dialog、Tab 焦点不逃逸、所有控件可达、Escape 关闭并归还焦点

### Requirement: 新能力必须保持现有验证治理兼容

该能力不得修改现有 `VerificationResult` 类型/信任判定、verification report 格式、document ledger、
CAS/原子写、build fingerprint、review receipt 或 phase gate。删除新增 formatter、route、API client 和
UI 入口必须能完整回滚，不要求 state/schema/data migration，不新增 runtime dependency。

#### Scenario: 草稿不能成为可信通过证据

- **WHEN** 用户生成或复制包含 passed entry 的 Markdown
- **THEN** Tenon 不创建 trusted issuer、revision binding、verification result 或 gate receipt

#### Scenario: 旧 Dashboard 与 workflow 行为不变

- **WHEN** 用户不打开 composer 或运行现有 API/workflow
- **THEN** 既有 snapshot、state、document evidence、transition 和 report 行为保持兼容
