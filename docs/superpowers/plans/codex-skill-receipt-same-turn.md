---
change: codex-skill-receipt-same-turn
design-doc: docs/superpowers/specs/codex-skill-receipt-same-turn-design.md
locale: zh-CN
---

# 实施计划

## 范围与决策

修复只涉及 Codex tool-program 解码与 transcript discovery。已有现场 transcript 与单元
fixture 能确定性复现，不需要一次性 prototype；持续授权下采用不新增原型的保守选择。

## 子阶段 1：曳光弹——从真实 ABI 到 history

- [ ] 在 `packages/cli/src/codexSkillReceipt.test.ts` 增加 custom exec 从主 worktree
  显式指向 sibling worktree 的回归 fixture；先证明当前代码返回空 evidence。
- [ ] 在 `packages/cli/src/codexToolProgram.ts` 以最小结构化 invocation 贯通 `cmd` 与
  `workdir`，在 `packages/cli/src/codexTranscriptEvidence.ts` 复用
  `explicitSiblingWorktreeTarget`。
- [ ] 运行
  `npx vitest run packages/cli/src/codexSkillReceipt.test.ts`，确认新场景由红转绿且
  `CodexSkillRead` 落入测试 history。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：失败关闭与兼容矩阵

- [ ] 为省略 workdir、非 sibling Git common directory、动态/不可解析 workdir、多个
  exec、failed/pending output 补拒绝测试。
- [ ] 增加 output-only wrapper、nested 非零 exit、相对 workdir 的红灯测试，并以完整
  `text(result)` wrapper 作为唯一 custom ABI 成功路径。
- [ ] 允许 JSON 中 `prefix_rule` 数组等非信任纯数据选项，同时只验证
  `cmd`/`command`/`workdir`。
- [ ] 更新根 Tenon Skill 的 Codex 执行示例，明确 Skill 读取必须转发完整 exec result，
  防止后续定时任务继续生成不可审计 wrapper。
- [ ] 保留 `transcriptExecCommands` 兼容入口，并运行既有 function/custom ABI 全量 receipt 测试。
- [ ] 运行 CLI typecheck/build、`npm run test:hooks` 与 bundle，确认 hook/打包路径未漂移。

**子阶段边界：此处建议 /clear。**

## 子阶段 3：首次调度验收与交付

- [ ] 从最新构建的 CLI 建立全新隔离 Change，在 custom ABI 首次读取后立即登记 Open 文档，
  验证无需第二用户轮次。
- [ ] 以红灯固定完整结果信封、拒绝任意未标型对象与伪造 stdout JSON；只保留明确
  `execution_result` 的旧 ABI 兼容。
- [ ] 以红灯固定 `payload.id` 精确 session 绑定、fork 继承 `session_id` 拒绝，以及
  malformed JSON / I/O 失败不回退旧 transcript。
- [ ] 以红灯固定普通目录身份，拒绝通过符号链接才解析到目标的 `workdir`。
- [ ] 运行 `npm test`、`npm run check:architecture`、`npm run check:comments` 及受影响
  集成门禁；记录真实结果。
- [ ] 完成 review、应用 spec、提交、推送、非草稿 PR 与 CI 检查。

**子阶段边界：此处建议 /clear。**

## 验证

- 定向：`npx vitest run packages/cli/src/codexSkillReceipt.test.ts`
- 集成：`npx vitest run packages/cli/src/internal-skill-gate-hook.integration.test.ts`
- hooks：`npm run test:hooks`
- 全量：`npm test`
- 构建：`npm run build`
- 静态门禁：`npm run check:architecture && npm run check:comments`

## 回滚

回滚 `codexToolProgram` 的结构化 invocation 导出和 custom transcript 分支即可恢复旧行为；
无 schema、状态或 ledger 迁移。回滚后 sibling-worktree 自动化会重新需要第二轮，其他 ABI
与既有 receipt 不受数据兼容影响。
