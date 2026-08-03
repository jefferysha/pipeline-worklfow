# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: 图 SHALL 以确定性阶段主线和次级关系呈现全部事实

Dashboard SHALL 把 workflow/change 作为 scope context，把 phase 按 canonical `order` 呈现为唯一主阶段
轨。只有主干阶段顺序使用直接连接提示；回退、分支、contains、governs、produces、reviews、executes
与其他次级边 SHALL 进入关系区和语义列表，不得在线上重叠形成交叉蛛网。该变化 MUST NOT 删除或
修改 `tenon-orchestration-graph/v1` 节点/边事实。

#### Scenario: default 七阶段含回退边

- **WHEN** 图包含七个 phase、正向 transition 与 `requirements-changed`/`verify-fail` 回退边
- **THEN** 主轨按 open→explore→spec→build→verify→ship→archive 稳定显示
- **AND** 回退边在关系区显示来源、事件和目标，不跨越主阶段卡覆盖内容。

#### Scenario: contains/governs 边很多

- **WHEN** Change 与全部 phase 之间存在 contains 边
- **THEN** scope 与阶段轨仍保持单一阅读顺序
- **AND** 所有 contains 边可在关系区或语义列表读取。

### Requirement: 图 SHALL 保留筛选、搜索、选择与等价键盘路径

节点类型筛选、标题搜索、稳定 visible set、节点选择、详情、incoming/outgoing 与替代列表 SHALL 保持；
阶段轨 SHALL 支持 ArrowLeft/ArrowRight/Home/End 移动焦点、Enter 选择、Escape 清除。1024px 下仅阶段轨
容器 MAY 横向滚动，文档根 MUST NOT 溢出。

#### Scenario: 搜索一个阶段并查看关系

- **WHEN** 用户搜索阶段标题并按 Enter 选择唯一结果
- **THEN** 主轨只保留匹配的可操作节点上下文
- **AND** 详情显示该阶段真实 incoming/outgoing 关系，焦点保持可见。

#### Scenario: 资源节点被启用

- **WHEN** 用户启用 task/document/review/session 类型
- **THEN** 资源按类型进入主轨下方的紧凑资源区
- **AND** 资源选择与语义列表提供和服务端边相同的关系事实。
