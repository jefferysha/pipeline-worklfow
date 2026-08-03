# Dashboard 操作清晰度统一设计

## 用户结果

本 Change 把五张反馈图收口为一条一致的桌面操作路径：用户先看到真实仓库项目，再进入某个
workspace；阶段主线、运行能力与宿主状态都先表达“现在是什么”，只有确实需要用户处理时才显示
动作。失效登记可以安全批量注销，但任何操作都不会删除磁盘文件、worktree 或 Change 数据。

## 已验证事实

1. `ProjectSnapshot` 只有 `root/ok/changes`，`ProjectsView` 只能按 basename 平铺，无法知道多个 root
   是否来自同一个 Git 仓库。截图中的 45 项不是 45 个真实项目，而是历史失效登记和同仓 worktree
   的混合。
2. 本轮已通过既有受鉴权 `DELETE /api/projects?root=` 注销 29 个不可达 root 与一个空的
   `/private/tmp` 登记；当前注册表剩余 16 个 root，全部可读。只改注册表，没有删文件。
3. 编排图把 workflow、change、phase 放在不同列，却同时把 Change→全部 phase 的 contains 边与
   phase→phase transition 画到同一 SVG，确定性布局仍会产生密集交叉线。
4. Workbench 把 Workflow 操作与项目级 Track 选择放进两个独立的大圆角表面，内部按钮高度、
   padding 与强调层级各自生长，形成截图中的大小框竞争。
5. Machine 把 Docker 与 sandbox image 直接计入全局 `blocked`，但这两项只服务 AFK 容器执行；
   普通终端/Codex 交互不依赖它们。
6. Host Plan 是 setup/update 的只读命令与步骤预览。现有 catalog 有全部 12 个目标，却没有本机
   宿主检测事实，因此页面要求用户先猜宿主再猜 setup/update。

## 研究与复用

项目已有固定到 Chorus commit 的一手研究：Chorus Resource Graph 将可见集、搜索顺序、第一父边
主干与交叉关系分开，使用确定性水平森林，避免次级边改变主阅读顺序。这里复用的是信息架构原则：

- 主执行路径只有一个稳定阅读顺序；
- 搜索、筛选和选中不改变事实排序；
- 非主干关系进入可扫描的关系区和等价语义列表；
- 异步请求使用 AbortController/generation，迟到响应不能覆盖当前上下文。

不复制 Chorus 组件、源码、文案或数据模型。Tenon 继续使用自己的
`tenon-orchestration-graph/v1`、七阶段 workflow 与 exact-event governance。

## 方案比较

| 决策 | 方案 | 结论 |
| --- | --- | --- |
| 项目分组 | A. basename/path 猜测；B. 前端逐 root 请求 Git；C. Snapshot 增加仓库身份 | 采用 C。A 会错分同名仓库，B 产生 N+1 与异步闪烁；C 是一次快照内的稳定事实。 |
| 失效登记 | A. 服务端静默自动删除；B. 显式批量注销；C. 保持逐项注销 | 采用 B。自动删除无法区分暂时卸载磁盘；批量注销可恢复且不碰文件。 |
| 编排图 | A. 继续调 SVG 走线；B. 主阶段轨 + 次级关系列表；C. 引入图形库 | 采用 B。主线最清晰，保留全部事实与可访问路径，且不增加依赖。 |
| Machine | A. 所有缺失均阻断；B. 核心能力与 AFK 可选能力分层 | 采用 B。只有当前工作真正依赖的能力才叫阻断。 |
| 宿主检测 | A. 固定默认 Codex；B. 新增只读宿主检测 DTO；C. 让用户继续选择 | 采用 B。固定默认会误导 Claude 用户；检测 DTO 可以诚实返回无结果。 |

## 项目与 workspace 分组

### 后端事实

`ProjectSnapshot` 增加可选 `repository`：

```ts
interface ProjectRepositoryIdentity {
  id: string              // common Git directory 的不可逆 SHA-256 身份
  label: string           // 仓库目录 basename；不回显新绝对路径
  workspace_kind: 'primary' | 'worktree'
}
```

生产探测使用固定 argv、无 shell 的
`git rev-parse --path-format=absolute --git-common-dir --show-toplevel`，绑定已登记且已验证为目录的
root，并设置短超时。`common-dir` 规范化后用于 hash；常规 `.git` / `repository.git` 可直接派生仓库目录名。
对无法从 linked worktree 单独反推出 primary top-level 的外置 metadata 布局，Snapshot 在同一批已登记
root 中优先采用 primary 的 top-level basename，并统一投影到相同 id 的 worktree；没有 primary 时采用
确定性 fallback。原始路径不进入新增字段。无法探测、
非 Git 项目、超时或异常时省略 `repository`，前端以 root 自成一组，不把失败伪装成共享仓库。

