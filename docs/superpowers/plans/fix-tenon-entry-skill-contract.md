---
change: fix-tenon-entry-skill-contract
design-doc: docs/superpowers/specs/fix-tenon-entry-skill-contract-design.md
locale: zh-CN
---

# 实施计划

## 阶段 1：曳光弹——从身份源打通入口到 doctor

> 子阶段边界：完成后建议 `/clear`。

- [ ] 在 `product/identity.json` 增加 `entrySkill: "tenon"`，扩展
  `tools/generate-product-identity.mjs`，一次生成 TypeScript 身份与 Codex managed block 模板。
- [ ] 让 `packages/cli/src/commands/doctor-skills.ts` 的 contract skills 从
  `PRODUCT_IDENTITY.entrySkill` 开始，补充 `packages/cli/src/commands/doctor.test.ts` 回归。
- [ ] 运行 `npm run generate:identity`、产品身份定向测试和 doctor 定向测试，证明最小链路
  “JSON 身份 → 生成常量 → doctor 发现根入口”打通。

## 阶段 2：统一所有投影与宿主安装态

> 子阶段边界：完成后建议 `/clear`。

- [ ] 将根 `AGENTS.md` 的 Tenon 哨兵块替换为生成模板内容；修改
  `adapters/codex/install.sh` 只读取该模板，并在 `tools/test-adapters.sh` 验证
  `tenon:tenon`、唯一 CLI 与哨兵外内容保留。
- [ ] 扩展 Codex 宿主 inventory 诊断，区分“当前根入口缺失”和“冲突工作流插件仍启用”；
  修复指引只使用宿主插件管理器，不直接修改 cache。
- [ ] 扩展 `tools/check-product-identity.mjs` 与 `tools/product-identity.node-test.mjs`，验证入口目录、
  frontmatter、完整 Skill 引用、AGENTS 新鲜度、adapter 模板消费和宿主冲突诊断。

## 阶段 3：仓库卫生、版本与分发闭环

> 子阶段边界：完成后建议 `/clear`。

- [ ] 复核 `tools/check-repository-hygiene.mjs` 对受版本控制路径与正文的摘要式受禁身份扫描，
  增加漏扫/大小写/错误输出不回显的回归，并确保根测试与 Release workflow 调用该门禁。
- [ ] 将 workspace、Codex/Claude plugin、Marketplace 与文档站版本统一推进到 `1.0.1`，
  更新中英文 release notes，并重新生成 CLI/server/dashboard/bundle。
- [ ] 在最终 payload、tracked paths 和 tracked text 上执行零残留扫描；验证 npm tarball 与
  GitHub Release 资产不包含内部研究、测试运行态或受禁身份。

## 阶段 4：Dashboard 显式项目上下文曳光弹

> 子阶段边界：完成后建议 `/clear`。

- [ ] 先在 `packages/dashboard-app/src/shell/dashboardLocation.test.tsx` 将
  `resolveDashboardRoot()` 的契约改为“无偏好或失效偏好返回无选择”，并在
  `packages/dashboard-app/src/App.test.tsx` 增加两个失败用例：有已注册项目但 URL 无 `root`
  时 URL 不被补 root、per-root API 零调用；失效 root 不回退首个项目且清除 `change`。
- [ ] 在 `packages/dashboard-app/src/shell/dashboardLocation.ts` 建立显式项目上下文解析，
  把 root 的规范化别名只用于验证已显式给出的选择，删除 `roots[0]` 默认值。
- [ ] 在 `packages/dashboard-app/src/App.tsx` 让 URL/用户动作成为选择的唯一写入口，移除
  `tenon-dashboard-root` 的自动恢复和 `okRoots[0]` 工作台回退；进度、自动运行、工作台在
  `none` 时统一展示或导航到项目总览，不发 per-root 请求。
- [ ] 覆盖项目被移除、浏览器前进/后退、显式选择、清除选择、非 Dashboard query 保留和单项目
  环境仍不自动选择，运行 Dashboard 聚焦测试证明红转绿。

