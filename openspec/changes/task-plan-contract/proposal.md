# 提案

## Why

现有 `tasks.md` 投影只有阶段、文本和完成态，无法稳定表达任务身份、验收覆盖、依赖和输入输出，自动拆分与可靠调度因此缺少机器契约。

## What Changes

新增版本化 TaskPlan/WorkItem 契约、确定性校验结果、legacy `tasks.md` 兼容投影和稳定只读 DTO，使后续 Dashboard 能展示所有计划状态。先修复长生命周期 Codex 安装中 transcript 超过 128 个时当前 host-session Skill receipt 无法发现的前置缺陷，同时保留元数据、字节、session、worktree 与文件身份安全边界。范围限于该治理前置修复以及 TaskPlan 领域模型、codec/validator 与投影；不在本 Change 中实现 Skill 执行、Workflow 配置、Dashboard 组件或调度器。

## Capabilities

### New Capabilities

`task-plan-contract`

### Modified Capabilities

无。

## Impact

影响 CLI Codex transcript discovery、kernel workflow/task 领域契约及其测试；旧 `tasks.md` 保持可读，legacy 输入不会被伪造出依赖或验收映射。