`repository` 是 `tenon-snapshot/v2` 的 additive 可选字段；旧 server/旧 fixture 继续解码。服务端与
前端 decoder 都严格验证 id、label 与 workspace_kind。

### 前端层级

```text
Projects
  └─ Repository group（真实项目）
       ├─ 组名、workspace 数、需处理/运行中汇总
       ├─ Primary workspace
       └─ Worktree workspace(s)
```

- 页面总数优先表达“项目组数 + workspace 数”，不再把每个 worktree 都叫项目。
- 默认展开含需处理或运行中的组；其他组保留明确的展开按钮。搜索命中组名、workspace basename 或
  完整 root 时自动显示命中 workspace。
- 状态计数按项目组聚合；组内 workspace 保留各自 phase、Change 数与完整 accessible root。
- 不可达 root 无 repository 事实，集中进入“失效登记”区。提供一次批量注销确认，逐个复用既有
  受鉴权 DELETE；部分失败保留失败项并显示可重试结果。

## 编排图

### 主阅读路径

workflow 与 change 变成画布顶部的 scope/context，不再分别占据巨大节点列。phase 按 canonical
`order` 呈现为一条水平阶段轨；当前、完成、待处理通过文字、形态与 token 同时表达。阶段卡使用
一致宽高，1024px 下阶段轨自身可以横向滚动，文档根不溢出。

只有按 canonical order 的主干 transition 作为阶段之间的箭头提示。回退、分支、contains、governs、
produces、reviews、executes 等关系不叠在线上，进入“关系”列表，逐条显示来源、关系、目标与事件。
选择阶段后只展示其 incoming/outgoing，未选择时显示关系摘要。

### 资源与可访问性

task/document/review/session 按类型进入阶段轨下方的紧凑资源区；筛选与搜索继续决定可见集，节点选择、
ArrowLeft/ArrowRight/Home/End、Enter/Escape、详情和原生语义列表保持。服务端 graph DTO 不变。

## Workbench 尺寸系统

Workflow、动作与项目级 Track 合并到一个 `Workbench controls` 表面：

- 第一行：Workflow 选择、阶段数、创建/复制/治理、只读/契约状态；
- 分隔线；
- 第二行：运行 Track 说明、等高 radio、Track 设置。

所有一等控制使用同一 40–44px 高度、10–12px 圆角与统一水平 padding。只有 Workflow identity
使用轻量 accent surface，不再用 56px 大卡压过其余动作；Track 不再有第二个外层大框。

## Machine 状态语义

Machine 把 readiness 分为：

1. **交互核心**：Codex 凭证、必备 Skill、受控操作能力；缺失时可进入 `attention/blocked`。
2. **AFK 自动运行**：Docker、sandbox image；缺失时显示 `optional-unavailable` 与“仅影响 AFK”，
   不进入全局 blocker 数或“当前阻断”。

当具体 Loop 的 canonical readiness 已经是 `not-ready` 时，它仍在项目风险队列显示真实阻断；页面
不根据 Docker 卡片自行推断某个 Loop。无当前项目也不叫阻断，Machine 仍可展示全机事实。

## 宿主目标计划与自动检测

Host Plan 的产品定义调整为：“检查当前宿主的 Tenon setup/update 命令与步骤，不在页面内执行”。
页面标题下直接解释：计划生成零副作用，复制或在终端运行命令才会发生安装/更新。

新增只读 `GET /api/host-target-detection`，返回：

```ts
interface HostTargetDetection {
  schema_version: 'host-target-detection/v1'
  detected_hosts: HostId[]
  recommended_host: HostId | null
  recommended_operation: 'setup' | 'update' | null
  reason: 'tenon-plugin-detected' | 'host-detected' | 'none'
}
```

检测只查看 `hostHome` 下受支持 native host 的配置/插件存在性，不读凭证内容、不运行命令、不访问网络，
不回显路径。优先已安装 Tenon 的 native host，再按 catalog 顺序选择仅检测到宿主的目标：已安装 Tenon
推荐 `update`，仅存在宿主推荐 `setup`，都未检测到则保持明确的手动选择空态。adapter 是项目范围，
没有 project context 时不伪装成自动检测。

Catalog 与 detection 并行加载。两者成功且推荐项有效时，UI 自动选中目标并直接请求只读推荐计划；
用户仍可改选其他宿主/操作。任一请求变化均取消旧请求，迟到 plan 不覆盖新选择。

## 状态与失败模型

