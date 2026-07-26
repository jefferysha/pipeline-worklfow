# Dashboard 执行来源增量规格

## ADDED Requirements

### Requirement: 执行状态与执行来源 SHALL 正交建模

Dashboard neutral model SHALL 提供唯一 `executionProvenance(change)` 投影，返回
`automation`、`terminal` 或 `none`。canonical automation 字段处于运行、计划、排队、失败或冲突态时
返回 `automation`；否则，新鲜且绑定当前 Change 的 terminal heartbeat 返回 `terminal`；其他返回
`none`。任何视图不得从折叠后的 `running|queued|failed` 展示态反推来源。

#### Scenario: 终端会话正在推进 Change

- **GIVEN** `automation=off`
- **AND** 当前 Change 存在新鲜 terminal heartbeat
- **WHEN** Dashboard 计算展示模型
- **THEN** progress state 可以是 `running`
- **AND** execution provenance 是 `terminal`。

#### Scenario: 自动运行正在推进 Change

- **GIVEN** canonical automation 为 `running`
- **WHEN** Dashboard 计算展示模型
- **THEN** execution provenance 是 `automation`
- **AND** 终端 heartbeat 不会把来源覆盖为 terminal。

### Requirement: 自动运行页面 SHALL 只展示自动化来源

自动运行队列、计数、筛选和详情 SHALL 只消费 `executionProvenance === "automation"` 的 Change。
进度页 MAY 展示所有运行状态，但必须使用 provenance 显示“终端运行中”或“自动运行中”的真实来源。

#### Scenario: 终端任务出现在进度页

- **WHEN** 一个 terminal provenance 的 Change 处于运行状态
- **THEN** 进度页显示“终端运行中”
- **AND** 自动运行页、自动运行计数和运行队列均不包含该 Change。

#### Scenario: 自动化任务跨页面显示

- **WHEN** 一个 automation provenance 的 Change 处于运行、排队或需处理状态
- **THEN** 进度页和自动运行页都展示该 Change
- **AND** 两页来源标签与阶段一致。

### Requirement: provenance 修复 SHALL 有模型、组件与真实浏览器回归

验证 SHALL 覆盖模型 truth table、ProgressView、AfkView 和真实 18765 Dashboard。浏览器验收必须同时
注入 terminal-only 与 automation fixture，并确认跨页面准入和标签，不得只断言 DOM 中存在任务名。

#### Scenario: 回归测试运行

- **WHEN** CI 与真实浏览器执行 provenance 验收
- **THEN** terminal-only fixture 在进度页可见、自动运行页不可见
- **AND** automation fixture 在两个页面均可见
- **AND** 没有 page error 或来源矛盾。
