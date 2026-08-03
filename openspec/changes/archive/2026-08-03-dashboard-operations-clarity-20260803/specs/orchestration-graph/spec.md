# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: 图必须支持桌面交互和等价的可访问阅读路径

Dashboard SHALL 把 workflow/change 作为 scope context，把 phase 按 canonical `order` 呈现为唯一主阶段
轨。只有主干阶段顺序使用直接连接提示；回退、分支、contains、governs、produces、reviews、executes
与其他次级边 SHALL 进入关系区和语义列表，不得在线上重叠形成交叉蛛网。该变化 MUST NOT 删除或
修改 `tenon-orchestration-graph/v1` 节点/边事实。Dashboard MUST 提供节点类型过滤、标题搜索、节点选择、节点详情、边详情以及同步的语义节点/边列表。图交互 MUST 支持键盘且不依赖颜色、hover 或指针。阶段轨 SHALL 支持 ArrowLeft/ArrowRight/Home/End 移动焦点、Enter 选择、Escape 清除；1024px 下仅阶段轨容器 MAY 横向滚动，文档根 MUST NOT 溢出。

#### Scenario: 搜索与过滤

- **WHEN** 用户输入标题搜索或切换一个或多个类型过滤
- **THEN** 只显示匹配节点及端点均可见的边，并报告可见数量
- **AND** 无匹配时显示“过滤结果为空”，不与服务端真实空态混淆

#### Scenario: 键盘浏览与选择

- **WHEN** 焦点位于图节点并使用 ArrowLeft/ArrowRight/Home/End
- **THEN** 焦点按当前可见确定性顺序移动
- **WHEN** 用户按 Enter 选择节点或按 Escape 清除选择
- **THEN** 同步详情面板更新并保持可见焦点
- **AND** focus、selected 与 pressed filter 均有足够对比和非颜色状态提示

#### Scenario: 图形不可用或难以理解

- **WHEN** 用户展开可访问替代列表
- **THEN** 原生语义列表逐项显示相同节点和边关系，包括边类型、label/event 和可读端点标题
- **AND** 选中详情分别显示 incoming/outgoing 相邻边
- **AND** 键盘与屏幕阅读器无需操作画布即可获取等价信息

#### Scenario: default 七阶段含回退边

- **WHEN** 图包含七个 phase、正向 transition 与 `requirements-changed`/`verify-fail` 回退边
- **THEN** 主轨按 open→explore→spec→build→verify→ship→archive 稳定显示
- **AND** 回退边在关系区显示来源、事件和目标，不跨越主阶段卡覆盖内容。

#### Scenario: contains/governs 边很多

- **WHEN** Change 与全部 phase 之间存在 contains 边
- **THEN** scope 与阶段轨仍保持单一阅读顺序
- **AND** 所有 contains 边可在关系区或语义列表读取。

#### Scenario: 搜索一个阶段并查看关系

- **WHEN** 用户搜索阶段标题并按 Enter 选择唯一结果
- **THEN** 主轨只保留匹配的可操作节点上下文
- **AND** 详情显示该阶段真实 incoming/outgoing 关系，焦点保持可见。

#### Scenario: 资源节点被启用

- **WHEN** 用户启用 task/document/review/session 类型
- **THEN** 资源按类型进入主轨下方的紧凑资源区
- **AND** 资源选择与语义列表提供和服务端边相同的关系事实。