## 阶段 5：曳光弹——宿主步骤期望状态对账

> 子阶段边界：完成后建议 `/clear`。

- [ ] 先在 `packages/cli/src/commands/release-coordinator.test.ts` 与
  `packages/cli/src/runtime/managed-release-journal.test.ts` 写失败用例：命令成功但 completed 写入
  失败后恢复不得重放；before 状态允许执行；desired 状态只补 checkpoint；第三状态 fail closed；
  旧 `started` WAL 缺少对账数据时 fail closed。运行定向测试确认按预期失败。
- [ ] 先在 `packages/kernel/src/state/document-ledger.test.ts` 写失败用例：经
  `requirements-changed` 回到 Spec 后，当前 `tenon-spec` 可以重新登记 ADR，而旧 producer、
  `--backfill` 和缺少当前 phase Skill evidence 均被拒绝；再把 `adr` 加入 Spec living-document
  policy。实现后受控回 Spec 更新本 ADR 并重建全部 read receipts。
- [ ] 在 `packages/cli/src/runtime/installer.ts` 定义可序列化 host step plan/observation/replay policy，
  在独立模块实现 codec 与三分支 reconcile domain policy；`managed-release-journal.ts` 只负责严格
  codec/原子持久化，`release-coordinator.ts` 只编排。
- [ ] 重构 `managed-host-command.ts`、`setupHost.ts` 与 `update.ts`：由宿主权威 inventory 生成稳定
  observation，mutation 前写 before/desired，恢复先 observe，执行后再次证明 desired；命令 stdout
  仅作诊断。运行 CLI/runtime 聚焦测试完成红→绿→重构。

## 阶段 6：Dashboard 事务身份曳光弹

> 子阶段边界：完成后建议 `/clear`。

- [ ] 先在 `dashboard.test.ts`、`dashboard-health.test.ts`、`release-coordinator.test.ts`、
  `packages/server/src/server.test.ts` 与 `preempt.test.ts` 写失败用例：普通同 release 服务在 probe
  窗口出现时不得 adopt/stop；同事务服务可在 journal 丢失后恢复；其他 transaction id fail closed；
  健康与 pidfile id 不一致不得收养。
- [ ] 将 transaction id 作为受管启动参数传入 `dashboard.ts`，经环境注入 `packages/server/src/main.ts`；
  扩展 health response、pidfile/preemption codec、`ManagedDashboardIdentity`、WAL 与
  `release-dashboard-coordinator.ts`，让 inspect/adopt/stop 精确匹配该 id。普通 dashboard 保持无 id。
- [ ] 运行 Server/CLI 聚焦测试和真实 18771 候选 smoke，证明事务服务可恢复、普通服务不被误接管、
  端口/pid/release/stateScope/transaction 五元身份一致。

## 阶段 7：持续授权契约与全链路收敛

> 子阶段边界：完成后建议 `/clear`。

- [ ] 对照 `normal-chat-routing` delta 回读共享 prompt classifier、session activation、
  review acknowledge 与生成式 Skill 交互块；补齐拒绝/修改优先、Change 隔离、撤销、exact event
  delegated receipt 的定向测试，禁止新增第二套解析器。
- [ ] 运行 `openspec validate fix-tenon-entry-skill-contract --strict`，在隔离副本演练
  archive/apply，证明新增 `plugin-runtime` delta 可应用且真实主规格 digest 不变。

## 阶段 8：Build→Verify 全量收敛契约

> 子阶段边界：完成后建议 `/clear`。

- [ ] 先在 `packages/kernel/src/flow/default-event-policy.test.ts`、`flow.test.ts`、
  `guard.test.ts` 和 CLI transition/integration 测试写红测：Build 的
  `pre_verify_review_result` 非 pass 时拒绝 `build-complete`；`spec-complete`、
  `requirements-changed`、`verify-fail` 均重置为 pending；pass 时才冻结。
- [ ] 在 `packages/kernel/src/types.ts` 末尾追加 `pre_verify_review_result`，为上一版本
  canonical revision 增加只接受精确尾字段缺失的兼容读取；同步 state init、field enum、
  default event policy、legacy guard、默认 workflow 模板/生成物和 Dashboard readiness 投影。
