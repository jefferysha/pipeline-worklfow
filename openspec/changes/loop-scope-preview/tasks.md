# 任务

## 立项

- [x] 创建独立 full/default Change 并绑定持续自主执行授权。
- [x] 记录用户问题、范围、非目标、初始假设与风险。
- [x] 登记 OpenSpec 初始文档并通过 Open 出口检查。

## 调研

- [x] 固定 Trellis、Comet 与 Tenon 当前实现的一手证据。
- [x] 确认路径匹配、API、安全与 Workbench 交互方案，形成 ADR。

## 规格

- [x] 编写 `loop-scope-preview` delta spec 与可执行计划。
- [x] 明确成功、拒绝、空、加载、错误、重试与键盘验收标准。

## 实现

- [x] B1 曳光弹：以测试先行贯通 kernel 逐路径解释、受保护 API、typed client 与 Dialog 最小成功/拒绝链路。
- [x] B2a 内核与服务端加固：覆盖 deny 优先、首个 pattern、aggregate 兼容、闭集 DTO、输入限额、root/Loop/registry 错误与无副作用。
- [x] B2b Dashboard 状态闭环：覆盖空态、加载、错误保留与重试、zh/en、未知响应拒绝、`Ctrl/Cmd+Enter` 与 Dialog 焦点路径。
- [x] B2c 集成收束：补齐 API/组件回归测试、文档注释与生成 bundle，保持包边界和文件长度门禁。

## 验证

- [x] 运行 kernel/server/Dashboard 定向测试、`typecheck:web`、`test:web`、`build:web`、`build` 与 `npm test`。
- [x] 在真实 Tenon Dashboard 对桌面/移动、明暗主题、空/加载/允许/拒绝/错误重试和键盘路径完成浏览器验收。

## 交付

- [ ] 应用主规格，提交、推送并创建含完整证据的非草稿 PR。

## 归档

- [ ] 完成 Tenon Change 归档并记录最终自动化记忆。
