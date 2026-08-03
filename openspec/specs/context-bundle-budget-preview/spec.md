# context-bundle-budget-preview Specification

## Purpose

让 Tenon 用户在执行 handoff 前，通过 Dashboard 安全、只读地预检 ledger-bound Context Bundle
的输入组成、物化模式与预算占用，并由 CLI 与 server 共享同一确定性编译规则。
## Requirements
### Requirement: CLI 与预览 SHALL 复用同一 ledger-bound 编译服务

系统 SHALL 在 kernel 提供单一共享应用服务，按目标 canonical phase 的有效 document policy
选择输入，读取 document ledger，校验源文件存在且 SHA-256 未漂移，并以确定性顺序生成
`context-bundle/v1`。现有 `tenon handoff --bundle` 与 Dashboard 预览 SHALL 调用该服务；
server 或客户端不得复制 policy、reason、materialization mode 或预算算法。

共享服务 SHALL 同时计算每项源文件 UTF-8 `sourceBytes` 与实际参与预算的
`materializedBytes`，并为每个 policy-owned `reason` 提供 UI-neutral、闭合集合的稳定 domain
`reasonCode`。现有 CLI 的中文 `reason`、默认预算、输出 schema、aggregate digest 和非 bundle
handoff 行为 SHALL 保持兼容；`reasonCode` 仅进入 preview metadata，不得扩展
`context-bundle/v1`，也不得使用 Dashboard i18n key 作为 domain token。

共享服务 SHALL 通过显式 ledger repository 与可信 source-reader port 编排 I/O。Dashboard
server SHALL 使用绑定 registered root 的目录 fd 与 `O_NOFOLLOW` 文件 fd 读取 ledger 和源文件，
并在读取正文前执行固定资源上限：最多 64 条待读 record、单文件最多 262144 source bytes、
合计最多 1048576 source bytes。资源上限独立于用户输入的 materialized budget；低预算不得
触发无界读取、哈希或压缩。

server 只有在运行平台能把子目录 lookup 锚定到已打开目录 fd（例如 Linux `/proc/self/fd`）
时才 SHALL 执行预览。若 Node runtime 只能退回词法 pathname（例如当前 Darwin），端点 SHALL
在读取 canonical state、ledger 或源正文前 fail closed，并返回稳定
`CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`；不得以读前/读后 pathname 检查冒充 fd-relative
安全。该 capability failure 不影响 CLI handoff。

#### Scenario: CLI 与预览使用同一真实输入

- **GIVEN** 同一 Change、source phase、target phase、ledger 和预算
- **WHEN** CLI 编译 bundle 且 server 生成预览
- **THEN** 两者的输入顺序、kind、path、digest、reason、mode、used bytes 和预算结果一致
- **AND** preview 为相同 reason 额外返回共享服务生成的稳定 `reasonCode`
- **AND** CLI 的 `context-bundle/v1` JSON 兼容既有消费者。

#### Scenario: 目标阶段没有 required reads

- **GIVEN** 目标 canonical phase 的 document policy 没有 required reads
- **WHEN** 共享服务生成预览
- **THEN** 返回成功的空输入集合
- **AND** `usedBytes` 为 0
- **AND** 不把空态解释为文档缺失。

#### Scenario: 可信 reader 拒绝换位与资源滥用

- **WHEN** registered root、Change 目录、ledger 或任一源文件在读取期间被 symlink/换位替换
- **THEN** preview fail closed，且不把替换目标内容或绝对路径返回浏览器
- **WHEN** record 数、单文件 source bytes 或合计 source bytes 超过固定上限
- **THEN** 在超限文件正文读取、哈希和压缩前返回稳定资源错误
- **AND** `budgetBytes=1` 也不得绕过资源边界。

#### Scenario: 平台没有 fd-relative traversal

- **GIVEN** registered root anchor 没有可遍历的目录 fd path
- **WHEN** Dashboard 请求 Context Bundle 预览
- **THEN** server 在读取 Change state、ledger 和文档前返回 501 与
  `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`
- **AND** 响应不含 root 绝对路径、文档 path 或正文。

### Requirement: 预览 API SHALL 只读且受 registered root 锚保护

server SHALL 提供只读 `GET /api/context-bundle/preview`，要求显式 `root`、安全 Change 名、
canonical `target` 和正安全整数 `budgetBytes`。端点 SHALL 仅接受机器项目注册表中的 root，
在读取 canonical state、ledger 和文档前后验证同一个 inode/realpath anchor，并拒绝 symlink
替换或路径逃逸。

成功响应 SHALL 使用 `context-bundle-preview/v1`，回显 `sideEffects: "none"`、change、
from、to、tier、预算、document count、输入摘要和有效 aggregate digest。输入摘要 SHALL 只含
kind、项目相对 path、digest、reason、reasonCode、mode、sourceBytes 和 materializedBytes；不得返回
materialized `content`。

#### Scenario: 注册项目成功预览

- **GIVEN** root 已注册且 Change、ledger、必读文档和 SHA 均有效
- **WHEN** 客户端请求预算足够的目标阶段预览
- **THEN** server 返回 200 和 `ok: true`
- **AND** 响应含确定性输入摘要和预算占用
- **AND** 响应不含任何文档正文。

