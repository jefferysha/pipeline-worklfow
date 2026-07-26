# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Dashboard health identifies the active machine-state scope

受管 Dashboard 单例 SHALL 同时标识当前不可变 release 与项目注册表、token、密钥和 pidfile
共同使用的机器状态作用域。进程装配层 SHALL 只调用一次产品路径解析器，并把同一个不可变
`ServerPaths` 值对象作为必填依赖注入 Server；Server SHALL NOT 从宿主 home 或进程环境再次推导
产品状态路径。
健康响应 SHALL 暴露不透明且确定性的 `stateScopeId`，并 SHALL NOT 暴露机器状态目录。
该标识只用于身份比较，SHALL NOT 被接受为授权凭据。

#### Scenario: Same release starts for a different state Home

- **GIVEN** a healthy Dashboard is listening on the configured port for state scope A
- **WHEN** the same immutable release is explicitly started with state scope B
- **THEN** the existing process is not reused
- **AND** takeover may proceed only after the reported PID is verified as the real loopback
  listener owner
- **AND** the new health response carries state scope B's identifier.

#### Scenario: Same release starts for the same state Home

- **GIVEN** a healthy Dashboard is listening for the requested state scope and release
- **WHEN** the managed launcher starts again
- **THEN** it reuses the existing process
- **AND** does not replace or duplicate the singleton.

#### Scenario: Legacy health has no state-scope identity

- **GIVEN** a prior Dashboard health response has no `stateScopeId`
- **WHEN** a scope-aware managed Dashboard starts
- **THEN** the legacy process is treated as a one-time migration takeover candidate
- **AND** listener ownership verification remains mandatory before signalling it.

#### Scenario: Managed startup waits for the exact intended process

- **WHEN** setup or update starts a Dashboard from an immutable release
- **THEN** readiness succeeds only when both `releaseId` and `stateScopeId` match the launcher
  expectation
- **AND** a browser is not opened for a process with a mismatched state scope.

#### Scenario: 生产入口装配 Dashboard

- **WHEN** Dashboard 进程使用当前环境与宿主 home 启动
- **THEN** 入口只解析一次完整 `ServerPaths`
- **AND** 注册表、密钥、token、pidfile 与 `stateScopeId` 全部消费该同一快照
- **AND** Server 内部不再次读取进程环境以重建产品路径。

#### Scenario: 显式路径与共享环境并存

- **GIVEN** 调用方提供一组显式 `ServerPaths`
- **AND** 进程环境同时包含指向另一个运行目录的 `TENON_RUNTIME_HOME` 或 XDG 根
- **WHEN** Server 启动并读写机器状态
- **THEN** 它只使用显式注入的路径
- **AND** 不读写共享环境所指向的目录。

#### Scenario: 宿主发现目录与产品状态目录不同

- **GIVEN** 调用方提供的 `hostHome` 与 `ServerPaths.homeDir` 不同
- **WHEN** Server 检查 skills、runner 资产、默认 Codex 凭证或 mem session
- **THEN** `.claude`、`.codex`、宿主会话与其他宿主资产只从 `hostHome` 派生
- **AND** 注册表、密钥、token、pidfile 与状态作用域仍只使用 `ServerPaths`
- **AND** Server 不读取 OS 全局 home 作为第三个隐式来源。

#### Scenario: Server 调用方省略路径依赖

- **WHEN** 代码尝试在未提供 `ServerPaths` 的情况下创建 Dashboard Server
- **THEN** TypeScript 契约在编译期拒绝该调用
- **AND** Server 不提供读取 `process.env` 的隐式 fallback。

#### Scenario: 路径解析失败

- **WHEN** 进程装配层收到损坏或不可接受的运行目录契约
- **THEN** 启动在绑定端口之前 fail-closed
- **AND** 不创建部分注册表、密钥或 pidfile 状态。

## ADDED Requirements

### Requirement: Tenon 命令 SHALL 共享单一产品身份与作用域快照

当前 runtime、hooks、CLI、Dashboard 和诊断命令 SHALL 只发现并调用 Tenon 稳定启动器，不得用
已废弃产品命令的存在性决定当前功能是否可用。一次 CLI 命令需要多个运行时探针时，adapter SHALL
只解析一份不可变 runtime scope，并把该快照注入全部探针；子探针 SHALL NOT 再读取实时 home 或环境。
旧用户迁移只由独立、有期限且所有权安全的 migration bridge 承担，不进入当前命令兼容面。

#### Scenario: 新用户确认 review

- **GIVEN** 新用户环境只安装当前 `tenon` 稳定启动器
- **WHEN** review hook 处理普通确认或已授权的 delegated confirmation
- **THEN** hook 使用同一个 `tenon` 启动器完成可用性检查和 `review acknowledge`
- **AND** 不要求任何已废弃 CLI 命令存在。

#### Scenario: doctor 环境在探针之间变化

- **GIVEN** `tenon doctor` 已在 adapter 边界解析 runtime scope
- **WHEN** native runtime 与 AFK readiness 探针依次执行且实时环境在中途变化
- **THEN** 两个探针仍消费命令开始时的同一不可变作用域快照
- **AND** provider 读取次数不会随子探针数量增加。
