# Design

## Architecture decision

采用 [Dashboard state scope identity ADR](../../../docs/adr/2026-07-24-dashboard-state-scope-identity.md)
和 [Explore design](../../../docs/superpowers/specs/2026-07-24-dashboard-state-scope-design.md)
确定的模型：在共享 kernel 边界计算 `stateScopeId`，对解析后的机器状态 Home 做带命名空间
的 SHA-256，只公开带版本前缀的完整摘要。server 将它作为 `/api/health` 的加法字段；
启动抢占决策和 CLI readiness probe 均要求该字段与当前进程期望值一致。

## Reuse and takeover

1. 没有服务：正常 bind。
2. 状态域一致：继续使用现有 version/release 决策。
3. 状态域不同或旧服务没有身份：显式启动的新状态域接管；实际发信号前仍由监听 PID
   校验防止误杀。
4. CLI 只有在 release 与状态域都匹配后才报告健康并打开浏览器。

## Compatibility

- `stateScopeId` 是可选健康字段，旧客户端可忽略。
- 新 server 面对无该字段的旧 server 时执行一次迁移接管。
- 默认 Home 的行为不变；`PIPELINE_DASHBOARD_HOME` 继续是 hermetic 隔离边界。

## Validated constraints

- `path.resolve` 统一相对路径与尾斜杠；配置的词法 state root 本身就是隔离边界。
- 响应、日志和 pidfile 只使用指纹，绝不返回真实 Home。
- 不同状态域接管时，即便新状态域没有旧 pidfile，也只能使用 health PID，并由真实 listener
  所有权交叉验证后发信号。
- `stateScopeId` 仅用于身份匹配，不得作为鉴权凭证。
