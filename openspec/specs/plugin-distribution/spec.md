# Single Plugin Distribution Specification

## Purpose

Define a complete, immutable, host-selectable plugin release with one
canonical Skill content root and ownership-safe installation behavior.
## Requirements
### Requirement: One release contains the complete pipeline product

Every published Tenon plugin release SHALL contain its CLI, seven-phase workflow, OpenSpec
document contract, mandatory skills, hooks, dashboard, AFK/tap/channel subsystems, templates, and
registered adapters. Selecting a host SHALL select installation ownership and SHALL NOT remove
other packaged product capabilities.

#### Scenario: A clean Codex user installs the plugin

- **WHEN** the user installs the release and runs `tenon setup --codex`
- **THEN** the selected Codex installation exposes the complete default pipeline and bundled skills
- **AND** it does not require a separate workflow or mandatory-skill installation.

### Requirement: Setup and update require one explicit host

Setup and update SHALL require exactly one supported host selector. Native Codex and Claude
selectors SHALL use only that host's marketplace inventory. Registered non-native adapters SHALL
apply only the selected adapter and SHALL NOT claim native automatic-update ownership.

#### Scenario: Host selection is ambiguous

- **WHEN** setup receives zero selectors or more than one selector
- **THEN** it exits non-zero with examples such as `tenon setup --codex`
- **AND** it does not modify any host or active runtime selection.

#### Scenario: One native host is selected

- **WHEN** the user runs `tenon setup --codex`
- **THEN** setup resolves and activates only the Codex-reported package
- **AND** it does not configure Claude merely because Claude metadata is included in the release.

### Requirement: Native hosts activate a verified immutable runtime

A native host checkout SHALL be treated as a candidate rather than an executable trust root.
Setup/update SHALL reject incomplete or symlinked payloads, validate the CLI, hooks, manifests, and
skills, publish a content-addressed immutable release, and atomically select active and previous
verified releases before installing stable launchers.

#### Scenario: Candidate verification fails

- **WHEN** a selected host reports a missing, malformed, symlinked, or smoke-test-failing candidate
- **THEN** publication exits non-zero and preserves the active release and launchers
- **AND** runtime diagnostics identify the rejection.

#### Scenario: Active payload changes after publication

- **WHEN** the selected active payload digest no longer matches its manifest
- **THEN** normal execution is refused and status reports the active release invalid
- **AND** only exact stable rollback to a verified previous release remains authorized.

### Requirement: Releases support bounded host-owned updates

Native releases SHALL support `tenon update --codex` and `tenon update --claude`. Automatic
update SHALL be explicit opt-in, scoped to the selected host, bounded to once daily, executed
through the stable launcher, and visible through durable diagnostics. A successful update SHALL be
observed by a new host session.

#### Scenario: Automatic update fails

- **WHEN** host refresh or candidate validation fails during an opted-in automatic update
- **THEN** the active managed release remains selected
- **AND** an `update-rejected` event is visible through runtime status or doctor.

### Requirement: Mandatory workflow skills are bundled

Every skill token required by the default workflow SHALL resolve to a concrete first-party
`SKILL.md` in the same plugin release. External tools and third-party skills MAY be optional
extensions but SHALL NOT block creating, advancing, verifying, or archiving a default Change.

#### Scenario: Package verification finds a missing skill

- **WHEN** a mandatory registry token has no packaged skill directory or resolves externally
- **THEN** package verification fails before the release is activated.

### Requirement: One plugin release SHALL expose one canonical Skill root

The repository `skills/<id>/SKILL.md` tree SHALL be the only maintained source
of first-party Skill content. Packaging SHALL copy that tree once into the
immutable plugin payload, and a running native installation SHALL expose
exactly one Selected Skill Root for that release. Manifests, registries,
workflows, tests, and documentation SHALL reference canonical Skill IDs rather
than duplicate Skill content.

#### Scenario: Native Codex setup is repeated

- **WHEN** `tenon setup --codex` or its idempotent update path is run more
  than once
- **THEN** exactly one immutable selected payload Skill root is discoverable
- **AND** no same-name project or user projection is added.

#### Scenario: Package verification finds duplicate Skill content

- **WHEN** two maintained payload paths claim the same canonical Skill ID
- **THEN** release verification fails before activation
- **AND** identifies both paths.

