---
change: post-merge-unified-review-20260729
design-doc: docs/superpowers/specs/2026-07-29-post-merge-unified-review-design.md
---

# 最终主干统一审查实施计划

## 前提、边界与停止条件

- 基线：`main@607c2ed97f2217b8edf44dd9cd872e7e9cceb545`，十个目标 PR
  （#8/#14/#13/#11/#12/#9/#15/#16/#17/#18）已合并，开放非 Draft PR 再查为空。
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

## 子阶段 5：requirements-changed 增量——纳入 #15/#16/#17/#18 与最终 main

1. 将 `origin/main@607c2ed9` 合入统一审查分支，冲突只按最终源代码重建生成物解决，禁止手工拼接
   Dashboard hash assets。
2. 将 #15 的 Host Plan desktop catalog/selected context 和 #16 的 document evidence timeline
   kernel→server→decoder→Dashboard 链、#17 的 Trace session rail/detail workspace，以及 #18 的
   canonical archive digest 链纳入文件→capability 覆盖矩阵。
3. 重跑 Host Plan 19 tests、Document timeline kernel/server/UI、Trace workspace 定向测试、全仓测试、Dashboard
   全量测试、build、typecheck、docs、OpenSpec、architecture/comments/hygiene、audit 与 release gates。
4. 使用 `tenon:design-taste-frontend` 对整个 Dashboard 重跑，不把 #15 的 desktop-only 原 PR
   或 #17 的 desktop-only Trace 证据当作全 Dashboard 豁免；#18 另以 archive ledger/digest
   完整性验证。真实浏览器覆盖成功/加载/空/错误/禁用、
   zh/en、主题、键盘和焦点。
5. 重做完整 pre-Verify Standards + Spec review；任何 C/H/M finding 修复后从本子阶段重新验证。

验收：新最终主干全部能力组合后 C0/H0/M0，生成物连续构建稳定，repo-zero。

此处建议 `/clear`。

## 子阶段 6：最终组合 finding 收口与 OpenSpec repo-zero

1. 为 Workbench 保存路径建立英文 401 RED；将 401 恢复文案放入现有 zh/en dictionary，
   `readSaveErrors` 由调用方传入当前 locale 文案，保存和新建 workflow 两条路径共同使用。
   再为 workflow list 的网络异常和非 JSON HTTP fallback 建立英文 RED，使 View 只按稳定的
   network/status/invalid-response 事实选择本地化文案，不拼接 transport 的中文 endpoint fallback。
2. 为 `document-evidence-timeline` 主规格补充只解释既有需求的 Purpose，运行目标与统一 Change
   strict validation。
3. 精确枚举 `align-tenon-entry-skill-contract`、`archive-ledger-safe-guidance`、
   `doctor-active-change-count`、`first-install-onboarding-commands`、
   `manual-loop-binding-preservation`，确认它们不在 Tenon 活跃清单、phase 为 done/escalated、
   且没有 proposal/delta。
4. 记录每个目录的相对路径、文件数和内容摘要；逐个运行
   `openspec archive <name> --yes --skip-specs --no-validate --json`，再证明日期化 archive 中的
   文件集合和摘要逐字一致。
5. 运行 `openspec validate --all --strict --no-interactive`，要求零失败；若 archive 改变任一证据
   文件或主规格，立即停止并恢复。

验收：英文 401/network/non-JSON HTTP 错误无 CJK 产品文案、目标主规格通过、5 个历史目录证据完整、
全仓 OpenSpec 全绿。

此处建议 `/clear`。

## 子阶段 7：冻结、全量 Verify 与 Ship

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
