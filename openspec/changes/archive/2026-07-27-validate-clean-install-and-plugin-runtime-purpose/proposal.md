# 提案

## Why

当前公开的一步安装命令已有自动化 bootstrap 覆盖，也在既有 Codex 环境完成过真实
setup/update 与 Dashboard 验收，但尚缺少从干净宿主状态出发、连接真实 Codex Marketplace 的
可重复首装证据，因此不能把“发布包可安装”等同于“真实零基础首装已完整验收”。

同时，`openspec/specs/plugin-runtime/spec.md` 缺少 OpenSpec 主规格应有的 `## Purpose`，
形成与其他主规格不一致的既有基线债务。

## What Changes

- 建立非破坏、可重复的真实 Codex 干净首装验收，隔离宿主与 Tenon 用户状态，验证公开
  bootstrap、Marketplace 安装、受管 runtime、doctor、Dashboard 身份及重复执行。
- 修复 changed-release 发布在 evidence 失败、恢复 previous Dashboard 后无法 fresh retry 的死锁：
  activation 前冻结精确 listener/空端口事实，只允许事务替换该精确 previous listener；补偿的
  stop、activation revert、previous restore 与完成证明必须分阶段写入 WAL 并可幂等恢复。
- 收紧进程归属边界：spawn 层必须在返回 ready 前用私有 child handle 清理身份不匹配的子进程；
  coordinator/restore 边界收到不可信 session 时只能失败关闭，禁止对其发送信号。
- 将该验收接入适当的本地/发布门禁，并明确真实凭据或宿主能力不可用时的诚实失败/跳过边界。
- Release 公网验收必须下载当前 checkout 对应的不可变 ref/commit 下的 `install.sh`，不得以
  漂移的 `main` 代替待发布候选；锁 PID 与 HTTP 错误诊断必须保持严格、无歧义。
- 仅为 `plugin-runtime` 主规格补充准确的 `## Purpose`，不改变、重排或重写任何既有
  requirement 与 scenario。
- 非目标：停止未在 activation 前冻结的 listener、扩大到任意不同 release、引入第二套安装通道、
  复制凭据、清理真实用户 Codex/Tenon 状态，或借本 Change 修改 `plugin-runtime` requirements。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-distribution`：补齐公开 Codex bootstrap 的真实干净首装验收契约与证据边界。
- `plugin-runtime`：仅补充主规格 Purpose 元数据；requirements 保持逐字不变。

## Impact

预计影响安装验收工具、发布/CI 门禁、managed release WAL/恢复状态机、相关测试与安装文档，以及
`openspec/specs/plugin-runtime/spec.md` 的 Purpose 区段。真实用户目录、现有受管 runtime、
项目 Change 和凭据均不得成为验收写入目标。具体隔离方式、Codex CLI 对 `CODEX_HOME`/`HOME`
的真实支持及新会话验证能力待 Explore 以当前 v1.0.1 和真实宿主实测确认。
