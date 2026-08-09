# Plugin Distribution 增量规格

## MODIFIED Requirements

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

当可信 Bash 将冻结的 Node 交给 provenance verifier 时，调用方 MUST 将其建模为同一个复合 spawn binding，并在 Bash spawn 前立即、同步地依次重放 Bash 与 Node 的物理绑定。传给 verifier 的 `--node` MUST 与刚复验的 Node executable 完全相同。两次 proof 与 spawn 之间 MUST NOT 出现 `await`、另一个 child process、host mutation、release activation、Dashboard 启动、ready evidence 或成功状态写入。

package、update-candidate、release-store、standalone/full setup 与 doctor 的所有 provenance spawn MUST 使用这一复合边界。历史 pathname-only seam MAY 继续作为旧数据读取输入，但 MUST NOT 被提升为新的可信执行证据。

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

#### Scenario: provenance Bash 委托冻结 Node

- **WHEN** verifier 由可信 Bash 启动并接收 `--node <frozen-node>`
- **THEN** 每次 spawn 的可观察顺序 MUST 为 `bash-proof → node-proof → verifier-spawn`
- **AND** 每一次 spawn MUST 独立重放两份 proof，且 argv 中的 Node MUST 等于刚复验的 frozen Node executable

#### Scenario: Node 在复合 proof 前漂移

- **WHEN** Bash 保持可信但 frozen Node 在 provenance spawn 前漂移
- **THEN** Node replay MUST 在 Bash runner 与任何 child process 之前失败
- **AND** 不得出现 host mutation、selection/launcher 变更、activation、Dashboard/ready evidence 或成功审计

#### Scenario: standalone setup skills 与 doctor 复用完整 verifier

- **WHEN** standalone `setup skills` 或 doctor 执行 provenance 验证
- **THEN** 它们 MUST 通过冻结 Bash 启动完整 `tools/verify-skills.sh`，并对委托 Node 执行复合 pre-spawn replay
- **AND** 它们 MUST NOT 直接信任 `process.execPath`、裸 PATH 结果或未绑定的 pathname

#### Scenario: 兼容已发布 provenance 数据

- **WHEN** 系统读取 v1.0.1 或 v1.0.2 provenance/selection/launcher 数据
- **THEN** 本变更 MUST NOT 重写 registry schema、release manifest、selection、launcher 或审计格式
- **AND** 已完整通过 provenance 验证的 previous release MUST 继续可作为 rollback 目标
