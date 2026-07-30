# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Workflow 定义状态必须作为编排图节点诊断

Server MUST 继续安全比较 frozen/current workflow definition，但该状态 MUST 作为
`tenon-orchestration-graph/v1` 的 workflow node metadata 消费，而不是独立 Dashboard 功能。

#### Scenario: 当前定义与冻结定义不同

- **WHEN** current workflow fingerprint 与 frozen workflow fingerprint 不同
- **THEN** workflow node 显示 `changed` 诊断与可用 fingerprint
- **AND** frozen phase、transition、readiness、document、Skill 与 review 执行语义不改变

#### Scenario: 当前定义缺失、无效或不可比较

- **WHEN** 当前 custom workflow 缺失、无效，或旧 Change 没有 frozen plan
- **THEN** workflow node 分别显示 `missing`、`invalid` 或 `unavailable`
- **AND** 不返回 workflow 正文、绝对路径、原始错误、stack、session 或凭证

#### Scenario: 独立状态端点滚动兼容

- **WHEN** 本轮保留 `GET /api/workflow-definition-status` 作为 graph route 的内部兼容构件
- **THEN** 它不得在 Dashboard 继续挂载独立窄卡片
- **AND** 回滚 graph UI 时既有 snapshot 与 transition API 不受影响
