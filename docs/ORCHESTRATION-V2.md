# Orchestration V2 运行手册

Tenon V2 是 local-first 的持久化编排闭环。Kernel 的 `BoardSnapshotV2` 是唯一状态真相源；`events/` 是 append-only 因果记录；`current.json` 只是可替换的快速投影。Server、Dashboard 和 CLI 都只提交带 `expected_revision` 的 typed command。

## 数据目录

每个 Change 的 `openspec/changes/<change>/.orchestration-v2/` 包含：

- `current.json`：当前快照 envelope，含 checksum；损坏时不得直接编辑。
- `snapshots/`：不可变快照，可按 revision 回放。
- `events/`：不可变事件，按 revision 单调排序。
- `idempotency/`：command identity 与结果绑定，保证重放不重复执行。

所有记录都有 schema version、project/change/correlation、actor、revision、causation 和 before/after digest。未知字段、超限、非法路径、错误 checksum 和断链都会 fail-closed。

## Workflow / Track / Pipeline 契约

规划结果会在同一条事件链中固化为 `workflow-pipeline/v2`，不再只存在于模型或前端临时状态。记录包含：

- `workflow_id@workflow_version`：流程定义身份；`workflow_source` 可为 `builtin`、`project`、`user` 或 `automatic`，并用 `workflow_fingerprint` 锁定内容。
- `track_id@track_revision`：场景能力轨道。未显式指定时由能力信号自动推断（frontend/UI → `frontend`，backend/API/database → `backend`，product/research/requirement → `pm`，否则 `free`）。
- `pipeline_id@pipeline_version`：一次可执行的有效组合身份；`stage_order` 是唯一的执行顺序，`stages[].skills[]` 按 `order` 是 stage 内 Skill 顺序。
- 每个 stage 都声明 `execution_mode`、依赖、Work Item、输入/输出引用、门禁类型；每个 Skill 都保留版本、来源、串并行模式、依赖、MCP、输入/输出 schema 和 validator。Skill 输出保持 opaque，只通过 schema id、artifact ref 和验证报告连接下游。
- `customizations` 明确记录 workflow、track、pipeline 是否自定义，以及用户选择的 Skill/MCP。用户或项目可通过 `pipeline_blueprint` 传入任意合法 ID、版本、阶段和 Skill 顺序；planner 会校验覆盖全部 Work Item、阶段序号唯一、引用安全后再冻结。

默认自动规划会把每个 graph Work Item 物化为一个 stage，因而 stage 顺序、Skill 顺序和运行顺序一一可审计。运行时优先按冻结 pipeline 的 `stage_order` 调度，并在同一 stage 内按 Skill `order` 排序；stage 的 `serial`/`parallel` 会覆盖旧 graph group 的调度提示，避免“看板顺序”和真实执行顺序分叉。

## 状态与恢复

Change 生命周期为 `draft → assessing → planning → [freeze-pipeline] → [freeze-work-graph] → planned → ready → executing → verifying → completed`，并可进入 `waiting-input`、`blocked`、`paused`、`failed` 或 `cancelled`。Pipeline 变更先由 `replan-change` 将旧记录标记为 `superseded`，再冻结新 pipeline 和 graph；旧事件、digest、revision 始终保留。Work Item、Run、Result、Validation 和 Gate 各自有闭集状态；状态只能由 Kernel reducer 通过 command 迁移。

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
