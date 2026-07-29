# Tenon Trace Timeline：本地现状与 Trellis / Comet 上游研究

## 1. 研究目标与结论

读取日期：**2026-07-29（Asia/Shanghai）**。

本报告回答三个问题：

1. Tenon `origin/main` 是否已经有可供用户诊断失败的 Trace 能力；
2. 当前开放 PR、已有 Change、BACKLOG / GOAL 与近期提交中是否存在重复建设；
3. Trellis 与 Comet 的最新一手变化能否为一个最小的前后端 Trace 纵向切片提供设计依据。

结论：

- Tenon 已经有完整的本地 tap 捕获、JSONL 存储、只读 HTTP 数据端和 Dashboard 入口，不能把本轮描述为“新建 Trace 采集”。
- 当前用户缺口是：Dashboard 只能读取原始 `unknown[]` 记录并渲染一行 `request_id + method/path + status`，没有安全收敛的元数据契约、失败汇总、耗时/模型/用量线索、筛选、重试或记录空态。
- 最小且不重复的纵向切片应是 **Trace Timeline**：保留旧原始接口兼容性，新增一个有上限、仅元数据、失败优先的只读时间线接口，并在现有 Advanced → Traffic 入口提供中英文加载、错误、空、重试、筛选和键盘交互。
- 不应在本轮增加新的代理协议、改变 trace 持久化 schema、展示 prompt/body/header、承担 Workflow 治理事实或实现跨会话全文搜索。

## 2. 固定来源

### 2.1 Tenon 基线

| 项 | 固定值 |
| --- | --- |
| 仓库 | `jefferysha/tenon` |
| 基线 | `origin/main` |
| SHA | `4c242b928b61285561f9cdbc63617db899a18a12` |
| URL | https://github.com/jefferysha/tenon/commit/4c242b928b61285561f9cdbc63617db899a18a12 |
| 读取日期 | 2026-07-29 |

### 2.2 mindfold-ai/Trellis

| 项 | 固定值 |
| --- | --- |
| 默认分支 | `main` |
| 默认分支 SHA | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` |
| 默认分支提交 | https://github.com/mindfold-ai/Trellis/commit/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c |
| 提交时间 | 2026-07-28T10:05:51Z |
| 最新 GitHub Release | **无**；`GET /releases/latest` 返回 HTTP 404 |
| 稳定版本回退 | 最新不含 prerelease 后缀的语义版本 tag `v0.6.10` |
| 稳定 tag SHA | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` |
| 稳定 tag URL | https://github.com/mindfold-ai/Trellis/tree/v0.6.10 |
| 读取日期 | 2026-07-29 |

说明：仓库还有更新的 prerelease tag `v0.7.0-beta.0`，但本次按“最新稳定版本”规则排除 prerelease，并明确采用语义稳定 tag 回退。

与本轮直接相关的一手变化：

| 变化 | 一手证据 | 可映射结论 |
| --- | --- | --- |
| Codex hook 输出被截断时恢复完整上下文，并在模糊 session 下保持保守行为 | PR #477，merge SHA `621435d143d352ac1db4ab077d682716fd6d5afd`：https://github.com/mindfold-ai/Trellis/pull/477 | 诊断视图不能把局部预览伪装成完整事实；Trace 响应必须显式报告截断和总数，缺失字段保持 unknown。 |
| Codex worker 明确 API 失败未上浮，最终退化为 supervisor timeout / killed | Issue #479：https://github.com/mindfold-ai/Trellis/issues/479 | 错误状态必须从 status / response 映射到可见 outcome；失败筛选和错误计数是时间线的核心，不是装饰指标。 |

### 2.3 rpamis/comet

| 项 | 固定值 |
| --- | --- |
| 默认分支 | `master` |
| 默认分支 SHA | `2945693e4061c369be0d400ed2999a66fa87c680` |
| 默认分支提交 | https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680 |
| 提交时间 | 2026-07-26T12:19:37Z |
| GitHub `releases/latest` | `0.4.0-beta.9`，tag SHA `84038b0d6b7c185b233f0f36b294ae74dd9121d0` |
| 最新 Release URL | https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9 |
| 严格稳定语义版本 | `0.3.9`，tag SHA `053f76d8ac6aaa499b1d3f8752cb5637fc4fb914` |
| 严格稳定 Release URL | https://github.com/rpamis/comet/releases/tag/0.3.9 |
| 读取日期 | 2026-07-29 |

说明：GitHub 将 `0.4.0-beta.9` 标为 `prerelease=false`，因此它是 API 返回的 latest Release；但版本号含 prerelease 标识。为避免把“GitHub latest”与“严格稳定语义版本”混为一谈，本报告同时固定 `0.3.9`，设计差异则优先读取更近的 `0.4.0-beta.9` 一手变化。

