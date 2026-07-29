# Trace Timeline 技术设计

## 背景与用户结果

Tenon 已有 `tap → TraceStore → server → TrafficPanel` 的本地捕获链路，但当前界面只显示
`request_id + method/path + status`。用户无法快速回答“哪个 turn 失败、哪次最慢、模型和实际
usage 是否异常、当前结果是否完整”，并且 Dashboard 仍需接收包含 request/response body 的 raw
record。

本 Change 的结果是：用户在现有 Advanced → Traffic 入口中，只查看白名单元数据即可定位最近一次
会话的传输失败、慢请求和 provider usage，同时能看见截断、损坏记录或未知状态，不把诊断投影误当成
Workflow 权威事实。

## 固定证据

读取日期均为 2026-07-29。

| 来源 | 固定版本 | 与本设计的关系 |
| --- | --- | --- |
| Tenon | [`4c242b9`](https://github.com/jefferysha/tenon/commit/4c242b928b61285561f9cdbc63617db899a18a12) | 已有本地捕获与 raw records UI；开放 PR 无同类 Trace Timeline。 |
| Trellis | [`c94d6fc`](https://github.com/mindfold-ai/Trellis/commit/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c)，GitHub Release 404，稳定 tag 回退 [`v0.6.10`](https://github.com/mindfold-ai/Trellis/tree/v0.6.10) | [PR #477](https://github.com/mindfold-ai/Trellis/pull/477) 说明截断上下文必须保守恢复；[Issue #479](https://github.com/mindfold-ai/Trellis/issues/479) 说明底层 API 错误不可退化成不可解释的超时。 |
| Comet | [`2945693`](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680)，latest release [`0.4.0-beta.9`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9)，严格稳定 [`0.3.9`](https://github.com/rpamis/comet/releases/tag/0.3.9) | [PR #228](https://github.com/rpamis/comet/pull/228) 的有界 canonical formatter 支持由后端形成稳定 DTO；[Issue #240](https://github.com/rpamis/comet/issues/240) 要求失败/跳过不能被报告成通过。 |
| maestro-flow | [`5375fb5`](https://github.com/catlog22/maestro-flow/commit/5375fb589f182c1c7e9cade69b4acd3ccd03bac1)，release [`v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58) / [`be4cf1f`](https://github.com/catlog22/maestro-flow/commit/be4cf1f8f7931574c720abe0dc8d813fb29abc21) | 统一时间线是只读投影；[PR #14](https://github.com/catlog22/maestro-flow/pull/14) 和 [PR #17](https://github.com/catlog22/maestro-flow/pull/17) 证明未持久化失败、静默 catch 和损坏行跳过会制造虚假健康。 |
| claude-tap | [`2db092e`](https://github.com/liaohch3/claude-tap/commit/2db092e668fc5ee240a1a77151c5fe60ada9f4d5)，release [`v0.1.140`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.140) / [`77b674f`](https://github.com/liaohch3/claude-tap/commit/77b674f20e6e5be6b931ce8c161a5bf5f9d47e95) | [PR #398](https://github.com/liaohch3/claude-tap/pull/398)、[#397](https://github.com/liaohch3/claude-tap/pull/397)、[#376](https://github.com/liaohch3/claude-tap/pull/376)、[#351](https://github.com/liaohch3/claude-tap/pull/351)、[#388](https://github.com/liaohch3/claude-tap/pull/388) 分别约束压缩/flush、截断流、上下文依赖、捕获 allowlist 和 usage 估算边界。 |

详细研究：

- `docs/superpowers/specs/2026-07-29-trace-timeline-claude-tap-research.md`
- `docs/superpowers/specs/2026-07-29-trace-timeline-maestro-flow-research.md`
- `docs/superpowers/specs/2026-07-29-trace-timeline-tenon-upstreams-research.md`

## 约束与非目标

- Trace 仍只读、本地回环、GET-only，不上传、不分享、不增加外部 observability 依赖。
- 不修改 reverse/forward/TLS/WebSocket 捕获协议，不强制 agent 改 transport。
- 不迁移 `sessions/*.json` 或 `records/*.jsonl`，不删除旧 `/api/traces/records`。
- 新 API 不返回 headers、prompt、messages、tools、tool input/result、request/response body、query 或
  upstream URL。
- outcome 只是 HTTP transport 结果，不表示模型语义成功、工具成功或 Tenon `verify-pass`。
- 不把 Trace 写入 WorkflowRun、ledger、review receipt 或 canonical state。
- 不修改全局 Dashboard token/App shell，降低与开放 PR #10 的视觉合并风险。

## 方案

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| A. Dashboard 拉 raw records 后聚合 | 改动少 | 敏感正文进入浏览器；provider 解析和限界落在 UI | 拒绝 |
| B. 把标准 span 写入持久化 | 读取快 | schema 迁移、旧数据补齐与 capture 变更扩大范围 | 本轮拒绝 |
| C. Store 有界窗口 + server metadata projector | 旧数据立即可用；暴露最小；读取/响应均有界；兼容旧 API | projector 是 best-effort，需要明确 unknown/partial | 采用 |
| D. OpenTelemetry/外部后端 | 生态成熟 | 新依赖、配置、费用和外发边界 | 拒绝 |

## 决策

### 数据流与边界

```text
records/<session>.jsonl
  │  newest 200 valid records / max 8 MiB
  ▼
TraceStore.readRecordWindow
  │  records + total/skipped/truncated/integrity/warnings
  ▼
server Trace timeline projector
  │  strict allowlist; strip query; normalize known usage only
  ▼
GET /api/traces/timeline?session=<id>
  │  content=metadata-only; outbound=local-only
  ▼
Dashboard decoder → summary + filterable timeline
```

`TraceStore.readRecordWindow` 从文件尾部读取，硬上限为 8 MiB，并逆向扫描到最多 200 条合法记录。
窗口最终按原始时间顺序返回。它复用现有 JSONL 和 sidecar 的 `record_count`，不写新文件。

如果记录超过条数或字节预算，`truncated=true`。损坏行、只读到超大记录的尾部、sidecar 与可见行数
不一致时，`integrity=partial` 并给出稳定 warning code；不能静默当成完整空数据。未知 session
不调用 reader，HTTP 返回 404；已知空 session 返回 200 和空 entries。

### API 契约草案

```text
TraceTimelineResponse {
  generated_at
  outbound: "local-only"
  content: "metadata-only"
  session: {
    id, client, proxy_mode, status, started_at, updated_at
  }
  total_count
  returned_count
  skipped_count
  truncated
  integrity: "complete" | "partial"
  warnings: (
    "record-limit" | "byte-limit" | "malformed-record" | "count-mismatch"
  )[]
  summary: {
    success_count, error_count, unknown_count,
    total_duration_ms, input_tokens, output_tokens, cached_input_tokens
  }
  entries: TraceTimelineEntry[]
}

TraceTimelineEntry {
  sequence
  request_id: string | null
  turn: number | null
  timestamp: string | null
  duration_ms: number | null
  transport: string | null
  method: string | null
  path: string | null
  status_code: number | null
  outcome: "success" | "error" | "unknown"
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
  stream_event_count: number | null
}
```

只接受非负 safe integer；字符串按字段设置硬长度，超限或类型不符返回 `null`。`path` 在 `?` 前截断。
model 只从 `request.body.model` 读取；usage 只从 response body 的已知 Anthropic/OpenAI 路径读取。
不得使用 `0.25 token/byte` 等估算，缺失与真实零必须可区分。第一版不承诺 tool call count，因为
claude-tap #397 已证明截断流下“未解析到”不等于零。

HTTP status `200–399` 映射 `success`，`>=400` 映射 `error`，缺失/非法映射 `unknown`。
汇总只累加非空实际数值；若所有 entry 对某 usage 均未知，对应 summary 为 `null`，不是 0。

### 关键业务规则

1. 新时间线必须由白名单 projector 生成，任何未知 record key 都不透传。
2. `content` 与 `outbound` 是精确字面量，Dashboard decoder 对其他值 fail closed。
3. 最近窗口的排序确定：选择最新记录，但 entries 仍按捕获先后升序显示。
4. `truncated` 与 `integrity` 是不同维度：合法的最近窗口可以 truncated 且 complete；损坏/计数不一致
   才是 partial。
5. unknown 不进入 success/error；过滤后无匹配与 session 无记录是两个独立空态。
6. raw records API 继续原样工作，但新 TrafficPanel 不再消费它。
7. active session 的 sidecar/JSONL 短暂竞态可显示 `count-mismatch`/partial，重试后恢复；不得伪造锁定快照。

### 状态机

```text
sessions loading ──success──► sessions ready
       │                         ├─ zero ─► no sessions
       └─failure──► sessions error ──retry──┘

session selected ─► timeline loading
       ├─ 200 + entries ─► timeline ready ─► all/success/error filter
       ├─ 200 + []      ─► known empty session
       ├─ 404           ─► timeline error (session unavailable)
       └─ 5xx/network   ─► timeline error ──retry──► loading

Escape within panel ─► clear selection + restore focus to session button
```

快速切换 session 时使用 request identity/cancellation，旧请求不得覆盖新选择。原生 button 提供
Tab/Enter/Space；筛选按钮使用 `aria-pressed`，完整性提示使用文字而非只用颜色。

### Dashboard 形态

- 保留现有会话列表与 local-only 提示。
- 选中后显示调用、失败、总耗时、实际 token 四个紧凑摘要。
- 时间线行显示 turn/时间、method/path、status/outcome、duration、transport；model/token/stream count
  只在存在时显示。
- `全部 / 失败 / 成功` 三个筛选；unknown 只在“全部”出现，并由 summary 单独计数。
- sessions 和 timeline 分别有 loading、empty、error、retry；partial/truncated 有文字告警；
  filter empty 提供清除筛选。
- 所有可见文案进入 `advanced` 中英文命名空间，不再硬编码中文。

## 红队自检与保守结论

| 质问 | 证据/失败方式 | 保守结论 |
| --- | --- | --- |
| 谁保证捕获了全部 agent 活动？ | claude-tap #351/#398 证明 method/path allowlist、transport flush 会影响可见性。 | 页面只称“已捕获请求”，不称完整 agent history。 |
| 解析不到 usage 是否等于 0？ | provider shape 不同；#388 的估算 PR 未合并。 | 返回 null；不估算、不补零。 |
| 一行 2xx 是否代表任务成功？ | Workflow、模型、工具与 HTTP 是不同层级。 | outcome 命名和文案限定为传输结果。 |
| 损坏行跳过后还能显示健康吗？ | maestro-flow #17 的静默丢边说明这会制造虚假健康。 | partial + warning；错误数不宣称完整。 |
| 200 条是否真正有界？ | maestro timeline 最终 slice 仍先读全量。 | Store 按 8 MiB 从尾部读，限制输入而不只限制响应。 |
| 新 UI 是否扩大敏感面？ | raw record 含 prompt/body，已知 secret 脱敏不能覆盖所有业务隐私。 | 后端先投影；新 API 和 UI 不接收 raw body。 |
| active 文件怎样获得一致快照？ | append 与 sidecar rename 之间存在可见竞态。 | 不加伪锁；短暂 mismatch 显式 partial，可重试。 |
| 为什么不修压缩/WebSocket？ | claude-tap #398/#376 表明那是 capture/runtime 风险。 | 本 Change 只消费已落盘事实，捕获增强另立 Change。 |

## Assumptions / Decision Log

1. 用户明确要求本轮以 `maestro-flow` 和 `claude-tap` 为重点；两者均作为主要一手设计依据写入 PR。
2. 选择现有 Advanced → Traffic，而不是新增一级导航；这是最小可逆入口，也避免与 PR #10 重叠。
3. 默认最近 200 条、8 MiB 读取预算；偏向当前故障排查，并通过 truncated/partial 诚实披露窗口边界。
4. 第一版只规范 HTTP outcome、模型、实际 usage 和 stream event count；不推导上下文因果或工具调用完整性。
5. 不实时 polling/SSE；选择、retry 或再次选择会话时刷新，避免把 raw stream 引入新安全边界。
6. 不新增依赖；Store、server 与 Dashboard 使用现有 Node 22/npm workspace 模式。

## 术语

- **Trace Timeline**：对某个本地捕获 session 的最近记录做出的只读诊断投影。
- **metadata-only**：响应只含设计列出的白名单元数据，不含请求/响应正文、headers、query 或 upstream。
- **transport outcome**：由 HTTP status 得出的 `success/error/unknown`，不等价于 agent 或 Workflow 成功。
- **complete window**：读取到的最近窗口中没有已知损坏或计数矛盾；不承诺捕获了所有 agent 活动。
- **partial window**：存在损坏行、字节预算边界或计数不一致，汇总不可解释为完整会话事实。
- **truncated window**：session 总记录超出最近窗口；它可以与 complete 同时出现。

## 验证策略

- tap：真实 JSONL 尾读、200 条、8 MiB、损坏行、超大记录、unknown/empty session、原顺序。
- server projector：Anthropic/OpenAI usage、非法/超长值、query 去除、outcome、unknown 与 zero、饱和汇总、
  响应递归键不含 body/headers/messages/tools/input/output/upstream。
- HTTP：缺 session、未知、空、成功、truncated/partial、reader 抛错、GET-only。
- Dashboard decoder/client：精确 disclosure、枚举、nullable 数值、非法 shape、HTTP 错误。
- 组件：两层 loading/empty/error/retry、summary、三筛选、filter empty、i18n、快速切换、Escape/focus。
- 真实浏览器：确认 Tenon Dashboard 身份和唯一端口；真实本地 Trace success/error/empty，
  受控延迟/失败路径，Tab/Enter/Space/Escape、窄视口与页面无 raw prompt/query。
- 全仓：定向测试、`typecheck:web`、`test:web`、`build:web`/`build`、`npm test` 和受影响
  hooks/adapters/skills/bundle/oracle 门禁。

```coverage
touches:
L1_api:      filled -> #API-契约草案
L2_data:     filled -> #数据流与边界
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #红队自检与保守结论
L6_security: filled -> #约束与非目标
L7_perf:     filled -> #数据流与边界
L8_deps:     filled -> #Assumptions--Decision-Log
L10_terms:   filled -> #术语
```
