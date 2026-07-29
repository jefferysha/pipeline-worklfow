# Build 收敛审查

## 基线与范围

- 比较基线：`origin/main` / `445aa1411d45a2c112d296a9fc3530db0f62e31e`
- 能力：`codex-skill-receipt-current-turn`
- 实现：`codexToolProgram.ts`、`codexProjectIdentity.ts`、`codexTranscriptEvidence.ts`、CLI bundle
- 测试：`codexSkillReceipt.test.ts`、internal Skill gate 与 stable hook 集成
- 治理：本 Change 的 proposal、design、ADR、delta spec、plan、tasks 与 ledger

## Standards 轴

- 包边界：解析留在 CLI adapter，不向 kernel/domain 引入 host ABI。
- 复杂度：`codexTranscriptEvidence.ts` 为 497 行，低于 backend service 500 行门限。
- 兼容：保留 `transcriptExecCommands`，新增结构化 invocation 仅供需要 workdir 的调用方。
- 生成物：`npm run bundle` 已重建 `packages/cli/dist/tenon.mjs`。
- 第一轮 Verify finding：custom program 的文本扫描可能把注释、字符串、死代码或未等待调用误认成
  已执行读取（High）；sibling `workdir` 的相对路径可能按 verifier cwd 错误解析（High）；
  function ABI 缺 `workdir` 的负向用例被替换（Low）。
- 修复：解析器现在锚定完整规范 wrapper
  `const result = await tools.exec_command(<受限字面对象>); text(result);`；完整 nested result
  必须提供 `exit_code=0`，只转发 `.output`、额外代码、自造输出与非安全对象均失败关闭。
  sibling 身份要求绝对 `workdir`，并恢复旧 ABI 负向测试。
- 第三轮 Verify finding：output-only wrapper 会让外层成功遮蔽内部非零退出（High）；
  规格未固定完整 result/绝对 workdir（Medium）；JSON 数组选项被过度拒绝（P2）。
- 修复：custom ABI 只接受完整 result 转发；无退出码或任一非零退出均拒绝；delta spec、
  技术设计和 ADR 固定安全契约；JSON 仅校验 `cmd`/`command`/`workdir`，忽略其他纯数据字段。
- 复查 Finding：无未处理 Critical / High / Medium。

## Spec 轴

| Requirement | 实现/测试 |
| --- | --- |
| custom exec 显式 sibling worktree | 结构化 `workdir` + `explicitSiblingWorktreeTarget`；fallback 与 exact receipt 均有测试 |
| 缺 workdir/跨仓失败关闭 | custom ABI 拒绝测试 |
| 字面量与单 exec 限制 | 动态值、注释/字符串、死代码、未 await、自造 output、多调用拒绝；JSON/safe-object 覆盖 |
| sibling 项目身份 | 缺失/相对 workdir、跨仓拒绝；绝对目标 + common Git directory 接受 |
| 既有 trust/completion gate | 52 个 receipt 测试、9 个 DAG/hook 集成和 3 个 stable-hook 测试继续通过 |
| nested exec completion | output-only、无 exit code、非零 exit 均拒绝；完整 result + exit 0 接受 |
| 根 Skill 防回退 | `skillSources.test.ts` 固定 `text(result)`、禁止 output-only 与 exit-code 指导 |
| 首次调度同轮成功 | 临时 sibling worktree 的全新 Change 第一次 `document record` exit 0 |

Finding：无 Critical / High / Medium。

## 门禁结果

- `npx vitest run packages/cli/src/skillSources.test.ts packages/cli/src/codexSkillReceipt.test.ts packages/cli/src/internal-skill-gate-hook.integration.test.ts packages/cli/src/runtime/stable-hook.integration.test.ts`：85 passed。
- `npm run test:hooks`：512 passed。
- `npm run build`：通过；包含 web、server、CLI bundle。
- `bash tools/test-bundle.sh`：31 passed、0 failed；分发 bundle、N-1 兼容与文档 evidence smoke 通过。
- `npm run check:architecture`：通过。
- `npm run check:comments`：通过。
- `git diff --check`：通过。
- 最终 `npm test`：327 files passed；5743 tests passed、26 skipped。本轮 Docker daemon
  不可用导致 Docker 条件用例诚实跳过；real Codex 与缺少 Claude OAuth 的既有条件跳过同样单列，
  不把外部环境缺失记为代码通过。
- 第一轮 Verify 的失败报告保留在
  `docs/superpowers/reports/codex-skill-receipt-same-turn-verify.md`，证明发现经正式
  `verify-fail` receipt 回退 Build 后修复，而非静默覆盖。

## 剩余风险

无 schema 或状态迁移。主要兼容风险是未来 Codex 改变 tool-program 语法；当前策略会失败关闭并
保留“缺少 Skill 调用证据”提示，不会伪造 evidence。