与本轮直接相关的一手变化：

| 变化 | 一手证据 | 可映射结论 |
| --- | --- | --- |
| 新增 canonical evidence formatter；输入有 1 MiB 上限，拒绝非普通文件与竞态替换 | PR #228，merge SHA `965e9e3e4fcf18bded66a52c5499b92d22949a6e`：https://github.com/rpamis/comet/pull/228 | Trace 时间线应由严格投影器生成稳定 DTO，响应有固定上限；不要让 UI 自己猜 raw body 形状。 |
| 失败、跳过、扫描上限与证据不完整应阻断“通过”，而非由报告自由声明 | Issue #240：https://github.com/rpamis/comet/issues/240 | 时间线必须区分 `success / error / unknown`，不得把无法解析或缺失状态默认为成功。 |
| Native completion loop 保留失败 acceptance item，并要求当前验证证据 | PR #243：https://github.com/rpamis/comet/pull/243 | Dashboard 应让失败事件可筛选并保留上下文，而不是只显示会话最终 badge。该 PR 尚开放，仅作为方向证据，不视为已发布事实。 |

## 3. Tenon 当前 Trace 调用链

```text
LLM client
  → reverse / forward / TLS MITM / WebSocket proxy
  → packages/tap/src/record.ts::buildRecord
  → packages/tap/src/trace-store.ts::appendRecord
  → records/<session>.jsonl + sessions/<session>.json
  → packages/server/src/traces.ts::listTraceSessions/readTraceRecords
  → GET /api/traces/sessions
  → GET /api/traces/records?session=<id>
  → packages/dashboard-app/src/api/auditClient.ts
  → packages/dashboard-app/src/api/auditDecoders.ts
  → packages/dashboard-app/src/advanced/TrafficPanel.tsx
```

### 3.1 已有能力

- `packages/tap/src/record.ts`
  - 记录 `timestamp`、`request_id`、`turn`、`duration_ms`、`transport`、请求、响应和可选 upstream。
  - 对 header、body 和 query 中已知凭证键做脱敏；SSE 记录也走 body 脱敏。
  - 明确把 tap 定位为本地诊断工具，不是 Workflow 治理真相源。
- `packages/tap/src/trace-store.ts`
  - `sessions/*.json` 保存会话摘要，`records/*.jsonl` append-only 保存原始记录。
  - session 可处于 `active / complete / empty / error`；损坏 JSONL 行会被忽略。
  - `readRecords` 当前同步读取并解析整个会话文件，没有记录数或响应字节上限。
- `packages/server/src/traces.ts` 与 `serverGetRoutes.ts`
  - 注入结构化 `TraceStoreReader`，server 不深导入 tap 内部实现。
  - 暴露 GET-only、`outbound: "local-only"` 的 sessions / records 接口。
  - records 响应类型为 `unknown[]`；未知 session 返回 `200 + count: 0`。
- `packages/dashboard-app`
  - 统一经 `src/api/` 获取数据，`auditDecoders.ts` 校验响应外壳。
  - `AdvancedPanel` 在 `capabilities.traffic=true` 时装配真实 `TrafficPanel`。
  - 组件已有 sessions loading、顶层 error、sessions empty、records loading 与 records error。
  - 会话按钮是原生 `button`，基础 Enter / Space 激活路径成立。
- 测试
  - `packages/server/src/traces.test.ts` 使用真实临时目录、真实 TraceStore 和真实 HTTP server。
  - `packages/dashboard-app/src/advanced/TrafficPanel.test.tsx` 覆盖会话列表、点选记录、local-only、记录加载和顶层失败。
  - tap 已有真实文件、socket、TLS / WS 与凭证脱敏测试。

### 3.2 用户可见缺口

| 缺口 | 当前事实 | 影响 |
| --- | --- | --- |
| 没有稳定 timeline DTO | server 返回 `unknown[]` 原始记录；客户端只检查每项是 object | UI 与 provider-specific raw body 耦合，无法可靠演进。 |
| 原始内容跨过 UI API 边界 | records 接口原样返回 request / response headers 与 body | 即使 local-only 且已脱敏，也扩大 prompt、业务内容和未知敏感字段暴露面。 |
| 读取与响应无上限 | `readFileSync(...).split('\n')` 后完整返回所有记录 | 长会话可能阻塞本机 server、放大前端内存与渲染成本。 |
| 失败不可聚合 | UI 只显示单行 status；没有 error count、outcome 或 errors-only | 用户必须逐行扫描，且 unknown 容易被误读。 |
| 诊断上下文不足 | 不显示 duration、transport、model、token/tool/stream 计数 | 很难区分上游错误、慢请求、代理传输和用量异常。 |
| 前端状态不闭环 | 顶层和记录错误都没有重试；记录数组为空时只出现空 `<ol>` | 断线恢复和“会话存在但无记录”不可操作。 |
| i18n 不完整 | 只有 `traffic_records_loading` 接入 i18n；local-only、错误、空态、计数等仍硬编码中文 | 英文模式不是完整用户路径。 |
| 键盘路径不完整 | 会话选择可用键盘，但没有清除选择、筛选或重试的明确键盘验收 | Advanced 诊断流难以仅靠键盘完成。 |

