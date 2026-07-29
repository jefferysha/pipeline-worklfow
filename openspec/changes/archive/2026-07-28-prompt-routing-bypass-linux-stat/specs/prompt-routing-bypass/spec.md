# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 只读 Hook 配置 SHALL 跨 GNU 与 Darwin 保持 fd identity

系统 SHALL 在读取只读 `.pipeline/hooks.json` 时比较 pathname 与已打开 fd 的真实
inode/size。GNU/Linux SHALL 解引用 `/dev/fd/N`，且失败的平台探针不得污染 identity stdout；
Darwin SHALL 保留 BSD `stat` 回退。任一 identity 不一致或读取失败 SHALL 丢弃 snapshot 并
沿用现有 fail-open 行为，不得放宽 symlink、4096-byte、NUL、FIFO 或 timeout 防线。

#### Scenario: GNU/Linux 读取只读配置

- **GIVEN** `.pipeline/hooks.json` 是 mode `0444` 的普通文件
- **WHEN** UserPromptSubmit hook 在 GNU/Linux 非 root 进程读取配置
- **THEN** pathname 与 `/dev/fd/9` 使用同一底层 inode/size
- **AND** 自定义旁路词、显式空字符串与 hook matrix 按磁盘值生效。

#### Scenario: Darwin 使用 BSD fallback

- **WHEN** GNU `stat -Lc` 能力探针在 Darwin 上无输出失败
- **THEN** 读取器使用 BSD `stat -f '%i:%z'`
- **AND** 现有 macOS Hook 行为保持不变。

#### Scenario: 平台探针失败时不消费污染输出

- **WHEN** 任一 `stat` 探针失败或输出无法形成单一 `inode:size`
- **THEN** 读取器拒绝该 snapshot
- **AND** 不把文件系统报告或 fd 符号链接元数据当成配置 identity。
