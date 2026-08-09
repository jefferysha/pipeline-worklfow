# 任务

## 立项

- [x] 核对 issue #46 最新正文、标签、父路线图和原生依赖关系。
- [x] 核对独立 worktree、冻结 commit、最新 `origin/main` 与任务分支身份。
- [x] 创建并绑定唯一 Change，记录 proposal、初始 design 与七阶段任务骨架。

## 调研

- [x] 读取 review request/acknowledgement/effect/resume 的实现、调用方、测试与持久化边界。
- [x] 完成影响面、文件所有权、公共兼容、隐私、并发和投影失败风险分析。
- [x] 比较事件持久化与 scorecard 方案，形成技术设计、ADR 和明确非目标。

## 规格

- [x] 编写 `interaction-observability` delta spec，逐项覆盖 issue Acceptance 与 Measurement。
- [x] 定义稳定事件/fixture schema、reason/outcome codes、指标公式、失败诊断与兼容策略。
- [x] 形成可执行实施计划、worker 文件边界、定向测试与最终验证矩阵。

## 实现

- [x] 实现纯 kernel `InteractionEventV1` contract/codec、matrix、diagnostics 与 public exports。
- [x] 实现 change-lock 内 append-only event store、hash chain、有界 reader 和并发/损坏测试。
- [x] 打通 review request/acknowledgement/transition effect/session resume 的真实 CLI trace。
- [x] 实现 deterministic replay/scorecard、完整 fixture matrix 与八个可重放 fixtures。
- [x] 装配只读 `tenon interaction scorecard <fixture-dir> --json` 和真实 integration tests。
- [x] 同步 architecture checker、contract/test-reality/CLI docs，并由 bundle 生成受控 dist。
- [x] 根代理检查 worker diff 和定向测试，只针对确认缺口回派修复。

## 验证

- [ ] 根代理在整体最多两次 code-review 尝试内完成正式 review 并关闭确认的 finding。
- [ ] 验证正向、stale-decision、repeated-prompt、failure、resume fixture 与 loss/malformed ordering 诊断。
- [ ] 仅在实现稳定后运行一次完整最终测试、构建、架构与发行 freshness 门，并记录真实 skip。

## 交付

- [ ] 同步受控 dist、fixtures、docs 与 applied spec，提交并推送任务分支。
- [ ] 创建包含 `Closes #46`、Change、验证证据、兼容与残余风险的 PR。

## 归档

- [ ] 完成 Tenon 归档并等待 PR exact-head CI；不合并、不发布。
