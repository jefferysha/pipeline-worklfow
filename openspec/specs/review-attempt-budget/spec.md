# review-attempt-budget Specification

## Purpose
TBD - created by archiving change versioned-release-install-lifecycle-20260808. Update Purpose after archive.
## Requirements
### Requirement: Workflow SHALL 配置并冻结有限 Review 预算

每个 Workflow SHALL 支持版本化 `review_budget` policy，至少声明每个 Review scope 的默认
`max_attempts`。未显式声明的 Workflow SHALL 使用有限安全默认值，而不是无限 Review。每个会执行
自动复核的 step SHALL 显式声明稳定 `review_lanes`；不得通过 skill 名包含 `review`、固定内置 skill
名单或 agent 名称猜测语义。编译后的
effective workflow plan 与其 snapshot SHALL 冻结该 policy；运行中的 Pipeline SHALL NOT 因随后编辑
workflow 文件而改变预算。

Pipeline 实例 MAY 通过显式 CLI 配置覆盖尚未开始的 Review scope；覆盖值 SHALL 绑定精确 run id、
workflow plan fingerprint 和审计时间。允许范围为 `1..20`。已有 attempt 时不得把上限降到已用次数
以下，active attempt 存在时不得改写其预算。

#### Scenario: 自定义 Workflow 声明两次 Review 上限

- **WHEN** Workflow 定义 `review_budget.version=v1` 且 `max_attempts=2`
- **THEN** 每个需要自动 Review 的 step 最多开始两次不同候选的 Review attempt
- **AND** snapshot 保存精确 policy 与该 step 的 `review_lanes`，恢复不重新读取 mutable workflow 默认值

#### Scenario: Pipeline 显式覆盖 Review 上限

- **WHEN** 用户在某个 scope 尚无 active attempt 时执行受支持的配置命令把上限改为 3
- **THEN** override 与当前 run/workflow identity 一起原子持久化
- **AND** 其他 Change、其他 Workflow 与已经冻结的 attempt 不受影响

### Requirement: Review attempt SHALL 是持久、幂等、候选绑定的事务

自动 Reviewer 在执行前 SHALL 通过 Tenon 开始 attempt。begin SHALL 在 Change 锁内绑定当前 step、
候选 fingerprint、冻结 `review_lanes`、attempt id、序号与预算；同一 active attempt 的精确重试 SHALL 返回原 identity，
不同候选不得冒用 active attempt。complete SHALL 绑定 attempt id、`pass|fail`、报告路径与报告 digest，
并只在报告存在、digest 可证明且所有 required lane 都有结构化结果时提交结果。

attempt 计数 SHALL 跨进程、重启、上下文压缩与 Build⇄Verify 回退保留；删除短时 marker、重跑命令或
更换 agent SHALL NOT 清零。Review handshake 的 request/acknowledge 仍是人工出口授权，不得与自动
Review attempt 计数混为一个布尔值。

#### Scenario: 同一候选恢复未完成 Review

- **WHEN** 进程在 begin 已提交、complete 前退出，随后以同一 step 和 candidate fingerprint 重跑
- **THEN** Tenon 返回原 attempt id 且 used count 不增加
- **AND** Reviewer 可以完成原 attempt，不创建重复预算消耗

#### Scenario: 新候选开始下一轮 Review

- **GIVEN** 前一 attempt 已以 fail 和不可变报告完成
- **WHEN** Build 产生不同 frozen candidate fingerprint 并开始 Review
- **THEN** used count 增加一次并绑定新 candidate
- **AND** 历史失败报告保持可审计，不被覆盖

### Requirement: 对抗式验证 SHALL 聚合为一次候选 Review

独立于 Build 实现反馈、针对冻结候选产生放行或打回结论的活动 SHALL 属于 Review，包括 Standards/
Spec code review、安全复核、E2E/API/browser/visual acceptance 与发布候选验收。Workflow SHALL 将这些
活动映射到当前 step 的稳定 lane id；自定义 Workflow MAY 声明新的 lane 与第三方 Review skill，Tenon
SHALL 消费显式声明而不是维护名称启发式名单。

同一候选的一轮复核 SHALL 只有一个 attempt。该 attempt 可并行执行多个 lane；单个 lane 重试、E2E
分片或 reviewer 进程恢复 SHALL 复用同一 attempt id，不分别扣减次数。Build 内为实现提供紧反馈的
TDD、unit、typecheck、lint 与非对抗式集成测试 SHALL NOT 单独创建 Review attempt。

官方 Workflow 中被声明为 Review 的 Skill、reviewer agent 与 E2E runner SHALL 在派发前证明当前 step
存在匹配 frozen candidate 的 active attempt；没有 active attempt、attempt 属于其他 candidate，或预算
已经耗尽时 SHALL 在调用 Skill/agent/runner 前失败关闭。complete 的聚合报告 SHALL 列出 required lane
的 `pass|fail`、证据路径与 digest；缺 lane 不得被当成整轮完成。

#### Scenario: 同一轮并行执行 code review 与 E2E

- **GIVEN** 当前 frozen candidate 的 required lanes 为 `standards`、`spec`、`e2e`
- **WHEN** Workflow 并行派发 reviewer、E2E runner 和其他声明 lane
- **THEN** 三者消费同一个 attempt id，used count 只增加 1
- **AND** 只有三条 lane evidence 都进入聚合报告后才能 complete

#### Scenario: 第三方 Review skill 不靠名称识别

- **WHEN** 自定义 Workflow 把 `acme-quality-gate` 显式声明为 Review lane consumer
- **THEN** Skill gate 在调用它前要求 active attempt
- **AND** 即使 skill id 不含 `review`、`verify` 或 `e2e` 也不能绕过预算

#### Scenario: Build 紧反馈不消耗 Review 次数

- **WHEN** Builder 为当前实现运行 TDD unit test、typecheck、lint 或修复后的定向回归
- **THEN** 这些命令不创建新的 Review attempt
- **AND** 候选冻结后的独立 E2E/acceptance 仍属于聚合 Review 的 `e2e` lane

### Requirement: Review 预算耗尽 SHALL 停止自动循环

当当前 step 的 used attempts 达到 effective max 时，Tenon SHALL 拒绝开始新的自动 Review，返回稳定
非零状态，并输出 scope、`used/max`、最后报告和剩余阻断。系统 SHALL NOT 自动再次派发 Reviewer、
自动扩大预算、把失败改成通过或绕过 review/transition guard。

耗尽后只允许显式的人类处置：修改需求回到 Spec、在允许边界内审计化提高 Pipeline override、接受
残余风险并走已有人工授权机制，或终止 Change。持续自主模式本身不构成提高预算或继续 Review 的授权。

#### Scenario: 第二次失败后达到上限

- **GIVEN** effective max 为 2，当前 step 已有两个 completed fail attempts
- **WHEN** agent 尝试开始第三次 Review
- **THEN** begin 在任何 Reviewer 派发前失败并报告 `used=2 max=2`
- **AND** candidate、state、receipt、任务和报告字节保持不变

#### Scenario: 并发 Reviewer 争抢最后一个名额

- **GIVEN** 当前 used 为 1、max 为 2，且没有 active attempt
- **WHEN** 两个进程同时以不同 candidate 请求 begin
- **THEN** Change 锁只允许一个 attempt 成为序号 2
- **AND** 另一个进程看到 active/耗尽状态并且不得启动 Review
