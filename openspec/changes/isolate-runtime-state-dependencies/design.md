# 设计

## 架构结论

- `resolveProductPaths` 继续作为平台目录与环境覆盖规则的唯一解释器。
- Dashboard 进程入口只解析一次完整产品 `ServerPaths`，并把该必填值对象注入 Server。
- Server 的 `hostHome` 与产品状态路径是两个独立依赖；`.claude`、`.codex` 等宿主资产只允许从
  `hostHome` 派生，mem session 默认文件系统也必须绑定 `hostHome`，`ServerPaths` 不携带宿主目录。
- 项目注册表迁移必须显式接收环境映射；测试使用空环境表达隔离，生产传入真实环境。
- managed runtime 事务在加锁前只解析一次路径，并在锁内复用同一不可变快照。
- `tenon doctor` 在 adapter 边界只解析一次 runtime scope，并把同一快照传给 native runtime 与
  AFK readiness 探针；子探针不得再次读取实时 home 或环境。
- shell hook 的命令发现和执行必须指向同一个当前 Tenon 启动器，禁止检查旧命令后调用新命令。
- 外部参考身份由一份集中式、非明文的禁止身份表治理；检查覆盖 Git 当前树的相对路径和文本内容，
  同时删除历史测试项目及其 demo、文档、OpenSpec 主规格和 archive。Git 历史保留。
- 注册表、密钥、token、pidfile 和状态作用域必须共享同一个路径快照。

## 风险

- 若只修测试调用而不修生产装配，双重路径解析仍会留下配置漂移窗口。
- 若改变 `TENON_RUNTIME_HOME` 或 XDG 的优先级，会破坏安装器和稳定启动器契约。
- 若为测试新增并行专用分支，会把测试语义与生产语义分叉。
- 若仅删除当前命中的字符串而不加集中门禁，后续文档、Skill 或发布包会再次引入外部身份。
- 若保留历史测试项目的 archive 或主规格，Dashboard 和仓库索引仍会把它们视为当前产品内容。

## 已验证事实

- `ServerPaths` 只包含产品路径；宿主发现路径由独立的 `hostHome` 统一提供。
- 当前源码中迁移服务只有测试调用方；把 `env` 改为必填可由编译器保证未来调用显式选择。
- 共享 `TENON_RUNTIME_HOME` 可稳定复现注册表、迁移回执与密钥串扰。
- `ServerPaths` 注入覆盖注册表、密钥、token、pidfile 与 `stateScopeId`。
- 首轮冻结审查发现并消除了可选 `paths`、rollback 双重解析和 CLI 环境错误逃逸。
- 第二轮冻结审查发现并收敛真实 CLI 入口的提前路径解析，以及 skills/readiness 路由绕过
  `hostHome` 的宿主目录漂移。
- 第三轮冻结审查真实复现默认 mem session 文件系统绕过 `hostHome`，并确认 doctor 同一命令仍有
  两个运行时作用域来源。
- PR CI 真实证明 review hook 的旧 CLI 探测会在只安装 Tenon 的新用户环境中阻止确认回执。

## 决策记录

采用“解析一次、值对象传递、应用服务显式依赖、单一产品身份门禁”，拒绝修改环境变量优先级、
串行 CI、字符串特判和测试专用兜底。
完整论证见 `docs/superpowers/specs/isolate-runtime-state-dependencies-design.md` 与
`docs/adr/isolate-runtime-state-dependencies.md`。
