---
change: pr-7-merge-audit
design-doc: docs/superpowers/specs/2026-07-28-pr-7-merge-audit-design.md
---

# PR #7 合并审计实施计划

## 原型决策

不插入一次性 prototype。PR #7 已有完整纵向实现和测试，当前未知是最新 main 的集成、职责边界与
真实验收，而不是可行性或数据模型。最小纵向切片直接用普通 merge + 组合测试暴露风险，更接近真实
交付且可通过 merge commit 回退。此持续授权下的保守决定不冒充用户再次选择。

## 子阶段 1：Tracer bullet——在最新 main 打通一个组合闭环

目标是在不先做横向重构的情况下，最早验证 kernel→CLI/server→Dashboard 以及 PR #6 composer 共存。

1. 执行普通 `git merge origin/main`，只解决
   `packages/dashboard-app/src/api/client.ts` 的源码冲突：同时保留 context bundle 与 verification
   evidence exports/type exports。生成物冲突暂按最终 build 重建，不手工认可任一旧资产。
2. 复核自动合并后的 `ProgressDrawer.tsx` 同时装配
   `ContextBundlePreview` `curStageExtra` 与 Verify 条件下的
   `VerificationEvidenceComposer` `documentsExtra`。
3. 在 `packages/dashboard-app/src/progress/ProgressDrawer.test.tsx`（或相邻既有测试文件）增加组合红测：
   Verify 同时可见两个工具，非 Verify 保留 preview 但不显示 composer。
