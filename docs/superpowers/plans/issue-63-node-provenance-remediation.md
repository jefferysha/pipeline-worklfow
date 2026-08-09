---
change: issue-63-node-provenance-remediation
design-doc: docs/superpowers/specs/issue-63-node-provenance-remediation-design.md
locale: zh-CN
---

# 实施计划

## 目标与约束

- 只修复 #63 冻结的 Node provenance pre-spawn replay；不处理 #44 失败报告中的其他 finding，不重置 #44 Review 2/2。
- 由且仅由一个 `luna_worker` 串行实施；根代理独占拆解、风险判断、代码审查、验收、Tenon transition、提交、推送、PR 与 CI。
- worker 不创建或替换 worktree，不提交或推送，不修改旧 Change/canonical state、本机插件或主 checkout PNG。
- 生产边界统一满足同步 `bash-proof → node-proof → verifier-spawn`；漂移必须早于 runner、child、host mutation、activation、Dashboard 与 ready evidence。

## 子阶段 1：native binding 与 package tracer bullet

- [ ] 在 `packages/cli/src/commands/native-host-command-binding.ts` 增加最小复合 provenance binding，使冻结 Bash 与 Node 在同一同步 spawn adapter 中复验。
- [ ] 将 `packages/cli/src/commands/packaged-assets.ts` 接到该边界，并保证 `--node` 精确使用刚复验的 executable。
- [ ] 在 `packages/cli/src/commands/native-host-command-binding.test.ts` 增加顺序、每次重放和 Node drift 负测；先跑该测试与相邻 package 测试。
- [ ] 子阶段完成后压缩 worker 上下文，再进入 update/setup。

## 子阶段 2：update 与 setup 生命周期

- [ ] 将 `packages/cli/src/commands/update-candidate-verification.ts` 接到复合 binding。
- [ ] 将 `packages/cli/src/commands/setupSkills.ts` 收敛到冻结 Bash 启动完整 `tools/verify-skills.sh`，移除生产路径对未绑定 `process.execPath` 的直接信任。
- [ ] 调整 `packages/cli/src/commands/setup.ts`，让首个 native host mutation 前冻结的 lifecycle environment 贯穿 `finishSetup` 与 skills 验证。
- [ ] 在 `packages/cli/src/commands/setup.test.ts` 与 `packages/cli/src/commands/update.test.ts` 覆盖 proof 顺序、Node drift 零 child/零 mutation、v1.0.1/v1.0.2 兼容；完成后压缩 worker 上下文。

## 子阶段 3：release-store runtime seam

- [ ] 修改 `packages/cli/src/runtime/release-store.ts`：provenance Bash 同步 replay Bash+Node；普通 Bash 只 replay Bash；直接 Node 只 replay Node。
- [ ] 复用 `release-payload.ts` 已有参考顺序，不复制新的信任模型或改变 selection/launcher schema。
- [ ] 在 `packages/cli/src/runtime/release-store.integration.test.ts` 覆盖每次 spawn proof、Node drift 时 selection/launcher/previous release 不变、v1.0.1/v1.0.2 与 rollback 兼容；仅必要时修改 `release-payload.test.ts`。完成后压缩 worker 上下文。

## 子阶段 4：Doctor production probe

- [ ] 新建 `packages/cli/src/commands/doctor-probes.ts`，把 production Doctor probe wiring 从 `packages/cli/src/main.ts` 提取为可注入、可测试 adapter。
- [ ] Doctor provenance probe 使用冻结 Bash+Node 复合 replay；保持 `DoctorProbes` 公共契约和 CLI 输出不变，并使 `main.ts` 不超过 400 行。
- [ ] 新增 `packages/cli/src/commands/doctor-probes.test.ts`，必要时更新 `doctor.test.ts`/`doctor-product-identity.test.ts`，覆盖顺序与 drift 零 spawn。

## 子阶段 5：bundle 与 worker 停写交接

- [ ] 运行定向测试、相关 typecheck/build 与 `npm run bundle`，同步 `packages/cli/dist/tenon.mjs`。
- [ ] worker 停止写入并回传变更范围、定向命令与原始结果；worker 不做正式 Review、不运行一次性完整最终门、不给验收 verdict。

## Worker 文件边界

生产文件仅限：

- `packages/cli/src/commands/native-host-command-binding.ts`
- `packages/cli/src/commands/packaged-assets.ts`
- `packages/cli/src/commands/update-candidate-verification.ts`
- `packages/cli/src/commands/setupSkills.ts`
- `packages/cli/src/commands/setup.ts`
- `packages/cli/src/runtime/release-store.ts`
- `packages/cli/src/main.ts`
- 新增 `packages/cli/src/commands/doctor-probes.ts`

测试文件仅限：

- `packages/cli/src/commands/native-host-command-binding.test.ts`
- `packages/cli/src/commands/setup.test.ts`
- `packages/cli/src/commands/update.test.ts`
- `packages/cli/src/runtime/release-store.integration.test.ts`
- 必要时 `packages/cli/src/runtime/release-payload.test.ts`
- 必要时 `packages/cli/src/commands/doctor.test.ts`
- 必要时 `packages/cli/src/commands/doctor-product-identity.test.ts`
- 新增 `packages/cli/src/commands/doctor-probes.test.ts`

生成文件仅限 `packages/cli/dist/tenon.mjs`。canonical Change 文档与任务记录由根代理维护。

## 根代理验收

- 逐文件审查 worker diff，确认无范围外修改、无 pathname-only 信任回退、无 proof/spawn 间隙、无旧 Change 状态变更。
- 复跑按 package/update/setup/release-store/doctor 划分的定向矩阵，以及 typecheck、bundle diff/行数/架构守卫。
- Build readiness 必须先穷尽定向矩阵；发现缺陷时只向同一个 worker 发有界返工，不创建第二个 worker。

## 正式 Review 与最终门

- #63 正式 Review 总上限为 2；换 skill 或 agent 不重置。测试、E2E 与 fixture/docs-only 修订不计 Review。
- 只在根代理确认稳定候选后运行一次完整最终门，范围以 `.github/workflows/ci.yml` 的本地可执行 truth 为准；真实 Codex secret lane 若本地不可用须如实记录。
- 若 Review 2/2 仍失败，保留 exact attempt evidence、停止循环并将 Change 标记 blocked。

## 原型决策

不制作 UI/交互原型。问题是已有 `TrustedExecutable` 原语与 `release-payload.ts` 参考实现之间的确定性调用边界缺口；最小 tracer bullet 与 drift 负测比临时原型提供更直接的风险证据。

## 验证

- proof 顺序：每次 provenance spawn 可观察为 `bash-proof,node-proof,verifier-spawn`。
- fail closed：Node drift 时 runner/child 为零，host/selection/launcher/activation/Dashboard/ready/success evidence 不变。
- 兼容：v1.0.1/v1.0.2、previous release rollback 与现有 Doctor/CLI contract 保持。
- 分发：源码与 tracked bundle 一致，clean-install/packaged-assets/update/setup/doctor 路径不分裂。

## 回滚

- 源码修复可通过单一提交回退；不写 registry migration、不更改 schema、不发布或激活新版本。
- drift 负测若暴露调用面遗漏，回到同一 worker 的对应子阶段修复，不通过放宽 proof 或恢复 pathname-only seam 规避。
