# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 公开 Codex 首装 SHALL 通过真实干净宿主验收

Tenon SHALL 提供一个可重复、失败关闭的真实 Codex 首装验收。验收 SHALL 把 `HOME`、
`CODEX_HOME`、`TENON_RUNTIME_HOME` 与 Dashboard 端口限制在本轮唯一临时作用域，通过真实
Codex Marketplace 安装当前候选或公开 `main/install.sh`，并验证 stable launcher、managed
runtime、doctor、Dashboard 产品身份以及新 Codex 进程发现的插件、入口 Skill 与 hooks。

验收 SHALL 不读取或复制真实用户凭据，不修改真实宿主或 Tenon 状态，不信任 hook，不停止未知
进程。相同候选的重复安装 SHALL 复用同一 content-addressed release；同 release 的健康 managed
Dashboard MAY 作为经过精确身份复核的 `preexisting` 服务保留，但新 transaction MUST NOT adopt
或 stop 它。changed-release transaction SHALL 在 activation 前将 current active previous
Dashboard 的完整 identity 或空端口事实持久化到 WAL；只有随后观察到的 listener 与该 previous
identity 逐字段一致时，transaction MAY 精确 adopt 并 stop 它以启动候选。未冻结、探针之间新出现、
身份漂移或并非 previous active release 的 listener MUST NOT 被 adopt、stop 或覆盖。

进入 `runtime-activated` 前没有冻结 `dashboardBefore`/`dashboardBeforeAbsent` 或
`dashboardPort` 的旧 WAL MUST fail closed；实现 MUST NOT 以 activation 后的 probe 或当前 retry
环境补造 pre-activation 证据。

候选 readiness 或 ready evidence 失败时，transaction SHALL 在每项副作用前持久化补偿 phase，
依次精确停止自己启动的候选、补偿 activation、恢复 previous Dashboard，并在精确恢复证明持久化
后才清除 WAL。进程在任一补偿 phase 崩溃后 SHALL 先证明已完成的副作用或幂等续跑，不能把
`dashboard-ready` 当作可直接清除的失败终态。下一次 fresh retry SHALL 能重新冻结、精确替换
恢复的 previous Dashboard 并完成发布，不得永久停在 indeterminate。

持有私有 child handle 的 starter/spawn 层 SHALL 在返回 ready 前验证 release、port、child PID
与 health PID、canonical state scope 与 transaction，并自行终止由它启动但身份不匹配的 child。
previous restore SHALL 使用本次补偿唯一 identity 防止并发 listener 冒充恢复结果。
coordinator/restore 边界收到身份不匹配的 session 时 MUST NOT 调用该不可信 session 的 stop；
它 SHALL 保留 WAL 并失败关闭。缺少真实 Codex CLI、Marketplace 失败、身份不匹配或清理所有权
不明 SHALL 使强制验收失败，不得以 fixture、文件存在或静默 skip 冒充通过。

#### Scenario: CI 验收当前 checkout

- **GIVEN** CI 安装了受支持的真实 Codex CLI
- **WHEN** 验收器在隔离临时作用域登记当前 checkout 的 Marketplace 并安装 `tenon@tenon`
- **THEN** packaged setup 发布一个已验证 managed runtime，stable launcher 的 doctor/runtime
  检查通过
- **AND** 唯一临时端口的 Dashboard health 与 HTML 均证明 Tenon 产品及 active release 身份
- **AND** 真实用户 HOME、Codex 配置、Tenon runtime 与 18765 listener 保持不变。

#### Scenario: 新 Codex 进程发现插件能力

- **WHEN** 首装完成后在隔离 `CODEX_HOME` 启动一个新的 Codex app-server 进程
- **THEN** `plugin/installed` 返回已安装且启用的 `tenon@tenon`
- **AND** `skills/list` 返回启用的 `tenon:tenon`
- **AND** `hooks/list` 返回 Tenon 的 `sessionStart`、`userPromptSubmit`、`preToolUse` 与
  `postToolUse` hooks
- **AND** hook 的未信任状态被报告为人工安全门，而不是由验收器绕过。

#### Scenario: 相同候选重复安装

- **GIVEN** 首次安装的 release 与 managed Dashboard 已健康提交
- **WHEN** 在同一隔离作用域再次执行相同安装
- **THEN** active content-addressed release 保持一致且不产生第二个 listener
- **AND** 新 transaction 精确证明同 release Dashboard 为 `preexisting`
- **AND** 新 transaction 不 adopt、不停止也不覆盖该 listener。

#### Scenario: changed release 替换 activation 前冻结的 previous Dashboard

- **GIVEN** transaction 在 activation 前已把 current active previous release 的完整 Dashboard
  identity 写入 WAL
- **WHEN** candidate runtime 激活后，同一端口仍返回逐字段一致的 previous listener
- **THEN** transaction 精确 adopt 并停止该 previous listener，再启动带当前 transaction identity
  的 candidate Dashboard
- **AND** 若 listener 未冻结、在空端口证明后才出现或任一 identity 字段漂移，则 transaction
  保留 WAL 并失败关闭，不发送停止信号。

#### Scenario: evidence 失败后恢复并 fresh retry

- **GIVEN** changed-release candidate Dashboard 已健康，但 ready evidence 提交失败
- **WHEN** transaction 精确停止 candidate、补偿 activation 并恢复 previous Dashboard
- **THEN** 本次结果如实报告 restored
- **AND** candidate stop、activation revert、previous restore 与恢复完成证明均在动作前后由
  durable WAL phase 约束，任一 phase 崩溃后可证明或幂等续跑
- **AND** 下一次 fresh retry 重新冻结恢复后的 previous identity，精确停止它并成功启动 candidate
- **AND** restore 或 start 返回的 ready ownership 与预期 release、port、PID、state scope 或
  transaction 不一致时，只有持有私有 child handle 的 spawn 层可以清理自己启动的 child；
  coordinator/restore 必须不发送信号、保留 WAL 并失败关闭。

#### Scenario: Release 验收公开一步安装

- **GIVEN** release workflow 已 checkout 一个待发布的不可变 Git ref/commit
- **WHEN** public 轨从该精确 ref/commit 对应的 raw URL 下载 `install.sh` 并执行 `--codex`
- **THEN** 它执行与 CI 候选轨相同的 runtime、doctor、Dashboard、新 Codex 进程和重复安装断言
- **AND** 下载 ref 与当前 checkout 一致，漂移的 `main` 不得代替待发布候选
- **AND** 任一 Marketplace、安装、身份或清理断言失败都会使 release 验收非零退出。

#### Scenario: 严格保留锁与 HTTP 诊断

- **WHEN** runtime 读取 lock owner PID 或等待 Dashboard health
- **THEN** PID 只有在完整值为安全的十进制正整数时才可参与存活判断
- **AND** 带数字后缀、前缀或其他字符的 PID 被视为无效而不是被 `parseInt` 截断
- **AND** 非 2xx health 响应先以 HTTP status 归因，即使 body 不是 JSON，也不得被 JSON
  解析错误覆盖。

#### Scenario: 清理时无法证明 Dashboard 所有权

- **WHEN** 验收结束时端口上的 pid、release id、state scope 或 transaction id 不再等于本轮记录
- **THEN** 验收器不向该进程发送终止信号
- **AND** 以清理所有权不明失败并保留脱敏诊断。
