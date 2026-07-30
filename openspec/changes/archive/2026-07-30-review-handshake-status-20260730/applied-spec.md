# 已应用规格回执

- Change：`review-handshake-status-20260730`
- 日期：`2026-07-30`
- 结果：`changed`

## 应用明细

| Delta | 主规格目标 | before digest | after digest | 结果 |
| --- | --- | --- | --- | --- |
| `openspec/changes/review-handshake-status-20260730/specs/review-handshake-status/spec.md` | `openspec/specs/review-handshake-status/spec.md` | `absent` | `sha256:01ee46e835b9f34d60d04ce585f841375e43d1a190749157ff603c6f487dce90` | `changed` |

## 影响摘要

创建 `review-handshake-status` durable capability：规定 Server 从 canonical state 与冻结 workflow
plan 投影 exact-event review receipt，HTTP/SSE 保持同源，Dashboard 在滚动升级窗口内严格区分旧
runtime unavailable、not-requested、pending 与 approved，并以中英文只读状态卡呈现，且不替代
transition guards 或 host-bound 人工授权。

## 冲突与幂等

应用前目标不存在，因此以经 Verify 批准的四条 Requirement 创建新主规格；未修改其他 capability，
无需冲突合并。主规格已通过 `openspec validate review-handshake-status --strict`，重复应用时目标
内容不应发生变化。
