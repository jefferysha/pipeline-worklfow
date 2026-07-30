# Dashboard Projects 桌面聚焦设计

## 背景与用户结果

Tenon Dashboard 是本地开发者的电脑端操作控制台。真实生产 Dashboard 基线在
`http://127.0.0.1:18831/?view=projects` 显示 38 个项目，其中 18 个可达、20 个不可达、3 个需要用户处理。
现有列表已经按“需要你动手 / 其余 / 读不到”分区，并正确区分同名 worktree，但用户只能顺序滚动定位目标。

本批的用户结果是：在 1024–1920px 的 Projects 页面里，用户可以按项目名或完整 root 快速检索，
也可以一键聚焦“需要处理 / 运行中 / 读不到”的项目，并始终知道当前显示结果、隐藏条件和恢复方式。

## 约束与非目标

- 只优化电脑端 Dashboard；不设计、不截图、不验收手机端。
- 不改项目发现、Snapshot、API、server、状态机、鉴权或数据模型。
- 保持既有项目排序、同名 worktree 身份、打开项目回调和不可达只读语义。
- 复用 React、Tailwind 4、Lucide、GSAP 和既有主题 token；不增加依赖。
- 与在途 AFK、Trace 批次隔离；运行时代码只触及 Projects 功能域和 `projects.*` i18n 键段。

## 真实浏览器基线

| 检查项 | 观察 |
| --- | --- |
| 身份 | 标题 `Tenon Dashboard`；URL `http://127.0.0.1:18831/?view=projects`；server 端口 18831 |
| 数据规模 | 38 个项目；3 个需处理；18 个可达；20 个不可达 |
| 1024×768 | 左侧 rail、标题、分区和项目行可操作；`scrollWidth=clientWidth=1024` |
| 1440×900 | 项目身份、相位轨、健康摘要形成稳定单行层级 |
| 主题 | System 解析为当前系统 Dark；显式 Light、Dark 和恢复 System 均正确更新 token |
| 键盘/反馈 | 项目行可聚焦，设置浮层有 focus 生命周期；Projects 没有检索、状态筛选、结果摘要或零结果恢复 |
| 动效 | 现有列表仅在项目集合变化时运行 280ms 内 GSAP 入场；reduced-motion 分支直接落终态 |

基线截图仅用于本轮视觉检查，不提交仓库，避免把本机路径和易漂移像素资产变成产品依赖。

## 方案比较

| 方案 | 能力 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 仅搜索 | 按 basename/root 过滤 | 改动最小 | 无法一键聚焦需处理、运行中或不可达项目 |
| B. 搜索 + 状态聚焦（采用） | 搜索；All/Needs you/Running/Unreachable 四态；结果摘要与恢复 | 同时解决定位和状态聚焦；复用既有 row 字段；无需 API | 需要明确计数口径、键盘模型和不可达展示规则 |
| C. 全局命令面板 | 跨页面项目跳转和动作 | 长期效率潜力高 | 扩大到 App/shell 全局状态、快捷键冲突和多页面契约，超出本批 |

## 交互与信息架构

### 聚焦工具栏

- 位于 PageHeader 之后、项目结果之前；1024px 起保持搜索框与状态 tabs 同行，空间不足时自然换行。
- 搜索输入使用 Lucide `Search`，可访问 label 和中英文 placeholder；匹配经过 `trim().toLocaleLowerCase()`，
  同时覆盖 `basename` 与完整 `root`。
- 状态 tabs 为 `all | attention | running | unreachable`：
  - `all`：全部项目数，包括不可达项目。
  - `attention`：`ok && need > 0`。
  - `running`：`ok && running > 0`。
  - `unreachable`：`!ok`。
- badge 计数来自完整 rows，不随查询改变；查询与 tab 共同决定结果摘要。
- tabs 使用 roving focus；ArrowLeft/ArrowRight/Home/End 同步焦点和选中项。

### 结果呈现