### Requirement: Native and static Skill projections SHALL be mutually exclusive

The Codex compatibility adapter MAY create project `.agents/skills` links only
for a host that cannot discover the native tenon plugin. When a verified
native Selected Skill Root exists, the adapter SHALL skip project Skill
projection. Switching modes SHALL not leave both roots discoverable.

#### Scenario: Adapter detects a native installation

- **GIVEN** a verified native tenon Selected Skill Root
- **WHEN** the compatibility adapter runs for the project
- **THEN** it installs no tenon project Skill links
- **AND** diagnostics report the native selected root as authoritative.

#### Scenario: Static-only host needs compatibility discovery

- **GIVEN** no native tenon plugin capability or selected root exists
- **WHEN** static adapter installation is explicitly selected
- **THEN** the project projection is the sole tenon discovery root
- **AND** rerunning installation remains idempotent.

### Requirement: Legacy duplicate migration SHALL be ownership-safe

A migration from static projection to native discovery SHALL remove only
tenon-owned symlinks whose lexical target and resolved target match the
adapter's expected source Skill. It SHALL never delete a real directory, a user
file, or a foreign symlink. Ambiguous ownership SHALL fail closed with an
actionable diagnostic.

#### Scenario: Owned legacy links are removed during native migration

- **GIVEN** a project Skill link is a symlink created by the compatibility
  adapter and still resolves to its exact expected source
- **WHEN** native discovery becomes authoritative
- **THEN** the migration may remove that link
- **AND** records the selected native root.

#### Scenario: User-owned content has the same Skill ID

- **GIVEN** the project path is a real directory or points outside the expected
  adapter source
- **WHEN** migration encounters the same canonical Skill ID
- **THEN** the path is preserved
- **AND** setup reports a shadow conflict instead of overwriting or deleting it.

### Requirement: Skill diagnostics SHALL distinguish duplicate projection and shadow conflict

Doctor and installation checks SHALL enumerate all relevant discovery roots,
compute canonical content digests, and report the Selected Skill Root. Multiple
roots with the same ID and digest SHALL be reported as
`duplicate-projection`; the same ID with different digests SHALL be reported as
`shadow-conflict` and SHALL fail closed for execution. Historical cache roots
SHALL not be silently added to the active candidate set.

#### Scenario: Same content appears in two discovery roots

- **WHEN** the same canonical Skill ID and digest are discoverable from native
  and project roots
- **THEN** doctor reports `duplicate-projection`
- **AND** selects only the native canonical root
- **AND** recommends or performs only ownership-safe convergence.

#### Scenario: Different content shadows a canonical Skill

- **WHEN** one Skill ID resolves to different digests in discoverable roots
- **THEN** doctor reports `shadow-conflict` with both sources
- **AND** evidence and execution fail closed until the conflict is resolved.

### Requirement: Default workflow evidence remains generated and consumed

Packaging and updates SHALL preserve the digest-bound default workflow document contract:
proposal/design/tasks at Open; Superpowers design and ADR at Explore; delta spec and plan at Spec;
verification report at Verify; applied main spec receipt at Ship; and complete read receipts before
review transitions and Archive.

#### Scenario: A later phase has not read a changed document

- **WHEN** a required document is missing, stale, or lacks the current phase's read receipt
- **THEN** the phase guard rejects transition even if the file exists on disk.

### Requirement: Dashboard health identifies the active release

Native setup and successful update SHALL run or hand off the dashboard from the active immutable
release. The default dashboard port SHALL remain `18765`, and `/api/health` SHALL expose the exact
active release identifier.

#### Scenario: A new release takes dashboard ownership

- **WHEN** a verified release becomes active and setup completes
- **THEN** the dashboard responds on the configured port
- **AND** the health release ID equals runtime status's active release ID.

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

### Requirement: Machine-state scope identity is canonical and path-private

The state-scope identifier SHALL be derived by one shared first-party primitive from a namespaced
canonical absolute state-Home path. Equivalent relative/trailing-slash inputs SHALL produce the
same identity. The health response, server log and pidfile SHALL NOT contain the state-Home path.

#### Scenario: Lexically equivalent state roots

- **WHEN** two inputs resolve to the same absolute path
- **THEN** they produce the same full-length versioned state-scope identifier.

### Requirement: 新用户 SHALL 无需 clone 一步安装完整插件

