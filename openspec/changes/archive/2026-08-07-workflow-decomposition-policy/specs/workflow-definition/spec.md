# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Workflow definition 闭集 codec

Workflow definition 顶层闭集 MUST 增加 `decomposition` 与 `interaction`，并在 parse、serialize、validate、compile 与 deep-freeze 中使用同一规范化契约。

#### Scenario: legacy definition

- **WHEN** 旧 definition 不含新字段
- **THEN** 编译为 decomposition.mode=off 与 interaction.mode=interactive

#### Scenario: round-trip

- **WHEN** 合法 v1 policies 完成 serialize -> parse -> compile
- **THEN** 规范化 IR 深等价且只读冻结

### Requirement: EffectiveWorkflowPlan 版本兼容

新 plan MUST 使用包含 policy 的新 fingerprint tag 和 V3 snapshot；V1/V2 MUST 用历史算法校验原 hash，再只读投影安全默认，不得原地重写。

#### Scenario: 旧 snapshot

- **WHEN** 读取合法 V1/V2 snapshot
- **THEN** 原 fingerprint 验证通过并投影 off+interactive，文件内容与 hash 不变

#### Scenario: V3 篡改

- **WHEN** snapshot policy 内容与 fingerprint 不一致
- **THEN** run resolve/admission 失败关闭

### Requirement: Track overlay 不污染 Workflow fingerprint

项目/track/run grants MUST 在运行期参与权限交集，但不得伪装成 Workflow-owned policy 或改变 definition fingerprint。

#### Scenario: 仅 track grant 改变

- **WHEN** Workflow IR 不变而 track grant 更新
- **THEN** Workflow fingerprint 不变，新 evaluation 的 effective grant 可降低或提高到 ceiling 内
