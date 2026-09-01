# Orchestration V2 运行手册

Tenon V2 是 local-first 的持久化编排闭环。Kernel 的 `BoardSnapshotV2` 是唯一状态真相源；`events/` 是 append-only 因果记录；`current.json` 只是可替换的快速投影。Server、Dashboard 和 CLI 都只提交带 `expected_revision` 的 typed command。

## 数据目录

每个 Change 的 `openspec/changes/<change>/.orchestration-v2/` 包含：

- `current.json`：当前快照 envelope，含 checksum；损坏时不得直接编辑。
- `snapshots/`：不可变快照，可按 revision 回放。
- `events/`：不可变事件，按 revision 单调排序。
- `idempotency/`：command identity 与结果绑定，保证重放不重复执行。

所有记录都有 schema version、project/change/correlation、actor、revision、causation 和 before/after digest。未知字段、超限、非法路径、错误 checksum 和断链都会 fail-closed。

## 状态与恢复

Change 生命周期为 `draft → assessing → planning → planned → ready → executing → verifying → completed`，并可进入 `waiting-input`、`blocked`、`paused`、`failed` 或 `cancelled`。Work Item、Run、Result、Validation 和 Gate 各自有闭集状态；状态只能由 Kernel reducer 通过 command 迁移。

执行器先获得 lease，再 heartbeat；lease 过期后恢复报告会记录 `expired-awaiting-scheduler`，runtime 生成新的 attempt 并保留 `prior_attempt_id`。重试、取消、人工门禁和重规划都写入同一事件链。任何 validator unknown/invalid 都不能伪造完成。

## CLI

```text
tenon orchestration init <change> --project <id> --correlation <id>
tenon orchestration start|status|watch|events <change>
tenon orchestration pause|resume|cancel|replan <change>
tenon orchestration retry <change> --work-item <id>
tenon orchestration approve|reject <change> [--gate <id>] [--evidence <ref...>]
tenon orchestration bind-artifact <change> --work-item <id> --ref <ref> --digest sha256:<64 hex>
```

`status`、`events` 和 `watch --json` 输出带 schema 的机器信封；人类输出只显示安全摘要，不打印 provider prompt、token 或 raw output。

## HTTP / SSE / 指标

- `POST /api/orchestration/changes`：初始化 Change。
- `GET /api/orchestration/changes/:id`：当前 canonical snapshot。
- `GET /api/orchestration/changes/:id/events?after_revision=N`：有界事件回放。
- `GET /api/orchestration/changes/:id/stream?after_revision=N`：先发 snapshot，再发 cursor 之后的事件和 heartbeat。
- `GET /api/orchestration/changes/:id/metrics`：有界计数指标，不含原始产出。
- `POST /api/orchestration/changes/:id/commands`：带 token、loopback、JSON 和 CAS 防护的 typed command。

SSE 客户端按 revision 去重；重连时允许收到当前 snapshot 与旧事件，但不得重复应用更旧 revision。冲突响应包含稳定机器码、当前 revision 和最新 snapshot。

## 备份、升级和回滚

停 scheduler 后，将每个 Change 的 `.orchestration-v2` 目录以保留权限和符号链接信息的方式复制到受保护备份位置；恢复时只恢复到同一 Change 目录的临时路径，完成 checksum/replay 校验后再原子替换 `current.json`。不要删除原目录，也不要手工改写事件。

升级前运行 `npm run build`、`npm run check:architecture`、`npm run check:openspec` 和完整测试；若 readiness 或 schema 校验失败，保持 scheduler disabled，旧二进制仍可读兼容投影。回滚只切换程序/静态产物，保留 V2 数据和证据链，后续版本可继续 replay。
