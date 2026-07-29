---
change: post-merge-unified-review-20260729
design-doc: docs/superpowers/specs/2026-07-29-post-merge-unified-review-design.md
---

# 最终主干统一审查实施计划

## 前提、边界与停止条件

- 基线：`main@907dac067c17ed77fb440b91b20d64fd0f24773b`，六个目标 PR 已合并且最终 CI 成功。
- 采用当前独立 worktree、`codex/unified-main-review-20260729`、full Change、TDD 和持续授权。
- 不改变 CLI/HTTP DTO，不增加无关功能，不修改自动化 schedule，不执行 npm publish 或生产部署。
- requirement 语义变化执行 `requirements-changed` 回 Spec；任何 Verify finding 默认修复。
- 依赖候选已在隔离 worktree 原型验证，因此不再插入一次性 prototype；正式 Build 仍从 RED 和干净
  安装重新证明，原型结果不能充当 Verify pass。

## 子阶段 1：Tracer bullet——升档状态从回归测试到生产 Dashboard

1. 在 `packages/dashboard-app/src/workbench/GovernanceRail.test.tsx` 建立确定性 RED：
   打开升档确认后以逻辑等价的新 row 对象 rerender，`wb-gov-promote-confirm` 保持。
2. 在 `GovernanceRail.tsx` 提取最小稳定 decision key 或显式字段比较，删除对 row 对象 identity 的
   生命周期依赖；增加决策事实变化、Escape/cancel 和焦点恢复用例。
3. 运行 GovernanceRail 定向测试、Dashboard typecheck 和生产 build。
4. 启动当前 worktree 的 built Dashboard，连接真实 root，打开 Governance 正常或空态；有安全的
   fixture 时只打开/取消确认，不提交真实 autonomy 变更。

验收：等价 refresh 绿、事实变化关闭、无网络 mutation、生产 UI Escape/focus 正确。

此处建议 `/clear`。

## 子阶段 2：Workbench 中英文完整性

1. 审计 `packages/dashboard-app/src/workbench/` 的可见文案、title、aria-label 和 sr-only 文案，
   将产品文本收敛到 `src/i18n/translations.ts`；技术 token 和用户数据保留原值。
2. 优先修改 `WorkbenchHeader.tsx`、`TrackSelector.tsx`、`TrackSettingsList.tsx`、
   `ExecutionTimelineComposer.tsx`、`TimelineHookRows.tsx`、`OrchestrationSkillZone.tsx` 及其调用方，
   使用现有 `useI18n`，不建立第二套 locale prop/store。
3. 在 `i18n/i18n.test.tsx` 保留字面量 key 双语存在性门；在 Workbench/Governance/Hook 定向测试中
   增加 English 正常、空、错误、禁用、确认和 accessible-name 断言。
4. 以生产浏览器切换 zh/en，并扫描可见 CJK；只允许 fixture/user data/technical id，任何产品文案
   残留继续修复。

验收：English Workbench 无非技术性中文，语言切换不丢状态/焦点，zh 行为不回退。

此处建议 `/clear`。

## 子阶段 3：依赖安全组合与确定性门

1. 先保存当前 `npm audit --json` 的 5 moderate / 1 high / 1 critical 失败基线。
2. 原子修改 root 与 Dashboard manifests：
   - AJV `^8.20.0`；
   - Vitest `^3.2.6`；
   - Vite `^6.4.3`；
   - VitePress 1.6.4 的 Vite 精确 override `6.4.3`。
3. 使用标准 `npm install` 更新 `package-lock.json`；禁止 `npm audit fix --force`。
4. 从干净安装运行 `npm audit --json`、`npm ls vite vitest ajv vitepress`，要求 audit total 0 且依赖
   树无 invalid/extraneous。
5. 运行 root build、Dashboard full tests/typecheck/build、docs check/build；任何兼容失败整体回滚
   依赖组合并重新评估稳定版本。

验收：manifest/lock 原子一致、audit 0、正式应用与文档资产可构建。

此处建议 `/clear`。

## 子阶段 4：全栈组合加固、文档与 pre-Verify review

1. 运行本批次 capability 的 CLI/server/shared decoder/hook 定向测试和 API 正负路径，复核
   input narrowing、固定 argv、root 隔离、缓存/取消、错误脱敏及 bundle freshness。
2. 运行 `tenon:design-taste-frontend`、Web 设计/可访问性和架构 review，覆盖 Dashboard
   390/720/1024/1440、zh/en、light/dark/system、reduced-motion、键盘、焦点、状态矩阵和无根溢出。
3. 更新 README/README.en、`docs/TEST-REALITY.md`、依赖安全/发布说明和必要的持久浏览器证据；
   只记录当前 head 的真实结果。
4. 从最终源码重建 CLI/server/Dashboard tracked assets，运行 freshness 和 repository hygiene。
5. 执行 Spec、规则/架构、安全与代码 review；C/H/M 必须为 0，Low 可安全修复则修复。

验收：pre-Verify review 报告绑定精确 build SHA，所有修复有回归证据。

此处建议 `/clear`。

## 子阶段 5：冻结、全量 Verify 与 Ship

1. 干净 `npm ci` 后运行 root/full Dashboard、CLI、server、hooks/adapters/skills/bundle/oracle、
   typecheck、build、docs、OpenSpec、architecture/comments/hygiene、audit 和 package/tarball gates。
2. 启动正式 Dashboard assets，按身份门确认 URL、title、root、Change、asset hash；执行完整状态、
   视口、主题、语言、键盘、焦点与 reduced-motion 矩阵。
3. 冻结精确 SHA，取得 GitHub Actions 全部必需 job；缺少 repo secret 的 Real-Codex 只能按仓库
   既有 honest-skip 记录，不能伪造通过。
4. 创建并合并统一修复 PR，确认合并 SHA 的 main CI；再启动独立 release Change。

验收：四轨 C0/H0/M0、主干 CI 成功、OpenSpec delta 可应用、repo-zero。

此处建议 `/clear`。

## 回滚策略

- Governance 与 i18n 修复可以按独立提交回退，不改变网络/持久化契约。
- 依赖 manifest/lock/override 必须作为一组回退，禁止留下半更新 lockfile。
- Verify 失败执行 `verify-fail` 回 Build；不得接受偏差进入 release。
- release Change 只有在统一修复 PR 合并并通过 main CI 后创建。
