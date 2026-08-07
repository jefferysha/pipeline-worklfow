---
change: skill-invocation-fd-anchor-linux
design-doc: docs/superpowers/specs/skill-invocation-fd-anchor-linux-design.md
locale: zh-CN
---

# 实施计划

## 范围与决策

仅修复 PR #34 的 Linux directory-FD alias 读取兼容性。无 HTTP DTO、ledger codec、写路径、依赖或 PR3/PR4/PR5 行为变化。现有失败 CI、锚点实现与 23 个定向测试已经消除“是否跑得通/模型是否成立”的关键未知，因此持续自主模式下保守决定不插入一次性 prototype。

## 阶段 1：Tracer bullet——打通可信 FD 到空 evidence

- [ ] 复核 `packages/server/src/serverSkillInvocationRoutes.ts`：只在打开目录 `fstat` 与 Change anchor dev/ino 相等、且 `traversableDirectoryFdPath` 可用时，把 identity 与 FD alias 同时传给 kernel；FD 在 await 完成后才关闭。
- [ ] 复核 `packages/kernel/src/skill-invocation/repository.ts`：默认分支调用原有普通读取器，显式 option 才调用 anchored 读取器，且 API 只新增 `{ dev, ino }` 能力。
- [ ] 运行 `npx vitest run packages/server/src/serverSkillInvocationRoutes.test.ts packages/kernel/src/skill-invocation/repository.test.ts`，期望注册 root 的空 ledger 返回 `state: empty`，路径 swap 返回 403/失败。

**子阶段边界：此处建议 /clear。**

## 阶段 2：安全栅栏与回归矩阵

- [ ] 复核 `packages/kernel/src/state/document-path.ts`：普通 parent `lstat` symlink 拒绝不变；anchored parent 通过 `parent/.` 解析后必须匹配 dev/ino；leaf 使用 `O_NOFOLLOW`。
- [ ] 复核 `packages/kernel/src/state/document-path.test.ts` 与 repository 测试：覆盖普通 alias 拒绝、正确身份成功、错误身份拒绝、读中 alias 重定向拒绝、option wiring。
- [ ] 运行三份定向测试并执行 `git diff --check`；任何身份/realpath/leaf 变化必须失败关闭。

**子阶段边界：此处建议 /clear。**

## 阶段 3：生成物与全量验证

- [ ] 运行 `npm run build` 重新生成 tracked `packages/server/dist/dashboard.mjs` 与 `packages/cli/dist/tenon.mjs`，确认只包含对应源变更。
- [ ] 运行 `npm run check:architecture`、`npm run check:comments`、`bash tools/test-bundle.sh` 及 phase skill 要求的相关门禁。
- [ ] 运行 `npm test -- --minWorkers=4 --maxWorkers=4`；记录通过/跳过数，外部凭证或 Docker skip 只作限制，不当作 pass。
- [ ] 对 `origin/main...HEAD` 加未提交修复做最终安全/正确性/契约审查，修复真实 Critical/High/Medium 问题。

**子阶段边界：此处建议 /clear。**

## 阶段 4：现有 PR 交付

- [ ] 应用 `skill-invocation-evidence` delta spec，提交源码、测试、bundles 和本 Change 治理文档到现有分支。
- [ ] 推送 `codex/task-planner-evidence-20260803`，等待 PR #34 当前 head CI；核对 base/head、非 draft、mergeability、reviews/comments/threads，不创建或合并 PR。

## 验证

- 三份定向测试：23 tests expected pass。
- `npm run build`、`npm run check:architecture`、`npm run check:comments`、`git diff --check`、bundle smoke/freshness。
- `npm test -- --minWorkers=4 --maxWorkers=4` 全仓受限 worker 套件。
- Tenon document/OpenSpec/check/review/transition gates 与 GitHub CI current-head conclusion。

## 回滚

回滚本修复提交即可恢复原路径读取行为；无数据迁移、schema 或依赖回滚。若 Linux CI 仍失败，保留 Change 在 Build/Verify 并修复，不放宽通用 symlink gate、不接受偏差、不改旧归档记录。