| 域 | loading | empty/none | error | ready |
| --- | --- | --- | --- | --- |
| 项目组 | Snapshot loading | 无登记项目 | Snapshot error | 分组列表 |
| 失效清理 | idle | 0 项不显示 | 部分失败保留 | 已注销并等 SSE/refresh |
| 编排 | graph loading | 真空图/筛选空分开 | retry | 阶段轨 + 关系 |
| Machine | 各数据源 unknown | 可选能力未配置 | 数据源 error | 核心/AFK 分层 |
| Host Plan | catalog+detection loading | 未检测到宿主 | detection 降级手选；catalog/plan 可重试 | 自动推荐或手选计划 |

## 安全、性能与兼容

- Git 探测只绑定已登记 root，固定 argv、无 shell、超时、失败关闭；不把 common directory 原文加入 DTO。
- 批量清理只注销 registry，逐项鉴权，不删除目录，不自动清理暂时不可达挂载。
- 宿主检测只返回闭集 token/布尔推论，不读取或返回 auth/token 内容。
- 每个 root 只进行一次有界 Git 探测，并与其他 root 并行；前端分组为 O(n)。
- 不增加运行时依赖，不改 canonical Change、workflow、review 或 host plan v1。
- 旧 Snapshot 没有 repository、旧 server 没有 detection endpoint 时分别降级为单 root 组与手动宿主选择。

## 验收矩阵

- 组件/模型：仓库分组、fallback、组计数、搜索/聚焦、批量清理成功/部分失败。
- Server：Git primary/worktree 同组、非 Git/超时降级、Snapshot decoder；宿主已装/仅宿主/无检测。
- 编排：七阶段顺序、回退关系不交叉覆盖主轨、筛选/搜索/选择/键盘、语义关系列表。
- Machine：Docker/image 缺失不计全局 blocker；真实核心缺失与 Loop not-ready 仍可见。
- Host Plan：自动 Codex update、自动 setup、无检测手选、旧 server 降级、切换取消、错误重试。
- Workbench：控制高度/表面层级、长 Workflow、zh/en、light/dark/system、键盘与 reduced motion。
- 真实 Dashboard：1024×768、1200×870、1440×900、1920×1080；无根级水平溢出，五张图路径均验收。

## Assumptions / Decision Log

1. 用户所说“项目”指稳定仓库，“任务/工作区”指其下 worktree/Change；因此页面会同时显示两级数量，
   避免隐藏真实并行工作。
2. 暂时不可达磁盘与永久删除无法仅靠一次 Snapshot 区分，所以产品不做静默自动删除。
3. Docker/image 不可用不能阻断普通交互；具体 AFK Loop 是否阻断由 canonical Loop readiness 拥有。
4. Dashboard 是多宿主产品，无法可靠声称唯一“当前宿主”；检测结果必须允许多项，并只给出可解释推荐。
5. 用户已明确委托后续问题自主解决；上述低风险、可回退决定直接进入 Spec，不再用产品偏好问题中断。

## Grill 红队自检

| 质疑 | 证据与处理 | 归属 |
| --- | --- | --- |
| common Git dir 会泄漏路径吗？ | DTO 只返回 hash id、basename label、kind；绝对 common path 不出服务端。 | Snapshot 契约/Server 测试 |
| 两个同名但不同仓库会不会合并？ | id 来自规范化 common dir hash，不使用 basename 分组。 | 项目模型测试 |
| 外接盘暂时断开是否被误删？ | 不自动删；批量注销必须由用户动作触发，且只操作当前 `ok=false` root。 | Projects 交互 |
| 不画所有边是否丢事实？ | 所有边仍在关系区与语义列表；主轨只减少视觉叠加，不删 DTO。 | 编排测试 |
| Docker 缺失是否掩盖 AFK 失败？ | 卡片仍显示不可用并明确“仅影响 AFK”；具体 Loop not-ready 仍进入风险队列。 | Machine 测试 |
| 自动推荐会不会执行更新？ | 只自动请求 `side_effects:none` 的计划；没有执行入口，命令仍需用户在终端运行。 | Host Plan API/UI |
| detection 失败是否锁死页面？ | Catalog 可独立成功；检测 404/错误降级为手动选择，不伪装检测成功。 | Host Plan 状态机 |

```coverage
touches:
L1_api:      filled -> #项目与-workspace-分组 和 #宿主目标计划与自动检测
L2_data:     filled -> #项目与-workspace-分组
L3_rules:    filled -> #machine-状态语义 和 #安全性能与兼容
L4_state:    filled -> #状态与失败模型
L5_errors:   filled -> #状态与失败模型
L6_security: filled -> #安全性能与兼容
L7_perf:     filled -> #安全性能与兼容
L8_deps:     filled -> #安全性能与兼容
L10_terms:   filled -> #用户结果 和 #宿主目标计划与自动检测
```
