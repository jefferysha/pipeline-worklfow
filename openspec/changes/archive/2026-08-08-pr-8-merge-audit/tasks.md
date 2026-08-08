# 任务

## 立项

- [x] 创建 PR #8 独立 Change，固定 current main、PR head、跨端范围、规则与持续授权。
- [x] 生成并登记 proposal、初始 design 与七阶段 tasks，通过 Open 出口检查。

## 调研

- [x] 阅读 Open 文档、PR 全量 diff、调用方、测试、原始 Change/规范与当前主线，建立证据基线。
- [x] 完成 CLI/server/Dashboard 架构、安全、契约及 `design-taste-frontend` 调研，形成 RFC 与 ADR。
- [x] 更新 proposal/design/tasks 的已验证范围，完成 Explore review 门禁。

## 规格

- [x] 固定 capability、完整 requirement/scenario、兼容、安全与视觉验收标准。
- [x] 生成可执行计划：主线集成、TDD 修复、全量门禁、真实 API/浏览器、独立审查、CI、合并与回滚。
- [x] 登记 delta spec 与 plan，完成 Spec review 门禁。
- [x] 第一轮 Verify 回退后补回五项 MODIFIED requirements 的全部 canonical scenarios，并在计划中冻结排队 deadline 的 TDD 修复与完整重验步骤。
- [x] 对照当前 main 审计全部 `MODIFIED` requirement 的场景集合，补回“用户首次进入 Host Plan”并通过最新版 OpenSpec strict validation。
- [x] Verify 语义复审回退后，将 5 条 `MODIFIED` requirement 修订为 current main 与既有 delta 的语义并集，保留全部 narrative、场景正文与既有加强项。
- [x] 最终 Verify 错误映射复审后，恢复 CLI/stdout/DTO 无效场景的确定性 `502 HOST_TARGET_PLAN_INVALID` 语义。
- [x] 冻结前 CI 风险匹配发现 reference-identity hygiene 门禁后，以不弱化许可边界的中性表述移除外部项目身份。
- [x] 最终文档复审后，将 proposal 从重复 New/无 Modified 修正为五条完整 `MODIFIED` requirement 与八个既有加强场景。

## 实现

- [x] 以最新版 OpenSpec strict 的原始失败为红证据，复跑完整场景审计、仓库固定门禁与 Node 22 CI 同款检查并取得绿色结果。
- [x] 以 Codex setup 为 tracer bullet，普通合并最新 `origin/main`，解决源码冲突并从最终源码重建全部生成物。
- [x] 以 TDD 核对 12×2 CLI truth table、当前 setup/update/runtime/WAL 语义、输入拒绝，以及 adapter `--target .` 的安全可复制命令展示契约。
- [x] 以 TDD 加固 GET/Host/query/fixed argv/strict JSON/DTO/错误脱敏、同 key 共享、失败重试、有界缓存/并发/超时。
- [x] 修复 Dashboard catalog/plan 全状态、陈旧响应、copy-only、i18n、键盘/focus/a11y 与当前 rail/route 共存。
- [x] 执行 `frontend-design`、`web-design-guidelines`、`design-taste-frontend` 和 production browser 全矩阵，修复全部 C/H/M。
- [x] 同步源码、测试、正式生成物、OpenSpec、README/CONTRACT/TEST-REALITY/用户文档与回滚事实。
- [x] 运行定向、前端、后端、全仓、分发、OpenSpec、oracle、hygiene、依赖与 repo-zero 门禁。
- [x] 完成独立 pre-Verify Spec、Rules/Architecture/Security、Dashboard 视觉复审，推送并取得精确 head CI。
- [x] 以 RED 复现 queue wait 逃逸 10 秒 deadline，最小实现 enqueue 绝对期限、过期 item 不启动 child 与健康槽位恢复。
- [x] 在第二个隔离 clone 证明 OpenSpec 1.6.0 archive/apply 无场景丢失，并重跑所有 focused/full/generated/API/browser/release gates。
- [x] 对完整新 diff 重做 Spec、Rules/Architecture/Security、Dashboard `design-taste-frontend` pre-Verify 复审，提交推送并取得新 exact-head CI。
- [x] 恢复归档 design 的 ledger-bound 不可变字节，把 REVIEW 证据改为固定 base/head snapshot 口径，并对完整最终候选重做 pre-Verify 复审与 exact-head CI。

## 验证

- [x] 冻结 build SHA，完成 Reviewer、真实 E2E/API/浏览器、Codex 与 Dashboard 视觉/可访问性验证轨。
- [x] 映射全部变更路径至 requirement/场景，核对 repo-zero、精确 head CI 与 GitHub review/comment/thread。
- [x] 登记完整验证报告；任何失败均回 Build 修复并重新冻结全部验证。

## 交付

- [x] 应用主 spec，更新必要 README/契约/测试现实/发布与回滚文档。
- [x] 最终 GitHub 审计与精确 head CI 通过后以普通 merge commit 合并 #8，并确认 `main` CI。
- [x] 登记 Ship 证据并完成出口。

## 归档

- [x] 核对 applied spec、合并可达性、子 Change、收据与 `main` CI，完成 canonical Archive 前置检查。
- [x] 准备官方 OpenSpec 归档和终态治理证据提交推送；本次不写用户级 automation memory。
- [x] 核对 worktree 清理边界；保留当前自动化 worktree，不触碰用户主 checkout 或其他 worktree。
