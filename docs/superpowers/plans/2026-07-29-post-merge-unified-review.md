---
change: post-merge-unified-review-20260729
design-doc: docs/superpowers/specs/2026-07-29-post-merge-unified-review-design.md
---

# 最终主干统一审查实施计划

## 前提、边界与停止条件

- 基线：`main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`，十五个目标 PR
  （#8/#14/#13/#11/#12/#9/#15/#16/#17/#18/#19/#21/#23/#27/#28）已合并，开放非 Draft PR
  再查只剩本统一审查 PR #20。
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

## 子阶段 5：requirements-changed 增量——纳入 #15/#16/#17/#18/#19 与最终 main

1. 将 `origin/main@445aa141` 合入统一审查分支，冲突只按最终源代码重建生成物解决，禁止手工拼接
   Dashboard hash assets。
2. 将 #15 的 Host Plan desktop catalog/selected context、#16 的 document evidence timeline
   kernel→server→decoder→Dashboard 链、#17 的 Trace session rail/detail workspace，以及 #18 的
   canonical archive digest 链、#19 的 Progress 状态 tab roving keyboard/context card 禁用/本地化摘要
   纳入文件→capability 覆盖矩阵。
3. 重跑 Host Plan 19 tests、Document timeline kernel/server/UI、Trace workspace 定向测试、全仓测试、Dashboard
   全量测试、build、typecheck、docs、OpenSpec、architecture/comments/hygiene、audit 与 release gates。
4. 使用 `tenon:design-taste-frontend` 对整个 Dashboard 重跑，不把 #15 的 desktop-only 原 PR
   或 #17 的 desktop-only Trace 证据当作全 Dashboard 豁免；#18 另以 archive ledger/digest
   完整性验证。真实浏览器覆盖成功/加载/空/错误/禁用、
   zh/en、主题、键盘和焦点。
5. 重做完整 pre-Verify Standards + Spec review；任何 C/H/M finding 修复后从本子阶段重新验证。

验收：十一个 PR 的新最终主干全部能力组合后 C0/H0/M0，生成物连续构建稳定，repo-zero。

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
6. 为 Loop 编辑草稿建立语言切换 RED；使 snapshot GET 只依赖 root/显式 refresh，并把 raw error
   留到渲染边界按当前 locale 格式化。断言切换 zh/en 不增加 GET 次数、不覆盖 allowlist/denylist/
   cadence dirty draft，且错误文案使用新 locale 或被安全清除。
7. 枚举 Machine blockers、Project Registration、Create Change、AFK、Progress 与 AFK log 的
   production 错误路径；将 state 收敛为 raw `unknown`/`ApiError`，在 render/action 边界使用当前
   locale 的 `formatApiError`。为英文 4xx/5xx、server 中文 detail、network/invalid response 建立
   回归，并增加 production TSX 禁止直接输出 `.message` 的静态测试。
8. 为 Operations/AFK 与 Workbench 建立 A/B 同名实体 RED：A 打开危险确认或发起慢请求后切 B；
   把确认和 mutation 绑定 exact root+entity+operation token，root 变化原子清空，所有
   response/catch/finally 只在 identity 匹配时落态，当前 root 加载完成前禁用写动作。
9. 为 Progress Create Change 建立 A→B RED：A 中填写完整草稿后切换 B，断言对话框关闭、草稿清空且
   不产生 B 的 POST；提交冻结 exact `{root,name,track,workflow,intent,operationToken}`。为 AFK
   settings/action 建立交错 RED并分离 generation/busy/error，断言 settings 失败回滚且 action
   `finally` 不会被另一通道吞掉。
10. 为 English create/copy default 建立 payload RED；用当前 locale 生成系统 canonical label，
   不翻译已有用户 label。为 composer/editor/toast 的 pending locale switch 建立迟到结果 RED。
11. 将 transport 的 success JSON/schema failure 映射为 typed invalid-response；为 no-project、
    Docker/readiness 503/401、200 malformed JSON 建立准确分类回归。

验收：全 Dashboard 英文错误状态无非技术性 CJK 泄漏，Loop 语言切换不 refetch 或丢草稿，
目标主规格通过、5 个历史目录证据完整、全仓 OpenSpec 全绿。

此处建议 `/clear`。

## 子阶段 7：requirements-changed 增量——纳入 #21/#23 与最新 main

1. 合入 `origin/main@ef728bf6`；对 Dashboard hashed assets 只从合并后源码重建。
2. 对 #21 逐项复核 custom/function completion ABI、current-turn discovery、session/turn、
   sibling worktree 与 symlink/I/O fail-closed；运行 CLI receipt、internal gate、stable hook 和
   Skill source 定向套件。
