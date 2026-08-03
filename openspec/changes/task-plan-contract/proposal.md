# 提案

## Why

现有 `tasks.md` 投影只有阶段、文本和完成态，无法稳定表达任务身份、验收覆盖、依赖和输入输出，自动拆分与可靠调度因此缺少机器契约。

## What Changes

新增版本化 TaskPlan/WorkItem 契约、确定性校验结果、legacy `tasks.md` 兼容投影和稳定只读 DTO，使后续 Dashboard 能展示所有计划状态。revision store 公开并强制执行单文件、目录 entry、读取次数和累计字节预算，准备提交的 target 必须在写入前计入；逐字节幂等重试也必须先验证完整 lineage。先修复长生命周期 Codex 安装中 transcript 超过 128 个时当前 host-session Skill receipt 无法发现的前置缺陷，同时保留元数据、字节、session、worktree 与文件身份安全边界。范围限于该治理前置修复以及 TaskPlan 领域模型、codec/validator 与投影；不在本 Change 中实现 Skill 执行、Workflow 配置、Dashboard 组件或调度器。

## Capabilities

### New Capabilities

`task-plan-contract`

### Modified Capabilities

`codex-skill-receipt-current-turn`：扩展长生命周期 transcript discovery 的有界候选数量，并冻结
合法 `max_output_tokens` tool-program 的完成态证明语义；不放宽完整输出、phase/session/turn、
worktree、ABI 或文件身份校验。

## Impact

影响 CLI Codex transcript discovery、kernel workflow/task 领域契约、revision store 持久化上限及其测试；旧 `tasks.md` 保持可读，legacy 输入不会被伪造出依赖或验收映射。越过预算的新发布以 typed conflict 在零写入状态拒绝，已有超限或损坏历史以 typed corrupt 失败关闭。
