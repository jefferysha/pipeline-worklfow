# workflow-decomposition-policy Specification

## Purpose

定义版本化 Workflow 拆分与互动策略、冻结语义、五层授权交集、权威 AFK admission 及安全 API/Dashboard 闭环。

## Requirements

### Requirement: 正交的 decomposition 与 interaction

Workflow MUST 分别配置版本化 `decomposition` 与 `interaction`，二者互不推导。

#### Scenario: 独立配置

- **WHEN** 只把 interaction 从 interactive 改为 recommended-defaults
- **THEN** decomposition 的 mode/target/strategy/limits/conditions 保持不变

### Requirement: 完整 decomposition 策略

decomposition MUST 支持 mode=`off|suggest|auto-safe|require-review`、target=`work-items|child-pipelines`、strategy=`balanced|breadth-first|depth-first`、`max_items=1..32`、`max_depth=0..4`，以及下列无重复条件闭集：`auto_when=independent-work-items|cross-component-boundary|context-budget-risk`，`ask_when=ambiguous-requirements|hard-boundary|missing-authorization|limit-exceeded`。条件含义、次序和 limits MUST 进入规范化 frozen policy；未知值、重复值与越界数值失败关闭。

#### Scenario: auto-safe 有界拆分

- **WHEN** auto_when 命中且建议项目不超过冻结 limits 并全部通过权限交集
- **THEN** 系统可自动物化目标并记录策略依据

#### Scenario: require-review

- **WHEN** 候选计划由 require-review 生成
- **THEN** 可保存候选但执行前必须具备 exact review event receipt

#### Scenario: 未知或重复条件

- **WHEN** policy 含未登记 condition、同一数组重复 condition、越界 limit 或不属于闭集的 strategy
- **THEN** definition compiler 拒绝且不得发布部分配置

### Requirement: interaction 模式

interaction MUST 支持 `interactive|recommended-defaults|afk`；recommended-defaults 仅抑制有冻结默认的例行问题。

#### Scenario: 例行默认

- **WHEN** routine question 有 matching frozen rule 且无硬边界
- **THEN** 采用默认值并要求 PR2 DecisionEvent 证明

#### Scenario: AFK 不扩权

- **WHEN** mode=afk 但外部发布/生产/费用/credentials/不可逆动作授权缺失
- **THEN** admission hard-blocked

### Requirement: 五层权限交集

有效权限 MUST 按动作取平台安全、Skill contract、项目/track、Workflow ceiling 与 exact Run grant 的交集；缺失、未知、过期或错绑均为 denied。

#### Scenario: 任一层拒绝

- **WHEN** 五层中任一层对 action=false
- **THEN** effective action=false 并返回贡献层与 remediation code

### Requirement: hard confirmation 不可默认

安全、费用、生产、外部副作用/发布、credentials、不可逆操作和缺失授权 MUST 在所有 interaction mode 下失败关闭。

#### Scenario: recommended-defaults 遇硬边界

- **WHEN** routine plan 后续动作触发 hard boundary
- **THEN** 系统停止在 hard-blocked，不得沿用普通默认继续

### Requirement: frozen policy 与 drift

新 WorkflowRun MUST 冻结规范化政策、有效授权输入与新版 fingerprint；live definition 漂移不得改变已有 Run。

#### Scenario: 运行中修改定义

- **WHEN** 当前 Workflow YAML policy 变化
- **THEN** Run 继续 frozen semantics，status 报告 current/frozen drift

### Requirement: authoritative AFK admission

queue/CLI MAY 早期拒绝，但 automation pre-claim admission MUST 使用 frozen snapshot 再检查 interaction、权限、证据与 hard confirmation。

#### Scenario: 早检与权威检查间漂移

- **WHEN** 早检通过后 run grant 或 policy identity 失效
- **THEN** pre-claim admission 拒绝且不生成可执行 context

### Requirement: 安全策略 API

server MUST 分离配置 policy、frozen policy、effective grants、denials 与 drift，并让写入继续走共享 compiler/registry lock/atomic publication。

#### Scenario: 非法 policy POST

- **WHEN** POST 含未知 key/version/mode/target/condition 或非法 limit
- **THEN** compiler 拒绝且现有 definition 不变

### Requirement: Dashboard 配置闭环

Dashboard MUST 通过完整 Workflow definition GET/POST 展示和编辑 decomposition 与 interaction，不得增加绕过 shared compiler、registry lock 或 atomic publication 的写入端点；MUST 提供 zh/en 文案、loading、empty、error、保存中与保存结果状态，并支持键盘完成主要编辑路径。

#### Scenario: 合法策略保存

- **WHEN** 用户在 Dashboard 修改任一策略字段并保存合法完整 definition
- **THEN** API 原子发布新 definition，刷新后显示规范化值与独立的 decomposition/interaction 状态

#### Scenario: 非法策略保存

- **WHEN** Dashboard 提交未知值、越界 limit 或不兼容条件
- **THEN** 页面显示可恢复错误且当前已发布 definition 保持不变

#### Scenario: 读取失败后重试

- **WHEN** 初始 GET 失败后服务恢复且用户触发重试
- **THEN** 页面离开 error 状态并显示服务器返回的真实 definition，不保留伪造默认值