- 默认 `all + 空查询` 完全保留现有三分区与“读不到 N 个”折叠语义。
- `all + 有查询` 自动展开匹配的不可达行，避免用户搜索到项目却仍要猜测折叠区。
- 非 `all` 状态直接展示对应结果；不可达结果继续是 `aria-disabled` 的只读 group，不伪装为可点击项目。
- live summary 使用 `role=status`、`aria-live=polite`，表达“显示 X / 共 Y 个项目”与当前状态。
- 零结果显示边框虚线空态，说明没有匹配项，并提供“清除条件”；执行后恢复 `all`、清空查询并把焦点返回搜索框。
- 搜索输入按 Escape 只清空查询，不改变当前状态 tab，避免一次键盘动作丢失两个条件。

## 状态与数据流

```text
Snapshot
  -> buildProjectRows (既有事实投影)
  -> global focus counts
  -> query match (basename + root)
  -> focus predicate
  -> existing section renderer / focused result renderer
  -> live summary + filtered empty recovery
```

所有新状态都留在 Projects 功能域：

- `query: string`
- `focus: 'all' | 'attention' | 'running' | 'unreachable'`
- `tabRefs` 与 `searchRef` 只管理键盘焦点

不把筛选条件写入 URL 或 localStorage：这是临时浏览上下文，离开页面后应自然重置。

## 动效与性能

- 不为每次键入新增 GSAP；搜索和状态切换立即更新，避免 38+ 项目下的重复 stagger 和输入延迟。
- 保留既有项目集合入场动画，其依赖仍是完整 rows 指纹，不因 query/focus 改变而重播。
- hover/press 和 focus ring 继续使用既有 token 与短 transition；reduced-motion 不增加新分支负担。
- 查询与聚焦均为 O(n) 的本地派生，n 为当前已注册项目数；不产生网络请求。

## 可访问性与兼容性

- 搜索使用原生 input；tabs 使用 `role=tablist/tab`、`aria-selected`、单一 `tabIndex=0`。
- 状态不只靠颜色：每个 tab 有文字、计数和选中形态。
- 结果摘要与零结果为可读文字；清除动作是普通按钮。
- 项目 accessible name 继续包含完整 root；同 basename 的 React key/DOM id 不变。
- 小于 1024px 的既有布局只做结构防回归，不属于设计或验收范围。

## Assumptions / Decision Log

- 用户已持续授权低风险 UI 细节自主决策，因此采用方案 B，无需扩大 API 或全局快捷键范围。
- 计数 badge 保持全局，结果摘要反映当前查询与状态；这与 Progress 已验证的“全局 badge + 当前结果摘要”一致。
- 不可达项目在查询或显式不可达 tab 下直接可见，默认无查询时仍折叠，兼顾扫描密度与可发现性。
- 搜索不匹配相位/状态文案，避免语言切换、翻译文本和业务事实之间产生漂移；状态由 tabs 负责。

## 红队自检

- 如果“项目很多”假设不成立：工具栏仍是低干扰局部控件，默认输出与现有列表一致。
- 如果查询隐藏了重要项目：全局计数、live summary、当前 tab 与清除按钮同时暴露过滤事实。
- 如果不可达项目不能打开：继续使用只读 group 和 `aria-disabled`，不提供虚假主操作。
- 如果用户快速输入：不触发网络或逐键 GSAP，只进行线性数组过滤。
- 如果 1024px 空间不足：工具栏允许换行，结果行保持现有已验证布局，不压缩身份与健康摘要。

```coverage
touches:
L1_api:      waived -> 本批只消费既有 Snapshot，不修改或新增 API
L2_data:     waived -> 不新增持久化、迁移或公共数据契约
L3_rules:    filled -> #交互与信息架构
L4_state:    filled -> #状态与数据流
L5_errors:   filled -> #结果呈现
L6_security: waived -> 只读本地筛选，不接收或外发新增敏感数据
L7_perf:     filled -> #动效与性能
L8_deps:     waived -> 复用既有 React、Tailwind、Lucide 与 GSAP，不增加依赖
L10_terms:   filled -> #状态与数据流
```