#### Scenario: root 在读取期间被替换

- **WHEN** registered root 的词法路径、realpath 或 inode 与启动时锚不一致
- **THEN** server 返回 403/404 的既有 root guard 错误
- **AND** 不读取替换后的外部目录。

#### Scenario: 请求参数非法

- **WHEN** Change、target 或 budgetBytes 不满足契约
- **THEN** server 返回 400 和 `CONTEXT_BUNDLE_INVALID_REQUEST`
- **AND** 不创建或修改任何项目文件。

### Requirement: 预览失败 SHALL 可机器判定且保持 fail-closed

共享服务 SHALL 使用稳定错误码区分 `CONTEXT_BUNDLE_INVALID_REQUEST`、
`CONTEXT_BUNDLE_STATE_CORRUPT`、`CONTEXT_BUNDLE_LEDGER_MISSING`、`CONTEXT_BUNDLE_DOCUMENT_MISSING`、
`CONTEXT_BUNDLE_DOCUMENT_STALE`、`CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED` 与
`CONTEXT_BUNDLE_BUDGET_EXCEEDED`。server 另 SHALL 以
`CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE` 表示平台 capability failure。server SHALL
按 400、409、409、409、409、413、422、501 映射，
不得解析本地化 message 决定协议。

预算超限 SHALL 返回 `422`、`ok: false`、required/available bytes 与不含正文的 safe preview
metadata，且 SHALL NOT 返回有效 aggregate digest 或可消费 bundle。其他完整性错误 SHALL
返回 code、message 和可执行恢复提示，不得降级为成功空态或静默遗漏输入。

错误响应 SHALL 只暴露稳定 code 与结构化安全上下文（相对 path、kind、metric、limit、actual 或
required/available）；底层 `ENOENT`、realpath、registered root 绝对路径和文档正文不得进入
browser response。Dashboard SHALL 按稳定 code 本地化 message/repair action，不得直接显示
kernel/server 的中文文案。

#### Scenario: canonical state 损坏

- **WHEN** Change 的 current、immutable、previous 或 transition canonical state JSON 损坏、
  digest/连续性校验失败或包含非法 UTF-8
- **THEN** 返回 409 和 `CONTEXT_BUNDLE_STATE_CORRUPT`
- **AND** 响应提供不含绝对路径或底层异常文本的安全恢复动作
- **AND** 不读取 ledger、源文档或返回部分成功。

#### Scenario: 必读文档未登记或文件缺失

- **WHEN** document policy 要求的 kind 没有 ledger record，或 record 的源文件不存在
- **THEN** 返回 409 和 `CONTEXT_BUNDLE_DOCUMENT_MISSING`
- **AND** 响应指出 kind/path 与重新登记动作
- **AND** 不返回部分成功。

#### Scenario: 文档已经漂移

- **WHEN** 源文件 SHA-256 与 ledger record 不同
- **THEN** 返回 409 和 `CONTEXT_BUNDLE_DOCUMENT_STALE`
- **AND** 响应要求重新 record/read
- **AND** 不接受旧 digest。

#### Scenario: 资源上限

- **WHEN** required record 数、单文件 source bytes 或累计 source bytes 超过固定上限
- **THEN** 返回 413 和 `CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED`
- **AND** 响应给出结构化 `metric`、`limit`、`actual` 与可选相对 path
- **AND** 不返回 safe preview、aggregate digest、正文或绝对路径。

#### Scenario: 预算不足

- **WHEN** 已验证输入的物化字节超过请求预算
- **THEN** 返回 422 和 `CONTEXT_BUNDLE_BUDGET_EXCEEDED`
- **AND** safe preview 显示 required/available 与逐项 bytes
- **AND** 响应没有 aggregate digest
- **AND** ledger、state、默认预算均保持不变。

### Requirement: Dashboard SHALL 提供可操作的完整预览状态

Dashboard SHALL 在选中 Change 的进度抽屉内提供 Context Bundle 预算预览。组件 SHALL 显示可见
目标阶段选择、正整数预算输入和提交动作；默认预选当前阶段之后的下一个 canonical phase，默认
预算为现有 `120000`，但每次 API 请求仍 SHALL 显式携带 target 与 budgetBytes。

组件 SHALL 区分 idle/loading、success、policy-empty、budget-error、其他 error；错误后 SHALL
提供 retry。target、budget 或 Change 改变时，旧请求不得覆盖新状态。表单 SHALL 支持键盘
Tab 导航与 Enter 提交，控件 SHALL 具备可见 label、可访问名称和焦点样式。

success 与 budget-error SHALL 在输入清单之前呈现独立容量摘要。摘要 SHALL 同时提供精确
used/max bytes、本地化使用比例、document count，以及 success 的 remaining 或 budget-error 的
overage。线性容量条 SHALL 使用 progressbar 语义，视觉宽度 SHALL 钳制在 0–100%，但文本 SHALL
保留真实超限比例和字节缺口；不得因视觉钳制把 budget-error 表示为成功。

