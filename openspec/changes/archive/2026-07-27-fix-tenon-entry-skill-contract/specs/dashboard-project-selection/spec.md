# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Dashboard 项目上下文 SHALL 只来自显式选择

Dashboard SHALL 将机器注册的项目集合与当前选择建模为不同状态。当前选择 SHALL 表示为
`none | selected(root)`；只有 URL 中有效且已登记的 `root`，或用户对项目的显式选择动作，
可以产生 `selected(root)`。注册顺序、首个可达项目、历史 localStorage 偏好和“默认项目”
MUST NOT 产生隐式选择。

#### Scenario: 打开不含 root 的 Dashboard URL

- **GIVEN** 机器注册表包含一个或多个项目
- **WHEN** 用户打开不含 `root` 参数的 Dashboard URL
- **THEN** 当前项目上下文为 `none`
- **AND** URL 继续不含 `root`
- **AND** Dashboard 不调用任何要求项目 root 的 API。

#### Scenario: 用户显式选择项目

- **WHEN** 用户从项目总览选择一个已登记且可达的项目
- **THEN** 当前项目上下文变为 `selected(root)`
- **AND** URL 写入该精确规范化 root
- **AND** 受项目约束的视图和 API 只消费该 root。

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
