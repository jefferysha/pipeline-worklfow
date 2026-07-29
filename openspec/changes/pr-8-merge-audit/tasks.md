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

## 实现

- [ ] 以 Codex setup 为 tracer bullet，普通合并最新 `origin/main`，解决源码冲突并从最终源码重建全部生成物。
- [ ] 以 TDD 核对 12×2 CLI truth table、当前 setup/update/runtime/WAL 语义、输入拒绝和命令展示契约。
- [ ] 以 TDD 加固 GET/Host/query/fixed argv/strict JSON/DTO/错误脱敏、同 key 共享、失败重试、有界缓存/并发/超时。
- [ ] 修复 Dashboard catalog/plan 全状态、陈旧响应、copy-only、i18n、键盘/focus/a11y 与当前 rail/route 共存。
- [ ] 执行 `frontend-design`、`web-design-guidelines`、`design-taste-frontend` 和 production browser 全矩阵，修复全部 C/H/M。
- [ ] 同步源码、测试、正式生成物、OpenSpec、README/CONTRACT/TEST-REALITY/用户文档与回滚事实。
- [ ] 运行定向、前端、后端、全仓、分发、OpenSpec、oracle、hygiene、依赖与 repo-zero 门禁。
- [ ] 完成独立 pre-Verify Spec、Rules/Architecture/Security、Dashboard 视觉复审，推送并取得精确 head CI。

## 验证

- [ ] 冻结 build SHA，完成 Reviewer、真实 E2E/API/浏览器、Codex 与 Dashboard 视觉/可访问性验证轨。
- [ ] 映射全部变更路径至 requirement/场景，核对 repo-zero、精确 head CI 与 GitHub review/comment/thread。
- [ ] 登记完整验证报告；任何失败均回 Build 修复并重新冻结全部验证。

## 交付

- [ ] 应用主 spec，更新必要 README/契约/测试现实/发布与回滚文档。
- [ ] 最终 GitHub 审计与精确 head CI 通过后以普通 merge commit 合并 #8，并确认 `main` CI。
- [ ] 登记 Ship 证据并完成出口。

## 归档

- [ ] 核对 applied spec、合并可达性、子 Change、收据与 `main` CI，完成 canonical Archive。
- [ ] 官方归档 OpenSpec，提交并推送终态治理证据，写入 automation memory。
- [ ] 在远端同步、干净、无独占提交且未占用时安全移除仅属于 #8 的 worktree。