安全判断：现有脱敏保护了已知 secret 键，但原始 prompt / response 本身仍可能含私有业务信息；因此新用户面应默认 **metadata-only**，而不是继续扩展 raw record viewer。

## 4. BACKLOG、GOAL、近期提交与重复审计

### 4.1 BACKLOG / GOAL

- `BACKLOG.md` 当前队列明确为“空”，M8 tap 已作为历史能力收编。
- 历史项 `#34` 已完成 tap 核心与护栏，`#34d` 已完成 traffic server 数据端与 Dashboard 查看器，`#34b/#34c/#34-wire` 已完成协议、runtime 与启动接线。
- `GOAL.md` 的 A7 已勾选；B8 强调降级可见和敏感能力明示。
- `GOAL.md` 还明确：tap **不承担 usage / completion 等治理事实**，session ID 和完成事实来自 provider structured protocol，网络抓包仅是独立诊断工具。

因此本轮不能声称补齐 A7，也不能把推断出的 token / outcome 写回 canonical Workflow 状态；它只能新增一个只读、best-effort 的诊断投影。

### 4.2 近期提交

- 原始 traffic 查看器来自提交 `46c96f49afdf4ffdca7b6e0cd3495dd0a7bb39a5`（2026-07-07，`#29d/#34d`）。
- 后续主要是 Dashboard 视觉修复、产品更名、API 边界拆分和 tap 安全 / 超时修复；没有引入新的 Trace Timeline 契约。
- `origin/main` 当前基线没有未合并的 trace timeline 实现。

### 4.3 开放 PR

读取时共有 5 个开放 PR：

| PR | 主题 | Trace/Tap/Traffic/Timeline 文件 |
| --- | --- | --- |
| #8 | Host Target Plan Center | 无 |
| #9 | project prompt routing bypass | 无 |
| #10 | Dashboard UI/UX system overhaul | 无 |
| #11 | Loop path scope preview | 无 |
| #12 | project-scoped related session search | 无 |

查询 URL：https://github.com/jefferysha/tenon/pulls

重复结论：没有开放 PR 实现 trace timeline、metadata-only trace DTO 或 TrafficPanel 失败筛选。PR #10 可能造成全局 Dashboard 视觉合并冲突，但不是功能重复；应避免顺手修改全局 token / App shell。

### 4.4 已有 Change

除本轮 `trace-timeline` 外，当前工作树可见的其他活跃 Change 名称聚焦入口 skill、archive ledger、doctor 计数、首次安装、loop binding 与 PR merge audit；对其 Markdown 做 `trace|tap|timeline|traffic|observab` 检索未发现同类功能。归档 spec 中仅有 tap 作为分发能力或日志类别的引用。

## 5. 备选方案

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| A. 继续扩展 raw records UI | 改动最少，可展示任何 provider 字段 | 继续把 body / headers 暴露给浏览器；无稳定契约；难做安全上限 | 拒绝 |
| B. 改写持久化 schema，写入标准 span | 读取快，结构稳定 | 需要迁移与兼容读；会扩大本轮到 capture/store；旧记录无法自然补齐 | 本轮不做 |
| C. 新增 metadata-only timeline 投影，保留旧接口 | 可兼容、可测试、可限界；旧记录立即可用；前后端闭环最小 | 投影是 best-effort，未来可能需要 provider adapter | **推荐** |
| D. 引入 OpenTelemetry / 外部 observability 后端 | 生态能力丰富 | 引入依赖、外发与配置成本，违反本地优先和最小切片 | 拒绝 |

## 6. 推荐的最小纵向切片

### 6.1 后端契约

新增：

```text
GET /api/traces/timeline?session=<id>
```

响应建议：

- 固定 `outbound: "local-only"`；
- 固定 `content: "metadata-only"`；
- `session`、`total_count`、`returned_count`、`truncated`；
- `summary`：`error_count`、`unknown_count`、可安全汇总的 duration / token；
- `entries` 保序，最多返回最近 **200** 条；
- entry 只包含 allowlist 元数据：
  - `request_id`、`turn`、`timestamp`、`duration_ms`、`transport`；
  - `method`、**去掉 query 的 path**、`status_code`；
  - `outcome: success | error | unknown`；
  - 可验证时才给 `model`、`input_tokens`、`output_tokens`、`cached_input_tokens`、`tool_call_count`、`stream_event_count`。

