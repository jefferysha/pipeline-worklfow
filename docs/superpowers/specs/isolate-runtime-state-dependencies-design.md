# 技术设计

## 背景

产品路径由 kernel 的 `resolveProductPaths` 统一解释。它支持平台默认目录、XDG、`TENON_RUNTIME_HOME`
以及启动器传递的版本化 root contract。该函数允许调用方显式传入 `env`、`homeDir` 与 `platform`，
但 `env` 缺省时会读取 `process.env`。

当前有两条调用链把“显式 home”错误地当成“完整隔离边界”：

1. Dashboard 生产入口先解析 `ServerPaths`，随后只把 `homeDir` 传给 `createDashboardServer`，
   Server 再次从进程环境解析产品路径。
2. 项目注册表迁移接收 `homeDir`，但 `env` 可省略，应用服务因此可能读取调用进程的全局环境。

第三轮冻结评审又定位出同一根因的两个未覆盖入口：默认 `nodeMemFs()` 从 OS home 读取宿主会话，
以及 `tenon doctor` 的两个子探针分别读取缓存快照和实时环境。PR CI 同时证明产品身份迁移不完整：
review hook 先检查旧 CLI 名称，导致只安装 Tenon 的环境无法写入确认回执。仓库当前树中的外部参考
身份和历史测试项目也说明卫生约束还未形成覆盖路径、文本与发布资产的单一门禁。

在共享 `TENON_RUNTIME_HOME` 下运行 Server 与迁移测试可稳定复现 13 个失败：注册表条目、迁移回执和
密钥在本应独立的临时 home 之间串扰。这不是并发调度问题，而是状态所有权边界错误。

## 决策

采用“解析一次、值对象传递、应用服务显式依赖”的结构：

- kernel 继续唯一解释平台目录和环境覆盖，保持既有优先级与磁盘布局。
- 进程入口调用 `resolveServerPaths()` 一次，并把完整、必填的 `ServerPaths` 注入
  `createDashboardServer`；Server 不重新解释环境，也不提供隐式 fallback。
- `DashboardServerOptions.hostHome` 只表示宿主资产发现目录；产品状态路径通过必填的 `paths`
  值对象表达。省略 `hostHome` 时只复用 `paths.homeDir`。
- 默认 mem session 文件系统在 Server 装配时显式绑定同一个 `hostHome`，不允许内部调用
  `homedir()` 形成第三来源。
- 项目注册表迁移的 `env` 改为必填依赖。生产调用方明确传入真实环境，测试明确传入空环境或测试环境。
- 测试夹具构造一次路径对象并同时交给被测 Server 与断言，防止被测路径和断言路径分别解析。
- managed runtime transaction 在加锁前解析一次 `RuntimePaths`，锁内回滚与补偿只消费该快照。
- doctor adapter 在进入应用命令前构造一次 runtime scope；native runtime 与 AFK readiness
  共享该值，不得分别读取实时环境。
- review hook 使用当前 Tenon 启动器完成发现与调用，旧通道迁移不进入当前 runtime。
- 仓库卫生门禁从集中式禁止身份表扫描当前 Git 树的路径和文本；历史测试项目及其 demo、文档、
  OpenSpec 主规格和 archive 从当前树删除，正式 Dashboard WebP 继续使用显式 allowlist。

```text
process.env + OS home
        │
        ▼
resolveServerPaths()  ──唯一解释──► immutable ServerPaths
                                      │
                                      ├──► Dashboard Server
                                      ├──► registry / secrets
                                      └──► token / pidfile / stateScopeId

hostHome ──唯一宿主发现根──► skills / runner / credentials / mem sessions

runtime scope snapshot ──► doctor native runtime probe
                       └─► doctor AFK readiness probe

迁移调用方 ── env + homeDir + platform ──► migration use case
                                              │
                                              └──► resolveProductPaths()
```

### 不变量

- 同一个 Server 实例的注册表、密钥、token、pidfile 和 `stateScopeId` 必须来自同一 `ServerPaths`。
- 应用服务不得在已经接收路径或环境依赖后再次读取 `process.env`。
- Server 默认宿主文件系统不得在已接收 `hostHome` 后调用 OS home。
- 同一 CLI 命令不得让不同子探针各自解析产品运行时作用域。
- 空环境是测试显式输入，不通过修改或暂存全局环境实现。
- `TENON_RUNTIME_HOME`、`TENON_RUNTIME_ROOTS` 与 XDG 优先级保持不变。
- 当前树和可发布资产不得包含集中禁止表中的外部参考身份。

### 状态与失败模式

- Server 启动所需的产品路径解析失败在进程装配阶段 fail-closed，Server 不绑定端口；CLI 子命令
  只在命令分派后的所属错误边界内按需解析，非法或不完整子命令不得读取产品路径。
- 迁移收到损坏 root contract 时在创建迁移目录前失败。
- 并发迁移仍由既有目录锁串行化；此次改动只确保每个迁移实例锁定自己的目录。
- 路径对象注入不改变持久化格式、锁、原子 rename 或恢复协议。
- 仓库卫生失败在构建和发布前 fail-closed；删除历史测试资产不改写 Git 历史。

## 备选方案

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 修改 `resolveProductPaths`，只要传 `homeDir` 就忽略环境 | 改动少 | 破坏操作员覆盖、XDG 和稳定启动器语义 | 拒绝 |
| 只在失败测试里补 `env: {}` | 可快速让 CI 变绿 | 生产入口仍双重解析，应用层隐式依赖仍存在 | 拒绝 |
| 生产入口注入完整路径，迁移显式注入环境 | 单一所有权、生产与测试同构、兼容现有路径协议 | 需要更新装配类型和调用方 | 采用 |
| 为每个残留名称加局部替换 | 单次改动少 | 无法覆盖路径、归档和新文档，发布仍可回归 | 拒绝 |
| 集中式身份门禁并删除当前树测试项目 | 单一规则覆盖源码、文档和发布前检查 | 需要清理历史工作树资产 | 采用 |

## 风险

- `DashboardServerOptions` 是公共类型；`paths` 改为必填以在编译期拒绝隐式产品路径，
  `hostHome` 独立承载 `.claude`、`.codex` 等宿主资产发现。
- 迁移输入的 `env` 改为必填会产生编译期迁移成本，但当前生产树没有调用方，测试调用点可一次性收敛。
- 若未来新增应用服务绕过装配边界，可能重现问题；架构检查与定向测试应固定该依赖方向。
- 禁止身份表只保存机器构造值，避免检查器自身重新引入受禁明文；错误输出必须脱敏。

```coverage
touches:
L1_api:      filled -> #状态与失败模式（doctor 与 hook 保持公共命令形态，只修正内部装配）
L2_data:     filled -> #不变量（持久化路径来源统一，文件格式与布局不变）
L3_rules:    filled -> #不变量
L4_state:    filled -> #状态与失败模式
L5_errors:   filled -> #状态与失败模式（路径契约错误在端口绑定和状态写入前 fail-closed）
L6_security: filled -> #不变量（密钥与 token 必须和注册表使用同一隔离路径快照）
L7_perf:     waived -> 改动减少一次路径解析且不改变热路径或吞吐契约
L8_deps:     filled -> #决策（装配层注入 ServerPaths、hostHome 和 runtime scope，无新增包）
L10_terms:   filled -> #背景
```
