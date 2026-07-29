# 提案

## Why

Tenon 已能在本地捕获模型 API 流量，但 Dashboard 目前只能逐条显示原始记录摘要，用户无法快速判断一次会话的错误、耗时、模型与用量分布。需要把现有捕获能力变成可操作的 Trace 诊断入口，同时避免扩大敏感正文的暴露面。

2026-07-29 固定的 `claude-tap`、`maestro-flow`、Trellis 与 Comet 一手证据共同表明：捕获记录可能因传输、截断、损坏或读取预算而不完整，诊断面必须显式呈现 failure/unknown/partial，而不能把 raw record 或空数组当成完整事实。

## What Changes

- 为本地 Trace 增加最近 200 条、8 MiB 读取预算的 metadata-only 时间线投影与 Dashboard 交互入口。
- 覆盖加载、空、错误、重试、筛选和键盘操作路径，并提供中英文文案。
- 显式呈现 success/error/unknown、truncated/partial、耗时、模型与实际 provider usage。
- 本轮不改变代理捕获方式、不上传 Trace、不引入外部观测服务，也不展示 prompt/body/header/query。

## Capabilities

### New Capabilities

- `trace-timeline`：把本地捕获记录转换为安全、有界、可浏览且诚实披露完整性边界的诊断时间线。

### Modified Capabilities

无。

## Impact

影响 `@tenon/tap` 的有界只读窗口、`@tenon/server` 的 Trace API，以及 Dashboard Traffic 面板、API decoder 和 i18n。保留既有 sessions/records API，文件持久化格式、代理协议、canonical workflow 与本地回环安全边界不变。
