# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Managed release source SHALL 绑定稳定标签版本

Native setup/update 发布的每个 managed runtime SHALL 记录来自已验证插件候选的稳定 SemVer 版本，并 SHALL 能与冻结的 target tag 和 target commit 对账。候选版本、插件 manifest、payload digest 或 target identity 不一致时 SHALL NOT 公开 selection。

#### Scenario: 版本化候选激活

- **WHEN** 宿主 inventory 证明 `v1.0.2` 插件根完整且 marketplace HEAD 等于 `v1.0.2` 的 peeled commit
- **THEN** managed release source 记录 `pluginVersion=1.0.2`
- **AND** stable launcher 原子切换到该 immutable payload

#### Scenario: 候选版本与目标标签不一致

- **WHEN** target tag 是 `v1.0.2`，但候选 manifest 或 inventory 报告其他版本
- **THEN** coordinator 拒绝 activation 和 ready evidence
- **AND** 旧 active runtime selection 保持可用

#### Scenario: 恢复 v1.0.1 旧 journal

- **WHEN** 旧 schema version 1 journal 的 Dashboard identity 没有 `serverVersion`
- **THEN** codec 保留可验证的恢复坐标而不是把整个 WAL 判为损坏
- **AND** coordinator 重新探测 Dashboard health 并只接受与目标 release 精确相等的 server version
- **AND** 缺失字段本身不构成 readiness 或完成证据

#### Scenario: v1.0.1 setup/update WAL 缺少 frozen stable target

- **WHEN** 版本化 installer 发现真实 v1.0.1 native `setup` 或 `update` WAL 处于 `preparing-host`、`candidate-resolved`、`activating-runtime`、`runtime-activated`、`starting-dashboard`、`dashboard-ready` 或 `evidence-committed`，且旧 schema 没有 `stableTarget` / `dashboardPort`
- **THEN** 磁盘 decoder 接受该精确旧形状，并保留原 operation、transaction id 与恢复坐标
- **AND** coordinator 在写 WAL、stop Dashboard、清 WAL 或执行任何新 mutation 前证明 successor `v1.0.2` tag/commit
- **AND** 证明成功后使用原 transaction id 将旧 WAL 一次原子转换为 `setup/preparing-host`、冻结目标与端口均完整的新事务
- **AND** `starting-dashboard` 的旧进程若在空探针之后迟到，只能由同一 successor transaction 按旧 release identity 精确 stop
- **AND** 缺目标的补偿 phase、operation/source 冲突或不可证明的 activation/Dashboard identity 均失败关闭，不改写旧 WAL
- **AND** successor tag 无法证明时旧 WAL 保持字节不变，旧 active runtime 与旧 Dashboard 保持可用

### Requirement: Dashboard 发布 SHALL 区分启动 readiness 与浏览器打开策略

Setup/update SHALL 始终从新 active managed payload 启动或收养 Dashboard 并证明 readiness。浏览器打开 SHALL 只发生在交互式首次 setup；curl 管道、CI、手动 update 和后台 auto-update SHALL NOT 自动打开，但 SHALL 输出健康 URL 和 `tenon dashboard --open`。浏览器打开失败 SHALL NOT 回滚已经健康的 runtime。

#### Scenario: 交互式首次 setup

- **WHEN** setup 在交互终端开始时没有有效 managed runtime，并完成 Dashboard readiness
- **THEN** Tenon 尝试打开已验证 URL
- **AND** 打开失败时保持成功安装并输出手动 URL
- **AND** 宿主候选此前是否已验证不改变首次 setup 判定

#### Scenario: 非交互安装或更新

- **WHEN** setup 来自 curl 管道/CI，或操作是手动 update/后台 auto-update
- **THEN** Dashboard 仍完成版本切换与健康检查
- **AND** 不调用 OS browser opener
- **AND** 输出已验证 URL 和 `tenon dashboard --open`（后台模式写入可审计日志）

#### Scenario: Dashboard 端口属于非受管进程

- **WHEN** 目标端口存在无法证明属于当前或前一 managed transaction 的 listener
- **THEN** coordinator 不 stop、adopt 或覆盖该进程
- **AND** 保留 journal 并返回不可证明诊断
