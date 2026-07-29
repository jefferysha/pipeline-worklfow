# 设计

## 初始假设

现场对照已确认问题位于 `packages/cli/src/codexToolProgram.ts` 与
`packages/cli/src/codexTranscriptEvidence.ts` 的 custom-tool ABI 边界。custom tool-program
只提取 `cmd` 而丢弃显式 `workdir`；session metadata 仍指向原工作树，导致合法 sibling
worktree 读取无法通过项目身份校验。原生 `function_call(exec_command)` 在同轮同目标成功，
排除了 Skill 路径、session binding、visit 时间与 output 完成态问题。

## 风险

- 过度放宽 shell program 识别会让包含无关或危险命令的复合调用被误判为 Skill 读取。
- custom wrapper 若只转发 stdout，外层 `Script completed` 会遮蔽内部非零 `exit_code`。
- 只按文件时间或最近 transcript 猜测会把其他线程/Change 的证据串入当前 Change。
- 只补单元测试而不复现首次 `tenon document record` 会遗漏 hook/CLI 集成差异。

## 待验证问题

- 安全对象解码器如何保留 `workdir`，同时拒绝表达式、模板字符串和多 exec program？
- 如何证明 output 来自同一个 awaited exec，并保留可验证的内部 `exit_code`？
- 新 ABI 复用 `explicitSiblingWorktreeTarget` 后，pending/failed output、越界路径、跨
  session 读取是否继续被拒绝？

## Explore 决策

采用结构化 invocation 解码、完整 nested result 转发与既有 sibling-worktree 校验。只接受
`const result = await tools.exec_command({...}); text(result);` 形状；output-only wrapper
失败关闭。JSON 解析仅校验 `cmd`/`command`/`workdir` 三个信任字段，其他纯数据选项不参与
证据判断。不修改 receipt journal、history schema、review gate 或 session binding。完整依据与测试矩阵见
`docs/superpowers/specs/codex-skill-receipt-same-turn-design.md` 和对应 ADR。

## Verify 后规格收紧

独立安全审查证明“存在 `exit_code=0`”仍不足以区分真实 exec result 与 stdout 中伪造的 JSON。
因此 current ABI 仅接受同时含 `chunk_id`、`wall_time_seconds`、`exit_code`、
`original_token_count` 与 `output` 的完整结果信封；旧 ABI 只接受明确标型的
`execution_result`。项目身份还要求字面 `workdir` 本身是普通目录，不能依赖符号链接。

transcript fallback 的 session 身份只来自 `session_meta.payload.id`，不再兼容可能由 fork
继承的 `payload.session_id`。最新候选一旦出现损坏 JSON 或读取 I/O 失败，整次 discovery
失败关闭并停止向旧 transcript 回退，避免从不完整的当前轮拼接旧证据。

第七轮安全审查进一步要求 invocation 与 output ABI 严格配对：custom 调用只能消费
`custom_tool_call_output`，function 调用只能消费 `function_call_output`，相同 `call_id`
不能跨 ABI 借用成功判定。失败关闭覆盖 transcript 枚举阶段；无法读取元数据、解析物理路径或
容纳最新候选时，不能跳过它再接受旧文件。项目根与 `workdir` 即使使用相同字面别名，也必须
证明该路径不含符号链接祖先。
