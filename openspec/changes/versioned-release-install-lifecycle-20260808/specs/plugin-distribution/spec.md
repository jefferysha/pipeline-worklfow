# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 公开安装 SHALL 从版本标签提供完整预构建产品

官方安装命令 SHALL 从不可变稳定 SemVer 标签读取 `install.sh`。该脚本 SHALL 安装同标签的完整 Codex 插件并运行打包 CLI；用户机器 SHALL NOT 需要 clone 仓库、安装 workspace 依赖、调用构建命令或从源码入口启动 Tenon。

#### Scenario: 干净 Codex 用户安装正式版本

- **WHEN** 用户执行固定到 `vX.Y.Z/install.sh` 的官方一行命令
- **THEN** installer 只调用受信任 PATH 中的 Codex CLI、Node 和标签内已发布 bundle
- **AND** 安装后的插件包含 CLI、server、Dashboard、Skills、hooks 和 manifests
- **AND** 命令历史不包含 `npm install`、`npm run build` 或本地源码路径
- **AND** installer 与生成的稳定 launcher 执行冻结的绝对 Node/Bash/host CLI 路径，不重新从 cwd 或相对 PATH 解析程序

#### Scenario: 标签内版本身份漂移

- **WHEN** install 脚本默认 ref、根 package、Codex/Claude plugin manifest 或 workspace package 版本与标签不一致
- **THEN** release/identity 门禁失败
- **AND** 该候选不得成为正式安装命令

#### Scenario: 同版本插件登记存在但被禁用

- **WHEN** 预检发现 Tenon plugin/marketplace 版本与目标一致但 plugin registration 被禁用
- **THEN** installer 把它视为可修复状态并通过公开 remove/add 收敛
- **AND** 不在任何 mutation 前错误拒绝本次安装

#### Scenario: 公开 bootstrap 在 packaged CLI 可用前中断

- **WHEN** 一行安装器必须先通过宿主 CLI 重绑定 Marketplace/plugin，且在任一 remove/add 后中断
- **THEN** 它已在 Tenon machine state 中持久化 target tag/commit、原 inventory、transaction 与下一 phase
- **AND** 同一宿主的并发 installer 由存活 owner lease 串行化
- **AND** 重跑只接纳 journal 记录的 before 状态或已证明的目标 postcondition，并从原 phase 幂等继续
- **AND** 任一并发第三状态保持不变并失败关闭，不被无条件 remove

### Requirement: 正式新用户验收 SHALL 使用宿主级卸载与版本化重装

稳定 Release 发布后 SHALL 在真实用户路径验证：通过宿主 CLI 删除现有 Tenon plugin 和 Tenon marketplace，执行公开版本化一行安装，重复安装，并执行 `tenon update --codex`。该验收 SHALL 保留项目 Change/OpenSpec、用户规则、截图和可恢复 managed runtime。

#### Scenario: 维护者验收公众安装命令

- **WHEN** 新稳定 Release 已发布且维护者开始最终安装验收
- **THEN** 维护者先记录当前 plugin、marketplace、launcher、runtime 和 Dashboard 身份
- **AND** 仅通过 Codex 公开 CLI 删除 Tenon plugin/marketplace
- **AND** 从 GitHub 已发布标签执行 README 中完全相同的一行命令
- **AND** 最终 inventory 不指向本地 marketplace、开发 worktree 或 `main`

#### Scenario: 重装失败

- **WHEN** 宿主 plugin 已删除但正式安装在网络或候选校验阶段失败
- **THEN** 项目数据和旧 managed runtime 保持不变
- **AND** 稳定 launcher 提供重试或 runtime 诊断路径

### Requirement: 可执行工具冻结 SHALL 绑定文件身份与可信路径链

安装器与 native lifecycle 在首个 mutation 前 SHALL 把 host CLI、Node、Bash 和 Git 解析为
普通文件的 realpath，冻结 device/inode/mode/owner、size/change identity 以及父目录身份。它 SHALL
拒绝 executable 自身的 group/world write 位或非 root/当前用户 owner，也 SHALL 拒绝非 sticky 的
world-writable 父目录，也 SHALL 拒绝由不同 owner 控制的 group-writable 父目录；由同一冻结 owner
控制的 package-manager 根（例如 Homebrew `0775` Cellar）和 sticky 系统临时根 MAY 使用，但同样
必须冻结完整父目录身份。每次 spawn 前 SHALL 重验原始路径仍解析到同一普通文件、物理文件及父目录
身份均未变化，且可执行文件未被同 inode 原地改写；仅保存绝对 pathname 不构成信任证据。runtime
repair、候选/已存 payload 校验和 installer decoder SHALL 使用同一冻结证明，不得回退到
`process.execPath`、裸 PATH 或未绑定 pathname。

POSIX SHALL 应用 owner 与 group/world-write 约束；Windows SHALL 以 realpath/file identity/change
identity 复验替代无意义的 POSIX uid/mode 判定。Windows `.cmd`/`.bat` 宿主还 SHALL 同时冻结并在每次
spawn 前复验其绝对 `ComSpec`/`cmd.exe` 物理身份。正式 CI SHALL 在真实 Windows runner 运行该链路。

#### Scenario: 冻结后 symlink 或 executable 被换位

- **WHEN** 预检后某个工具的 realpath、inode、owner、mode、父目录身份或上述 owner/write 约束发生变化
- **THEN** 安装/update 在调用该工具前失败关闭
- **AND** 不执行被换位的程序或任何后续宿主 mutation

