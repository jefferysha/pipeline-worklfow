# 任务

## 立项

- [x] 创建并激活独立 frontend/default/full Change。
- [x] 建立 Host Target Plan Center 的目标、边界、风险和七阶段任务骨架。

## 调研

- [x] 固定并核对 Comet 与 Trellis 上游证据，提炼可映射原则。 (explore)
- [x] 追踪现有宿主 flags、命令装配、server 路由、Dashboard client/i18n/测试调用链。 (explore)
- [x] 选择最窄稳定包边界并形成 RFC 与 ADR。 (explore)

## 规格

- [x] 定义 `host-target-plan` delta spec、共享 DTO、严格校验与兼容策略。 (spec)
- [x] 编写可执行实现计划与验证矩阵。 (spec)

## 实现

- [x] 建立 CLI→server→Dashboard 的最小纵向切片：Codex setup 计划、只读 API 与首个可见预览。 (build)
- [x] 完成全部 TENON_HOSTS、setup/update DTO、严格 CLI/server decoder 与兼容测试。 (build)
- [x] 完成目标卡、操作选择、loading/empty/error/retry/ready、复制反馈和响应式样式。 (build)
- [x] 完成中英文 i18n、键盘可访问性与 Dashboard client/component/location 测试。 (build)

## 验证

- [ ] 运行定向测试、typecheck:web、test:web、build、npm test 与受影响门禁。 (verify)
- [ ] 在真实 Tenon Dashboard 完成页面身份、桌面/移动、键盘及 loading/empty/error 验收。 (verify)
- [ ] 生成三轨验证报告并处理全部可修复失败。 (verify)

## 交付

- [ ] 应用 OpenSpec，提交本轮文件并推送 `codex/` 分支。 (ship)
- [ ] 创建面向 main 的非草稿 PR，记录上游 SHA、契约、安全、证据、测试、浏览器与 CI 状态。 (ship)

## 归档

- [ ] 复核最终文档、任务与交付证据并归档 Change。 (archive)
