---
change: prompt-routing-bypass-linux-stat
design-doc: docs/superpowers/specs/2026-07-28-prompt-routing-bypass-linux-stat-design.md
---

# Linux 只读 Hook 配置 identity 修复计划

## 子阶段 1：跨平台 tracer bullet

- 在 `hooks/hooks-config.sh` 的 `pipeline_hooks_config_identity` 先调用 GNU
  `stat -Lc '%i:%s'`，失败后回退 BSD `stat -f '%i:%z'`。
- 用 Ubuntu 非 root mode `0444` fixture 调用真实 `pipeline_prompt_skip_keyword`，
  先确认旧实现稳定回退 `no-tenon`，再确认修复后返回 `skip-tenon`。
- 验证：连续 3 次 Linux 最小复现均返回成功；macOS path/fd identity 保持一致。
- 回滚：revert helper 的单一变更。

此处建议 /clear。

## 子阶段 2：现有安全面回归

- 运行 `bash tools/test-hooks.sh`，要求 macOS 511/511。
- 在 Linux 非 root 容器运行同一 suite，确认原 13 个只读配置语义失败全部消失；把非 reaping
  容器 PID 1 的 zombie 观测与 GitHub runner 行为分开记录，不修改产品测试断言。
- 运行 `git diff --check`、受影响 bundle/release freshness 与完整 CI。

此处建议 /clear。

## 原型决策

最小 Linux 容器反馈环本身即一次性 portability prototype，已在正式修复前稳定复现，
无需新增产品原型或持久化代码。
