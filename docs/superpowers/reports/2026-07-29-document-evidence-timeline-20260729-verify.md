# 文档证据时间线验证报告

## 冻结基线与范围

- Change：`document-evidence-timeline-20260729`
- 冻结 Build SHA：`382f34b063af53c51c3829a62b5e0f916691a6fd`
- 范围：经 digest 和当前 phase/visit 校验的 producer、`recordedAt`、`readAt` 只读投影；Dashboard 本地化时间线与旧 server 降级。

## 自动验证

- `npx vitest run packages/kernel/src/state/document-ledger.test.ts packages/server/src/snapshot.test.ts --reporter=dot`：通过，2 files / 52 tests。
- `npx vitest run --config packages/dashboard-app/vitest.config.ts src/shared/TaskDocumentsSection.test.tsx --reporter=dot`：通过，2 tests。
- `npm run test:web -- --run`：通过，68 files / 1197 tests。
- `npm run typecheck:web`：通过。
- `npm run build`：通过；Vite 仅报告既有的单 chunk 大小告警。
- `git diff --check`：通过。
- E2E/API 轨：`serverIntegration.test.tsx`、`boundaryDecoders.test.tsx` 与 `TaskDocumentsSection.test.tsx` 通过，3 files / 22 tests；真实 `/api/snapshot` 中该 Change 的 8 条 timeline item 均可读，当前读取回执含 `readAt`。

## 浏览器验收

环境：本 worktree 编译的 Dashboard server，`http://127.0.0.1:18831`，页面标题 `Tenon Dashboard`。

1. 从“进度”选择 `/Users/a1234/.codex/worktrees/255c/pipeline-worklfow`，打开 `document-evidence-timeline-20260729`。
2. 成功态：OpenSpec 文档区域显示“证据时间线”；展开 proposal 后显示 `tenon-explore · 2026-07-29T10:23:39Z → 2026-07-29T10:41:22Z`。
3. 键盘：焦点停在原生 summary 后按 Enter，时间线折叠；先前点击展开状态由浏览器快照确认。该控件不提供任何写入或推进操作。
4. 错误态：同一目标 Dashboard 的 Context Bundle 预检如实显示 `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE` 与重试入口，未影响文档时间线读取。组件测试覆盖无 items 的既有空态；旧 server 缺少 `timeline` 时显示“时间线不可用”。

## 冻结基线审查

- Reviewer 轨：完整 diff、kernel → server → decoder → Dashboard 路径和 spec 回读；无 P0/P1/P2，PASS。
- E2E/API 轨：无功能或 API 阻断，PASS。
- Codex CLI 轨：未调用；本机 `codex login status` 显示 ChatGPT 登录，但本轮避免消耗未单独确认的外部模型额度。由独立 reviewer 与 E2E/API 两轨替代，结论不受影响。
- 建议（P3）：原生 `<summary>` 的单元测试当前验证 Enter 事件与可渲染内容；真实浏览器已验证它实际折叠。后续可加强为断言 `details.open`，不影响本 Change 行为。

## 逐文件规格回读

| 改动面 | 命中的规范 | 比对结果 |
| --- | --- | --- |
| `document-evidence.ts`、`snapshot.ts`、DTO 与 bundle | `document-evidence-timeline`：仅当前 digest/visit 的 readAt，且不泄露 digest、visit、内容、会话或绝对路径 | 通过 |
| decoder、types、translations、TaskDocumentsSection 与测试 | `document-evidence-timeline`：可选字段、畸形对象拒绝、旧 server 本地化降级、键盘可访问且无控制按钮 | 通过 |
| OpenSpec、研究、设计和计划文档 | Change delta 与实施边界 | 通过 |

## OpenSpec 隔离演练

- `openspec show document-evidence-timeline-20260729 --json --deltas-only`：通过。
- `openspec validate document-evidence-timeline-20260729 --strict`：通过。
- 在 `/private/tmp/tenon-verify-document-evidence.Bs4SfY` 的隔离副本运行 `openspec archive document-evidence-timeline-20260729 --yes --json`：通过，新增 2 条主规格需求。
- 隔离副本 `openspec validate document-evidence-timeline --strict`：通过。
- 全仓 `openspec validate --all --strict` 返回 12 个既存、与本 Change 无关的失败项；目标 `spec/document-evidence-timeline` 通过，且真实工作区主规格在 Verify 期间未被修改。

## 风险与回滚

该 Change 仅增加 snapshot 投影和只读 UI。旧 server 使用“时间线不可用”安全降级；回滚可移除 projection/rendering，不需要 ledger 迁移、数据清理或 API 写端点回滚。
