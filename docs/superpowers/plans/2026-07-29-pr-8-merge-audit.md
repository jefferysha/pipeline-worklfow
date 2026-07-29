---
change: pr-8-merge-audit
design-doc: docs/superpowers/specs/2026-07-29-pr-8-merge-audit-design.md
---

# PR #8 Host Target Plan 合并与验证计划

## 前提与停止条件

- 固定审计对象：PR #8、head `942520bb`、base `main`。
- 采用独立 worktree、`preset=full`、普通 merge、TDD、持续授权。
- 任何 requirement 语义变化执行 `requirements-changed` 回 Spec。
- 任何 Verify finding 或 repo-zero 违规执行 `verify-fail` 回 Build；不接受偏差。
- 未取得精确 head CI、GitHub 零未处理 finding、合并后 main CI 前不得合并。

## 子阶段 1：Tracer bullet——当前主线上的一条端到端只读链路

1. 在审计分支普通合并最新 `origin/main`；记录双方 SHA、merge-base、冲突路径和逐项保留决策。
2. 解决 `Nav.tsx`/测试的源码冲突，先不手工保留生成物；从最终源码重建 CLI/server/Dashboard dist。
3. 用一个 Codex setup 计划纵向打通：
   - CLI `createHostTargetPlan/cmdHostTargetPlan`；
   - server fixed argv + strict decoder + GET；
   - Dashboard client/decoder + Host Plan ready/copy-only；
   - production browser 打开真实 Host Plan 页面。
4. 先运行最窄测试：
   - `packages/cli/src/commands/host-target-plan.test.ts`
   - `packages/server/src/serverGetHostTargetPlanRoutes.test.ts`
   - Dashboard hostPlan/API/App/Nav/location 测试。
5. 保存失败证据；只有链路真实贯通才进入横向加固。

此处建议 `/clear`。

## 子阶段 2：CLI 与当前 setup/update/runtime 真相收敛

1. 全文对照 `TENON_HOSTS`、native/adapter selector、`nativeInstallPlan`、`nativeUpdatePlan`、setup/update、managed runtime、事务/WAL 与 Dashboard handoff。
2. 为 12 hosts × 2 operations 建立确定性 truth table；覆盖 catalog、结构化 argv、步骤、notice、无 project/auth/env 读取。
3. 先写失败测试，再修复：
   - 重复/缺失/未知 host/operation/无 `--json`；
   - `display` 与结构化 argv 的明确 shell 展示语义；
   - Codex auth status 只作为预览步骤，不实际探测；
   - adapter `<project>` 占位与路径注入拒绝；
   - setup/update owner 漂移。
4. 检查触碰文件长度、包公开出口、领域/DTO 分离和无新增依赖。

验证：定向 CLI、`npm run build`、bundle smoke、现有 setup/update 全部测试。

此处建议 `/clear`。

## 子阶段 3：server 安全、严格 DTO 与有界 runtime

1. 核对 Host 守卫在路由前、GET-only、无 root/token 旁路、fixed argv 和准确状态码。
2. 对 query 缺失/空/重复/多余/unknown、混合 stdout、多余/缺失 DTO 字段、错误命令/顺序、非零 exit、throw、stderr/路径/token 做红测。
3. 对 25 canonical keys 验证：
   - 同 key in-flight sharing；
   - success-only bounded cache；
   - failure retry；
   - resolve/reject cleanup；
   - 不同 key 的并发上限/超时，无全局无界阻塞。
4. 若 `serverGetRoutes` 或 protocol 触及长度/职责上限，按 route adapter、DTO decoder、runtime 拆分，保持公开契约。
5. 使用真实 built CLI/server 在隔离 home 启动 API，记录 child argv、并发峰值、缓存次数、状态码与零写指纹。

验证：server 定向、API integration、全仓测试、build/server bundle、Host 403 与错误脱敏 smoke。

此处建议 `/clear`。

## 子阶段 4：Dashboard 状态、架构和 design-taste 修复

