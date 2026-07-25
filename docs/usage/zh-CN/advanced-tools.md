# 高级工具

本页介绍 Channel、Memory bridge、Tap 和 Handoff。它们用于兼容、观测和上下文管理，不是 default workflow 的必需入口。

## Channel

Channel 提供受控 worker 消息和 supervisor 能力。provider、timeout、inbox policy 和并发必须来自显式配置。不要把任意 agent 文本当成可执行路径或命令。

## Memory bridge

Memory bridge 是只读上下文入口，用于恢复经过筛选的历史知识。它不应自动写入用户记忆，也不能替代当前仓库和 Change 的真实文档。

## Tap

Tap 是显式 opt-in 的本地诊断工具，可能捕获 prompt、header、token 或 CA 相关材料。启用前确认数据范围、存放位置、保留期限和清理方式。

## Handoff

```bash
pipeline handoff <change> --json
```

Handoff 压缩当前阶段的状态、计划和证据路径，帮助新上下文恢复。它不创建新事实，也不能用摘要替代需要全文读取的受治理文档。

## 使用原则

1. 默认关闭；
2. 明确目的和退出条件；
3. 最小权限、最小数据；
4. 诊断后清理；
5. 不把兼容工具描述成所有宿主的原生保证。

## 排查

先用 `pipeline doctor --json` 查看能力是否真实启用，再检查 provider、文件权限和敏感数据边界。未知状态应 fail-loud，而不是静默降级后声称成功。

## 适用性矩阵

| 工具 | 默认状态 | 适用场景 | 不能替代 |
| --- | --- | --- | --- |
| Channel | 关闭 | 受控 worker 通信 | workflow 与 review |
| Memory bridge | 只读 | 历史线索恢复 | 当前仓库事实 |
| Tap | 关闭 | 短期本地诊断 | 常规日志 |
| Handoff | 按需 | 上下文切换 | 全文 document read |

Channel 消息仍然是不可信输入，进入 CLI、文件路径或 shell 前必须结构校验。

历史记忆可能过期。涉及代码、端口、版本、状态和外部系统时，都应回到当前工作区重新验证。

Tap 不应在 CI、共享终端或公开演示中默认启用。诊断完成后停止捕获并清理敏感副本，报告只保留脱敏结论。

Handoff 会沿用 Change 固定语言，但 phase id、路径和 digest 不翻译。接收方仍需运行 `pipeline document read <change> all`。

## 配置边界

provider、预算、并发、超时和数据目录应显式声明。缺失配置时 fail-loud，不能偷偷切换 provider、无限重试或扩大收集范围。

持续授权不自动授权：

- 新外部 provider；
- 付费调用或预算提升；
- 向真实用户发送消息；
- 发布诊断数据；
- 修改生产环境。

## 排查顺序

```bash
pipeline runtime status
pipeline doctor --json
pipeline status <change> --json
pipeline handoff <change> --json
```

Handoff 与文件冲突时，以当前仓库和 document ledger 为准。Tap 体积异常时立即停止捕获。Channel 堵塞时检查 inbox policy 和 timeout，不能用无限并发掩盖背压。

## 审计要求

最终报告应写明高级工具是否启用、处理哪些数据、留下哪些文件以及如何清理。没有运行的能力不能写成已验证，没有宿主原生支持的功能不能用兼容层冒充。
