# Dashboard UI/UX 主线整合任务

## 立项

- [x] 从最新 `origin/main` 创建独立 worktree、`codex/` 分支与 frontend/default/full Change。
- [x] 固定电脑端 Dashboard 边界、替代 PR 策略与不可复用旧 Verify 的原因。

## 调研

- [x] 对比 PR #10、归档设计证据与最新 main，形成逐文件取舍矩阵。 (explore)
- [x] 审计最新 main 的桌面 Dashboard 基线、冲突面和可访问性/动效现状。 (explore)
- [x] 形成受证据支持的整合设计与 ADR。 (explore)

## 规格

- [x] 更新 `dashboard-ui-ux-system` delta spec，明确桌面端整合要求与验收场景。 (spec)
- [x] 冻结逐步实施计划、回滚策略与桌面验证矩阵。 (spec)

## 实现

- [x] 子阶段 1：移植 Solution 章节导航纵向切片；保留 main 的 Button 基线，运行定向测试。 (build)
- [x] 子阶段 2：整合共享原语、motion、App/Nav/Onboarding 生命周期与成对 i18n，运行定向测试。 (build)
- [x] 子阶段 3：整合 Projects 工作区身份并运行定向测试、typecheck 与全量前端测试。 (build)
- [x] 子阶段 4：从最终源码重新生成 tracked assets，确认无 conflict marker 或旧 asset 残留。 (build)
- [x] 保持既有前端分层，不引入新依赖或服务端契约变更。 (build)
- [x] 子阶段 5：修复同 basename 的可见唯一标签与稳定 DOM id，并补 modal Escape 回归测试。 (build)
- [x] 子阶段 5：清理 diff 门禁问题，从最终源码重建 tracked assets 并证明隔离重建无漂移。 (build)
- [x] 子阶段 5：在隔离副本证明 OpenSpec desktop-only delta 可应用且不改写真实主规格。 (build)

## 验证

- [ ] 运行定向 Vitest、`npm run typecheck:web`、`npm run test:web` 与风险匹配构建。 (verify)
- [ ] 在真实 Tenon Dashboard 上完成 1024–1920px 桌面验收，包括主题、键盘、状态与 reduced-motion。 (verify)
- [ ] 完成代码、E2E/行为与视觉三轨复核并登记验证报告。 (verify)

## 交付

- [ ] 提交并推送替代分支，创建包含证据和回滚说明的非草稿 PR。 (ship)
- [ ] 替代 PR 可审查后关闭 PR #10，并在两处相互链接。 (ship)
- [ ] 检查 PR/CI 状态并修复范围内问题。 (ship)

## 归档

- [ ] 应用主规格、完成 Archive 检查并归档 Change。 (archive)
- [ ] 更新 automation memory 为新的 Change、分支、worktree 与替代 PR 身份。 (archive)