Tenon SHALL 提供一行 Marketplace bootstrap，用户只选择一个宿主。bootstrap SHALL 注册
`jefferysha/tenon` Marketplace、安装 `tenon@tenon`、从宿主 inventory 解析真实安装根、
验证完整 payload，再调用包内 `tenon setup --<host>`。用户不得被要求手动 clone、安装 monorepo
依赖、运行 build 或拼装 Skills。

#### Scenario: Codex 新用户执行一行安装

- **WHEN** 用户执行官方 bootstrap 并选择 `--codex`
- **THEN** Codex Marketplace 安装一个完整 Tenon 插件
- **AND** CLI、七阶段 workflow、OpenSpec、Skills、hooks、Dashboard 与 adapters 均可从同一 payload 使用
- **AND** 安装后提示真实的一次性 hook 信任与新会话生效边界。

#### Scenario: Marketplace candidate 不完整

- **WHEN** inventory 返回的候选缺少任一受管资产、包含非法 symlink 或 smoke 失败
- **THEN** bootstrap 非零退出且不选择该候选
- **AND** 既有 active release 与 launcher 保持不变。

### Requirement: Marketplace 与 npx SHALL 复用同一安装事务

Marketplace SHALL 是首选宿主分发入口。公开 npm 包 MAY 提供
`npx --yes @<publisher>/tenon setup --codex`，但它 SHALL 是薄 bootstrap，并复用同一产品身份、
release manifest、候选验证、content-addressed publication、active/previous 选择和更新诊断。
两种入口不得创建第二 runtime、第二 Skill root 或第二 update 状态。

#### Scenario: 本地验证 npx tarball

- **WHEN** CI 对待发布 npm tarball 在隔离 HOME 执行 npx 首装
- **THEN** 它安装/激活与 Marketplace 相同 digest 的 payload
- **AND** tarball 不包含设计 demo、截图、内部研究、测试运行态或 monorepo 开发依赖。

#### Scenario: npm 尚未完成首次发布

- **WHEN** publisher scope 或发布凭据不可用
- **THEN** 文档继续提供真实可用的 Marketplace bootstrap
- **AND** 不把 npx 命令或 npm 包描述为已公开发布。

### Requirement: 跨品牌更新 SHALL 使用有期限的旧通道迁移桥

既有旧 identity 无法通过同名 update 自动发现新的插件/package identity。旧分发通道 SHALL 发布
一个所有权安全、可审计、失败可回滚的 migration bridge：验证 Tenon 候选、原子激活新 release、
验证新 launcher 和新宿主登记后，才移除旧登记。Tenon 本体 SHALL 不提供旧命令兼容。

#### Scenario: 旧用户完成迁移

- **WHEN** 旧自动更新通道获得 migration release 且 Tenon 候选验证通过
- **THEN** active/previous 记录原子切换到 Tenon
- **AND** 新会话只发现 Tenon Skill root、插件身份与 launcher
- **AND** 旧 launcher 和登记仅在新入口验证后删除。

#### Scenario: 迁移候选验证失败

- **WHEN** 下载、manifest、Skill、hook、Dashboard 或 CLI smoke 任一失败
- **THEN** 旧 active release 保持可用
- **AND** 失败原因进入持久诊断
- **AND** 不产生半迁移的 Tenon active 状态。

### Requirement: Tenon 更新 SHALL 只有一个整包事务

Tenon SHALL 使用 `tenon update --<native-host>` 更新唯一的完整插件，不得再把 CLI/runtime
拆成第二套 `--self-update` 通道。手动更新与用户明确启用的定时更新 SHALL 调用同一个事务协调器；
Skills、hooks、CLI、Dashboard、workflow 与 adapters SHALL 来自同一候选 payload 和 release digest。

宿主 Marketplace/plugin manager SHALL 是宿主插件登记与 cache 的唯一写入者；Tenon 不得直接改写、
备份或恢复宿主私有 cache 目录。Tenon SHALL 在自己的所有权边界内对 content-addressed runtime、
active/previous selection、bootstrap、stable launchers 与 Dashboard 服务执行可审计事务，并明确报告
宿主提交与 Tenon 提交两个边界，不得把只回滚 managed selection 描述成“整个宿主插件已恢复”。