3. 对 #23 逐项复核 canonical review handshake projector、snapshot/SSE 一致性、严格 decoder、
   old-runtime/unknown/partial 降级和 review→review receipt 消费；运行 Server、Dashboard 与 API 套件。
4. 对 Progress Drawer 在 1024/1440/1920、zh/en、light/dark/system、loading/empty/error/disabled、
   键盘与焦点状态进行真实 production 浏览器回归；同时复验整个 Dashboard，不给予单页豁免。
5. 完成 #21 Ship pending Change 的官方治理收尾；更新统一 REVIEW、报告和任务，再冻结新 SHA。

验收：十三 PR 组合 C0/H0/M0/L0，#21 无悬空治理状态，最新主干与统一分支均可追溯。

此处建议 `/clear`。

## 子阶段 8：冻结、全量 Verify 与 Ship

1. 干净 `npm ci` 后运行 root/full Dashboard、CLI、server、hooks/adapters/skills/bundle/oracle、
   typecheck、build、docs、OpenSpec、architecture/comments/hygiene、audit 和 package/tarball gates。
2. 启动正式 Dashboard assets，按身份门确认 URL、title、root、Change、asset hash；执行完整状态、
   视口、主题、语言、键盘、焦点与 reduced-motion 矩阵。
3. 冻结精确 SHA，取得 GitHub Actions 全部必需 job；缺少 repo secret 的 Real-Codex 只能按仓库
   既有 honest-skip 记录，不能伪造通过。
4. 创建并合并统一修复 PR #20，确认合并 SHA 的 main CI；再启动独立 release Change。

验收：四轨 C0/H0/M0、主干 CI 成功、OpenSpec delta 可应用、repo-zero。

此处建议 `/clear`。

## 子阶段 9：2026-08-03 Verify 回退——Track editor 状态一致性与最终基线收敛

1. 在 `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx` 增加 RED：从真实 Workbench
   打开 Track Settings、编辑草稿，断言 dirty 上报不会触发 maximum update depth、无限 effect 或
   不收敛 render；随后在 `WorkbenchView.tsx` 使用稳定 callback identity 完成最小修复。
2. 在 `TrackSettings.test.tsx` 增加 RED：延迟 save response 后尝试修改全部 Track 字段、route
   preview prompt、切换/删除/关闭，断言 busy 期间控件不可变且请求 payload 保持冻结；失败后原草稿
   与焦点可继续编辑，成功后只关闭已提交且未变化的 surface。
3. 在 `TrackSettings.tsx`、`TrackEditorFields.tsx` 与 `TrackRoutePreview.tsx` 复用现有 `busy` 身份，
   用 fieldset/显式 disabled 最小化锁定提交 surface，不新增全局状态或协议字段。
4. 先分别运行两个定向 RED 并保存预期失败，再完成最小实现使其 GREEN；随后运行
   `npm run typecheck:web`、完整 `npm run test:web`、`npm run build` 与 `git diff --check`。
5. 在项目专用 production Dashboard 复验 Track edit/save 的鼠标、键盘、busy、失败恢复、取消和
   dirty navigation；覆盖 1024/1440/1920、zh/en、light/dark 与 reduced-motion。
6. 对 `origin/main@a86dabb4...<new-head>` 重做完整 Standards + Spec pre-Verify review；所有 C/H/M
   清零后更新报告、生成物和 tasks，冻结新 `build_sha` 再进入三轨 Verify。

验收：Track 草稿编辑无 render loop，保存期间无静默输入丢失，PR #27/#28 的三个 capability 均在
覆盖矩阵中可追溯，完整验证和精确 head CI 通过。

此处建议 `/clear`。

## 子阶段 10：2026-08-03 Verify 回退——snapshot 同长度覆写稳定性

1. 在 `packages/server/src/snapshot.test.ts` 增加 RED：通过 `readSource` 对已打开的 `tasks.md`
   做同 inode、同字节长度原地覆写，断言 reader 返回 `undefined`，旧实现必须因只比较 size 而失败。
2. 在 `packages/server/src/snapshotTasks.ts` 以 opened fd 的 dev/ino/size/mtimeNs/ctimeNs 为基线，
   在 bounded read 前后分别 `fstat`，并让 pathname fence 核对同一组变化元数据；任一变化 fail closed。
3. 运行定向 snapshot 测试、server/full root tests、architecture、typecheck、build 与 `git diff --check`；
   重建 tracked Dashboard/CLI/server 资产后重新执行完整 pre-Verify review。此处建议 `/clear`。

## 回滚策略

- Governance 与 i18n 修复可以按独立提交回退，不改变网络/持久化契约。
- 依赖 manifest/lock/override 必须作为一组回退，禁止留下半更新 lockfile。
- Verify 失败执行 `verify-fail` 回 Build；不得接受偏差进入 release。
- release Change 只有在统一修复 PR 合并并通过 main CI 后创建。
