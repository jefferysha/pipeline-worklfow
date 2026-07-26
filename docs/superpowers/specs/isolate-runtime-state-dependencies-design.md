# 技术设计

## 背景

产品路径由 kernel 的 `resolveProductPaths` 统一解释。它支持平台默认目录、XDG、`TENON_RUNTIME_HOME`
以及启动器传递的版本化 root contract。该函数允许调用方显式传入 `env`、`homeDir` 与 `platform`，
但 `env` 缺省时会读取 `process.env`。

当前有两条调用链把“显式 home”错误地当成“完整隔离边界”：

1. Dashboard 生产入口先解析 `ServerPaths`，随后只把 `homeDir` 传给 `createDashboardServer`，
   Server 再次从进程环境解析产品路径。
2. 项目注册表迁移接收 `homeDir`，但 `env` 可省略，应用服务因此可能读取调用进程的全局环境。

在共享 `TENON_RUNTIME_HOME` 下运行 Server 与迁移测试可稳定复现 13 个失败：注册表条目、迁移回执和
密钥在本应独立的临时 home 之间串扰。这不是并发调度问题，而是状态所有权边界错误。

## 决策

采用“解析一次、值对象传递、应用服务显式依赖”的结构：

- kernel 继续唯一解释平台目录和环境覆盖，保持既有优先级与磁盘布局。
- 进程入口调用 `resolveServerPaths()` 一次，并把完整 `ServerPaths` 注入
  `createDashboardServer`；Server 不重新解释环境。
- `DashboardServerOptions.home` 只表示宿主资产发现目录；产品状态路径通过 `paths` 值对象表达。
- 项目注册表迁移的 `env` 改为必填依赖。生产调用方明确传入真实环境，测试明确传入空环境或测试环境。
- 测试夹具构造一次路径对象并同时交给被测 Server 与断言，防止被测路径和断言路径分别解析。

```text
process.env + OS home
        │
        ▼
resolveServerPaths()  ──唯一解释──► immutable ServerPaths
                                      │
                                      ├──► Dashboard Server
                                      ├──► registry / secrets
                                      └──► token / pidfile / stateScopeId

迁移调用方 ── env + homeDir + platform ──► migration use case
                                              │
                                              └──► resolveProductPaths()
```

### 不变量

- 同一个 Server 实例的注册表、密钥、token、pidfile 和 `stateScopeId` 必须来自同一 `ServerPaths`。
- 应用服务不得在已经接收路径或环境依赖后再次读取 `process.env`。
- 空环境是测试显式输入，不通过修改或暂存全局环境实现。
- `TENON_RUNTIME_HOME`、`TENON_RUNTIME_ROOTS` 与 XDG 优先级保持不变。

### 状态与失败模式

- 路径解析失败在进程装配阶段 fail-closed，Server 不绑定端口。
- 迁移收到损坏 root contract 时在创建迁移目录前失败。
- 并发迁移仍由既有目录锁串行化；此次改动只确保每个迁移实例锁定自己的目录。
- 路径对象注入不改变持久化格式、锁、原子 rename 或恢复协议。

## 备选方案

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 修改 `resolveProductPaths`，只要传 `homeDir` 就忽略环境 | 改动少 | 破坏操作员覆盖、XDG 和稳定启动器语义 | 拒绝 |
| 只在失败测试里补 `env: {}` | 可快速让 CI 变绿 | 生产入口仍双重解析，应用层隐式依赖仍存在 | 拒绝 |
| 生产入口注入完整路径，迁移显式注入环境 | 单一所有权、生产与测试同构、兼容现有路径协议 | 需要更新装配类型和调用方 | 采用 |

## 风险

- `DashboardServerOptions` 是包内公共类型；新增可选 `paths` 保持源码兼容，生产入口立即改用它。
- 迁移输入的 `env` 改为必填会产生编译期迁移成本，但当前生产树没有调用方，测试调用点可一次性收敛。
- 若未来新增应用服务绕过装配边界，可能重现问题；架构检查与定向测试应固定该依赖方向。

```coverage
touches:
L1_api:      waived -> HTTP、CLI 与健康响应契约不变，仅修正进程内依赖装配
L2_data:     filled -> #不变量（持久化路径来源统一，文件格式与布局不变）
L3_rules:    filled -> #不变量
L4_state:    filled -> #状态与失败模式
L5_errors:   filled -> #状态与失败模式（路径契约错误在端口绑定和状态写入前 fail-closed）
L6_security: filled -> #不变量（密钥与 token 必须和注册表使用同一隔离路径快照）
L7_perf:     waived -> 改动减少一次路径解析且不改变热路径或吞吐契约
L8_deps:     filled -> #决策（装配层注入 ServerPaths，迁移 env 为必填依赖且无新增包）
L10_terms:   filled -> #背景
```
