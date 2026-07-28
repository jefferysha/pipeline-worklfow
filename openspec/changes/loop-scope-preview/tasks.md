# 任务

## 立项

- [x] 创建独立 full/default Change 并绑定持续自主执行授权。
- [x] 记录用户问题、范围、非目标、初始假设与风险。
- [x] 登记 OpenSpec 初始文档并通过 Open 出口检查。

## 调研

- [x] 固定两项上游与 Tenon 当前实现的一手证据，完整身份记录仅保留在 PR 与 automation memory。
- [x] 确认路径匹配、API、安全与 Workbench 交互方案，形成 ADR。

## 规格

- [x] 编写 `loop-scope-preview` delta spec 与可执行计划。
- [x] 明确成功、拒绝、空、加载、错误、重试与键盘验收标准。

## 实现

- [x] B1 曳光弹：以测试先行贯通 kernel 逐路径解释、受保护 API、typed client 与 Dialog 最小成功/拒绝链路。
- [x] B2a 内核与服务端加固：覆盖 deny 优先、首个 pattern、aggregate 兼容、闭集 DTO、输入限额、root/Loop/registry 错误与无副作用。
- [x] B2b Dashboard 状态闭环：覆盖空态、加载、错误保留与重试、zh/en、未知响应拒绝、`Ctrl/Cmd+Enter` 与 Dialog 焦点路径。
- [x] B2c 集成收束：补齐 API/组件回归测试、文档注释与生成 bundle，保持包边界和文件长度门禁。
- [x] B2d Verify 返工：以 TDD 修复 registry 子路径可信读取、稳定 403/500 契约和客户端请求/响应绑定。
- [x] B2e 返工收束：重建 bundle，重新执行全量 Standards/Spec 审查并清零 critical/high/medium。
- [x] B2f 契约返工：以 TDD 对齐 transport-safe 路径字符、POSIX 冒号路径和 typed client 去重边界，并移除 tracked 文档中的受限参考身份。
- [x] B2g transport 返工：以 TDD 拒绝未成对 Unicode surrogate，保证路径预算不会因 JSON 转义膨胀越过公共 body 上限。
- [x] B2h client 返工：以 TDD 将 2xx 空体与 malformed JSON 归一化为稳定 `response` 错误、保留 body-read abort 身份并重建 Dashboard bundle。
- [x] B2i 交互返工：仅在路径策略草稿未保存时阻止预检，补齐中英文提示，并修复 light/dark placeholder 对比度。
- [x] B2j 冻结返工：严格关闭响应枚举类型，清除重新提交期间的旧结果，并保留非 2xx body-read abort 身份。

## 验证

- [x] 重新运行 kernel/server/Dashboard 定向测试、`typecheck:web`、`test:web`、`build:web`、`build` 与 `npm test`。
- [x] 重新完成真实浏览器验收与隔离 OpenSpec show/strict validate/archive/apply 演练。
- [ ] 重新运行 repository hygiene、边界 HTTP/client 测试、全量门禁与冻结四轨验证。

## 交付

- [ ] 应用主规格，提交、推送并创建含完整证据的非草稿 PR。

## 归档

- [ ] 完成 Tenon Change 归档并记录最终自动化记忆。
