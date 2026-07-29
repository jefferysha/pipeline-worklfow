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
