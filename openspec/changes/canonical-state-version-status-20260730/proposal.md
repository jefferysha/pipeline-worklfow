# 提案

## Why

当较新的 Tenon 写出当前 Dashboard 不认识的 canonical state 版本时，用户现在只能看到笼统的“状态损坏或不可读”，无法区分应恢复数据还是升级运行时。这个歧义会诱导错误修复，并掩盖本应失败关闭的版本边界。

## What Changes

- 由 kernel 将“canonical revision 的安全整数版本高于本运行时支持范围”识别为稳定 typed error；其他畸形、旧版号、closed-schema 或摘要失败继续视为损坏。
- 在项目 Dashboard 快照中增加 optional、只读、无路径泄露的 `unsupported-canonical-version` issue，并提供中英文说明与升级后刷新重试。
- 保持未知版本不可读、不可写、不可降级；本 Change 不迁移或改写任何 canonical state。
- 兼容 issue 优先于 Progress 的 no-change 教学空态；其他可读 Change 继续展示。

## Capabilities

### New Capabilities

- `canonical-state-version-status`

### Modified Capabilities

- 无。

## Impact

影响 kernel canonical revision 解码错误分类、server snapshot 的加法字段、Dashboard 边界解码与 Progress 状态展示。旧 server 可继续省略新字段；未知 canonical 版本仍失败关闭。无新依赖、无写端点、无持久化格式变更。
