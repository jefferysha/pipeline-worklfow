# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Dashboard health identifies the active machine-state scope

受管 Dashboard 单例 SHALL 同时标识当前不可变 release 与项目注册表、token、密钥和 pidfile
共同使用的机器状态作用域。进程装配层 SHALL 只调用一次产品路径解析器，并把同一个不可变
`ServerPaths` 值对象注入 Server；Server SHALL NOT 从 `home` 或进程环境再次推导产品状态路径。
健康响应 SHALL 暴露不透明且确定性的 `stateScopeId`，并 SHALL NOT 暴露机器状态目录。

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

#### Scenario: 路径解析失败

- **WHEN** 进程装配层收到损坏或不可接受的运行目录契约
- **THEN** 启动在绑定端口之前 fail-closed
- **AND** 不创建部分注册表、密钥或 pidfile 状态。
