# claude-tap 对 Tenon Trace Timeline 的启示

> 研究对象：[`liaohch3/claude-tap`](https://github.com/liaohch3/claude-tap)
> 读取日期：2026-07-29（Asia/Shanghai）
> 决策问题：Tenon 应如何把现有本地 trace 变成可诊断的时间线，同时不扩大敏感数据暴露面？

## 固定上游

| 固定项 | 值 | 一手来源 |
| --- | --- | --- |
| 默认分支 | `main` | [仓库](https://github.com/liaohch3/claude-tap) |
| 默认分支 SHA | `2db092e668fc5ee240a1a77151c5fe60ada9f4d5`，提交时间 `2026-07-28T13:03:38Z` | [commit](https://github.com/liaohch3/claude-tap/commit/2db092e668fc5ee240a1a77151c5fe60ada9f4d5) |
| 最新稳定 release | `v0.1.140`，发布时间 `2026-07-27T05:03:32Z` | [release](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.140) |
| release tag SHA | `77b674f20e6e5be6b931ce8c161a5bf5f9d47e95` | [commit](https://github.com/liaohch3/claude-tap/commit/77b674f20e6e5be6b931ce8c161a5bf5f9d47e95) |

默认分支 SHA 晚于最新 release：本研究将 `v0.1.140` 作为稳定版本锚点，将 `2db092e...` 上尚未发布的行为明确视为默认分支现状，不把两者混为同一稳定契约。

## 结论先行

建议 Tenon 实现“后端元数据投影 + 有界时间线”，而不是把原始 trace body 交给 Dashboard 再由前端裁剪。

- 新时间线只返回严格白名单字段，例如时间、turn、transport、HTTP method、去除 query 的 path、状态、耗时、模型、实际 usage、工具调用数和 stream 事件数。
- prompt、消息、工具参数/结果、headers、原始 request/response body、upstream URL 一律不进入新契约。
- 解析不到的 provider 字段应返回 `null` / `unknown`，不能伪装成 `0`；流结束不完整、存储丢记录或只捕获到部分上下文时，界面必须显式标记“不完整”。
- 时间线响应应有固定条数上限和确定顺序；后端负责聚合，Dashboard 只消费最小契约并提供加载、空、错误、重试、筛选和键盘路径。
- 保留现有原始 trace API 以维持兼容可以作为第一阶段策略，但新 Dashboard 不应依赖它。

这能吸收 claude-tap 的可观测性经验，同时避免照搬其“查看完整 prompt 与 body”的产品边界。

## 五个重点 PR 的可验证事实

### PR #398：压缩请求体与在线可见性

来源：[`fix: capture Pi zstd SSE requests`](https://github.com/liaohch3/claude-tap/pull/398)，已合并；merge SHA 为 [`2db092e...`](https://github.com/liaohch3/claude-tap/commit/2db092e668fc5ee240a1a77151c5fe60ada9f4d5)。

**事实**

- PR 的起因不是 UI 缺一个列表，而是 Pi 的长生命周期 WebSocket 让已完成 turn 直到 socket 关闭才出现；切换 SSE 后又暴露 Node 代理继承和 zstd request body 解析缺口。
- 当前默认分支的 [`forward_proxy.py`](https://github.com/liaohch3/claude-tap/blob/2db092e668fc5ee240a1a77151c5fe60ada9f4d5/claude_tap/forward_proxy.py) 已在“仅用于 trace 解析”的副本上解压 `gzip`、`deflate`、`zstd`，原压缩 bytes 继续发往 upstream。
- [`test_forward_proxy.py`](https://github.com/liaohch3/claude-tap/blob/ef5510dd5e33adc739d01bdad2b3d076acb695a9/tests/test_forward_proxy.py) 覆盖三种编码、未知/损坏编码降级，以及 capture-only 路径不会访问 upstream。
- PR 描述报告全量测试 `1007 passed, 26 skipped`，并给出真实 Pi SSE trace；该 PR 的 lint、coverage、三版 Python 测试、Windows launch、截图质量等 GitHub checks 均通过。[CI run](https://github.com/liaohch3/claude-tap/actions/runs/30338247243)

**对 Tenon 的含义（推断）**

- “页面上没有 trace”可能是 transport 生命周期、解码或持久化时机问题，不能只靠前端轮询修饰。
- 时间线契约需要 transport 和完整性字段；否则“当前没有记录”与“记录尚未 flush / 无法解码”不可区分。
- 本轮 Tenon 切片不应顺手扩张 TLS、压缩或代理捕获能力；应基于 Tenon 已落盘记录做最小投影，并把捕获缺口如实显示为未知。

### PR #397：被截断流中的工具调用参数

来源：[`fix(sse): retain streamed Responses tool payloads`](https://github.com/liaohch3/claude-tap/pull/397)，当前为 open，head SHA `291bdac2f97850b78deecbdc1f5011f317997c5e`，尚未进入默认分支稳定契约。

**事实**

- OpenAI Responses 流在缺少 `response.output_item.done` 时，文本 delta 已能保留，但 `response.function_call_arguments.delta` 与 `response.custom_tool_call_input.delta` 会丢失。
- PR 在 [`sse.py`](https://github.com/liaohch3/claude-tap/blob/291bdac2f97850b78deecbdc1f5011f317997c5e/claude_tap/sse.py) 中按 `output_index`、item type 和目标字段累加 delta；错误 index、非对象 item 和空 delta 会被忽略。
- [`test_responses_support.py`](https://github.com/liaohch3/claude-tap/blob/291bdac2f97850b78deecbdc1f5011f317997c5e/tests/test_responses_support.py) 有缺失 `.done` 的 function/custom tool 回归，以及 malformed/out-of-range 场景。
- PR 报告聚焦测试 `24 passed`；完整本地 gate 曾因无关 Chromium 测试未退出而超时，但后续 GitHub CI 的 Python 3.11/3.12/3.13、coverage、lint、policy、截图和 Windows launch checks 均通过。[CI run](https://github.com/liaohch3/claude-tap/actions/runs/29984999178)

**对 Tenon 的含义（推断）**

- 工具调用数只能从受支持、已识别的完整事件形态统计；不能把“解析不到”当作“没有工具调用”。
- Timeline 第一版应只展示计数，不展示工具输入；并为计数提供 `known/unknown` 语义，避免截断流造成虚假的零。
- 该 PR 尚未合并，因此只能作为风险证据和测试模式，不能表述为 claude-tap 已发布能力。

### PR #376：上下文完整性优先于传输形态

来源：[`fix(codex): capture complete context over HTTP`](https://github.com/liaohch3/claude-tap/pull/376)，已合并；merge SHA `9e2b99f191b13bdab15f78dd296b537af31c6955`。

**事实**

- Codex 的长连接 Responses WebSocket 可以通过 `previous_response_id` 延续，后续 tool-result frame 可能没有 user message；只看单帧会误判上下文缺失。
- PR 通过进程级临时 provider 配置把 reverse-proxy 会话设为 `supports_websockets=false`，让每个模型调用产生自包含的 HTTP/SSE request；它明确不修改 `~/.codex/config.toml`。
- 测试覆盖内置 provider、profile、profile file、自定义/Unicode provider、冲突 override 和目标优先级；PR 报告全量 `970 passed, 25 skipped`，GitHub checks 全通过。[CI run](https://github.com/liaohch3/claude-tap/actions/runs/29143496795)

**对 Tenon 的含义（推断）**

- 时间线的“一行”只能代表一个捕获记录，不能暗示它必然包含完整会话上下文。
- 如果 Tenon 暂无可靠 parent/continuation 关系，应避免推导因果链，只按 session 内 timestamp + turn 做确定排序，并显示 transport。
- 为了时间线完整而强制改变 agent transport 属于更高风险产品决策，不应纳入本轮展示切片。

### PR #351：捕获面应有允许列表

来源：[`Capture Codex App traffic via forward proxy`](https://github.com/liaohch3/claude-tap/pull/351)，已合并；merge SHA `7b979fc1798935a12882bb385ec16f1697df1cdf`。

**事实**

- PR 把 Codex App 从本地 transcript/CDP side channel 切换到 forward proxy，持久化最终模型路径的 `POST` / `WEBSOCKET`，同时转发但不记录 analytics、GraphQL 和 app-server 噪声。
- 客户端配置将记录范围限制为 `/backend-api/codex/responses`，并限制 method；测试覆盖 HTTP 模型请求、产品噪声、WebSocket、长连接上逐 response flush 和 upstream connect failure。
- PR 报告聚焦 `23 passed`、Python 增量 coverage `88.05%`、全量 `979 passed, 25 skipped`；GitHub checks 全通过。[CI run](https://github.com/liaohch3/claude-tap/actions/runs/29843641993)
- PR 明确说明真实 Codex App GUI 捕获没有在当时的活跃 App 会话中运行，因为必须先退出再以代理环境重启；它没有把 fixture/screenshot 冒充完整真实 GUI 验收。

**对 Tenon 的含义（推断）**

- 最小暴露应在后端边界执行：先限制“哪些字段可进入时间线”，再考虑前端如何呈现。
- 真实验收中若 transport 或客户端前置条件不满足，必须记录限制，不能以模拟记录替代实际目标页面和真实会话证据。

### PR #388：工具 schema 占用排行

来源：[`feat(viewer): rank tool schema footprint`](https://github.com/liaohch3/claude-tap/pull/388)，closed 且未合并，head SHA `9fae65a6abe47ba442c02a0cc24628c16ff28ebb`。

**事实**

- 该 PR 按工具定义序列化后的 UTF-8 bytes 排序，再按 `mcp__...` 名称约定聚合 MCP server。
- [`renderers.js`](https://github.com/liaohch3/claude-tap/blob/9fae65a6abe47ba442c02a0cc24628c16ff28ebb/claude_tap/viewer_assets/renderers.js) 优先用 `/count_tokens` 的 exact input tokens，次选已捕获 usage 对整个 request bytes 做比率校准，否则采用 `0.25 token/byte` 启发式；因此展示的是估算，不是每个 schema 的真实 tokenizer 计数。
- 测试覆盖 Unicode UTF-8 大小、MCP 分组、provider cache token 口径和估算校准；PR 报告 `1007 passed`，GitHub checks 全通过，但它仍被关闭且未合并。[CI run](https://github.com/liaohch3/claude-tap/actions/runs/29329042372)

**对 Tenon 的含义（推断）**

- 可借鉴“先给概览、再展开记录”和清晰标注估算/实测的方法。
- Timeline 第一版不应复制 schema 序列化和 token 启发式；只展示 provider 实际返回的 usage。没有 usage 时显示未知，而非估算值或零。
- PR 未合并进一步说明：测试绿色不等于产品决策已被上游接受。

## 隐私边界

### 已验证的上游边界

- README 将 claude-tap 定义为本地代理与 trace viewer，目标就是查看 system prompt、conversation history、tool schema、tool input/result 和真实 API body；[指南](https://github.com/liaohch3/claude-tap/blob/2db092e668fc5ee240a1a77151c5fe60ada9f4d5/docs/guides/agent-trace-viewer.md) 强调本机保存而非上传。
- [`proxy.py`](https://github.com/liaohch3/claude-tap/blob/2db092e668fc5ee240a1a77151c5fe60ada9f4d5/claude_tap/proxy.py) 会遮盖常见鉴权 header，但 `_build_record` 仍保存 request/response body，path 也包含 query string。
- [`live.py`](https://github.com/liaohch3/claude-tap/blob/2db092e668fc5ee240a1a77151c5fe60ada9f4d5/claude_tap/live.py) 默认绑定 `127.0.0.1`；停止 Dashboard 的写操作有 localhost Host/Origin 与 token 检查。读取 trace 的 GET API 和 SSE 仍会返回完整记录，所以“loopback 默认”不是字段级最小化。
- 原始 SSE/WebSocket event arrays 默认不存，需显式 `--tap-store-stream-events`；这减少默认体积和暴露，但 reconstructed request/response body 仍然可能包含敏感 prompt、代码和工具数据。

### Tenon 应采用的边界（建议）

1. **在 server/tap 包边界投影**：Dashboard 不接收原始 body 后再过滤。
2. **path 去 query**：只返回 pathname，避免 query token、资源 ID 或用户数据意外进入 UI。
3. **白名单解析**：model 和 usage 仅从已知 JSON shape 读取；字符串长度、数值范围和枚举均设上限。
4. **不返回 upstream URL、headers、prompt 和工具参数**：即使已有存储已做 header redaction，也不把它当作时间线 API 的授权依据。
5. **响应自描述**：例如声明 `content: "metadata-only"`、`outbound: "local-only"`，并用测试锁定“不含敏感键”。

## 完整性风险模型

| 风险层 | claude-tap 证据 | Tenon 时间线应如何表达 |
| --- | --- | --- |
| 捕获范围不完整 | #351 只记录特定 method/path，其他流量转发但不存 | 只称“已捕获记录”，不称“全部 agent 活动” |
| transport 生命周期未 flush | #398 的长生命周期 WebSocket 延迟可见 | 显示 transport；空态不宣称“没有调用” |
| wire body 无法解析 | #398 的 gzip/deflate/zstd 与损坏编码降级 | 解析失败显示未知，不能把字段置零 |
| stream 被截断 | #397 在缺少 `.done` 时 delta 丢失 | tool/usage/结果统计允许 unknown 或 incomplete |
| 上下文依赖前序响应 | #376 的 `previous_response_id` | 不推导完整因果链；只给确定顺序 |
| 本地存储失败 | 当前 [`trace.py`](https://github.com/liaohch3/claude-tap/blob/2db092e668fc5ee240a1a77151c5fe60ada9f4d5/claude_tap/trace.py) 选择不中断代理，并累计 `storage_error_count` / `dropped_trace_records` | 若 Tenon 无同等信号，不得声称时间线完整；有信号则显示丢失告警 |
| provider usage 口径不同 | #388 区分 cache 是否已包含在 input tokens | 只输出明确归一化字段并测试 provider 口径；缺失即 unknown |

## 方案比较

| 方案 | 优点 | 缺点 / 风险 | 结论 |
| --- | --- | --- | --- |
| A. 后端生成有界 metadata-only timeline | 最小暴露；契约可测试；前端简单；可统一 provider 差异 | 需要新增共享类型、server 路由与投影测试 | **推荐** |
| B. Dashboard 拉取原始 records 并在浏览器聚合 | 实现快；复用现有读取 API | 原始 prompt/body 已到浏览器；前端要承担 provider 解析；契约不可控 | 不推荐 |
| C. 重写 capture/transport 以获得“完美 trace” | 理论上可改善完整性 | 触碰 TLS、代理、客户端启动和上游 wire；范围与安全风险远超时间线切片 | 本轮明确排除 |

## 推荐的最小契约

以下是设计方向，不是既成事实：

```text
TraceTimelineResponse
  session: { id, status, startedAt, updatedAt }
  summary:
    { totalRecords, returnedRecords, truncated, errors, durationMs,
      inputTokens?, outputTokens?, cacheReadTokens? }
  records[]:
    { requestId, turn, timestamp, durationMs, transport, method, path,
      statusCode?, outcome, model?, inputTokens?, outputTokens?,
      cacheReadTokens?, toolCallCount?, streamEventCount?, completeness }
  disclosure:
    { content: "metadata-only", outbound: "local-only" }
```

契约约束：

- 默认最多返回一个固定上限（例如 200）并在 response 明示 `truncated`；排序规则必须稳定。
- `outcome` 只能从明确的 HTTP status / error 字段推导；无信息为 `unknown`。
- 所有 token/count 字段都要区分 absent 与 zero。
- `path` 必须去掉 `?query`。
- 任何未知扩展键都不能从原 record 透传。
- 前端成功态至少支持 all/success/error 筛选；错误态可重试；空态区分“没有 session”和“session 暂无已捕获记录”；session 行和重试/筛选均可键盘操作；中英文文案同步。

## 不能照搬的部分

- 不照搬 Python/aiohttp/SQLite 实现；Tenon 已有 TypeScript `packages/tap`、server 和 Dashboard 包边界。
- 不照搬 TLS MITM、CA 信任、客户端重启、强制 HTTP/SSE 等 capture 机制；这些属于独立安全与兼容项目。
- 不照搬“完整 body 的本地 viewer”作为新 Dashboard 默认，因为 Tenon 的时间线目标是诊断概览，而不是 prompt 内容浏览器。
- 不照搬 #388 的 `0.25 token/byte` 或 request 级比例校准为“真实 token”；该 PR 未合并且算法本质是估算。
- 不依赖 provider 私有事件名作为公共 API；provider 差异应封装在后端投影，前端只消费稳定字段。
- 不把 upstream PR 描述中的真实运行截图当作 Tenon 浏览器验收；Tenon 仍需在自己的 Dashboard、真实 API 和目标端口上验收。

## 推荐测试证据

1. 投影单元测试：Anthropic/OpenAI 常见 usage、未知 shape、负数/超大数、非 JSON body、缺失字段、query 清除。
2. 隐私契约测试：序列化响应中不存在 `headers`、`body`、`prompt`、`messages`、`tools`、`input`、`output`、`upstream` 等敏感键。
3. server 测试：session 参数缺失、未知 session、空 session、有记录、条数上限、读取失败。
4. Dashboard client/decoder 测试：非法 response fail closed，unknown 与 zero 不混淆。
5. 组件测试：loading / empty / error / retry / success / filter；中文和英文。
6. 真实浏览器：确认目标是 Tenon Dashboard；验证 session 选择、筛选、错误重试、空态、键盘 Tab/Enter/Escape，并保存不含 prompt/body 的截图证据。

## 开放问题

1. Tenon 现有 trace store 是否有可公开的“记录丢失 / storage error / stream incomplete”信号？若没有，第一版应把 `completeness` 固定为 `unknown`，还是暂不暴露该字段？
2. 时间线默认返回最近 200 条还是最早 200 条？二者分别偏向实时排障与会话起因定位，需要在 API 中固定并测试顺序。
3. provider usage 的 cache token 是否在 Tenon 当前 record 中已归一化？若未归一化，第一版是否只显示 input/output，避免错误合计？
4. 现有原始 records API 是否仅为兼容保留，还是后续需要独立权限/显式“显示敏感内容”入口？本轮不应扩大到删除或破坏兼容。
5. Dashboard 是否需要实时 SSE 增量更新？若现有 stream 不提供同一 metadata-only 契约，第一版用显式刷新会比把原始 SSE 接入前端更安全。
