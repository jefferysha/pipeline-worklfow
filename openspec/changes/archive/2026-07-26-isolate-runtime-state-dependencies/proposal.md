# 提案

## Why

GitHub Actions 暴露出机器级状态目录的所有权不唯一：调用方显式传入临时 `homeDir` 后，底层路径解析仍会隐式读取进程环境，导致并发测试共享注册表、迁移回执和密钥文件。这个问题会掩盖真实隔离边界，也会让生产装配重复解析同一组路径。

第三轮冻结验证进一步证明问题并未止于基础路径对象：默认 mem session 文件系统仍可绕过
`hostHome`，`tenon doctor` 在同一命令内使用两个运行时作用域来源，review hook 仍探测已废弃的
CLI 名称。仓库当前树还保留外部参考身份和历史测试项目资产，已有卫生检查覆盖不完整，无法保证发布包、
文档站和后续提交持续保持 Tenon 单一产品身份。

## What Changes

- 把完整产品路径解析收敛到进程装配边界，Server 应用把已解析路径作为必填依赖，不保留隐式环境 fallback。
- 让迁移应用服务显式接收环境依赖，禁止在业务用例内部隐式读取进程环境。
- 让 managed runtime 事务在锁内复用同一份路径快照，并让 CLI 统一映射作用域解析错误。
- 让 mem session、skills、runner、凭证和 AFK 等全部宿主资产发现只消费显式 `hostHome`。
- 让一次 `tenon doctor` 调用只解析一份不可变运行时作用域快照，并传给全部子探针。
- 让 hook、安装器、文档和发布资产只探测并调用当前 Tenon CLI，不保留旧命令兼容。
- 删除当前树中的外部参考项目身份、历史测试项目和无关演示资产；用集中式仓库卫生门禁同时扫描路径、
  文本和发布 allowlist，防止回归。
- 用共享 `TENON_RUNTIME_HOME` 和 XDG 根的回归测试证明各测试实例仍使用各自状态目录。
- 保持现有平台目录、环境覆盖和持久化文件格式不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-distribution`：运行时装配必须只解析一次产品路径，并把该结果传给 Server。
- `repository-architecture-compliance`：环境和文件系统路径必须通过显式依赖进入应用用例；当前树与
  发布资产必须保持 Tenon 单一身份且不携带历史测试项目。

## Impact

影响 kernel 产品路径模型的调用契约、Dashboard Server 装配、项目注册表迁移、doctor、review hook、
仓库卫生门禁和相应测试，并删除不属于 Tenon 产品的历史测试资产。HTTP API、磁盘格式、默认端口、
用户目录布局及环境变量语义保持兼容；Git 历史不重写，已删除资料仍可从既有提交恢复。