项目 canonical Change、OpenSpec 与任务文件不属于插件更新事务。更新 SHALL 只读取机器级项目注册表，
报告需要显式 `tenon sync` 的项目，不得在后台或 `--auto` 模式中静默修改工作区。

#### Scenario: 用户更新完整 Codex 插件

- **WHEN** 用户运行 `tenon update --codex`
- **THEN** 只有 Codex Marketplace/plugin manager 更新 `tenon@tenon`
- **AND** 宿主 inventory 返回的候选先完成 payload、CLI、workflow、hook、Skill 与 Dashboard smoke
- **AND** Tenon 再把同一 digest 发布为 content-addressed managed release
- **AND** active selection、bootstrap、两个 stable launchers 与 18765 Dashboard 共同提交。

#### Scenario: 自动更新已明确启用

- **WHEN** `tenon setup --codex --auto-update` 已写入用户偏好且每日检查到期
- **THEN** 后台任务调用与手动更新相同的 `tenon update --codex --auto`
- **AND** 不存在第二套下载器、selection、Skill root、CLI 自更新或项目写入逻辑。

#### Scenario: launcher 或 Dashboard 提交失败

- **WHEN** managed release 已验证，但任一 launcher 写入或新 Dashboard readiness 失败
- **THEN** Tenon SHALL 以 activation 前快照精确恢复 selection、bootstrap、launcher 的存在性/内容/mode
- **AND** 终止本次候选 Dashboard child，并重新验证或恢复 previous release 的 18765 服务
- **AND** 持久诊断分别说明宿主提交状态与 Tenon managed transaction 的补偿结果。

#### Scenario: 已登记项目需要新投影

- **WHEN** 更新后的 runtime 扫描机器级项目注册表并发现某项目版本落后
- **THEN** 更新结果列出项目及显式 `tenon sync` 命令
- **AND** 自动更新不得写该项目的 OpenSpec、Change、rules 或 owned manifest。

### Requirement: Tenon 产品机器状态 SHALL 只有一个路径所有者

Tenon 自有的 release、staging、selection、audit、项目注册表、凭证、Dashboard token 与 pid
SHALL 全部由 kernel 的单一平台路径解析器定位。macOS SHALL 使用
`~/Library/Application Support/tenon`，Linux SHALL 使用带 `tenon` 命名空间的 XDG
data/state/config roots，Windows SHALL 将本机 data/state 与 roaming config 分开。
Tenon 不得借用 `.claude`、`.codex` 或其他宿主目录保存产品状态。

`TENON_RUNTIME_HOME` SHALL 是测试与运维隔离的唯一用户覆盖。安装器 SHALL 只解析一次实际 roots，
并通过版本化 `TENON_RUNTIME_ROOTS` 契约把精确 root 元组传给 stable launcher、bootstrap、CLI 与
Dashboard；bootstrap、server 和各领域 store 不得各自复制平台路径算法。单 root 环境变量 MAY
作为冻结 N−1 bootstrap 与 shell hook 的只读投影，但当前路径解析器不得把它们作为第二输入源。

#### Scenario: 新安装在不同平台解析产品状态

- **WHEN** Tenon 在 macOS、Linux 或 Windows 上首次安装
- **THEN** kernel 返回该平台标准目录下、带 `tenon` 命名空间的 data/state/config roots
- **AND** release、selection、registry、secrets、Dashboard token 与 pid 均位于约定的产品域
- **AND** `.claude` 与 `.codex` 只用于宿主资产发现，不成为 Tenon 产品状态根。

#### Scenario: launcher 启动不同进程

- **WHEN** stable launcher 启动当前 bootstrap、冻结 N−1 bootstrap、CLI 或 Dashboard
- **THEN** 所有进程消费同一个带版本的 `TENON_RUNTIME_ROOTS` 元组
- **AND** current runtime 不会因单 root 投影变量或 Dashboard 专属 Home 得到第二套状态目录
- **AND** Dashboard 单例 scope 绑定 canonical `stateRoot`。

#### Scenario: 运维隔离运行时

- **WHEN** 测试或运维显式设置 `TENON_RUNTIME_HOME`
- **THEN** kernel 在该根下确定性派生 data/state/config
- **AND** 子进程接收相同 root contract
- **AND** 未设置该变量时不会从任一旧产品或宿主目录隐式回退。

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
