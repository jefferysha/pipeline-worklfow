# Maestro Flow 对 Tenon Trace 时间线的设计启示

## 研究范围

- 读取日期：**2026-07-29**（Asia/Shanghai）
- 上游仓库：[`catlog22/maestro-flow`](https://github.com/catlog22/maestro-flow)
- 研究问题：Maestro Flow 的项目时间线、Session/Run 审计流、执行监控和两次重点故障修复，能为 Tenon 本地 Trace 时间线提供哪些可验证的产品与工程约束？
- 边界：只提炼能力和失败经验；不复制上游代码、字段或状态机，不把 Trace 提升为 Tenon workflow 的权威状态源。

## 固定上游版本

| 对象 | 固定值 | 一手来源 |
| --- | --- | --- |
| 默认分支 | `master` | [repository](https://github.com/catlog22/maestro-flow) |
| 默认分支 HEAD | `5375fb589f182c1c7e9cade69b4acd3ccd03bac1`，提交时间 `2026-07-28T13:47:31Z` | [commit](https://github.com/catlog22/maestro-flow/commit/5375fb589f182c1c7e9cade69b4acd3ccd03bac1) |
| 最新稳定 release | `v0.5.58`，发布时间 `2026-07-28T13:43:38Z` | [release](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58) |
| release annotated tag object | `cfde86818ab15c05d9b2d434518be7e5da69c84b` | [tag ref](https://github.com/catlog22/maestro-flow/tree/v0.5.58) |
| release commit | `be4cf1f8f7931574c720abe0dc8d813fb29abc21` | [commit](https://github.com/catlog22/maestro-flow/commit/be4cf1f8f7931574c720abe0dc8d813fb29abc21) |

`v0.5.58` 是实际 GitHub Release，无需 tag fallback。该 release 的重点是 Run 证据采集、知识曝光/消费、候选晋升、审计与安全剪枝闭环；它不是专门的 Trace release，但进一步强化了“运行事实必须可追踪、治理动作必须留痕”的产品方向。

## 一手证据索引

| 证据 | 已确认事实 |
| --- | --- |
| [`src/commands/timeline.ts`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/src/commands/timeline.ts) | 将 Git commit 与 Session 条目投影到统一、倒序的项目活动时间线；支持时间窗、scope、platform、JSON 和 limit。 |
| [`src/run/store.ts`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/src/run/store.ts) | Session 权威 JSON 使用锁、schema、事务 intent、临时文件、rename、备份与恢复；`events.ndjson` 是受工作区路径约束、加锁 append 的非权威投影。 |
| [`session-run-structure-guide.md`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/guide/session-run-structure-guide.md) | 明确 `session.json` / `run.json` 为权威状态，`events.ndjson` 为可截断、可归档、可重建的高频审计流。 |
| [`execution-journal.ts`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/dashboard/src/server/execution/execution-journal.ts) | Dashboard 执行日志使用 append-only JSONL，读取时跳过损坏行，按末事件推导 retry/resume 恢复动作，并在 10 MiB 后轮转。 |
| [`ExecutionsTab.tsx`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/dashboard/src/client/pages/supervisor/ExecutionsTab.tsx) | 执行页以统计卡、活动执行和队列呈现 supervisor 快照；失败数和成功率可见，但不是完整历史时间线。 |
| [`execution-store.ts`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/dashboard/src/client/store/execution-store.ts) | `fetchCommanderConfig` 和 `toggleSupervisor` 的 catch 直接忽略网络错误，说明 Dashboard 某些控制失败仍可能静默。 |
| [PR #14](https://github.com/catlog22/maestro-flow/pull/14) | 修复死路由、E007 不暂停和 Dashboard 字段缺失，并把分裂测试 runner 统一后首次暴露 67 个既有失败。 |
| [PR #17](https://github.com/catlog22/maestro-flow/pull/17) | 修复 KG 提取的嵌套事务：一条路径直接崩溃，另一条路径因 catch 静默降级而长期丢失关系边。 |

## 已确认事实

### 1. 时间线是跨来源投影，不是新的真相源

`maestro timeline` 从两个已有来源读取事实：Git log 和 WikiIndexer 中的 Session/Scratch 条目。它把两类事件转换成带 `type` 与 `at` 的联合类型，按时间倒序合并，再输出窗口摘要、事件、热路径和冷 workflow 文件。

这一实现有两个重要边界：

1. 时间线不反向修改 Git、Session 或 workflow state。
2. Session 索引不可用时会向 stderr 输出 `W001`，然后继续生成 git-only 结果；git log 无结果时会输出 `W004` 并返回空历史。

因此，上游把时间线定位为**可丢失、可降级的观察投影**，而不是执行授权或恢复真相。

### 2. 输出有上限，但读取成本并未完全有界

上游默认 `--limit 500`，合并排序后才 `.slice(0, limit)`；Git 查询额外有 `--max-count=1000`。这使返回 payload 有上限，但 Session 侧仍先取得完整 index、过滤后再截断。`--limit` 也只是 `parseInt(...) || 500`，没有严格的最小值、最大值和非法值错误契约。

事实结论是：**结果数量受控不等于读取、排序和内存成本受控**。Tenon 若声称“有界 Trace 时间线”，边界必须落在存储读取或 projector 输入处，而不只是 HTTP 响应的最后一个 `slice`。

### 3. 权威状态与诊断事件被明确分层

Maestro Flow 的 SessionStore 对权威 JSON 使用：

- 进程锁和 owner identity 复核；
- Zod schema 校验；
- transaction intent；
- 临时文件写入与 rename；
- 写前备份；
- 失败后的恢复或 fail-closed。

相对地，`events.ndjson` 被文档明确标为“非权威、高频、可截断归档”，通过受 `.workflow` 根路径约束的 `appendLine` 写入。Dashboard 的 `ExecutionJournal` 也采用 JSONL，并允许轮转。

这说明事件流适合回答“发生了什么、哪里失败、如何定位”，不适合回答“当前 Change/Run 是否有权推进”。对 Tenon 而言，HTTP Trace 只能是诊断证据；phase、review、ledger、revision/CAS 仍必须来自现有 canonical state。

### 4. PR #14：失败未持久化，会让监控看不见真实阻塞

PR #14 的诊断发现：

- E007 只返回错误码而不把 session 写成 `paused`，自动 loop 会反复重试同一错误；
- Dashboard 类型缺少 `completion_status`、`retry_count` 等字段，不同失败/重试状态被渲染成近似相同结果；
- E-code 只打 stdout，没有进入 Dashboard 消费的持久状态；
- 文件 watcher 对半写 JSON 的解析错误存在静默吞掉路径。

修复将 E-level prerequisite 错误持久化为 `paused`，清空 active step，并扩宽 Dashboard 的共享类型。更重要的是，这个 PR 在统一测试 runner 后诚实报告 `1437` 绿、`67` 个既有红，而不是因为旧 runner 未执行就声称全绿。

对 Trace 时间线的直接启示是：**错误行、部分读取、截断、上游格式不识别和数据端不可达都必须是显式状态，不能只靠 console、空数组或 catch 维持“看似可用”。**

### 5. PR #17：catch 后继续运行可能比直接崩溃更危险

PR #17 固定了一个具体故障：`insertExtractionResults` 在外层事务中再次开启 `better-sqlite3` 事务。一条调用路径直接崩溃，另一条调用路径有 try/catch，因而静默丢弃关系边。PR 描述中的真实数据长期形成 `11079` 节点但只有 `49` 条边；修复后全量同步达到 `11329` 节点、`1073` 条边。

修复方式不是取消原子性，而是先检查 `inTransaction`：已有事务时复用外层事务，独立调用时仍自开事务。

对 Tenon Trace 的对应约束：

- 解码器不能把“格式不识别”自动当作“没有事件”；
- 一条损坏记录可以隔离，但响应必须暴露 `skipped_records` / `warnings` / `integrity`；
- 聚合指标必须说明分母和完整性，否则“0 errors”可能只是“错误记录没被解析”；
- 若无法证明统计完整，UI 应显示 partial/unknown，不得显示健康绿色。

### 6. Dashboard 形态可借鉴，但也暴露了空白

`ExecutionsTab` 的可取之处是快速扫读结构：

- 顶部 KPI：dispatched、success rate、queued、failed；
- 中部活动执行：issue、executor、turn progress、elapsed；
- 下部 queue：按顺序呈现等待项；
- 无活动执行时有空态。

但它不是完整时间线：没有持久历史列表、来源完整性、失败详情或读取错误恢复；部分文案仍硬编码英文；`execution-store.ts` 的网络 catch 有直接忽略路径。Tenon 不应只复制卡片布局，而应补上 loading、empty、error、partial、retry 和 keyboard 状态闭环。

## 对 Tenon 当前实现的映射

Tenon 已经具备可以复用的基础：

- `packages/tap/src/record.ts` 捕获 `timestamp`、`request_id`、turn、duration、transport、request/response，并对 header、body、query 凭证做本地写盘前脱敏。
- `packages/tap/src/trace-store.ts` 使用 Session JSON + append-only record JSONL；Session sidecar 原子 rename，损坏行当前会跳过。
- `packages/server/src/traces.ts` 已有 local-only 的 Session 列表与 raw records GET 投影。
- `packages/dashboard-app/src/advanced/TrafficPanel.tsx` 已有 Traffic 入口、Session 选择、加载/空/错误基础状态。

当前缺口也很明确：

- Dashboard 只把 raw record 渲染为 `request_id method path → status`，无法定位慢调用、错误 turn、模型、token 或流事件规模。
- records API 直接返回 `unknown[]`，把含 request/response body 的大对象交给 UI；这不适合作为默认诊断摘要契约。
- `readRecords` 会读取整个 JSONL 后返回全部合法记录；既没有 tail/limit，也没有损坏行计数。
- 未知 Session 与已知但无记录 Session 都可能投影为空，调用者无法区分。
- 数据被截断、部分解码或不支持某供应商 usage 形状时，没有显式 completeness 信号。

## 建议的最小 Tenon 纵向切片

建议新增一个**只读、metadata-only、严格有界的 Trace Timeline projector + Dashboard 时间线**，保留 raw records API 兼容，但新 UI 默认只消费摘要端点。

### 后端/共享契约

建议返回：

```text
session
generated_at
outbound = local-only
content = metadata-only
integrity = complete | partial | unknown
total_records
returned_records
skipped_records
truncated
warnings[]
summary { errors, duration_ms, input_tokens, output_tokens }
events[] {
  request_id, turn, timestamp, duration_ms, transport,
  method, path_without_query, status_code, outcome,
  model, input_tokens, output_tokens, stream_event_count
}
```

约束：

1. 默认与硬上限都固定，例如最多返回最近 `200` 条；存储 reader 应支持 bounded tail 或带诊断的有界读取，不能只在最终响应 `slice`。
2. 不返回 headers、prompt、response body、完整 query、upstream URL；`content: metadata-only` 是可测试契约。
3. token/model 只从严格 allowlist 路径读取；不识别时为 `null`，不猜测。
4. HTTP status 不等于模型语义成功；第一版可把 `2xx` 记为 transport success、`>=400` 记为 transport error，并在字段名或文档中明确层级。
5. 未知 Session、空 Session、损坏/部分 Session、server 失败分别使用可判定响应，不合并为空数组。
6. `warnings` 和 `integrity` 参与前端呈现与测试；任何 skipped record 都不得继续显示“完整/健康”。

### Dashboard 交互

建议在现有 TrafficPanel 内形成两栏或主从结构：

- Session 列表保留 client、record count、状态与 local-only 标识；
- 选中后显示调用数、错误数、总耗时、token 摘要；
- 时间线按 turn/时间呈现 method、无 query path、model、status、duration、tokens；
- 支持 All / Errors / Success 过滤，过滤结果为空要与“Session 无记录”使用不同空态；
- Session 列表加载失败和 timeline 加载失败都提供 retry；
- `Tab` 可遍历 Session、filter 和 retry；`Enter`/`Space` 选择；`Escape` 清除当前 Session 或返回列表；
- 所有用户可见文案走中英文 i18n；
- partial/truncated 状态使用文字和图标，不只依赖颜色。

### 用户价值

这个切片让用户无需打开原始 prompt/response，即可回答：

1. 哪个 Session/turn 发生错误？
2. 哪次请求最慢？
3. 当前看到的是完整记录还是被截断/部分解码？
4. 哪种 transport/model 产生了异常？
5. token 规模是否在某个 turn 突增？

它也保持 Tenon 的安全承诺：诊断仍在本机，默认 UI 不扩大敏感 body 的暴露面。

## 建议的降级与有界策略

| 场景 | 不可接受行为 | 建议行为 |
| --- | --- | --- |
| Session 不存在 | 返回 `200 + []` | 明确 `404` 或稳定的 `found: false` 契约 |
| Session 存在但无记录 | 复用“不存在”文案 | `200`、`integrity: complete`、empty state |
| 单行 JSON 损坏 | 静默跳过后仍称完整 | 隔离该行，增加 `skipped_records`，`integrity: partial` |
| 文件超出读取预算 | 读完整文件再截断 | bounded tail；`truncated: true` 并保留总数/已知下界 |
| usage/model 形状未知 | 猜测为 0 或 unknown model 字符串 | 对应字段 `null`，增加受控 warning |
| API/网络失败 | catch 后保留旧健康卡 | error state + retry；旧数据若保留必须标 stale |
| filter 后无结果 | 显示“暂无捕获会话” | 显示“当前筛选无匹配”，可一键清除 filter |
| raw 数据包含 query | 默认列表直接展示 | projector 去掉 query，只显示 pathname |

## 事实、推断与建议边界

### 已确认事实

- Maestro Flow 的 CLI 时间线确实合并 Git 与 Session，并有 scope/platform/limit。
- Session index 不可用时确实降级为 git-only，但结构化输出中没有单独的 completeness 字段。
- `events.ndjson` 在设计文档中明确非权威、可截断；权威 Session/Run JSON 使用更强的事务与恢复语义。
- ExecutionJournal 确实会跳过损坏 JSONL 行并按文件大小轮转。
- PR #14 确实修复未暂停的错误路径与 Dashboard 字段缺失，并报告统一 runner 后出现的既有失败。
- PR #17 确实修复嵌套事务导致的崩溃/静默丢边。

### 推断

- 将 `integrity`、`warnings`、`skipped_records` 放进 Tenon timeline 响应，是根据上游静默失败事故得出的设计推断，不是 Maestro Flow 已提供的 API。
- `200` 条硬上限是面向 Tenon Dashboard 的建议值，不是上游标准；最终值应以本仓真实 trace 体积和浏览器验收为准。
- model/token/stream event 可作为第一版摘要，是基于 Tenon 已捕获 record 形状的可行推断；不同供应商格式仍需 fixture 验证。
- 主从时间线和过滤交互是对 Maestro Dashboard 扫读结构的产品迁移，不是复制其组件。

## 不能照搬的部分

1. **不能照搬 `maestro timeline` 的 shell 拼接。** `HEAD~N`/commit 解析最终进入 `execSync` 字符串；Tenon 的 Trace 不需要 shell，也不应新增此攻击面。
2. **不能把最后 `.slice(limit)` 宣称为完整有界。** Tenon 应在 reader 或 projector 输入处限制读取和解析预算。
3. **不能照搬“损坏行直接跳过且不计数”。** 这与 PR #17 暴露的静默数据丢失风险同类。
4. **不能照搬多来源 project timeline 的领域模型。** Tenon 本轮是 LLM HTTP Trace，不应混入 Git commit、phase transition 或 OpenSpec ledger，避免第二真相源。
5. **不能复制 Maestro Session/Run schema。** Tenon 已有自己的 Change、workflow、revision/CAS、ledger 和 review receipt。
6. **不能直接把 raw request/response body用于默认 Dashboard。** Tenon Trace 包含 prompt 等敏感上下文；即使已脱敏凭证，也应默认只给 metadata。
7. **不能把 transport 200 当成 agent 成功。** HTTP 成功、模型响应完成、工具执行成功和 Tenon verify-pass 是不同层级。
8. **不能沿用硬编码或静默 catch 的 UI。** 中英文 i18n、错误恢复、空态、加载态和键盘路径必须闭环。

## 开放问题

1. `TraceStoreReader` 是否应新增 `readTimelineTail(session, limit)` 并直接返回 `skipped/truncated`，还是先提供兼容 adapter，同时保留旧 `readRecords`？
2. 第一版是否只承诺 transport outcome，还是已有足够跨 Claude/OpenAI/Codex fixture 可以稳定区分 stream completed / model error？
3. token 汇总应支持哪些固定 usage 路径；未知或部分 SSE usage 如何避免重复计数？
4. Session 仍为 `active` 且文件持续 append 时，timeline 响应怎样表达 snapshot/stale 边界，是否需要基于 record count 的轻量 revision？
5. 浏览器验收中，如何构造不含真实 prompt/secret 的 success、error、empty、partial 与 truncated fixture，同时确认默认 UI 不泄露 raw body/query？

## 结论

Maestro Flow 值得借鉴的不是某个 Gantt 或卡片样式，而是三条组合原则：

1. **统一时间线是只读投影，绝不取代权威状态。**
2. **事件流可以降级、截断和隔离损坏，但所有不完整都必须显式可见。**
3. **失败若只存在于 stdout、catch 或被缩窄的 Dashboard 类型里，系统会产生虚假健康感。**

Tenon 本轮最小、真实的用户价值应是：把现有 raw Trace 从“能列出请求”提升为“可安全定位错误、慢调用、token 峰值和完整性边界”的本地 metadata-only 时间线，同时保持 raw records 兼容、local-only 安全语义和现有 canonical workflow 权威不变。
