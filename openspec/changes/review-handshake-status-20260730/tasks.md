# 任务

## 立项

- [x] 创建并绑定独立 Change，记录 Review Handshake 的目标、边界与风险。

## 调研

- [x] 固定上游来源并审计 Tenon snapshot、review receipt 与 Progress 交互调用链。 (explore)
- [x] 形成方案对比、ADR 和可验证的设计边界。 (explore)

## 规格

- [x] 定义 `review-handshake-status` delta spec、实现计划和验收场景。 (spec)

## 实现

- [x] 用 server 红测和纯 projector 投影三态、exact event、时间与非法 receipt 错误。 (build)
- [x] 用 decoder 红测实现滚动兼容与已出现对象的严格失败关闭。 (build)
- [x] 用组件红测实现 Progress Drawer 只读状态卡与中英文 i18n。 (build)
- [x] 用 Progress 集成测试锁定 readiness 正交、多出口、SSE、失败回滚和键盘路径。 (build)
- [x] 构建 Dashboard 产物并执行受影响的仓库级实现门禁。 (build)

## 验证

- [ ] 执行三轨代码/安全/测试审查并修复所有本轮缺陷。 (verify)
- [ ] 执行全仓门禁与 1024/1440/1920 桌面真实 Dashboard 浏览器验收。 (verify)
- [ ] 形成 digest-bound verification report 与浏览器证据。 (verify)

## 交付

- [ ] 应用 OpenSpec，提交推送并创建含五仓来源、phase、测试与浏览器证据的非草稿 PR。 (ship)
- [ ] 检查 PR 远端 URL、标签和 CI，修复所有可归因失败。 (ship)

## 归档

- [ ] 归档 Change，并确认 canonical 状态与 PR 文件一致。 (archive)
