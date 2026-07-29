# Dashboard Trace 会话工作区设计

## 用户结果

在 1024–1920px 电脑端，用户可以在 Machine → Advanced → Traffic 中保持 session 选择上下文，同时在同一视野内识别当前会话、摘要、完整性边界、筛选结果和请求序列。界面继续只展示本地 metadata-only Trace，不增加任何控制面或远端行为。

## 证据

### 当前实现

- 真实生产 Dashboard、真实本地 TraceStore fixture、真实 Machine 页面。
- 1024/1200/1440/1920px 的 TrafficPanel 宽度约为 854/1030/1054/1054px，四档横向溢出均为 0。
- 选中 7 条请求的会话时，当前 TrafficPanel 高约 808px，其中 sessions 列表约 201px、timeline 约 567px；详情随列表向下移动。
- 现有实现已正确区分 sessions 与 timeline 的 loading/error/empty，保留 partial/truncated、filter-empty、旧响应隔离及 Escape 焦点恢复。

### Chorus 固定源码参考

- 官方仓库：`chorus-aidlc/chorus`
- 固定提交：`be647877b4b56a61e480e939d6a6d31b3f84f7f9`
- 可借鉴：稳定的 desktop master-detail、身份优先的 rail 行、detail 内“身份 → 状态 → 活动”的扫描顺序。
- 不复制：暖色品牌、340px 固定 rail、字段语义、控制操作、图标/依赖、手机端 drill-down。
- 详细对照：`docs/superpowers/specs/2026-07-29-dashboard-trace-session-workspace-chorus-ia-research.md`。

## 方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| 保持纵向堆叠，仅收紧间距 | 改动最小 | 无法解决 session 与 detail 的上下文断裂 | 不采用 |
| rail + detail，显式选择 | 稳定桌面锚点；不新增隐式请求；Escape 语义清楚 | 需要稳定的未选择占位 | 采用 |
| rail + detail，默认选择首项 | 首屏立即有数据 | 新增请求；Escape 后重选语义复杂 | 不采用 |

## 信息架构

```text
TrafficPanel
├── 安全说明
└── workspace grid
    ├── session rail: clamp(248px, 28%, 288px)
    │   ├── 标题 + session 数
    │   └── client/status → short id/proxy → count/updated
    └── detail: minmax(0, 1fr)
        ├── 未选择提示，或 session identity header
        ├── calls / errors / duration / actual tokens
        ├── partial / truncated integrity
        ├── all / error / success filters
        └── compact timeline rows
```

## 关键业务规则

- 只使用现有 decoder 已接受的 metadata 字段；不渲染 prompt、body、header、query、upstream URL 或未知扩展字段。
- session rail 与 timeline detail 状态独立；rail 错误不能伪装成 detail 空态，filter-empty 不能伪装成 session empty。
- 选择 session 才发 timeline 请求；切换会话重置筛选；过时响应不覆盖当前会话。
- UI 只读，不添加 interrupt、resume、send instruction 或其他控制操作。
- 仅针对 1024–1920px 电脑端；手机端不在设计、实现、截图或验收范围。

## 状态机

```text
sessions.loading
  ├─ success(empty) → sessions.empty
  ├─ success(rows)  → sessions.ready + detail.unselected
  └─ failure        → sessions.error → retry

sessions.ready + select(id)
  → detail.loading
  ├─ success(entries) → detail.ready(filter=all)
  ├─ success(empty)   → detail.known-empty
  ├─ success(partial) → detail.partial
  └─ failure          → detail.error → retry

detail.* + Escape
  → detail.unselected + focus(session[id])
```

## 视觉与响应式策略

- 工作区在 1024px 及以上使用两列，不创建手机端分支。
- rail 选中态使用 Tenon `--accent` / `--accent-t` / `--ring-blue`；错误、成功和完整性继续使用现有 red/green/amber token。
- timeline rows 位于单一边框容器内，以分隔线形成扫描节奏；路径列 `min-w-0`，长值可截断但保留完整 `title`。
- detail 较窄时 summary 为 2×2；较宽时四列。四个目标视口均要求 document 与工作区横向溢出为 0。

## 可访问性

- session、filter、retry、clear 都是原生 button。
- session 使用 `aria-pressed`，rail/detail 有稳定可访问名称，loading/status/error 保持 `role=status/alert`。
- 键盘顺序遵循视觉顺序；焦点环不被裁切；Escape 恢复原 session button 焦点。
- 选中、成功、失败、partial 均有文字，不仅用颜色表达。

## 错误与边界行为

- sessions error 保持 rail 级 alert + retry；timeline error 保持 detail 级 alert + retry。
- sessions empty 跨工作区说明 tap 默认关闭；known-empty、partial-window 与 filter-empty 使用互不相同的文案。
- 非法时间降级为“未知”，空 proxy mode 使用中英文“未知代理模式”，不显示空占位符。
- 长 session id、path、model 和 transport 不得撑出工作区；完整 session id 仍可从 title/可访问描述获取。

## 安全与隐私

- 本轮不改 `TraceSessionRow` / `TraceTimelineResponse` decoder、fetch 路由或 server/tap。
- UI 只消费既有白名单 metadata，继续显示 local-only / no bodies / never sent out 声明。
- 不添加复制原始记录、下载、外发、控制 Agent 或读取未知 summary 字段的能力。

## 性能边界

- 不自动选择首项，因此 sessions 加载不会产生额外 timeline 请求。
- rail 可在会话数量增长时独立滚动；timeline 保持服务端最多 200 条的现有有界窗口。
- 不引入 ticker、动画库或额外依赖；updated time 在渲染时格式化一次。

## Assumptions / Red-team 自检

- 假设：现有 session 字段足以区分会话。反例是同 client/proxy/time；因此必须显示 short id，并保留完整 id。
- 假设：双栏能在 1024px 工作。反例是应用 rail 与卡片 padding 消耗宽度；因此按真实 Machine 页的约 854px 内容宽度设计，rail 上限 288px。
- 假设：密度提升不会损伤扫描。反例是 token/model 全部挤在一行；因此保持两层文本、稳定列与可换行的次级元数据。
- 假设：外部参考不会稀释 Tenon 身份。反例是复制暖色、图标或大圆角；因此只迁移信息架构，并由 ADR 禁止品牌/依赖复制。

## 领域术语

- **session rail**：工作区左侧的会话选择列表，只承载身份、状态与时间元数据。
- **detail**：右侧当前会话的身份、摘要、完整性、筛选和请求序列。
- **known-empty**：已知 session 存在且窗口完整，但没有捕获请求。
- **partial-window**：会话不为空，但有记录因损坏或预算边界不可见。
- **filter-empty**：完整 entries 存在，但当前筛选没有匹配。

## Decision Log

1. 采用显式选择的 rail + detail，避免自动读取 timeline。
2. rail 宽度采用 `clamp(248px, 28%, 288px)`，优先保护 detail。
3. updated time 使用短绝对时间，不引入 ticker。
4. 使用分隔行，不引入无数据含义的视觉轴线。
5. 不修改 API、server、tap、Machine 容器、依赖或手机端。

```coverage
touches:
L1_api:      waived -> 复用现有 GET /api/traces/sessions 与 /api/traces/timeline
L2_data:     waived -> 不改变 TraceStore、decoder 或响应 schema
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #错误与边界行为
L6_security: filled -> #安全与隐私
L7_perf:     filled -> #性能边界
L8_deps:     waived -> 不新增依赖
L10_terms:   filled -> #领域术语
```
