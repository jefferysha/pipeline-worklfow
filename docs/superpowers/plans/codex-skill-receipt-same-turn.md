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

- [x] 在 `packages/cli/src/codexSkillReceipt.test.ts` 增加 custom exec 从主 worktree
  显式指向 sibling worktree 的回归 fixture；先证明当前代码返回空 evidence。
- [x] 在 `packages/cli/src/codexToolProgram.ts` 以最小结构化 invocation 贯通 `cmd` 与
  `workdir`，在 `packages/cli/src/codexTranscriptEvidence.ts` 复用
  `explicitSiblingWorktreeTarget`。
- [x] 运行
  `npx vitest run packages/cli/src/codexSkillReceipt.test.ts`，确认新场景由红转绿且
  `CodexSkillRead` 落入测试 history。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：失败关闭与兼容矩阵

- [x] 为省略 workdir、非 sibling Git common directory、动态/不可解析 workdir、多个
  exec、failed/pending output 补拒绝测试。
- [x] 增加 output-only wrapper、nested 非零 exit、相对 workdir 的红灯测试，并以完整
  `text(result)` wrapper 作为唯一 custom ABI 成功路径。
- [x] 允许 JSON 中 `prefix_rule` 数组等非信任纯数据选项，同时只验证
  `cmd`/`command`/`workdir`。
- [x] 更新根 Tenon Skill 的 Codex 执行示例，明确 Skill 读取必须转发完整 exec result，
  防止后续定时任务继续生成不可审计 wrapper。
- [x] 保留 `transcriptExecCommands` 兼容入口，并运行既有 function/custom ABI 全量 receipt 测试。
- [x] 运行 CLI typecheck/build、`npm run test:hooks` 与 bundle，确认 hook/打包路径未漂移。

**子阶段边界：此处建议 /clear。**

## 子阶段 3：首次调度验收与交付

- [x] 从最新构建的 CLI 建立全新隔离 Change，在 custom ABI 首次读取后立即登记 Open 文档，
  验证无需第二用户轮次。
- [x] 以红灯固定完整结果信封、拒绝任意未标型对象与伪造 stdout JSON；只保留明确
  `execution_result` 的旧 ABI 兼容。
- [x] 以红灯固定 `payload.id` 精确 session 绑定、fork 继承 `session_id` 拒绝，以及
  malformed JSON / I/O 失败不回退旧 transcript。
- [x] 以红灯固定普通目录身份，拒绝通过符号链接才解析到目标的 `workdir`。
- [x] 运行 `npm test`、`npm run check:architecture`、`npm run check:comments` 及受影响
  集成门禁；记录真实结果。
- [ ] 完成 review、应用 spec、提交、推送、非草稿 PR 与 CI 检查。

**子阶段边界：此处建议 /clear。**

## 子阶段 4：第七轮安全收敛

- [x] 为 custom/function invocation 与 output ABI 错型配对增加红灯，并在 exact receipt 与
  fallback 两条路径保存、校验 invocation ABI。
- [x] 为带完整公开字段的未标型对象增加红灯，令 custom 完成判定只接受序列化当前信封或
  明确标型的旧 `execution_result`。
- [x] 为枚举阶段超预算后回退旧文件、目标与 `workdir` 同时使用祖先 symlink 别名增加红灯，
  将两条路径改为失败关闭。
- [x] 重新运行定向、hook、bundle、build、全仓测试和完整 pre-Verify 审查。

**子阶段边界：此处建议 /clear。**

## 子阶段 5：第八轮文件身份收敛

- [x] 令 direct project identity 与 sibling identity 共用普通物理目录约束，增加三方同一
  symlink 祖先别名的拒绝测试。
- [x] 在 transcript discovery 与消费之间绑定 device/inode/size/mtime/ctime，以
  `O_NOFOLLOW` 打开、有界读取并在解析后复核。
- [x] 增加候选替换、已打开文件增长以及 function invocation + custom output 的 exact/fallback
  双路径回归。
- [x] 重跑全仓门禁并取得无 Critical / High / Medium 的独立 pre-Verify 审查。

**子阶段边界：此处建议 /clear。**

## 子阶段 6：第九轮路径轮换与 exact 读取收敛

- [x] 读后重新打开 candidate path，并将其身份与原 fd/枚举快照同时比较，拒绝打开后
  rename/unlink + 原路径新 inode。
- [x] 令 exact receipt 与 fallback 共用 candidate 捕获、`O_NOFOLLOW` fd、固定读取长度、
  流回收及读后路径/元数据复核。
- [x] 增加打开后路径替换回归，并重跑 78 个 receipt 与 12 个真实 hook 集成。
- [x] 重跑全仓门禁并取得冻结指纹下无 Critical / High / Medium 的独立 pre-Verify 审查。

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
