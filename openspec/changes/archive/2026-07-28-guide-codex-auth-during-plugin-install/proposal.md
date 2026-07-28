# 提案

## Why

Tenon 插件安装完成后，如果宿主未暴露 `OPENAI_API_KEY`，当前提示不足以帮助用户判断下一步。
这会让使用 ChatGPT 订阅账号的用户误以为必须另外购买 API 用量，也会让确实需要 API Key 的用户
不知道从哪里获取、怎样安全登录和怎样确认认证已生效。

## What Changes

- 在 Codex 插件安装流程中检测可用的 Codex CLI 与认证状态，并在未认证或无法确认时给出分支引导。
- 明确区分 ChatGPT 订阅登录与 OpenAI Platform API Key 登录，提供安全、可复制的后续命令和官方入口。
- 覆盖浏览器登录、远程/无头设备、API Key 以及安装后状态验证场景。
- 对非交互安装保持可预测行为：不得阻塞 CI，不得读取、回显、复制或持久化用户凭证。
- 本 Change 不代替 Codex 完成登录、不判断用户具体套餐权益，也不改变 OpenAI 的计费或认证规则。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-distribution`：插件安装在无法确认 Codex 认证时 SHALL 提供订阅账号与 API Key 两条准确引导。

## Impact

预计影响安装入口、Codex setup/update 或 doctor 的认证探测、安装文档、分发测试及真实干净安装验收。
这是认证与秘密处理边界变更：实现只能消费退出码和官方未登录哨兵，不得记录 token、API Key、
`auth.json` 内容或原始宿主输出。具体调用面、交互位置和兼容策略待 Explore 结合当前实现与官方
Codex 认证契约确认。