- [ ] 更新 `skills/tenon-build/SKILL.md`、`skills/tenon-verify/SKILL.md` 与
  `agents/tenon-reviewer.md`：Build 冻结前必须完整 diff/契约/发行门禁收敛；Verify Reviewer
  禁止窄 repair brief，所有并行轨完成后一次性聚合 findings；重试同时做旧 finding 回归和全 diff。
- [ ] 运行 canonical state 旧/新 fixture、default workflow freshness、guard/transition、
  Dashboard readiness 与 Skill/bundle 测试，证明新字段不会放宽损坏状态或跳过独立 Verify。

## 阶段 9：真实安装与交付

> 子阶段边界：完成后建议 `/clear`。

- [ ] 运行聚焦测试、`npm test`、`npm run test:web`、hook/adapter/Skill/bundle/oracle 全门禁。
- [ ] 从最终候选执行 `tenon update --codex` 与 `tenon setup --codex --auto-update -y`，
  新宿主会话验证入口 Skill 与阶段 Skill，`tenon doctor` 除未配置的可选 runner 凭证外无黄红。
- [ ] 在 `127.0.0.1:18765` 先打开无 `root` URL，证明不会自动进入任何项目；再显式选择当前
  项目，复验进度来源与自动运行来源隔离。随后提交推送，等待 CI，
  应用主规格、归档 Change，发布并验证 `v1.0.1`。

## 验证

- `npm run generate:identity && npm run check:identity`
- `node --test tools/product-identity.node-test.mjs tools/check-repository-hygiene.node-test.mjs`
- `npx vitest run packages/cli/src/commands/doctor.test.ts`
- `npx vitest run packages/kernel/src/flow/default-event-policy.test.ts packages/kernel/src/flow/flow.test.ts packages/kernel/src/flow/guard.test.ts packages/kernel/src/state/store.test.ts packages/cli/src/commands/transition.test.ts`
- `npx vitest run packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/dashboard.test.ts packages/cli/src/commands/dashboard-health.test.ts packages/cli/src/runtime/managed-release-journal.test.ts packages/server/src/server.test.ts packages/server/src/preempt.test.ts`
- `npx vitest run packages/dashboard-app/src/shell/dashboardLocation.test.tsx packages/dashboard-app/src/App.test.tsx`
- `bash tools/test-adapters.sh && bash tools/verify-skills.sh && bash tools/test-hooks.sh`
- `npm run build && npm test && npm run test:web && npm run oracle`
- `git ls-files` 驱动的路径/文本零残留扫描
- `tenon doctor --json`、`curl http://127.0.0.1:18765/api/health` 与真实浏览器验收

## 回滚

- 代码提交可用普通 Git revert 回退；不改写历史，不删除用户文件。
- managed runtime 使用已验证的 `tenon runtime rollback` 回到 previous release。
- pending host step 不做盲目自动回滚；before/desired 无法证明时保留 WAL 并返回 indeterminate，
  由诊断确认宿主 inventory 后再恢复。
- ADR 只通过修复后的 Spec living-document contract 重登记，不手改 `.pipeline-documents.json`；
  若新 policy 回滚，保留旧 ADR 并让 stale guard 失败关闭。
- 宿主插件登记只通过 Codex/Claude 官方插件管理器恢复；Tenon 不直接恢复或覆盖宿主 cache。
- Dashboard 提交失败时沿用现有原子补偿，恢复 selection、launcher 与上一健康进程。
- Dashboard 补偿只停止 transaction id 精确匹配的进程；普通或其他事务服务始终保留。
- Dashboard 项目上下文变更可用普通 Git revert 回退；不得通过恢复首项目 fallback 作为运行时兜底。
- 回滚 `pre_verify_review_result` 时必须同时回滚 FIELD_ORDER、旧 revision 精确兼容、默认 workflow
  guard/action 与 Skill/Reviewer brief；不得只删 guard 而留下被误读的 canonical 字段。
