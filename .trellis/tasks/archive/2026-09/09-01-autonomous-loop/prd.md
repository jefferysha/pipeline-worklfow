# Production autonomous development platform

## Goal

把 Tenon 从“可验证的内存编排适配器”完成为一个生产可用的、local-first 的自主开发平台：用户只输入自然语言目标，系统自动识别执行所需的能力，组合用户自定义 Skill/MCP，持久化每个决策和状态，通过 Server/SSE 和 Dashboard 实时观察、控制、恢复整个开发流程。

第一阶段以单机单仓库单 Change 为生产基线，但所有协议必须保留 revision/CAS、审计、租约和版本化边界，后续可安全扩展到企业部署。

## Confirmed baseline

- Kernel 已拥有版本化编解码器、不可变 canonical transition、revision guard、TaskPlan/WorkGraph 和现有 Workflow gate。
- Automation 已拥有 provider proposal 边界与 Skill 执行适配器 v1；它目前是内存服务，不负责持久化、HTTP 或 Dashboard。
- Server 已有 loopback HTTP、token、snapshot/SSE、StateStore、transition record 和 WorkflowRunRepository 基础设施，但尚未把新 orchestration board 接入持久化读写与控制 API。
- Dashboard 已有项目、Workflow、AFK、TaskPlan 和部分编排画面基础，但尚未消费 production orchestration snapshot/command/SSE 契约。
- 远程 `origin/main` 当前为 `4073e54`（v1.0.7）；本地工作分支包含更完整的 Trellis 与 orchestration 设计，远程比较只作为兼容性输入，不覆盖本地用户变更。

## Product requirements

### P1. Natural-language intake and automatic capability inference

用户不选择“前端/后端/全栈”等场景。系统基于目标、仓库事实、策略和可用能力生成 bounded proposal，归一化为 capability requirements、constraints、risks、acceptance refs 和 clarification questions。scene label 只能作为展示信号，不能驱动状态迁移。

### P2. User-defined Skill/MCP composition

用户可以注册或选择任意自定义 Skill/MCP，并声明串行、并行和显式依赖。Skill 输出契约可能完全不同；系统只要求生命周期、artifact ref 和 validator 接口，不要求强行统一领域 schema。用户选择优先于自动选择，但不可越过权限、资源冲突和不可满足依赖。

### P3. Durable canonical state and event history

Change、Work Item、Run、Result、Validation、Gate、Board Command 都必须版本化、可重放、可恢复。快照和 append-only event/transition 记录必须崩溃安全；每个写命令带 expected revision，冲突必须 fail-closed。重启后只能从最后一个可信 revision 恢复，不能从半写文件或模型输出推断状态。

### P4. Production execution runtime

执行器需要 worker lease、heartbeat、超时、优雅取消、有限重试、幂等 run identity 和 orphan recovery。串行/并行调度必须由冻结 WorkGraph、Skill resource claims 和策略共同决定。禁止静默重试、重复运行或以进程退出码伪造成功。

### P5. Heterogeneous output and verification gates

每次执行保存通用 result envelope、opaque output ref、artifact metadata、诊断和 validator report。只有 validator 或显式政策批准的人审 receipt 可以将结果视为 proof；unknown/invalid/缺失验证只能进入 blocked、waiting-input 或 failed。verify/review/ship gate 必须复用 Kernel guard。

### P6. Server control plane

提供受保护的创建、读取、事件回放、SSE 订阅和 typed command API，覆盖 pause、resume、approve、reject、retry、cancel、replan、bind artifact。所有写请求使用 loopback/DNS rebinding 防护、token/auth、Content-Type、body/速率限制和 expected revision CAS；错误响应不泄露 secrets 或原始模型输出。

### P7. Dashboard board

看板实时展示 Change/Work Item/Run/Gate、当前 Skill/MCP、依赖、资源、artifact ref、validator 状态、租约、阻塞原因、下一步和 revision。控制操作必须显示确认、冲突重载和失败原因，不能直接编辑状态列。断线后自动重连并从 last event/revision 恢复。

### P8. CLI parity

CLI 只作为同一 application command 的薄适配器，支持 start/status/watch/pause/resume/approve/retry/cancel/replan，并输出机器可读 JSON 与人类可读进度。CLI、Server、Dashboard 必须读取同一个 canonical snapshot。

