# 任务

## 立项

- [x] 建立 PR #7 独立 Change，固定最新主线、PR head、范围、规则与持续授权证据。
- [x] 登记 proposal、design、tasks 并通过 Open 出口检查。

## 调研

- [x] 阅读 Open 文档、PR diff、调用方、测试、合同和原始归档证据，形成当前证据基线。
- [x] 完成前后端架构、安全、Dashboard 交互与 `design-taste-frontend` 风险分析，形成设计与 ADR。
- [x] 完成 Explore 文档、覆盖块与出口检查准备；确切 `explore-complete` 回执由 canonical review 历史记录。

## 规格

- [x] 固定 capability、需求/场景、兼容与安全约束，生成 delta spec。
- [x] 生成可执行实施计划，包含 tracer bullet、子阶段、最新 main 集成、TDD、全量验证、浏览器/E2E、CI、合并与回滚。
- [x] 补齐 coverage 并完成 Spec 文档与出口检查准备；确切 `spec-complete` 回执由 canonical review 历史记录。
- [x] 将五条既有 requirement 改为完整 `MODIFIED`、共存能力保留 `ADDED`，并通过隔离 archive/apply。
- [x] 把默认阶段标签 i18n、custom 作者标签保留及修订后的架构/测试事实同步到 design、proposal 与 plan。
- [x] 重新登记并全文读取所有变更的 Spec 文档，完成本次 `requirements-changed` 的确切 review 门禁。

## 实现

- [x] 普通合并最新 `origin/main`，显式保留 context bundle 与 verification evidence 两组 API/抽屉能力，并从最终源码重生成 dist。
- [x] 增加 Verify 抽屉两工具共存组合红测并完成 tracer bullet 定向链路。
- [x] 按职责拆分超建议线 Dashboard 组件和接近硬上限 server handler，保持 public contract。
- [x] 完成 Host/root/Change/canonical/ledger/source/预算/DTO 的安全负面测试与架构自检。
- [x] 完成 Dashboard 第一次 `design-taste-frontend`、修复和第二次复审，覆盖主题/语言/三视口/键盘/focus/reduced-motion。
- [x] 运行全部定向、前后端全仓、生成物、hooks/adapters/skills/bundle/CAS/oracle/OpenSpec/hygiene 门禁。
- [x] 完成 pre-Verify Spec、Rules/Architecture/Security、Dashboard visual 复审，修复所有 C/H/M。
- [x] 提交、普通推送并取得精确 head CI；登记 `pre_verify_review_result=pass`。
- [x] 以红测固定默认 workflow 英文阶段/动作标签，保持 custom 作者标签，并完成最小实现。
- [x] 串行复跑 focus 相关 Web 测试、全量门禁、生成物、独立复审与精确 head CI，冻结新的 Verify SHA。

## 验证

- [ ] 冻结 build SHA，完成 Reviewer、真实 E2E/API/浏览器、Codex 与 Dashboard `design-taste-frontend` 视觉/可访问性验证轨。
- [ ] 验证 Linux success/empty/422/missing/retry、Darwin 501、Verify composer 共存、OpenSpec 隔离应用、全路径映射与 repo-zero。
- [ ] 核对精确 head CI 与 GitHub review/comment/thread，登记验证报告并完成 `verify-pass` review 准备。

## 交付

- [ ] 应用主 spec，更新必要 README/CONTRACT/TEST-REALITY/分发与回滚文档。
- [ ] 在最终 PR 审计和精确 head CI 通过后合并 #7，等待并确认 main CI 通过。
- [ ] 登记交付证据并完成 Ship 出口。

## 归档

- [ ] 核对 applied spec、合并可达性、子 Change、收据和 main CI，完成终态归档。
- [ ] 安全清理仅属于 #7 且已合并、干净、无独占提交的 worktree，保留当前自动化 worktree。
- [ ] 提交并推送归档治理证据，写入自动化 memory。
