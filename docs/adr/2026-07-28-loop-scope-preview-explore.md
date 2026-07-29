# ADR：Loop 路径策略预检复用生产约束

## 背景

Loop 的 allowlist/denylist 已在 automation 结算路径强制执行，但 Workbench 只能展示原始 glob。用户无法在启动运行前验证一组计划路径，错误配置往往直到 conflict worktree 被保留才暴露。

## 决策

新增无副作用的逐路径解释投影：

- kernel 维护 denylist-first、空 allowlist fail-closed 与稳定 reason；
- server 注入 automation 的生产 `matchesPathGlob`，读取 exact registered-root/Loop；
- Dashboard 通过受保护 POST 获取完整 DTO，不实现 glob；
- 预检结果不持久化、不成为 permit，真实运行继续 fresh 执行现有 gate。

## 备选方案

1. 前端实现 glob：拒绝，规则会与执行面漂移。
2. 通过 CLI 子进程预检：拒绝，增加进程/序列化/超时面且没有必要。
3. 把预检写入 canonical state：拒绝，结果会因 registry/路径变化迅速过期，并可能被误当许可。

## 后果

- 用户在运行前获得可解释反馈，且结果与生产 matcher 同源。
- server 增加一个本地受保护计算端点，Dashboard 增加一个有界 Dialog。
- API 成功不保证未来运行一定通过；UI 与文档必须持续强调 fresh recheck。
- 无 schema、数据库、依赖或迁移；回滚只需删除投影、端点、client/Dialog 与 capability spec。
