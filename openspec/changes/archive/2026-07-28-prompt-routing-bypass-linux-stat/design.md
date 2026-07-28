# 设计

## 初始假设

实机证据确认 GNU `stat -c` 默认统计 `/dev/fd/N` 符号链接本身，且 GNU `stat -f` 会在失败前
污染 stdout；Darwin 当前 `stat -f` 行为正确。采用 GNU 形式优先并显式 `-L`、失败后回退
Darwin 形式的能力探针，不引入 `uname` 平台枚举。

## 风险

- 错误调整顺序可能破坏 macOS/Bash 3.2 路径。
- 只读配置走独立 worker，不能弱化 timeout、PID identity 或 NUL/size 防线。

## 已验证结论

- `stat -Lc` 在 GNU 上对 pathname 与 `/dev/fd/9` 返回相同 inode/size。
- macOS 的 GNU 形式探针无输出失败并可靠进入 BSD fallback。
- Linux 非 root 中原 13 个配置语义失败全部消失；非 reaping 容器 PID 1 的 zombie
  观测与 GitHub runner 原始通过结果分开记录。
