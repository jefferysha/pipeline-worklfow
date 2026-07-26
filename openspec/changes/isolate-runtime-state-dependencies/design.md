# 设计

## 架构结论

- `resolveProductPaths` 继续作为平台目录与环境覆盖规则的唯一解释器。
- Dashboard 进程入口只解析一次完整 `ServerPaths`，并把该值对象注入 Server。
- Server 的宿主 home 与产品状态路径是两个独立依赖，不能互相推导。
- 项目注册表迁移必须显式接收环境映射；测试使用空环境表达隔离，生产传入真实环境。
- 注册表、密钥、token、pidfile 和状态作用域必须共享同一个路径快照。

## 风险

- 若只修测试调用而不修生产装配，双重路径解析仍会留下配置漂移窗口。
- 若改变 `TENON_RUNTIME_HOME` 或 XDG 的优先级，会破坏安装器和稳定启动器契约。
- 若为测试新增并行专用分支，会把测试语义与生产语义分叉。

## 已验证事实

- `ServerPaths` 已包含全部产品路径和宿主发现路径，可直接作为装配值对象。
- 当前源码中迁移服务只有测试调用方；把 `env` 改为必填可由编译器保证未来调用显式选择。
- 共享 `TENON_RUNTIME_HOME` 可稳定复现注册表、迁移回执与密钥串扰。
- `ServerPaths` 注入覆盖注册表、密钥、token、pidfile 与 `stateScopeId`。

## 决策记录

采用“解析一次、值对象传递、应用服务显式依赖”，拒绝修改环境变量优先级、串行 CI 和测试专用兜底。
完整论证见 `docs/superpowers/specs/isolate-runtime-state-dependencies-design.md` 与
`docs/adr/isolate-runtime-state-dependencies.md`。
