# Linux 只读 Hook 配置 identity 修复设计

## 用户结果

在 GNU/Linux 与 Darwin 上，只读 `.pipeline/hooks.json` 都能按同一 canonical 语义读取；
自定义旁路词、显式空字符串和 hook matrix 不再因平台差异回退默认值。

## 证据

- GitHub CI run `30341716302`：构建、release freshness、clean install、全量 vitest 和
  Dashboard tests 通过；hook scripts 中 13 个失败均聚合在只读配置读取。
- Ubuntu 非 root 最小复现连续 3 次返回 `no-tenon`，修复后连续 3 次返回 `skip-tenon`。
- GNU `stat -c '%i:%s' /dev/fd/9` 未加 `-L` 时统计符号链接本身；`stat -Lc` 与 pathname
  返回相同 inode/size。
- GNU `stat -f FORMAT path` 会把 `FORMAT` 当成 pathname，在失败前向 stdout 输出文件系统报告。
- macOS `stat -Lc` 无输出失败，现有 BSD `stat -f '%i:%z'` 对 pathname/fd 返回一致 identity。

## 方案比较

1. 仅加入 GNU `-L`，仍保留 Darwin-first：不能阻止 GNU `stat -f` 污染 stdout，拒绝。
2. 解析 `uname` 后分支：新增平台识别与测试面，且不如能力探针直接，拒绝。
3. GNU `stat -Lc` 优先，失败后 BSD `stat -f` 回退：最小、能力驱动、无新依赖，采用。

## 关键业务规则

- pathname 与已打开 fd 必须来自同一 inode 且 size 相等。
- identity 读取失败、输出污染、symlink、非普通文件、超限或 NUL 均 fail-open 到默认行为。
- 不改变旁路 token、Dashboard/API、matrix 或 review/confirm/safety 语义。

## 状态机

读取流程仍为：普通可写文件固定 fd 同步读取；只读文件进入有界 worker；成功发布 snapshot，
任何校验或 timeout 失败都丢弃 snapshot。此次仅替换 identity 能力探针，不新增状态。

## Assumptions / Decision Log

- 2026-07-28：选择能力探针而非 `uname`，减少平台名单与分支漂移。
- 2026-07-28：保留现有 timeout/PID identity/4097-byte/NUL 防线，不借 CI 修复弱化安全测试。
- 2026-07-28：Docker 的非 reaping PID 1 会让已终止 `stat` 短暂显示 zombie；GitHub runner
  原始 blocking-descendant 测试已通过，因此该容器差异不作为产品语义失败。

```coverage
touches:
L1_api:      waived -> 无 API 变化
L2_data:     waived -> 无 schema 或持久化格式变化
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #关键业务规则
L6_security: filled -> #关键业务规则
L7_perf:     filled -> #状态机
L8_deps:     waived -> 不新增依赖
L10_terms:   filled -> #证据
```
