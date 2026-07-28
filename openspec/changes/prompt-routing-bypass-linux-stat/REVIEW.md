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
