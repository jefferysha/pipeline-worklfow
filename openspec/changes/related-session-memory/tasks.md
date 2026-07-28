# 任务

## 立项

- [x] 建立独立 Change/worktree，记录非重复范围和初始安全边界。

## 调研

- [x] 固定 Trellis/Comet 默认分支与 release/tag 证据并形成差异映射。 (explore)
- [x] 审计现有 kernel mem、server session-link 与 Dashboard 任务详情调用链。 (explore)
- [x] 完成设计 RFC 与 ADR，明确隐私、预算和错误语义。 (explore)

## 规格

- [x] 编写 `related-session-memory` delta spec 与实现计划。 (spec)
- [x] 明确 API、解码、i18n、加载/空/错态和浏览器验收场景。 (spec)

## 实现

- [x] 以 TDD tracer bullet 打通 bounded read、kernel、POST、decoder 与 TaskDetail 成功态。 (build)
- [x] 完成读取预算、user-only 隐私 DTO、宿主闭集、single-flight 与 typed errors。 (build)
- [x] 完成 Dashboard 空/错/partial/重试/旧响应丢弃状态和中英文文案。 (build)
- [x] 回归 session-link、CLI mem search 与生成物，完成集成门禁。 (build)

## 验证

- [ ] 运行定向测试、typecheck:web、test:web、build:web、build 与 npm test。 (verify)
- [ ] 对真实 Tenon Dashboard 执行成功、空、错误和键盘路径浏览器验收。 (verify)
- [ ] 完成验证报告与 review gate。 (verify)

## 交付

- [ ] 应用 OpenSpec，提交、推送并创建包含上游映射和真实证据的非草稿 PR。 (ship)
- [ ] 检查远端 PR 与 CI，修复可归因失败并记录外部阻塞。 (ship)

## 归档

- [ ] 归档 Change 并将本轮结果写回 automation memory。 (archive)
