# Trustworthy Build Revision Specification

## Purpose

Define how Dashboard fixtures represent canonical build-revision readiness without weakening the
production trust boundary or making trusted Verify state ambient in unrelated tests.

## Requirements

### Requirement: Dashboard 正向 Verify fixture MUST 携带可信 readiness 投影

断言可操作 Verify 状态的 Dashboard 测试 fixture MUST 显式提供与生产 snapshot 同形的
`workflowExecution.readinessByTransition.verify` 投影，并同时声明 `verify-pass` 与
`verify-fail` 两条出边的 `{ ready: true, blockers: [] }`。该投影表示 server/kernel 已完成
canonical build revision 与 provenance assessor；fixture 不得用裸 SHA、额外 `ready` 字段或
caller-declared assessor 代替它。`makeChange` 的默认行为 MUST 继续 fail closed，避免把可信状态
ambient 地注入不相关测试。

#### Scenario: 四个 Dashboard surface 使用可信正向 fixture

- **GIVEN** App、Inbox、ProjectsView 或 TaskDetail 的测试要断言 Verify badge、card、need/attention
  计数或 verdict
- **WHEN** fixture 提供上述 server-shaped readiness 投影
- **THEN** Dashboard model 消费该可信事实并呈现原有成功路径
- **AND** 不修改生产 projection、公共 DTO、revision token 或 assessor 语义。

#### Scenario: 缺失或不可信 readiness 仍然失败关闭

- **GIVEN** fixture 缺失 readiness，或 revision missing/mismatch/drift/rollback 等负向事实成立
- **WHEN** Dashboard 计算 Verify 状态
- **THEN** 既有 blocker、agent/attention 与零 mutation 负断言保持不变
- **AND** 测试不得通过补一个裸 SHA 或 caller-declared `ready` 绕过 guard。

#### Scenario: 默认 testkit 不携带 ambient trusted state

- **WHEN** 不相关测试继续调用默认 `makeChange` 而没有显式 trusted projection
- **THEN** 默认 fixture 仍按缺失 canonical readiness fail closed
- **AND** 只有目标四个测试文件的正向 fixture 获得局部可信投影。
