# 干净 Codex 首装与 Plugin Runtime Purpose 设计

## 目标与事实基线

本 Change 同时关闭两个可独立验证、但共享发布边界的问题：

1. 把“一步安装脚本存在且 fake-host 测试通过”提升为真实 Codex CLI、真实 Marketplace、
   全隔离用户状态、真实 managed runtime、真实 Dashboard 和真实新进程发现的端到端验收。
2. 为 `openspec/specs/plugin-runtime/spec.md` 补齐 OpenSpec 必需的 `## Purpose`，并用
   requirements-tail digest 证明既有 requirements 与 scenarios 逐字不变。

2026-07-27 使用 `codex-cli 0.144.1` 在空的临时 `HOME`、`CODEX_HOME` 与工作目录实测：

- `codex plugin marketplace add jefferysha/tenon --ref main` 成功登记 Git Marketplace；
- `codex plugin add tenon@tenon --json` 成功安装版本 `1.0.1`；
- 新启动的 `codex app-server` 在不登录、不调用模型、不读取或复制真实凭据的情况下，
  通过 `plugin/installed` 发现启用的 `tenon@tenon`；
- 同一新进程通过 `skills/list` 发现 62 个 `tenon:*` skills，并通过 `hooks/list` 发现
  12 个 Tenon hooks，覆盖 `preToolUse`、`postToolUse`、`sessionStart` 与
  `userPromptSubmit`；
- hooks 的 `trustStatus=untrusted` 是 Codex 的预期人工安全门，安装器必须继续明确提示
  `/hooks` 信任步骤，自动验收不得伪造信任。

## 根因

现有 `tools/install-bootstrap.node-test.mjs` 能证明参数、命令顺序与 packaged setup 调用，
但宿主是 fixture。真实 Marketplace 安装和新 Codex 进程发现此前没有成为可重复门禁。

进一步沿真实 setup 调用链发现，`ReleasedDashboardOptions.port` 已存在，
`tenon dashboard` 也已支持 `TENON_DASHBOARD_PORT`，但
`publishSetupManagedRuntime → publishManagedRelease → coordinateReleaseDashboard`
没有把该端口传给 `inspect/start`。因此隔离 runtime 仍会碰撞真实用户的 18765，无法安全执行
完整首装。

第二个重试缺口是：同一 release 的上一笔已提交事务 Dashboard 对新 setup 来说是
`preexisting`，当前 coordinator 却把所有非当前 transaction id 的 managed listener 都判为
indeterminate。这样重复安装无法证明幂等。已有 journal schema 和补偿逻辑已经声明
`owner: transaction | preexisting`，但成功路径尚未实现 `preexisting` 分支。

## 决策

### 1. 一个验收器，两种候选来源

新增 Node 验收器，统一执行以下断言：

```text
临时 HOME/CODEX_HOME/TENON_RUNTIME_HOME + 唯一空闲端口
  → 真实 Codex Marketplace 安装
  → packaged tenon setup --codex --yes
  → stable launcher doctor/runtime
  → Dashboard health + HTML 产品身份
  → 新 codex app-server 的 plugin/skills/hooks inventory
  → 相同输入重复执行并证明幂等
  → 只停止本轮精确拥有的 Dashboard，清理本轮精确临时根
```

- `local` 模式从当前 checkout 登记 Marketplace，用于 PR/CI 验证候选本身。
- `public` 模式执行调用方显式指定的公开 immutable ref/commit 下的 `install.sh`；普通人工
  验收可显式选择 `main`，release workflow 必须传当前 checkout 的精确 commit。
- 两种模式共用后半段断言，避免“本地测试一套、公网 smoke 另一套”的漂移。

真实模型调用不属于首装加载证明。Codex 官方 app-server 协议已提供
`plugin/installed`、`skills/list` 与 `hooks/list`；它们是宿主实际发现路径，并且无需账号
凭据。只有需要模型生成的产品行为才进入已有 credential-gated real-Codex 轨。

### 2. 端口属于 Dashboard launch options，不新增第二个 runtime home

setup/update 从既有 `SetupEnv.runtimeEnv().TENON_DASHBOARD_PORT` 解析一次可选端口，并把它作为
`ManagedReleaseRequest.dashboardPort` 传入 coordinator。coordinator 对 before/current/start
使用同一个端口。缺失时仍唯一回退 18765；非法值不静默改写为其他端口，而是沿现有默认行为或
在调用边界给出可诊断结果。

不新增 setup CLI flag、不新增 Dashboard 专属 home、不改变普通用户命令。该环境变量只是现有
Dashboard 运维覆盖在 managed setup/update 调用链中的一致传播。

### 3. pre-activation identity 决定 Dashboard 是否可保留或替换

新事务在 activation 前先把健康 listener 的完整 identity 或显式空端口事实写入 WAL。activation
后再次观察时：

- 若 transaction id 等于当前 WAL，按当前事务 adopt；
- 若 release id 与新 activation 相同、state scope 和端口已经由 starter 精确验证，则保留该
  listener，journal 记录 `owner: preexisting`，新事务不得 stop；
- 若 listener 是 activation 前冻结的 current active previous release 且所有 identity 字段不变，
  新事务可精确 adopt/stop 它，再启动 candidate；
- 若 pre-activation 已证明端口为空，或 listener 未冻结、不是 previous active release、身份漂移，
  继续 fail closed，绝不 adopt、stop 或覆盖。

恢复 `dashboard-ready` journal 时同时接受精确的 `transaction` 与 `preexisting` ownership：
前者必须 adopt；后者必须重新 inspect 并证明 listener 身份仍与 journal 完全一致。补偿只停止
`transaction` owner，`preexisting` 永远不属于本次回滚域。