投影规则：

- 数值必须是非负 safe integer；字符串必须有长度上限；
- 只读取明确 allowlist 路径，不能把任意 body key 复制到响应；
- HTTP `>=400` 或结构化 error 状态映射为 `error`；缺失 / 不可识别映射为 `unknown`，不能默认为 success；
- provider-specific usage 只做窄映射，找不到就省略；
- 旧 `/api/traces/records` 保持不变，避免破坏兼容调用方；
- 未知 session 应与已知但空会话区分，建议前者 `404`、后者 `200 + entries: []`；
- store / projector 抛错继续由 HTTP 边界映射为 `500`，不得吞成空结果。

包边界建议：时间线是 Trace/Tap 限界上下文的只读展示投影；server 仍只依赖结构化 reader port，不深导入 tap 内部文件。若不改变现有 workspace 构建顺序，纯 `unknown → DTO` 投影可放在 server 的 trace adapter 模块，并以测试锁定它不包含原始 body / headers / upstream。

### 6.2 Dashboard

沿用 Advanced → Traffic 入口，不新建一级导航：

- 会话列表继续按最近更新时间排列；
- 选择会话后展示 summary chips 与时间线；
- 提供 `全部 / 失败 / 成功` 筛选，分组名称对用户可见；
- 每条至少显示 turn / 时间、endpoint、status/outcome、duration、transport；model / token / tool 信息仅在存在时显示；
- sessions 与 timeline 各自拥有 loading、empty、error、retry；
- 已知空会话显示专用空态，不渲染空列表；
- 全部新增文案接入中英文 i18n；
- 使用原生 button / radio 或现有可访问组件；验收 Tab、Enter / Space、筛选和 Escape 清除选择。

### 6.3 测试边界

- server 纯投影测试：Anthropic / OpenAI 风格、HTTP error、结构化 error、缺字段、异常大数、超长字符串、query 去除、原始 body/header 不出现在 JSON。
- 真实 HTTP + TraceStore 测试：成功、已知空会话、未知 session、200 条截断、store error。
- client decoder 测试：完整响应、错误枚举、非法计数、非 metadata-only 响应拒绝。
- TrafficPanel 组件测试：成功、sessions 空、timeline 空、两层失败与 retry、筛选、中文 / 英文、键盘路径。
- 浏览器验收：确认真实 Tenon Dashboard 身份；成功 / 失败 / 空 / loading、窄视口、暗色、仅键盘路径。

## 7. 明确非目标

- 不新增或修改 reverse / forward / TLS / WS 捕获协议。
- 不改 `sessions/*.json` 或 `records/*.jsonl` 持久化格式，不做迁移。
- 不删除、不替换旧 raw records API。
- 不展示或搜索 prompt、response body、headers、完整 query、upstream URL。
- 不增加 trace 删除、导出、上传、分享或外部 observability 接入。
- 不把推断的 outcome、token 或 model 写回 WorkflowRun、ledger、verification report 或 canonical state。
- 不实现跨会话全文搜索、实时 SSE tail、成本计价或 provider 完整解析框架。
- 不修改全局 Dashboard 设计 token / App shell，降低与 PR #10 的合并风险。

## 8. 开放问题与保守默认

1. **上限应是记录数还是字节数？**
   默认先用最近 200 条，同时给所有字符串字段设独立长度上限；真正的按字节 tail 需要 TraceStore 新读法，可作为后续性能增强。

2. **model / usage / tools 是否应作为必填？**
   不应。不同 provider 和 transport 形状不稳定，默认 best-effort 可选字段；缺失就是 unknown，不补零。

3. **失败规则是否会把 3xx 当错误？**
   默认仅 `>=400` 为 error，`200–399` 为 success；没有 status 或只有不可识别状态时为 unknown。

4. **是否保留 query 中的非敏感参数？**
   默认整个 query 都从 timeline path 去除。原始存储仍维持现有逐键脱敏兼容性。

5. **是否需要实时更新？**
   本轮默认按用户选择 / 重试重新拉取，不引入 polling 或 SSE。实时 tail 是独立功能点。

6. **是否应把 projector 放到 tap 包？**
   领域归属上属于 tap；但现有 server 明确避免对 tap 的构建顺序耦合。若没有调整 workspace DAG 的充分理由，本轮采用 server 入站 adapter 内的纯投影，并保持 reader port；后续若出现 CLI 等第二个消费者，再上移为 tap 公共契约。