4. 运行最小纵向命令：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts
   packages/dashboard-app/src/progress/ProgressDrawer.test.tsx
   packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx`，
   `npx vitest run packages/kernel/src/compress/ledger-context-bundle.test.ts
   packages/cli/src/commands/handoff.test.ts packages/server/src/contextBundleTrustedReader.test.ts`。

验收：组合红测先失败或证明旧缺口，修复后上述链路全部通过；无 unresolved conflict。

**子阶段边界：此处建议 /clear**

## 子阶段 2：职责拆分与 TDD 修复

1. 将 `packages/dashboard-app/src/progress/ContextBundlePreview.tsx` 拆成：
   - 同域请求/状态 hook（target、budget、abort、generation、retry）；
   - 同域 presentation 组件（form、summary、inputs、error）。
   保持 public props 和 i18n contract，不上移 `shared/`，不新增依赖。
2. 将 `packages/server/src/contextBundlePreview.ts` 中的 Change path anchor 与 safe HTTP DTO/error
   mapping 拆到同域 helper；handler 只做参数校验、root/Change binding、compiler 调用和 response。
3. 对每次职责拆分先运行现有测试确认行为固定，再做机械移动；不得顺便改变状态码、schema 或错误文案。
4. 审查 `packages/kernel/src/compress/ledger-context-bundle.ts` 与
   `packages/server/src/contextBundleTrustedReader.ts`。只有发现真实耦合/测试缺口才拆；否则记录其原子
   信任/编译边界理由。

验收：修改的普通组件/handler 回到规则建议线或有明确职责理由；公共 API 和 snapshot 无漂移；
`git diff --check` 通过。

**子阶段边界：此处建议 /clear**

## 子阶段 3：安全、架构与设计修复

1. 用 `security-review` 覆盖 Host/root/Change、canonical predecessor/TransitionRecord、ledger/source
   symlink/FIFO/UTF-8/上限、低预算、safe DTO 和客户端 hostile JSON。
2. 补足发现的负面测试，不得通过放宽校验解决失败。
3. 对运行 UI 执行第一次 `design-taste-frontend`：
   检查层级、密度、长 path、大数值、状态区、控件、明暗主题、中英文、1440/1024/390、
   focus/keyboard/reduced-motion 与抽屉滚动。
4. 修复所有发现，执行第二次 `design-taste-frontend`，记录 0 Critical/High/Medium 的结果和仍存在的
   Low/建议项。
5. 验证 Verify composer body portal、outside click、Escape、focus restore、draft/route 和预算预览
   状态互不干扰。

验收：架构依赖仍为 shell→domain view→api/shared，kernel 不依赖 Node/server/UI，server 不复制
policy；安全负面路径和第二次视觉审查通过。

**子阶段边界：此处建议 /clear**

## 子阶段 4：全量 Build 门禁、生成物与精确 head CI

按串行顺序运行并保存原始输出：

1. 定向测试：kernel compiler/run revision、CLI handoff、server trusted reader/route、Dashboard
   client/component/ProgressDrawer。
2. `npm run typecheck:web`、`npm run test:web`、`npm test`。
3. `npm run build`，确认 `packages/cli/dist/tenon.mjs`、
   `packages/server/dist/dashboard.mjs` 与 Dashboard `dist/` 来自最终源码且无 conflict marker。
4. `npm run check:comments`、`npm run check:default-workflow-freshness`、
   `bash tools/test-hooks.sh`、`bash tools/test-adapters.sh`、`bash tools/verify-skills.sh`、
   `bash tools/test-bundle.sh`、migration CAS 和 `npm run oracle`。
5. 检查 OpenSpec strict validation、repository hygiene、生成物 freshness 和 `git diff --check`。
6. 完成 Spec/Rules-Architecture-Security/Dashboard visual 的独立 pre-Verify review；所有
   Critical/High/Medium 必须修复并重跑受影响门禁。
7. 提交并普通 fast-forward push 原 PR 分支；等待该精确 head 的 GitHub CI 全绿，才完成 Build task、
   写 `pre_verify_review_result=pass` 并冻结 Verify SHA。

回滚：合并冲突或修复失控时保留普通 merge commit 前的可达 head；不得 reset/force push。生成物可从
源码重新构建。

**子阶段边界：此处建议 /clear**

## 子阶段 4.5：Verify-fail 规格与 UI 修复

1. 将已存在的五条 `context-bundle-budget-preview` requirement 按 OpenSpec 完整
   `MODIFIED Requirements` 语义重写，只把 Verify evidence 共存保留为 `ADDED Requirements`；
   在无 hardlink 的隔离 clone 中验证 archive/apply 成功。
2. 修正文档事实：`ContextBundlePreview.test.tsx` 为 16 例，
   `contextBundleTrustedReader.ts` 为 323 行并记录超过 300 建议线、低于 500 硬上限的凝聚性理由。
3. 对默认 workflow 的英文阶段/前进/回退标签先增加失败测试；实现必须显式区分 default 与 custom，
   默认使用 `phases.*`，custom 保留作者标签，不允许语言启发式。
4. 串行复跑 Dashboard 聚焦测试与全套 Web 测试，确认先前并行执行时的 focus timing 观察不再复现；
   若仍可确定复现则作为可靠性缺陷修复。
5. 重跑全量 Build、架构/安全/视觉审查、生成物与精确 head CI，再冻结新的 Verify SHA；旧冻结 SHA
   和旧 Verify 报告只作为失败证据，不得复用为通过结论。

验收：OpenSpec 隔离 archive/apply 通过；英文默认 workflow 不再出现中文阶段名；custom label
保持原样；文档计数与源码一致；所有受影响及全量门禁通过。

**子阶段边界：此处建议 /clear**

## 子阶段 4.6：最新版 OpenSpec 场景漂移恢复

1. 逐项比较 `openspec/changes/pr-7-merge-audit/specs/context-bundle-budget-preview/spec.md`
   中每个 `MODIFIED` requirement 与当前
   `openspec/specs/context-bundle-budget-preview/spec.md` 的 scenario 标题和完整正文。
2. 对存在漂移的 `Dashboard SHALL 提供可操作的完整预览状态` 使用当前主 spec 的完整 requirement
   语义，保留容量摘要、确定性输入清单、静态 loading、reduced motion、键盘和 i18n 场景；不改动
   其他已匹配 requirement，也不新增产品范围。
3. 先确认 `@fission-ai/openspec@latest` 在本轮解析为 `1.8.0`，再固定运行
   `npx --yes @fission-ai/openspec@1.8.0 validate pr-7-merge-audit --strict` 与仓库固定版检查；
   以独立解析确认所有主 spec scenario 均由 delta 保留，并分别用 1.6.0、1.8.0 隔离 archive。
4. 通过 `tenon document record` 重新登记 delta、tasks 与本计划，全文读取后执行 Spec 出口检查；
   仅在确切 `spec-complete` 人工回执后进入 Build。
5. current main 已存在的共存 requirement 必须作为完整 `MODIFIED` 处理，不得继续以重复 `ADDED`
   依赖新 CLI 的隐式 no-op；两版 archive 都必须成功，requirement/场景语义不得漂移。固定版
   1.6.0 重组相同 spec 时可能追加一个 EOF 空行，正式 apply 后须规范为单一末尾 LF，不把格式差异
   冒充产品语义变化或字节级 no-op。

回滚：只回退本次 delta、tasks 和计划的场景同步提交；不得删除、改名或弱化主 spec 的既有场景，
不得手改 canonical state 或 receipts。

**子阶段边界：此处建议 /clear**

## 子阶段 5：冻结 Verify、交付和归档

1. 在冻结 SHA 上并行完成 Reviewer、真实 E2E/API/浏览器、Codex CLI（允许 Skill 声明的诚实降级）和
   Dashboard visual/accessibility；包含 Linux success/empty/422/missing/retry 与 Darwin 501。
2. 映射全部冻结 diff 路径，验证 repo-zero、OpenSpec 隔离应用、精确 head CI 和 GitHub
   review/comment/thread 状态；失败走 `verify-fail → Build`。
3. `verify-pass` 后应用 `context-bundle-budget-preview` 主 spec，更新必要 README/CONTRACT/
   TEST-REALITY 与回滚说明；最终精确 CI 通过后使用普通 merge 合并 PR #7。
4. 等待 main-push CI；记录 merge SHA，完成 Ship→Archive、官方 OpenSpec archive、安全移除仅属于
   #7 且干净/已合并/无独占提交的 worktree。
5. 推送终态治理证据并更新 automation memory。

回滚：PR 合并前保留开放分支；合并后只通过后续修复/回滚 PR，不改写 main 历史。该能力无数据迁移。
