# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Backend adapters SHALL decode DTOs and call application boundaries

HTTP、CLI 与 hooks SHALL 只负责输入及授权校验、DTO 转换、应用用例调用和公共错误映射。
产品路径、平台与环境映射 SHALL 在进程装配或 adapter 边界解析并显式注入应用服务。
已经接收路径或环境依赖的应用服务 SHALL NOT 再读取 `process.env`、重建平台优先级或从
宿主 home 推导机器状态目录。外部值 SHALL 以 `unknown` 进入并在状态变更前完成收窄。
Adapter SHALL NOT 实现私有持久化解析器或跨聚合写协议。

#### Scenario: Malformed Workflow request reaches the server

- **WHEN** a request body is not a valid Workflow DTO
- **THEN** a boundary decoder rejects it using the existing compatible client
  error shape
- **AND** no domain compile/save or state write occurs.

#### Scenario: Loop command reads Change state

- **WHEN** a loop command needs a Change-state projection
- **THEN** it uses the kernel/application repository or codec contract
- **AND** it does not parse `.pipeline.yaml` privately.

#### Scenario: 迁移服务在共享运行环境中执行

- **GIVEN** 进程环境包含共享 `TENON_RUNTIME_HOME` 或 XDG 根
- **AND** 迁移调用方显式提供空环境与独立临时 home
- **WHEN** 项目注册表迁移执行
- **THEN** 注册表、回执和目录锁只位于该临时 home 对应的产品路径
- **AND** 共享运行目录保持未修改。

#### Scenario: 新迁移调用方省略环境依赖

- **WHEN** 代码尝试在未提供环境映射的情况下调用项目注册表迁移
- **THEN** TypeScript 契约在编译期拒绝该调用
- **AND** 应用服务不以隐式 `process.env` 作为兜底。

#### Scenario: 现有路径协议保持兼容

- **WHEN** 调用方显式传入与当前进程等价的环境、home 与 platform
- **THEN** `TENON_RUNTIME_HOME`、`TENON_RUNTIME_ROOTS` 和 XDG 的优先级保持不变
- **AND** 注册表、密钥、回执与锁文件格式保持不变。

#### Scenario: managed runtime 回滚等待事务锁

- **GIVEN** runtime adapter 已提供 home、环境和平台作用域
- **WHEN** 回滚事务解析路径并等待作用域锁
- **THEN** 锁目录和锁内全部读写复用同一个不可变路径快照
- **AND** 后续环境变化不能让事务跨到另一个状态根。

#### Scenario: runtime 命令无法解析作用域

- **WHEN** runtime adapter 的 home 或环境提供器失败
- **THEN** CLI 将失败映射为稳定的非零退出码和命令错误
- **AND** 无效或不完整子命令不读取运行时作用域。
