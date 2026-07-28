# PR #6 合并审计实施计划

change: pr-6-merge-audit
design-doc: docs/superpowers/specs/2026-07-28-pr-6-merge-audit-design.md
delta-spec: openspec/changes/pr-6-merge-audit/specs/verification-evidence-composer/spec.md

## 目标与边界

把 PR #6 的验证证据编排器与最新 `origin/main` 通过普通 merge commit 集成，解决共享
`Dialog` 与 Dashboard 生成物冲突，保留原功能与最新 UI 系统语义，并在新 exact head 上重新完成
本地、真实浏览器和 GitHub 门禁。不得强推、执行草稿命令、写可信验证状态、改变 gate、引入依赖或
扩大功能。

## Assumptions / Decision Log

- 采用 ADR 的普通 merge commit 方案；rebase/force push 和重建 PR 均排除。
- B3 原型决策：不插入一次性 prototype。原因是未知已由 `git merge-tree` 精确缩减为两个冲突，
  kernel/API/UI 均有可运行实现与测试；原型不会降低剩余的集成风险，真实 merge + TDD 更直接。
- 最新 main 若在 push 前再次前进，先重新 fetch 和 merge-tree；有新冲突则在同一 Build 子阶段
  处理并重跑全部受影响门禁。
- 旧 PR CI 和原 Change PASS 仅作为基线，不充当新 head 的 Verify 证据。

## 子阶段 1：纵向曳光弹——合并 main 并跑通最小端到端链路

目标：用一次普通 merge 同时打通 kernel → protected route → client → Verify UI → production
bundle，尽早暴露共享层集成问题。

1. 重新固定远端身份。
   - 执行 `git fetch origin main codex/verification-evidence-composer-20260728-121335`。
   - 用 `gh pr view 6` 确认 PR 非 Draft、head 未被第三方改变；记录最新 base/head。
   - 用 `git merge-tree --write-tree origin/main HEAD` 复核冲突集合。
   - 若远端 head 已前进，停止使用旧 SHA，重新审查新增 diff 后才继续。
2. 执行 `git merge --no-ff origin/main`。
   - 不使用 rebase、`--force` 或 `--force-with-lease`。
   - 冲突期间不提交半成品。
3. 语义解决 `packages/dashboard-app/src/shared/Dialog.tsx`。
   - 导入并渲染 `lucide-react` 的 `X`。
   - 保留 `closeLabel` prop 与 locale 调用方。
   - 保留 Escape 的 `preventDefault()`、`stopImmediatePropagation()` 与 topmost stack。
   - 保持 default/workspace panel、focus trap、backdrop 和 focus restore 公共契约。
4. 保留 `packages/dashboard-app/src/progress/useProgressDrawer.ts` 的两组并发语义。
   - nested `[role="dialog"][aria-modal="true"]` 存在时不处理 Tab/Escape。
   - close tween 使用最新 main 的 ease-out，不回退为 ease-in。
5. 先补/更新冲突回归，再构建生成物。
   - `packages/dashboard-app/src/shared/Dialog.test.tsx`：本地化 label、Lucide、单次 Escape。
   - `packages/dashboard-app/src/verification/VerificationEvidenceComposer.test.tsx`：
     内外层、焦点归还、双向 Tab 和字段保留。
   - `packages/dashboard-app/src/progress/ProgressView.test.tsx`：nested modal 让渡与 ease-out。
   - 执行定向 Vitest；再运行 `npm run build:web`、`npm run build:server` 和
     `npm run build:cli`，由构建解决 `dist/index.html` 与 bundles。
6. 运行最小端到端回归。
   - kernel composer 测试。
   - server compose route 测试。
   - client decoder/client 与 composer 组件测试。
   - 启动真实 server，用带 token 的请求确认 200、400、401 和 state/ledger 零变化。

验收：合并冲突清零，工作树没有 conflict marker；最小 kernel/API/UI/构建链路全部通过；
生成 HTML 只引用存在的新 assets。

**子阶段边界：此处建议 /clear**

## 子阶段 2：规则、架构和全量回归

1. 静态与规范门禁。
   - `git diff --check origin/main...HEAD`
   - `npx openspec validate pr-6-merge-audit --strict`
   - `npx openspec validate verification-evidence-composer --strict`
   - `npm run check:architecture`
   - `npm run check:comments`
   - 仓库已有 docs、repository hygiene、identity 和 default-workflow freshness 检查。
2. 全量前后端验证。
   - `npm run typecheck:web`
   - `npm run test:web`
   - `npm test`
   - `npm run build`
   - 记录既有 React `act(...)` 或 Vite chunk warning，但不得将 warning 隐藏或伪报为零。
3. 分发面验证。
   - `bash tools/test-hooks.sh`
   - `bash tools/test-adapters.sh`
   - `bash tools/verify-skills.sh`
   - `bash tools/test-bundle.sh`
   - 只运行仓库实际存在的命令；外部环境不可用时记录精确失败与替代证据。
