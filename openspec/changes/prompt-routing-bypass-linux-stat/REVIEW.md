# Build 收敛审查

## Standards 轴

- 范围：`hooks/hooks-config.sh` 的 `pipeline_hooks_config_identity` 与本 Change 治理文档。
- CRITICAL/HIGH/MEDIUM/LOW：0/0/0/0。
- 结论：GNU-first 能力探针不引入 `uname`、依赖或热路径 Node/Python；Darwin fallback、
  symlink、size、NUL、FIFO、timeout 与 PID identity 防线保持不变。

## Spec 轴

- GNU/Linux mode `0444` 非 root 最小复现：旧实现连续 3 次失败，修复后连续 3 次通过。
- macOS：GNU 探针无输出失败，BSD `stat -f` pathname/fd identity 一致。
- `bash tools/test-hooks.sh`：511 passed，0 failed。
- Linux 非 root 完整 hook suite：原 13 个只读配置语义失败全部消失；node 容器 PID 1
  不回收 zombie 导致 blocking-descendant 观测 1 项环境差异，GitHub runner 原始该项通过，
  未弱化测试断言。

## 结论

实现与 delta spec 一致，可冻结进入 Verify。GitHub CI 必须在推送后重新运行，不能用本地结果
替代远端终态。

## Verify-fail 回退与二次收敛

首次冻结 `1b7a36052eb356d73e623bc6c0c40fe3768b257a` 的 Codex 独立轨发现：若 GNU
能力探针先写 stdout 再失败，直接 `stat ... || stat ...` 会把污染输出与 BSD fallback
拼接。该行为违反“失败探针不得污染 identity stdout”的 delta spec，因此已通过确切
`verify-fail` event 回退 Build，没有在 Verify 中修改产品代码。

二次实现把每个探针的 stdout 隔离在独立 command substitution 中，只向调用方发出单一数字
`inode:size`；新增 fake-stat 回归固定“首探针写污染内容后失败、fallback 成功”的路径。

- `bash -n hooks/hooks-config.sh tools/test-hooks.sh`：通过。
- `bash tools/test-hooks.sh`：512 passed，0 failed。
- `git diff --check`：通过。
- CRITICAL/HIGH/MEDIUM/LOW：0/0/0/0。

二次实现修复了首次 Verify 的唯一发现，可重新冻结；远端 CI 与独立复核仍须绑定新的冻结 SHA。
