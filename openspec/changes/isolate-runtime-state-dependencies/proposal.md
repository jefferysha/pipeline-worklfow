# 提案

## Why

GitHub Actions 暴露出机器级状态目录的所有权不唯一：调用方显式传入临时 `homeDir` 后，底层路径解析仍会隐式读取进程环境，导致并发测试共享注册表、迁移回执和密钥文件。这个问题会掩盖真实隔离边界，也会让生产装配重复解析同一组路径。

## What Changes

- 把完整产品路径解析收敛到进程装配边界，Server 应用把已解析路径作为必填依赖，不保留隐式环境 fallback。
- 让迁移应用服务显式接收环境依赖，禁止在业务用例内部隐式读取进程环境。
- 让 managed runtime 事务在锁内复用同一份路径快照，并让 CLI 统一映射作用域解析错误。
- 用共享 `TENON_RUNTIME_HOME` 和 XDG 根的回归测试证明各测试实例仍使用各自状态目录。
- 保持现有平台目录、环境覆盖和持久化文件格式不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-distribution`：运行时装配必须只解析一次产品路径，并把该结果传给 Server。
- `repository-architecture-compliance`：环境和文件系统路径必须通过显式依赖进入应用用例。

## Impact

影响 kernel 产品路径模型的调用契约、Dashboard Server 装配、项目注册表迁移和相应测试。HTTP API、磁盘格式、默认端口、用户目录布局及环境变量语义保持兼容；改动只消除应用层的隐式环境读取与重复解析。