4. 回读文件与公共契约。
   - kernel 只能从公开 index 导出；server 不深导入内部实现。
   - API path、鉴权顺序、status/envelope 与 client decoder 一致。
   - UI 仅 Verify 可见，zh/en 完整，文件长度和 feature/shared 边界合规。
   - README、capability、ADR、计划、原验证报告和 PR body 不承诺自动执行或可信通过。

验收：所有适用的仓库门禁成功；无 Critical/High/Medium/Low 未处理 finding；任何失败先修复并
重跑同层及全量受影响门禁。

**子阶段边界：此处建议 /clear**

## 子阶段 3：真实浏览器、pre-Verify 复审与非强制 push

1. 启动正确构建的 Dashboard server。
   - 验证页面标题、API version、root 与 Change 均属于目标 worktree。
   - 使用新的隔离端口，不接受其他应用占用端口的页面。
2. 覆盖桌面和移动、亮色和暗色、reduced-motion。
   - Verify-only 入口、空态、添加/删除、kind/status 条件字段。
   - 客户端校验、真实 server 400、网络失败、loading、防重复提交、成功与复制失败。
   - 未鉴权 401；相同输入输出确定性；canonical state/ledger 前后不变。
   - 单 Escape 只关闭 composer，外层 TaskDetail/URL 保留并归还焦点。
   - 正向/反向 Tab 不逃逸；关闭按钮 icon、label、焦点 ring 和窄屏无横向溢出。
3. 独立 pre-Verify 审查。
   - standards reviewer：COMMON/FRONTEND/BACKEND、架构、文件长度、安全和兼容。
   - spec reviewer：两条 MODIFIED requirements 与每个 changed file 映射。
   - visual reviewer：桌面/移动、亮暗、状态矩阵、键盘与 motion。
   - 所有 finding 修复后让原 reviewer 复审，不以新 reviewer 稀释原结论。
4. 提交审计修复与治理文档。
   - commit message 明确 main integration 与 findings。
   - 仅执行普通 `git push origin HEAD:codex/verification-evidence-composer-20260728-121335`。
   - push 后确认远端 head 与本地 exact SHA 一致。

验收：真实浏览器矩阵通过，三组独立复审全零，PR head 由非强制 push 更新。

**子阶段边界：此处建议 /clear**

## 子阶段 4：冻结 Verify、GitHub CI 与合并

1. 用干净 committed SHA 设置 `build_sha`，冻结 reviewer、Codex、E2E、视觉四轨输入。
2. 在隔离副本运行 OpenSpec show/strict/apply 演练并证明真实主规格 digest 不变。
3. 生成 `docs/superpowers/reports/2026-07-28-pr-6-merge-audit-verify.md`，逐文件回读
   requirement、测试、截图和回滚证据。
4. 取得 exact `verify-pass` 委托 review receipt，进入 Ship。
5. Ship 应用审计 delta，逐项复核 README/docs/回滚并登记 `applied-spec`。
6. push Ship/Archive 证据到审计分支；对原 PR 分支只推产品与审计所需提交。
7. 显式等待新 PR head 的所有必需 GitHub checks 成功，重新确认无 review thread、
   `mergeable=MERGEABLE`、base 仍是最新 main。
8. 执行 `gh pr merge 6 --repo jefferysha/tenon --merge`；不使用 `--auto`。
9. 等待 merge SHA 对应的 main CI 成功；失败则报告并不继续发布链。

验收：GitHub 明确记录 merge commit，新 head 与 main CI 都成功，Change 可进入 Archive。

**子阶段边界：此处建议 /clear**

## 子阶段 5：归档与安全清理

1. 以 Tenon Archive phase 归档 `pr-6-merge-audit`，保留完整 state、ledger、review 和报告。
2. 将归档提交 push 到批量 release 分支，确保后续 release PR 把审计证据带回 main。
3. 对原 PR worktree 执行只读安全审计：clean、无未推送 commit、无进程/任务占用、路径精确。
4. 仅在全部条件满足时使用普通 `git worktree remove <exact-path>`；否则保留并报告。
5. 更新 `/Users/a1234/.codex/automations/tenon-pr-2/memory.md` 的 PR #6 head/base、
   findings、验证、merge SHA、CI 与 cleanup 事实。

## 回滚

- Build 尚未 push：普通 merge commit 可在本地可恢复地回退，但不得使用破坏性 reset 清除用户改动。
- push 尚未 merge：继续保留 PR 并提交最小修复；不强推。
- merge 后：以 GitHub merge SHA 整体 revert；本能力无 schema/data migration。
- 任一真实门禁阻断：停止 PR 合并，保留 worktree、Change 与远端证据，准确报告阻断。
