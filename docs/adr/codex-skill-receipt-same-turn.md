# 架构决策记录

## 背景

Codex custom exec transcript 已包含执行目标 `workdir`，但 Tenon 只提取 `cmd`。当 session
从原工作树启动、命令执行于 sibling worktree 时，fallback receipt 无法证明项目身份。

## 决策

把 custom tool-program 解码结果从 command 字符串提升为受限的 invocation
`{ command, workdir? }`，并复用现有 `explicitSiblingWorktreeTarget`。只有字面对象、
单个 awaited exec、同一变量的完整 result 转发、绝对 workdir、目标物理目录相等且 Git
common directory 相同才接受。只转发 stdout 会丢失 nested `exit_code`，因此
`text(result.output)` 明确拒绝，规范 wrapper 为 `text(result)`。JSON 旁路字段作为纯数据
忽略，只验证 `cmd`/`command`/`workdir`。

## 备选方案

- 放弃 worktree 隔离：违反自动化并发安全要求。
- 按同仓任意目录放行：扩大证据信任边界。
- 等待下一用户轮次：不能满足无人值守调度。

## 后果

定时任务可在首次调度的同一轮完成 Skill evidence 登记；function/custom 两种 ABI 的项目
身份规则保持一致。解析失败和缺少显式 `workdir` 继续失败关闭。无需迁移状态或回填 ledger。
外层 custom tool 完成状态不再替代内部执行成功；只有可见的 nested `exit_code=0` 能产生 receipt。
