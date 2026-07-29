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
- [x] 修订 adapter 真实控制流契约：setup 五步、update 三步并排除 setup-only 步骤。 (spec)
- [x] 修订 native update 与 Host Plan stdout 契约：排除 setup-only 尾步并要求单一完整 JSON 文档。 (spec)
- [x] 修订最新 main 的 Codex 认证契约：setup/update 在 managed runtime 后预览只读 auth-status 与引导。 (spec)

## 实现

- [x] 建立 CLI→server→Dashboard 的最小纵向切片：Codex setup 计划、只读 API 与首个可见预览。 (build)
- [x] 完成全部 TENON_HOSTS、setup/update DTO、严格 CLI/server decoder 与兼容测试。 (build)
- [x] 完成目标卡、操作选择、loading/empty/error/retry/ready、复制反馈和响应式样式。 (build)
- [x] 完成中英文 i18n、键盘可访问性与 Dashboard client/component/location 测试。 (build)
- [x] 修复首轮 Verify 的 clean-room、strict decoder、错误 i18n、snapshot 独立性、live announcement、文档和 hygiene findings。 (build)
- [x] 修复第二轮 Verify 的重复 CLI option 与宿主计划子进程有界并发 findings。 (build)
- [x] 修复冻结前审查发现的 adapter 步骤顺序与真实 setup/update 执行链漂移。 (build)
- [x] 修复第三轮 Verify 的真实 adapter 编排顺序、空 catalog、测试索引与 ADR 漂移，并以真实 setup 契约测试锁定顺序。 (build)
- [x] 以真实 `cmdSetup`/`cmdUpdate` 集成测试修复 adapter setup 五步与 update 三步差异，并同步三端严格 fixture。 (build)
- [x] 以真实 native `cmdUpdate` 与混合 stdout RED 测试修复 native update 尾步和 server 单文档解析。 (build)
- [x] 合并最新 `origin/main` 的 Codex 认证引导，保留两侧测试并重建 CLI/server/Dashboard 生成物。 (build)
- [x] 以交叉 RED 测试同步 Codex auth-status 步骤、notice、三端 decoder、i18n 与生成物。 (build)

## 验证

- [x] 运行定向测试、typecheck:web、test:web、build、npm test 与受影响门禁。 (verify)
- [x] 在真实 Tenon Dashboard 完成页面身份、桌面/移动、键盘及 loading/empty/error 验收。 (verify)
- [x] 生成三轨验证报告并处理全部可修复失败。 (verify)

## 交付

- [x] 应用 OpenSpec，提交本轮文件并推送 `codex/` 分支。 (ship)
- [x] 创建面向 main 的非草稿 PR，记录上游 SHA、契约、安全、证据、测试、浏览器与 CI 状态。 (ship)

## 归档

- [x] 复核最终文档、任务与交付证据并归档 Change。 (archive)