输入清单 SHALL 保持 server 返回的确定性顺序，并以紧凑文档行显示 path、kind、mode、
本地化 reason、source bytes 和 materialized bytes。客户端 SHALL NOT 按体积重排、推导新的
物化规则或以颜色作为唯一状态线索。

loading SHALL 使用静态、有界的状态占位并保留 `role="status"`/`aria-busy`，不得使用 pulse、
循环或其他持续动画；policy-empty、budget-error 和其他 error SHALL 保持可读文字、对应语义 role
与原地恢复路径。容量过渡 SHALL 在 `prefers-reduced-motion: reduce` 下直接呈现终态。

当前 workflow step 可以是 custom step；这不影响用户选择 canonical target。custom step 下组件
SHALL 可见，默认 target 为 `open`，请求的 `from` 保留当前安全 step id。只有 target 必须是
canonical phase。

默认七阶段 workflow 的阶段名 SHALL 始终通过 `phases.*` 使用当前 Dashboard locale 显示，包括
当前阶段序号、前进动作和回退动作；custom workflow 的作者标签 SHALL 原样保留，不得用语言启发式
猜测或改写。

#### Scenario: 成功预览

- **WHEN** 用户打开抽屉且默认目标的预览成功
- **THEN** 页面在输入清单之前显示 used/max bytes、使用比例、remaining、document count 和有语义的容量条
- **AND** 每项按 server 顺序显示 mode/reason/source/materialized bytes
- **AND** loading 状态被成功内容替换。

#### Scenario: 真实空态

- **WHEN** 用户选择没有 required reads 的 `open`
- **THEN** 页面显示本地化空态
- **AND** 不显示错误、容量摘要或伪造输入。

#### Scenario: 预算错误与重试

- **WHEN** 用户以不足预算提交
- **THEN** 页面显示本地化预算警告、required/available、真实超限比例、overage 和安全输入摘要
- **AND** 容量条视觉宽度不超过容器且保持 error 语义
- **AND** 用户调整预算后可以 retry/submit 得到成功状态。

#### Scenario: 完整性错误恢复

- **WHEN** API 返回 missing、stale、platform capability 或其他稳定错误
- **THEN** 页面显示本地化错误说明、稳定 code、恢复提示与 retry
- **AND** 修复外部条件后无需刷新整个 Dashboard 即可重试。

#### Scenario: 加载与 reduced motion

- **WHEN** 预览请求仍在进行
- **THEN** 页面显示静态、有界且具备 status/busy 语义的 loading 状态，提交按钮禁用
- **AND** loading 状态不执行 pulse、循环或其他持续动画
- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** loading 与容量反馈直接呈现可操作终态而不执行过渡动画。

#### Scenario: 键盘提交和竞态

- **WHEN** 键盘用户聚焦预算输入并按 Enter
- **THEN** 触发与点击按钮相同的预览请求
- **AND** Tab 顺序保持 target、budget、submit
- **AND** 快速切换 target 时最后一次请求结果保持可见，旧响应被忽略。

#### Scenario: 默认阶段标签随语言切换

- **GIVEN** Dashboard 使用默认七阶段 workflow
- **WHEN** 用户切换到英文
- **THEN** 当前阶段、前进动作和回退动作显示 `Open`、`Explore`、`Spec`、`Build`、`Verify`、
  `Ship`、`Archive` 的对应英文标签
- **AND** 容量、remaining/overage、document count 和输入摘要同步切换为英文
- **AND** 不显示默认 workflow 中固化的中文作者标签。

#### Scenario: custom workflow 保留作者标签

- **GIVEN** Dashboard 使用 custom workflow
- **WHEN** 当前 step 或 transition 带有作者提供的标签
- **THEN** 阶段与动作显示作者标签
- **AND** 不按字符语言或 default phase id 猜测改写该标签。

### Requirement: 预览 SHALL 支持中英文且不新增持久化

所有新增读者可见文案 SHALL 在 zh/en 字典中键结构对称，并通过 i18n 完整性测试。语言切换 SHALL
改变 label、loading、empty、budget、error、retry 和输入摘要文案。Dashboard SHALL 以共享服务
返回的稳定 domain `reasonCode` 通过显式、闭合的 domain-token → i18n-key 映射本地化输入原因，
不得显示或解析兼容用中文 `reason`，也不得按 kind 推导或复制一份 reason 规则。稳定
schema/code/reasonCode/token 不得本地化。

预览预算和 target SHALL 仅存在于当前抽屉组件生命周期；关闭或切换 Change 后 SHALL 重新根据
当前状态选择默认值。该能力 SHALL NOT 修改 canonical state、document ledger、`.pipeline.yaml`、
handoff 默认预算或任何项目配置。

#### Scenario: 语言切换

- **WHEN** 用户从中文切换到英文
- **THEN** 所有预览文案切换为英文
- **AND** API code、digest、path、reasonCode 和 mode token 保持不变。

#### Scenario: 关闭抽屉

- **WHEN** 用户关闭预览所在抽屉
- **THEN** 在途请求被取消或其结果被忽略
- **AND** 不留下项目文件、状态字段或配置变更。

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