`runtime-activated` 及其后 phase 的 journal 若缺少 pre-activation
`dashboardBefore`/`dashboardBeforeAbsent` 或 `dashboardPort`，必须作为旧 WAL fail closed；
不得在 activation 后 probe 或从当前 retry 环境补写成历史证据。

changed-release candidate 的 readiness/evidence 失败时，补偿不是一段不可恢复的
`stop → revert → clear → restore` 顺序，而是 WAL 驱动状态机：

```text
stopping-candidate
  → reverting-activation
  → restoring-previous
  → previous-restored
  → clear WAL
```

每次 phase 在对应外部副作用前写入。恢复时先 inspect/prove：candidate 已不存在才进入 revert；
activation 仍为 candidate 时执行 revert，已等于 checkpoint 时视为幂等完成，其他状态
indeterminate；previous listener 已与记录的恢复 identity 精确一致时复用，不存在时才重新启动；
只有 `previous-restored` 的精确证明通过后才清 WAL。这样任一阶段崩溃都保留恢复责任，fresh retry
才会在新 transaction 中重新冻结恢复后的 previous identity，精确停止后启动 candidate。

starter/spawn 是唯一持有新 child 私有 handle 的层。它必须在返回 `ready` 前验证 release、port、
child PID 与 health PID、canonical state scope 与 transaction；不匹配时用私有 handle 自行终止
child 并返回失败。previous restore 生成本次补偿唯一 identity，并要求 health 回显，以排除并发
listener 冒充恢复结果。coordinator/restore adapter 返回的 session 如果不匹配，只能视为不可信
结果并保留 WAL，不得调用该 session 的 `stop()`。adopt 也必须先由 inspect 的完整 identity建立
信号权限。

### 4. Purpose-only 修复使用 requirements-tail digest

`plugin-runtime` 的 Purpose 为：

> Define the contract that turns a native Tenon plugin installation or update into one
> immutable, recoverable managed runtime with stable launchers, hooks, Dashboard ownership,
> safe Change routing, and an evidence-bound Build-to-Verify handoff.

修改只允许位于标题与 `## Requirements` 之间。变更前固定：

```text
sha256(requirements heading through EOF)
= 6334e35ef63c7c58a7dd70f4e9c01be44650c622beaab0a23e8620413bff1e5c
```

实现后重新计算同一 tail，必须完全相等。随后对 `plugin-runtime`、`plugin-distribution` 和本
Change 执行 strict validate，并在保留权限与 symlink 的临时仓库副本执行真实 OpenSpec archive
演练；演练不得移动真实 Change，也不得修改真实主规格。

## 失败与清理

| 失败 | 结果 |
| --- | --- |
| 临时根不在验收器创建的唯一父目录内 | 启动前失败，不执行宿主命令 |
| Codex CLI 缺失或版本不支持 plugin/app-server | 显式失败；CI 不 honest-skip |
| Marketplace 网络失败 | `public` 轨失败并归类为外部发布依赖，不冒充产品通过 |
| setup/doctor/runtime 任一非零 | 保留脱敏诊断，整体验收失败 |
| 端口已有 listener | 选择新的空闲端口；不得触碰 18765 或未知进程 |
| health 的 pid/release/state scope/transaction 不匹配 | 不发送信号，失败并保留诊断 |
| spawn 后 child identity 不匹配 | spawn 层以私有 child handle 清理；不向 coordinator 暴露 ready |
| 补偿 phase 中崩溃 | 下次启动先证明或幂等续跑，恢复证明前不清 WAL |
| activation 后旧 WAL 缺 pre-activation identity/port | fail closed，不以当前环境补证 |
| lock PID 含非十进制字符 | 判为无效 lock 元数据，不以截断值探测或发送信号 |
| health 返回非 2xx 且 body 非 JSON | 保留 HTTP status 为主因，不被 JSON parse 错误覆盖 |
| 新 Codex 进程未发现入口 Skill 或 hooks | 失败；不能用文件存在替代宿主发现 |
| hook 未信任 | 记录为预期人工门；不得自动改 Codex trust 配置 |
| 重复安装产生新 release、失败 WAL 或第二 listener | 幂等断言失败 |
| archive rehearsal 改动真实树 | repo-zero-output 失败 |

## 覆盖与发布门

- 单元/集成：端口贯穿、非法端口、preexisting same-release、不同 release 冲突、恢复和补偿。
- 现有 bootstrap fixture：继续验证 shell 参数与兼容错误。
- CI：安装固定 Codex CLI，运行 `local` 干净首装验收，之后执行现有全仓门禁。
- Release：在发布候选上以当前 checkout 的精确 commit 执行 `public` 公网 bootstrap 验收；
  GitHub release 不能用漂移的 `main` 或失败 smoke 宣称候选成功。
- 本 Change Verify：在冻结候选上独立重复 `public` 轨、strict validate 和 archive rehearsal。

```coverage
touches:
L1_api:      filled -> ManagedReleaseRequest dashboardPort and clean-install verifier modes
L2_data:     filled -> temporary roots, journal dashboard owner, requirements-tail digest
L3_rules:    filled -> one port per transaction, no credential copy, purpose-only boundary
L4_state:    filled -> Dashboard ownership plus durable compensation WAL phases
L5_errors:   filled -> failure and cleanup table
L6_security: filled -> exact root/process ownership and Codex hook trust boundary
L7_perf:     filled -> one bounded install plus one idempotency rerun
L8_deps:     filled -> Codex CLI 0.144.1, GitHub Marketplace, existing Node runtime
L10_terms:   filled -> local/public acceptance, preexisting ownership, requirements-tail digest
```