1. 保留当前主线 rail/route/已合并 view，解决 Host Plan 导航冲突；`App/shell` 只装配，API 只在 `src/api`，请求状态与视图留在 `hostPlan`。
2. 对 catalog/plan loading、empty、所有 error、retry、ready、host/operation 切换、旧 Promise、unmount、copy success/error 写红测并修复。
3. 检查 exact decoder 与 server/CLI truth table，避免宽松接受未知字段或错误步骤。
4. 强制运行 `frontend-design`、`web-design-guidelines`、`design-taste-frontend`：
   - 1440/1024/768/769/390；
   - zh/en、light/dark、reduced motion；
   - keyboard/focus/live status/ARIA/contrast；
   - 长命令、长文本、错误/空态、无 body overflow；
   - API 只读，无 Run/Execute。
5. 每个 C/H/M 先落失败测试或可复现浏览器证据，再修复并二次复审；正式 hashed assets 从源码重建。

验证：focused Web、`npm run typecheck:web`、`npm run test:web`、`npm run build:web`、production Chromium 与截图/trace。

此处建议 `/clear`。

## 子阶段 5：全量 Build 门禁与 pre-Verify 复审

1. 同步 README/CLI reference/Dashboard API/CONTRACT/TEST-REALITY/回滚事实，只写最终可证明行为。
2. 运行：
   - `npm ci`（仅隔离 clone）与 `npm audit`；
   - `npm run build`、`npm run typecheck:web`、`npm run test:web`、`npm test`；
   - comments、architecture、default workflow freshness、docs、templates、identity、repository hygiene、npx；
   - hooks、adapters、skills、bundle、migration CAS、golden oracle；
   - OpenSpec strict validation与隔离 archive/apply；
   - `git diff --check` 与生成物 freshness。
3. 独立完成 Spec、Rules/Architecture/Security、Dashboard visual/accessibility 三类 review；修复所有 C/H/M，记录 Low 或 reliability observation。
4. 将全部 Build tasks 勾选并登记，`pre_verify_review_result=pass`，提交并普通推送。
5. 等待 fresh exact-head GitHub CI 全部成功；若失败必须修复并产生新 head/新 CI，不能重用旧通过。

此处建议 `/clear`。

## 子阶段 6：冻结 Verify

1. `build-complete` 冻结精确 SHA，记录 base、路径清单、capability mapping 和 repo-zero 指纹。
2. 同时执行四轨：
   - Reviewer：全路径 Spec/Correctness/Rules/Architecture/Security；
   - E2E：CLI、Linux/Darwin API、hostile input、并发/缓存、OpenSpec 隔离、production browser；
   - Codex CLI read-only review；不可用时按 skill 明示 DEGRADED，不伪造 PASS；
   - Dashboard `design-taste-frontend` visual/accessibility/performance。
3. 报告必须列全部命令、pass/fail/skips、C/H/M/L、截图/trace、GitHub CI/reviews/comments/threads和共享指纹。
4. 只有所有适用轨道通过才请求并委托确认 `verify-pass`。

## 子阶段 7：Ship、合并、main CI 与 Archive

1. 隔离演练后应用 `host-target-plan` delta 到 canonical spec，记录 before/delta/after digest。
2. 完成最终 README/文档与 GitHub 审计，确认 PR OPEN、non-Draft、MERGEABLE/CLEAN、精确 head、零未处理 review/comment/thread。
3. 使用普通 merge commit 合并 PR #8，等待精确 merge SHA 的 main CI 全部成功。
4. 完成 Ship tasks/receipt，进入 Archive；核对 applied spec、合并可达性、子 Change、收据与 main CI。
5. canonical `archived` 后运行官方 OpenSpec `--skip-specs` 归档，提交并推送终态治理证据。
6. 把 post-merge archive commit 记录给后续 release Change；仅在 worktree 干净、远端同步、无独占提交且未占用时普通移除。

## 回滚

- 合并前：保留 PR open，修复审计分支；不 force push、不删除原分支。
- 合并冲突：中止未提交 merge，回到干净审计 head 后重新生成保留矩阵；不手工覆盖 canonical state。
- API/UI 回归：从最终合并源码回退 Host Plan 路由/view 与生成物的同一原子提交，保留诊断证据。
- 合并后 main CI 失败：停止后续 PR 与发布，保留 merge/CI 证据，开独立修复 Change；不篡改历史。
