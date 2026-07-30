---
change: canonical-state-version-status-20260730
design-doc: docs/superpowers/specs/2026-07-30-canonical-state-version-status-design.md
---

# Canonical State Version Status 实施计划

## 原型决策

不插入一次性 prototype。风险已被现有 `parseRunRevision`、`buildSnapshot`、`decodeSnapshot` 与
`useSnapshot.refresh` 边界直接约束，TDD 的第一个纵向测试可以用真实 canonical fixture 打通所有层；
额外原型不会回答新的架构问题。该选择在持续授权下采用最小、可逆默认值。

## Build 子阶段 1：曳光弹——未来版本从 kernel 到 Progress

目标：用一个真实 `schemaVersion: 2` fixture 纵向打通 typed error → snapshot issue → Dashboard notice
→ refresh，不先横向完成所有变体。

1. 在 `packages/kernel/src/state/run-revision-codec.ts` 与
   `packages/kernel/src/state/run-revision-store.test.ts` 先写失败测试，再加入支持版本常量与 typed error；
   验证未来版本即使含新增顶层字段也失败关闭，命令：
   `npx vitest run packages/kernel/src/state/run-revision-store.test.ts`。
2. 在 `packages/server/src/types.ts`、`packages/server/src/snapshot.ts` 与
   `packages/server/src/snapshot.test.ts` 加入 optional issue 投影与 mixed-project 测试；验证可读 Change
   共存、未来 Change 不计数且无路径泄露，命令：
   `npx vitest run packages/server/src/snapshot.test.ts`。
3. 在 `packages/dashboard-app/src/types.ts`、`api/snapshotDecoder.ts`、
   `progress/CanonicalStateVersionNotice.tsx` 和 `ProgressView.tsx` 接入最小 notice 与 refresh；
   先以组件/decoder 测试证明链路，命令：
   `npm run test:web -- --run packages/dashboard-app/src/api/boundaryDecoders.test.tsx packages/dashboard-app/src/progress/CanonicalStateVersionNotice.test.tsx`。

此处建议 /clear

## Build 子阶段 2：边界、双语与 Shell 空态

1. 扩展 kernel 测试覆盖坏 JSON、字符串、分数、不安全整数和低版本，保证仍为 corruption。
2. 扩展 server 测试覆盖普通 corruption 与 future issue 分流、多个 issue 稳定排序和 generic error 不变。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加成对 zh/en key；组件覆盖 empty、loading、
   retry、多个 issue 与两种语言。
4. 修改 `packages/dashboard-app/src/App.tsx` 并在 `App.test.tsx` 证明 compatibility issue 优先于
   no-change Onboarding；在 `boundaryDecoders.test.tsx` 覆盖缺失字段兼容及所有畸形 issue fail-closed。

验证：
`npx vitest run packages/kernel/src/state/run-revision-store.test.ts packages/server/src/snapshot.test.ts`，
`npm run typecheck:web`，`npm run test:web`。

此处建议 /clear

## Build 子阶段 3：收敛、文档与冻结候选

1. 审查完整 diff 的包边界、安全、兼容、加载/空/错误状态和中英文文案；修复所有
   Critical/High/Medium finding。
2. 运行 `npm run build:web`、`npm run build`、`npm test` 及受影响 hooks/adapters/bundle 门禁；任何会
   写 tracked 生成物的命令必须在冻结前完成。
3. 将 tasks 勾选为真实完成状态，执行 Tenon Build 文档回执和 pre-Verify convergence，冻结唯一
   `build_sha`。

回滚边界：删除 optional DTO、typed error 分支与 notice 即可恢复原行为；无数据迁移、无状态写入、
无依赖变更。

此处建议 /clear

## Build 子阶段 4：第二次 Verify 返工——有界截断与本地化恢复

1. 先在 `packages/server/src/snapshot.test.ts` 写 101 项失败回归：期望前 100 项、
   `compatibilityIssuesTruncated: true`、无普通 `error` 且可读 sibling 保留；在 Dashboard boundary
   测试中先证明合法截断被接受，`false`、错误类型和少于 100 项的截断声明被拒绝。
2. 在 selection/Progress/App/Machine 测试中先写失败回归：截断项目保持只读可导航并显示双语省略提示；
   Machine 不把 compatibility-only 项目误报为损坏，仍扫描 readable sibling。
3. 在 `useSnapshot`、`App` 与 Progress 错误态测试中先写英文 503 失败回归：不展示中文服务端 message，
   展示本地化 status 与 `Retry loading`，键盘点击后复用既有 refresh 恢复。
4. 加入最小 shared DTO、server aggregation、strict decoder、i18n 与 presentation 实现；运行定向
   server/Dashboard 测试和 `npm run typecheck:web`，保持红→绿→重构证据。

验证：
`npx vitest run packages/server/src/snapshot.test.ts`，
`npm run test:web -- --run packages/dashboard-app/src/api/boundaryDecoders.test.tsx packages/dashboard-app/src/machine/MachineView.test.tsx packages/dashboard-app/src/App.test.tsx`，
`npm run typecheck:web`。

此处建议 /clear

## Build 子阶段 5：第三次冻结前全量收敛

1. 更新 `docs/CONTRACT.md` 与生成资产，完整审查相对 `origin/main` 的全部实现、配置、文档与 capability。
2. 运行 web 及 repo 全量测试、build、typecheck、hooks/adapters/bundle/oracle、OpenSpec strict 和
   `git diff --check`；修复全部 Critical/High/Medium。
3. 将本次返工 tasks 勾选，重新登记 Build 文档，完成独立 convergence review 后冻结新的唯一 SHA。

回滚边界：移除 optional truncation metadata 与 presentation-localized retry 即恢复上一冻结行为；
不涉及迁移、状态写入、新 endpoint 或依赖。

## Verify

1. Reviewer/Codex/E2E/视觉轨基于同一冻结 SHA 独立审查；所有轨前后 workspace fingerprint 一致。
2. 在真实生产 Dashboard 核对 title、目标 worktree root、目标 Change；以 1440×900 和 1024×768
   覆盖中英文升级状态、101 项截断、英文 503 通用重试、Machine readable sibling、加载/刷新、
   空/错误、Tab/Shift+Tab/Enter，并记录无横向溢出。
3. 在全部轨结束后一次性写入并登记 `verification_report`；有 finding 则走 `verify-fail` 回 Build 修复。

## Ship 与 Archive

1. 只提交本 Change 文件，确认相对 `origin/main` 干净可审，push 唯一 `codex/` 分支。
2. 创建非草稿 PR，列出五个上游固定点、API/安全/兼容/回滚、Tenon evidence、真实测试与浏览器证据。
3. 检查 CI，修复代码失败；外部 secret 阻塞单独记录。完成 Ship 后应用 delta spec，并用 Tenon CLI
   Archive，不手改 canonical state 或 `.pipeline.yaml`。
