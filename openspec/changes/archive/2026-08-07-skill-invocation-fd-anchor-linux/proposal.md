# 提案

## Why

PR #34 的 Skill invocation 读取链在 Linux 上会把可信的 `/proc/self/fd/<n>` Change 目录锚点识别为普通 symlink/path alias，导致唯一一个 CI 测试失败。需要在不放宽通用路径读取安全边界的前提下恢复 Linux 兼容性。

## What Changes

- 为已经持有并验证过的目录句柄增加最小的 dev/ino 身份能力参数。
- 仅在 server 使用可遍历的目录 FD alias 时传递该能力；通用读取仍拒绝任意 symlink/path alias。
- 保持 leaf `O_NOFOLLOW`、父目录与 leaf 读前/读中/读后身份和 realpath 稳定性检查，并同步 tracked server/CLI bundles。
- 非目标：不改变 Skill invocation 公共响应、写入协议、PR3/PR4/PR5 行为或其他路径读取器。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

`skill-invocation-evidence`：可信目录 FD alias 可在身份精确匹配时读取，同时保留 fail-closed 路径与 TOCTOU 防护。

## Impact

影响 kernel 的有界文件读取基础设施、Skill invocation repository 选项装配、server 的可信 Change 目录锚点以及生成 bundles。无新依赖、无持久化格式变化、无 HTTP DTO 变化；待 Explore 验证最小 API 边界与 Linux 语义。
