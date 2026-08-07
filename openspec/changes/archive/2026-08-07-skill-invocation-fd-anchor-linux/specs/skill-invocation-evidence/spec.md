# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: 严格 append-only repository

repository MUST 在 Change lock 下使用 closed JSONL codec、bounded read、append+fsync；坏行使写面 degraded/fail-closed。

repository 的普通有界读取入口 MUST 继续拒绝任意 symlink/path alias。只有调用方仍持有已打开目录，并提供与该目录已验证 dev/ino 精确相等的 anchored-directory capability 时，读取器 MAY 接受该目录的可遍历 FD alias；leaf MUST 使用 no-follow 语义，且父目录身份/realpath 与 leaf 身份/元数据 MUST 在读取窗口内保持稳定。任一身份不符、alias/realpath/leaf 变化或无法验证 MUST 失败关闭。

#### Scenario: 并发和幂等

- **WHEN** 两个进程并发写同 invocation 的相同事件
- **THEN** 只产生一个有效事实；不同事件按状态机串行验证

#### Scenario: 普通路径别名仍被拒绝

- **WHEN** 调用方通过普通 repository/文件读取入口传入 symlink parent 或其他路径别名
- **THEN** 读取失败，且不得返回 ledger 内容

#### Scenario: 已验证目录 FD alias 在 Linux 可读

- **WHEN** server 仍持有以 `O_DIRECTORY | O_NOFOLLOW` 打开的 Change 目录，`fstat` 身份与 Change anchor 相等，并通过可遍历 FD alias 读取
- **THEN** repository 使用同一 dev/ino capability 读取非 symlink 普通 leaf，并保持既有 evidence 投影与空 ledger 语义

#### Scenario: 身份或读取窗口变化失败关闭

- **WHEN** anchored capability 的 dev/ino 错误，或 parent alias、realpath、leaf 身份/大小/mtime/ctime 在读前、读中或读后变化
- **THEN** 读取失败且不得把变化前后任一内容返回为有效 evidence
