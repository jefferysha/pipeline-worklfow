# 提案

## Why

Codex marketplace 首次刷新已实际成功但 Tenon 尚未观察到新 HEAD 时，更新事务会保留 pending WAL。随后重试会因 desired 内嵌 marketplace 的旧 HEAD 而把同一更新目标误判为不同目标，导致无法完成官方幂等恢复。需要修复该单点恢复缺陷，确保插件可安全更新到已合并的最新 main。

## What Changes

- 让 native host desired 的等价判断只把 marketplace 路径、来源和来源类型视为身份，并继续严格比较目标 HEAD、插件版本和插件根目录。
- 兼容已由旧版本写入、仅 marketplace identity HEAD 不同的 pending WAL。
- 增加回归测试并重建发布 CLI bundle。
- 非目标：不放宽第三状态、来源变化、目标提交变化或未知 WAL 的 fail-closed 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

`plugin-runtime`：更新恢复必须区分稳定 marketplace 身份与会随刷新变化的 HEAD observation。

## Impact

影响 CLI managed-host reconciliation、native host desired schema、相关单元测试和已提交 CLI bundle；不修改 Dashboard API、项目 Change 数据或宿主私有缓存写入边界。