#### Scenario: executable 在原 inode 上被改写

- **WHEN** 预检后工具内容、size 或 change identity 在原 inode 上变化
- **THEN** 下一次 spawn 前的物理重验失败
- **AND** runtime selection、宿主 plugin 与 marketplace 保持 mutation 前状态

#### Scenario: Windows batch interpreter 漂移

- **WHEN** 已冻结的 host shim 仍不变，但其绝对 `cmd.exe` 物理身份在 batch spawn 前变化
- **THEN** native setup/update/doctor 不执行 shim
- **AND** 不回退到 PATH、cwd 或只保存 pathname 的 interpreter

### Requirement: Release 门禁 SHALL 使用精确公开 N-1 产物

每个稳定 Release 候选 SHALL 以固定版本、commit 和 digest 的完整公开 N-1 payload
执行兼容测试。缺少 N-1、使用任意本机 previous release、fixture 版本不匹配，或
N-1 `status`/`set`/bundle contract 无法读写当前候选 Change 时 SHALL 阻止发布。

#### Scenario: v1.0.2 验证真实 v1.0.1

- **WHEN** release candidate 运行 N-1 compatibility gate
- **THEN** gate 校验完整 v1.0.1 payload 的固定 commit 与 CLI SHA-256
- **AND** v1.0.1 的 `status`、`set` 与 bundle 兼容断言全部通过
- **AND** 不得在 N-1 缺失时静默 skip 并报告成功

## MODIFIED Requirements

### Requirement: Tenon 更新 SHALL 只有一个整包事务

Tenon SHALL 使用 `tenon update --<native-host>` 更新唯一的完整插件，不得再把 CLI/runtime
拆成第二套 `--self-update` 通道。手动更新与用户明确启用的定时更新 SHALL 调用同一个事务协调器；
Skills、hooks、CLI、Dashboard、workflow 与 adapters SHALL 来自同一候选 payload 和 release digest。

宿主 Marketplace/plugin manager SHALL 是宿主插件登记与 cache 的唯一写入者；Tenon 不得直接改写、
备份或恢复宿主私有 cache 目录。Tenon SHALL 在自己的所有权边界内对 content-addressed runtime、
active/previous selection、当前 hardened stable bootstrap、stable launchers 与 Dashboard 服务执行可审计事务，
并明确报告宿主提交与 Tenon 提交两个边界，不得把只回滚 managed selection 描述成“整个宿主插件已恢复”。
已验证 previous payload 的 rollback/补偿 SHALL 只切换 selection 并恢复精确 launcher/Dashboard 状态；
它 SHALL NOT 用 previous payload 的旧 bootstrap 替换当前兼容 bootstrap。

项目 canonical Change、OpenSpec 与任务文件不属于插件更新事务。更新 SHALL 只读取机器级项目注册表，
报告需要显式 `tenon sync` 的项目，不得在后台或 `--auto` 模式中静默修改工作区。

#### Scenario: 用户更新完整 Codex 插件

- **WHEN** 用户运行 `tenon update --codex`
- **THEN** 只有 Codex Marketplace/plugin manager 更新 `tenon@tenon`
- **AND** 宿主 inventory 返回的候选先完成 payload、CLI、workflow、hook、Skill 与 Dashboard smoke
- **AND** Tenon 再把同一 digest 发布为 content-addressed managed release
- **AND** active selection、当前 hardened bootstrap、两个 stable launchers 与 18765 Dashboard 共同提交。

#### Scenario: 自动更新已明确启用

- **WHEN** `tenon setup --codex --auto-update` 已写入用户偏好且每日检查到期
- **THEN** 后台任务调用与手动更新相同的 `tenon update --codex --auto`
- **AND** 不存在第二套下载器、selection、Skill root、CLI 自更新或项目写入逻辑。

#### Scenario: launcher 或 Dashboard 提交失败

- **WHEN** managed release 已验证，但任一 launcher 写入或新 Dashboard readiness 失败
- **THEN** Tenon SHALL 以 activation 前快照精确恢复 selection、launcher 的存在性/内容/mode 与 Dashboard
- **AND** 当前 hardened bootstrap 保持不降级，不复制 previous payload 的旧 bootstrap
- **AND** 终止本次候选 Dashboard child，并重新验证或恢复 previous release 的 18765 服务
- **AND** 持久诊断分别说明宿主提交状态与 Tenon managed transaction 的补偿结果。

#### Scenario: 已登记项目需要新投影

- **WHEN** 更新后的 runtime 扫描机器级项目注册表并发现某项目版本落后
- **THEN** 更新结果列出项目及显式 `tenon sync` 命令
- **AND** 自动更新不得写该项目的 OpenSpec、Change、rules 或 owned manifest。

### Requirement: 公开 Codex 首装 SHALL 通过真实干净宿主验收

Tenon SHALL 提供一个可重复、失败关闭的真实 Codex 首装验收。验收 SHALL 把 `HOME`、
`CODEX_HOME`、`TENON_RUNTIME_HOME` 与 Dashboard 端口限制在本轮唯一临时作用域，通过真实
Codex Marketplace 安装当前候选或已发布的精确 `vX.Y.Z/install.sh`，并验证 stable launcher、managed
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
- **AND** 下载 ref 与当前 checkout 一致，移动的 `main` 不得代替待发布候选
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
