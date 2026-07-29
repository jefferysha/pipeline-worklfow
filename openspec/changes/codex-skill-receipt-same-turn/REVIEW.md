# Build 收敛审查

## 基线与范围

- 比较基线：`origin/main` / `445aa1411d45a2c112d296a9fc3530db0f62e31e`
- 能力：`codex-skill-receipt-current-turn`
- 实现：`codexToolProgram.ts`、`codexProjectIdentity.ts`、`codexTranscriptEvidence.ts`、
  `codexTranscriptCompletion.ts`、CLI bundle
- 测试：`codexSkillReceipt.test.ts`、internal Skill gate 与 stable hook 集成
- 治理：本 Change 的 proposal、design、ADR、delta spec、plan、tasks 与 ledger

## Standards 轴

- 包边界：解析留在 CLI adapter，不向 kernel/domain 引入 host ABI。
- 复杂度：`codexTranscriptEvidence.ts` 为 457 行；独立的有界枚举模块
  `codexTranscriptDiscovery.ts` 为 75 行，均低于 backend service 500 行门限。
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
- 第五轮 Verify finding：custom output 曾允许从任意 stdout 文本提取 `exit_code: 0`（High）；
  fallback discovery 只绑定 session/visit，没有绑定最新 current turn（Medium）。
- 修复：custom completion 只接受完整 nested result 信封自身的顶层数值 `exit_code=0`，不递归解释
  stdout；legacy function ABI 保留独立兼容解析。fallback 只读取最新带 `turn_id` 的
  `turn_context`，优先用 transcript 自身 `payload.id` 绑定 host session，并在最新匹配 transcript
  结束查找；即使该文件畸形或读取中断，也不回退旧文件，防止旧 turn、fork 或 sibling transcript
  复用 evidence。
- 第六轮 Verify finding：部分 JSON 信封与任意 untyped 对象仍可能伪造成功（High）；
  fallback 可从父 session 继承 `payload.session_id`（High）；malformed JSON 与 transcript I/O
  未统一失败关闭（Medium）；指向 sibling worktree 的符号链接仍可能被接受（Medium）。
- 修复：current custom ABI 只接受具备非空 `chunk_id`、整数 `exit_code`、非负整数
  `original_token_count`、字符串 `output` 与有限非负 `wall_time_seconds` 的完整结果信封；
  legacy 兼容只接受显式 `execution_result`。fallback session 只绑定
  `session_meta.payload.id`；任何 malformed JSON 或 transcript I/O 都使本次发现整体失败关闭；
  command workdir 与目标 root 必须都是非 symlink 的普通目录、字面规范化路径相同且物理路径
  完全相同，因此最终路径或中间祖先含 symlink 都不能作为 sibling 身份证明。
- 第七轮 Verify finding：custom invocation 可与同 `call_id` 的 function output 错型配对
  （High）；具备完整公开字段的未标型对象仍可能伪造成功（High）；枚举阶段错误或超预算会
  跳过新文件后回退旧证据（Medium）；目标与 `workdir` 同时使用同一祖先 symlink 别名时仍
  被接受（Medium）。
- 修复：exact receipt 与 fallback 均保存 invocation ABI 并只接受同型 output；custom 完成
  只接受序列化当前信封或明确标型的 `execution_result`；枚举阶段的目录/候选读取失败及
  单文件超预算整体失败关闭，总预算只保留连续的最新前缀；项目字面路径必须等于物理路径，
  所以相同祖先别名也不能成为身份。枚举逻辑拆入 `codexTranscriptDiscovery.ts` 后通过架构门。
- 复查 Finding：无未处理 Critical / High / Medium。

## Spec 轴

| Requirement | 实现/测试 |
| --- | --- |
| custom exec 显式 sibling worktree | 结构化 `workdir` + `explicitSiblingWorktreeTarget`；fallback 与 exact receipt 均有测试 |
| 缺 workdir/跨仓失败关闭 | custom ABI 拒绝测试 |
| 字面量与单 exec 限制 | 动态值、注释/字符串、死代码、未 await、自造 output、多调用拒绝；JSON/safe-object 覆盖 |
| sibling 项目身份 | 缺失/相对 workdir、跨仓拒绝；绝对目标 + common Git directory 接受 |
| 既有 trust/completion gate | 67 个 receipt 测试、9 个 DAG/hook 集成和 3 个 stable-hook 测试继续通过 |
| nested exec completion | output-only、无 exit code、非零 exit 均拒绝；完整 result + exit 0 接受 |
| stdout/跨 turn 防伪 | plain/JSON stdout exact 与 fallback 均拒绝；新/malformed turn、旧 transcript 与 fork evidence 不可复用 |
| 根 Skill 防回退 | `skillSources.test.ts` 固定 `text(result)`、禁止 output-only 与 exit-code 指导 |
| 首次调度同轮成功 | 临时 sibling worktree 的全新 Change 第一次 `document record` exit 0 |
| invocation/output ABI 同型 | exact 与 fallback 均拒绝 custom invocation + function output |
| 枚举阶段失败关闭 | 新候选超 512 MiB 时不得接受旧 transcript |
| 祖先 symlink 身份 | 目标与 workdir 同时使用相同别名仍拒绝 |

Finding：无 Critical / High / Medium。

## 门禁结果

- `npx vitest run packages/cli/src/codexSkillReceipt.test.ts`：72 passed。
- `npx vitest run packages/cli/src/runtime/stable-hook.integration.test.ts packages/cli/src/internal-skill-gate-hook.integration.test.ts`：12 passed。
- `npm run test:hooks`：512 passed。
- `npm run build`：通过；包含 web、server、CLI bundle。
- `bash tools/test-bundle.sh`：31 passed、0 failed；分发 bundle、N-1 兼容与文档 evidence smoke 通过。
- `bash tools/test-adapters.sh`：272 passed；`npm run test:migration-cas`：13 passed。
- `bash tools/verify-skills.sh`：66 个路径、62 个 Skills 通过。
- `npm run check:default-workflow-freshness` 与 `npm run check:interaction-contract`：通过。
- `npm run check:architecture`：通过。
- `npm run check:comments`：通过。
- `git diff --check`：通过。
- 最终 `npm test`：327 files passed；5763 tests passed、26 skipped。本轮 Docker daemon
  不可用导致 Docker 条件用例诚实跳过；real Codex 与缺少 Claude OAuth 的既有条件跳过同样单列，
  不把外部环境缺失记为代码通过。
- 第一轮 Verify 的失败报告保留在
  `docs/superpowers/reports/codex-skill-receipt-same-turn-verify.md`，证明发现经正式
  `verify-fail` receipt 回退 Build 后修复，而非静默覆盖。

## 剩余风险

无 schema 或状态迁移。主要兼容风险是未来 Codex 改变 tool-program 语法；当前策略会失败关闭并
保留“缺少 Skill 调用证据”提示，不会伪造 evidence。