### P9. Observability and safety

记录 correlation/causation、actor、provider/model、Skill/MCP 版本、输入摘要、耗时、重试、成本、人工介入、阻塞和验证差异。默认 redaction、路径/网络/并发/输出限额、审计完整性校验、优雅关闭和可诊断健康端点必须存在。

### P10. Release readiness

提供 migration/compatibility checks、构建产物同步、readiness/liveness、数据目录备份与恢复说明、单机升级/回滚流程和端到端黄金路径。未接线能力必须在 capabilities/readiness 中明确为 unavailable，不能在 UI 或 API 中谎报完成。

## Acceptance criteria

- [ ] 用户只输入自然语言目标，能够得到带能力、约束、风险和待澄清项的 proposal；无需先选场景。
- [ ] 两个以上自定义 Skill 可按用户依赖执行串行与安全并行组合，版本和 MCP 绑定被固定记录。
- [ ] 任意 JSON-compatible 或 opaque Skill 输出都能进入通用 result envelope；非 JSON、超限、越权或恶意输出被拒绝且不进入 canonical state。
- [ ] 进程在任意命令/执行阶段重启后，可从最后可信 revision 恢复，孤儿 lease 不会重复执行。
- [ ] executor 抛错、validator 缺失/失败、CAS 冲突和依赖缺失都进入可解释、可恢复的 blocked/failed 状态，不伪造完成。
- [ ] Server 提供带鉴权和 CAS 的读/写/SSE API；过期 revision 返回机器可判定的 conflict 并包含最新 revision。
- [ ] Dashboard 能实时显示阶段、运行、产出、验证、租约和阻塞，并完成 pause/resume/approve/retry/cancel/replan。
- [ ] CLI 与 Dashboard 看到的状态一致；断线重连和事件回放不会丢失或重复应用状态。
- [ ] 一个真实本地仓库 Change 能从 intake → context → assessment → graph → route → execute → validate/review 推进到 completed，或以明确 blocker 终止。
- [ ] 每个命令、运行和人工介入都有可追踪审计；敏感配置和原始输出不会出现在日志、响应或看板状态中。
- [ ] `npm run build`、架构/注释门禁、全包类型与测试、Server/Dashboard E2E 和 release readiness 检查通过；失败项必须分类记录。

## Out of scope for this release

- 多租户云控制面、组织/RBAC/计费、跨团队协作和多仓库事务。
- 自动部署到生产环境、不可逆外部变更和无人审查的 ship gate。
- 自动理解任意 Skill 的深层业务语义，或把所有领域产出转换为一个统一 schema。
- 依赖强制在线的第三方数据库/队列；单机持久化优先，外部基础设施通过端口接入。

## Key decisions

- Kernel 是唯一 canonical state machine；Automation 负责 application sequencing；Server、CLI、Dashboard 只能通过 typed command/query 适配。
- Storage 使用 atomic snapshot + append-only event/transition record + lock/CAS；不使用 last-write-wins。
- Model/provider/executor/validator/MCP 都是不可信或可失败边界；先 bounded normalize，再允许进入 canonical state。
- “自动识别场景”以 capability/constraint inference 实现，不创建固定 scene 枚举。
- 第一版生产基线保留 `verifying` 停止点；没有真实验证/审查证据时不自动宣称 completed 或 ship。

## Child task map and order

1. `09-01-canonical-orchestration-aggregate-v2` — one v2 schema/state/event/effect/transition authority and honest legacy adapters。
2. `09-01-orchestration-persistence-recovery` — durable snapshot/event store, codecs, CAS, crash/restart recovery。
3. `09-01-automatic-planning-routing` — intake/context/proposal-to-graph planner and dynamic Skill/MCP catalog。
4. `09-01-persistent-execution-adapters` — leases, worker runtime, retry/resume/cancel and real executor/validator ports。
5. `09-01-orchestration-server-api` — authenticated HTTP/SSE/query/command control plane。
6. `09-01-production-orchestration-dashboard` — production board, controls, reconnect and accessibility。
7. `09-01-orchestration-cli-observability-release` — CLI parity, metrics/audit, E2E, migration/readiness and release hardening。

Each child is independently testable; the listed order is a dependency order, not permission to bypass the parent acceptance criteria.
