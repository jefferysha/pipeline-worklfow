# Verification Evidence Composer 合并审计增量规格

## MODIFIED Requirements

### Requirement: Dashboard 必须提供 Verify-only 完整编排交互

Change detail 的 document evidence 区域 `MUST` 仅在 `phase=verify` 时显示“编排验证证据”
入口。入口必须打开现有 accessible `Dialog`，清楚说明输出只生成、不执行、不保存、不改变
gate。编辑器必须提供真实空态、添加/删除 entry、kind/status、title、command 与
status-specific result/skipReason 控件；当前 Dashboard locale 必须显式传给 API。

空态不得发请求。提交期间必须显示 loading 并防重复提交；server validation/network failure
必须以内联 error/live feedback 呈现且保留草稿；成功后必须显示只读 Markdown 与复制操作。
clipboard 成功和失败必须分别反馈，失败时只读文本仍可手工选择。所有可见文案必须提供中英文翻译。
validation error 必须以 `aria-invalid` 与 `aria-describedby` 关联具体失败控件，并将焦点移到首个
无效控件。关闭或卸载 dialog 必须取消进行中的 compose 请求；晚到的旧响应不得覆盖重开后的新会话。

composer 与共享 Dashboard surface 集成时 `MUST` 保留 shared `Dialog` 的统一 Lucide 图标、
theme token、ease-out motion 和 reduced-motion 语义。嵌套在 Task detail/drawer 内时，
topmost dialog 必须独占 Escape 与双向 Tab；单次 Escape 只能关闭 composer，外层详情和
`change=` URL 必须保留，焦点必须归还 composer 入口。关闭图标的 accessible label 必须使用
当前 locale，不得退化为硬编码字形或硬编码语言。
共享文档区不得反向导入 verification feature；composer 必须由拥有 feature/shell 上下文的上层
通过中性 slot 装配。

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
- **AND** 字段错误关联对应控件，焦点进入首个无效控件
- **AND** 用户修复后可重试

#### Scenario: 关闭后旧请求不能污染新会话

- **WHEN** 用户在 compose 请求进行中关闭 dialog，随后重新打开并开始新会话
- **THEN** 已关闭会话的请求被取消
- **AND** 旧请求的晚到成功或失败响应不能改变新会话的 loading、草稿、错误或输出

#### Scenario: 复制成功和失败都诚实反馈

- **WHEN** clipboard 写入成功
- **THEN** 使用现有 toast 显示成功
- **WHEN** clipboard API 缺失或拒绝
- **THEN** 显示失败反馈且保留可选择的只读 Markdown

#### Scenario: 键盘路径完整

- **WHEN** 用户仅使用键盘打开和操作 dialog
- **THEN** 初始焦点进入 dialog、Tab 焦点不逃逸、所有控件可达、Escape 关闭并归还焦点

#### Scenario: 嵌套键盘与共享视觉语义完整

- **WHEN** composer 从 Task detail/drawer 内以当前 locale 打开
- **THEN** workspace 关闭按钮使用共享 Lucide 图标和本地化 accessible label
- **AND** initial focus、正反向 Tab 困笼、单次 Escape 与焦点归还都只作用于 topmost dialog
- **AND** 外层详情、URL、ease-out 与 reduced-motion 语义保持不变

### Requirement: 新能力必须保持现有验证治理兼容

新能力 `MUST` 保持现有验证治理兼容，不得修改现有 `VerificationResult` 类型/信任判定、
verification report 格式、document ledger、CAS/原子写、build fingerprint、review receipt
或 phase gate。删除新增 formatter、route、API client 和 UI 入口必须能完整回滚，不要求
state/schema/data migration，不新增 runtime dependency。

compose route 必须要求 `root` 是显式非空字符串。缺失、空白或非字符串 root 必须在调用
registered-root resolver 前返回稳定 HTTP 400 validation envelope，不得隐式采用 server cwd。

与最新 `main` 集成时 `MUST` 使用不改写 PR 历史的普通 merge，语义解决共享源文件冲突，并从
合并后的源码重建 Dashboard HTML/assets、server bundle 与 CLI bundle；不得手工拼接生成物。
合并后的 exact head 必须重新通过目标 OpenSpec strict validation、架构/规则门禁、kernel/API/UI
定向测试、全量测试与构建、真实 HTTP/浏览器验证以及 GitHub CI，旧 head 的 PASS 不得替代新证据。

#### Scenario: 草稿不能成为可信通过证据

- **WHEN** 用户生成或复制包含 passed entry 的 Markdown
- **THEN** Tenon 不创建 trusted issuer、revision binding、verification result 或 gate receipt

#### Scenario: 旧 Dashboard 与 workflow 行为不变

- **WHEN** 用户不打开 composer 或运行现有 API/workflow
- **THEN** 既有 snapshot、state、document evidence、transition 和 report 行为保持兼容

#### Scenario: 缺失 root 失败关闭

- **WHEN** compose 请求缺失 root，或 root 为空白/非字符串
- **THEN** 返回 HTTP 400 与稳定 `verification_evidence_invalid` envelope
- **AND** 不调用 registered-root resolver、formatter 或任何持久化路径

#### Scenario: 冲突与生成物按源码真相解决

- **WHEN** feature branch 与最新 main 在共享 Dialog 和 Dashboard 生成 HTML 上产生冲突
- **THEN** 共享源文件采用已批准语义并集，生成物只由正式 build 刷新
- **AND** 不通过 rebase、force push、手改 bundle 或复用旧冻结结果绕过审计
