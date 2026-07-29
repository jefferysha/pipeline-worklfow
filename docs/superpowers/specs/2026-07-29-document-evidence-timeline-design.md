# 文档证据时间线设计

## 目标与边界

Dashboard 应让操作者在 Change 详情中直接核实每一份受治理文档的当前登记来源、登记时间，以及当前阶段是否已读取对应 digest。该视图只解释 canonical ledger；不触发 document read、record、transition 或任何文件写入。

非目标：不展示 digest、visitId、绝对路径或历史上已失效的读取回执；不改变 CLI、ledger 格式或现有状态判定。

## 已验证事实

- `DocumentRecord` 已有 `producer`、`recordedAt` 和按 digest 绑定的 `reads[].readAt`。
- `evaluateDocumentEvidence` 已淘汰缺失、过期和错误 visit 的记录，但其 item 投影没有时间线字段。
- Server snapshot 和 Dashboard decoder 已有独立的契约镜像；`TaskDocumentsSection` 已是受治理文档的唯一详情展示入口。

## 选择

在 kernel 的 `DocumentEvidenceItem` 中增加最小、已验证的 `recordedAt` 与可选 `readAt`：

```text
ledger record -> evaluateDocumentEvidence -> server snapshot -> client decoder -> TaskDocumentsSection
```

`recordedAt` 仅在至少一个当前 record 存在时投影；`readAt` 仅在该 item 对当前 phase/current visit 的全部 required records 都存在匹配回执时投影。缺失、stale 与 unread 一律不将历史回执伪装成当前读证据。

## 交互与状态

| 状态 | 时间线展示 | 操作者含义 |
| --- | --- | --- |
| recorded（无需读取） | 登记时间与技能 | 当前版本已登记 |
| recorded（要求读取） | 登记时间、技能、当前阶段读取时间 | 可安全推进的完整证据 |
| unread | 登记时间与技能；明确“尚未读取” | 运行 document read |
| stale / missing | 不展示过期读取时间 | 先恢复当前文档证据 |

组件在 snapshot 更新前保留既有整体 loading；没有时间线字段的旧 server 响应显示“时间线不可用”，解析失败则保持现有 snapshot error 边界。键盘路径使用原生 `details/summary` 展开和关闭时间线。

## Assumptions / Decision Log

- 选择 additive snapshot 字段而非新端点：复用同一根信任锚、SSE 刷新和现有错误语义，兼容旧 Dashboard。
- 多 record 的同 kind 目前可出现在 delta-spec；本轮选择最新 `recordedAt`，并只在所有 required records 有当前回执时给出 `readAt`，避免把局部完成误称为完整读取。
- 仅显示相对路径；当前 UI 已显示 path，本功能不新增路径暴露面。

```coverage
touches:
L1_api:      filled -> #选择
L2_data:     waived -> 仅扩展既有只读 snapshot DTO，不新增存储或 schema
L3_rules:    filled -> #选择
L4_state:    filled -> #交互与状态
L5_errors:   filled -> #交互与状态
L6_security: waived -> 不新增写端点、鉴权面或敏感字段
L7_perf:     waived -> 只遍历已经加载的 ledger record，不新增 I/O
L8_deps:     waived -> 不引入依赖
L10_terms:   filled -> #目标与边界
```
