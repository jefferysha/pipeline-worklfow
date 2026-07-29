# 任务

## 立项

- [x] 创建独立 Change，冻结 Trace 时间线的用户问题、安全边界与初始影响面。
- [x] 登记 OpenSpec 初始文档并通过 Open 出口检查。

## 调研

- [x] 固定 Trellis、Comet、maestro-flow 与 claude-tap 的版本、SHA 和重点 PR 证据。 (explore)
- [x] 审计 Tenon 现有 Trace 数据流、调用方、测试与重复功能。 (explore)
- [x] 产出经评审的交互/架构设计与 ADR。 (explore)

## 规格

- [x] 定义 metadata-only Trace 时间线契约、场景、错误语义与兼容边界。 (spec)
- [x] 编写前后端纵向实施计划与测试矩阵。 (spec)

## 实现

- [x] Tracer bullet：用真实记录打通 Store 有界窗口 → timeline API → Dashboard entry。 (build)
- [x] 完成 200 条/8 MiB 尾读、损坏/partial 诊断与兼容回归。 (build)
- [x] 完成白名单 projector、provider usage、隐私、HTTP 语义与服务测试。 (build)
- [x] 完成 Dashboard decoder、summary、筛选与快速切换竞态处理。 (build)
- [x] 完成中英文 loading/empty/error/retry/partial 状态和键盘路径。 (build)
- [x] 完成代码审查、安全审查并修复发现。 (build)

## 验证

- [ ] 运行定向测试、全仓测试、类型检查与构建门禁。 (verify)
- [ ] 使用真实 Tenon Dashboard 和真实本地 Trace 数据做浏览器验收。 (verify)
- [ ] 登记验证报告并完成精确事件评审。 (verify)

## 交付

- [ ] 应用 delta spec，提交、推送并创建包含完整证据的非草稿 PR。 (ship)
- [ ] 检查远端 PR、标签与 CI，修复可控失败。 (ship)

## 归档

- [ ] 完成 Change 归档与自动化 memory 记录。 (archive)
