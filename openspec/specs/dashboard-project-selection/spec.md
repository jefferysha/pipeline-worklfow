# Dashboard 项目选择规格

## Purpose

定义 Dashboard 项目注册表、显式选择和 URL 投影之间的唯一上下文契约，确保无选择、失效选择与
浏览器历史不会隐式绑定到其他项目。
## Requirements
### Requirement: Dashboard 项目上下文 SHALL 只来自显式选择

Dashboard SHALL 将机器注册的项目集合与当前选择建模为不同状态。当前选择 SHALL 表示为
`none | selected(root)`；只有 URL 中有效且已登记的 `root`，或用户打开某个已登记且可达的 workspace，
可以产生 `selected(root)`。注册顺序、首个可达项目、历史 localStorage 偏好、“默认项目”以及项目组的
展开/折叠与筛选 MUST NOT 产生隐式选择；选择项目组本身只改变展示状态。

#### Scenario: 打开不含 root 的 Dashboard URL

- **GIVEN** 机器注册表包含一个或多个项目
- **WHEN** 用户打开不含 `root` 参数的 Dashboard URL
- **THEN** 当前项目上下文为 `none`
- **AND** URL 继续不含 `root`
- **AND** Dashboard 不调用任何要求项目 root 的 API。

#### Scenario: 用户显式选择项目

- **WHEN** 用户从项目总览打开一个已登记且可达的 workspace
- **THEN** 当前项目上下文变为 `selected(root)`
- **AND** URL 写入该精确规范化 root
- **AND** 受项目约束的视图和 API 只消费该 root。

#### Scenario: 展开项目组

- **WHEN** 用户展开包含多个 workspace 的项目组
- **THEN** 当前项目上下文保持 `none`
- **AND** URL 不写入组内任一 root。

### Requirement: 失效选择 SHALL fail closed

当 URL root 未登记、不可达、被移除或不再匹配注册身份时，Dashboard SHALL 清除选择并回到
`none`，不得把选择重定向到另一个项目。只能在单项目上下文工作的进度、自动运行和工作台视图
SHALL 显示项目选择入口或导航到项目总览，不得以空 root 或其他项目 root 请求 per-root API。

#### Scenario: 深链 root 已失效

- **GIVEN** URL 包含一个未登记或已移除的 root
- **WHEN** 项目快照完成校验
- **THEN** Dashboard 清除该 root 并进入无选择状态
- **AND** URL 移除 `root` 与依赖它的 `change`
- **AND** 不选择注册表中的首个项目。

#### Scenario: 当前项目在运行时被移除

- **GIVEN** 当前上下文为 `selected(root-a)`
- **WHEN** 新快照不再包含 `root-a`
- **THEN** 当前上下文原子变为 `none`
- **AND** 任何后续项目 API 不得改用 `root-b`。

### Requirement: URL SHALL 是可复制的显式项目投影

Dashboard SHALL 只把真实选择投影到 `root` 参数。无选择时 SHALL 删除 `root` 和依赖项目的
`change`；浏览器前进/后退 SHALL 通过同一解析与登记校验恢复 `none` 或 `selected(root)`，
不得绕过选择模型。其他非 Dashboard query 参数 SHALL 保持不变。

#### Scenario: 从已选项目返回项目总览

- **WHEN** 用户清除项目上下文或进入无选择的项目总览
- **THEN** URL 删除 `root` 和 `change`
- **AND** 其他 query 参数保持不变
- **AND** 刷新后仍为无选择状态。

### Requirement: Snapshot SHALL 提供稳定且失败关闭的仓库身份

Server SHALL 对已登记且可达的 root 使用固定 argv、无 shell、有界超时的 Git probe 获取 common
directory，并在 `ProjectSnapshot.repository` 中返回不可逆稳定 `id`、可读 `label` 与
`primary|worktree` workspace kind。新增字段 SHALL 是 optional additive；探测失败、超时、非 Git
项目或无效输出 SHALL 省略该字段，不得按 basename 猜测身份，也不得回显 common directory 路径。

#### Scenario: 主工作区与 worktree 属于同一仓库

- **GIVEN** 两个已登记 root 的 `git --git-common-dir` 解析为同一规范目录
- **WHEN** Server 构建 Snapshot
- **THEN** 两个 ProjectSnapshot 返回相同 repository id 与 label
- **AND** workspace kind 分别为 `primary` 与 `worktree`。

#### Scenario: Git 身份无法取得

- **WHEN** root 不是 Git 仓库、probe 超时、失败或返回无效路径
- **THEN** 该 ProjectSnapshot 继续按既有契约返回
- **AND** `repository` 缺席且 Snapshot 不因探测失败整体失败。

### Requirement: Projects SHALL 按仓库项目分组并保留 workspace 身份

Projects SHALL 以 repository id 作为组 identity；缺少 repository 的 root SHALL 自成一组。项目组
SHALL 聚合 workspace 数、需处理数、运行中数与 Change 数，并在展开后逐项显示 primary/worktree、
阶段摘要、可区分路径和完整 accessible root。页面 SHALL 同时表达项目组数与 workspace 数，不得再把
同仓 worktree 平铺计作多个项目。

#### Scenario: 同一仓库有多个并行 worktree

- **WHEN** Snapshot 包含一个 primary 与三个相同 repository id 的 worktree
- **THEN** Projects 显示一个项目组和四个 workspace
- **AND** 每个 workspace 可以独立打开自己的 exact root。

#### Scenario: 两个同名仓库 identity 不同

- **WHEN** 两个 root basename 与 repository label 相同但 repository id 不同
- **THEN** Projects 显示两个独立项目组
- **AND** React key、DOM id、搜索与打开动作不会交叉。

#### Scenario: 旧 Server 不返回 repository

- **WHEN** Dashboard 解码没有 repository 的合法 Snapshot
- **THEN** 每个 root 以单 workspace 项目组安全显示
- **AND** 页面不加载失败或把多个同名 root 合并。

### Requirement: 失效登记 SHALL 可批量安全注销

Projects SHALL 对当前 Snapshot 中 `ok=false` 的 root 提供显式批量清理动作。动作 SHALL 先说明只从
本机 registry 注销且不删除文件/Change，再逐项复用受鉴权的 `DELETE /api/projects?root=`。部分失败
SHALL 保留失败 root、报告结果并允许重试；服务端 MUST NOT 因一次不可达 Snapshot 静默自动注销。

#### Scenario: 批量清理全部失效登记

- **WHEN** 用户确认清理三个当前 `ok=false` root 且三个 DELETE 均成功
- **THEN** Dashboard 刷新后不再显示这些登记
- **AND** 不执行任何文件、worktree 或 Change 删除。

#### Scenario: 批量清理部分失败

- **WHEN** 三个注销请求中一个失败
- **THEN** 两个成功项完成注销，失败项继续可见
- **AND** UI 显示本地化部分失败结果与重试动作。
