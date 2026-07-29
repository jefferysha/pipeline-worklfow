# 提案

## Why

CI 暴露出 GNU/Linux 对 `/dev/fd/N` 的 `stat` 行为与 Darwin 不同，导致项目级
UserPromptSubmit 只读配置整体回退默认值。该问题会让自定义旁路词、显式禁用和 hook matrix
在 Linux 上失效，必须作为已交付功能的兼容性热修复处理。

## What Changes

- 修正 GNU 与 Darwin 的 inode/size 读取顺序及 fd 符号链接解引用。
- 保持 4096-byte、NUL、symlink、FIFO、timeout 和 sibling 安全边界不变。
- 以 Linux 非 root 最小复现、完整 hook suite 和 GitHub CI 作为可验证结果。
- 非目标：改变旁路关键词匹配、Dashboard/API 契约或 review/confirm/safety gate。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

`prompt-routing-bypass`：补足只读 hooks 配置在 GNU/Linux 的跨平台持久化读取保证。

## Impact

仅影响 `hooks/hooks-config.sh` 的 portability 分支，不新增依赖或 API 字段。Darwin 继续使用
BSD `stat -f`，GNU/Linux 优先使用 `stat -Lc`；旧配置和默认值完全兼容。
