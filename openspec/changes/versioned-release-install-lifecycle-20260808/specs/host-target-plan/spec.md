# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Codex 宿主计划 SHALL 描述版本化 Release 生命周期

只读 host target plan SHALL 明确区分 setup 的当前包稳定标签与 update 的 latest stable 解析步骤，并 SHALL 展示 plugin/marketplace 重绑定、inventory、managed runtime 和 Dashboard readiness 边界。计划 SHALL NOT 把 `main`、移动标签或本地 checkout 显示为正式发布源。

#### Scenario: 用户预览 Codex setup 计划

- **WHEN** 用户请求 Codex setup host target plan
- **THEN** 计划显示当前已发布插件版本对应的 `vX.Y.Z` marketplace ref
- **AND** 显示候选校验、managed runtime、Dashboard readiness 和浏览器策略提示

#### Scenario: 用户预览 Codex update 计划

- **WHEN** 用户请求 Codex update host target plan
- **THEN** 计划先显示只读 latest stable Release 解析
- **AND** 显示 plugin remove、marketplace remove、目标标签 register、plugin install 和 inventory proof
- **AND** 提醒目标版本只在执行开始时冻结，计划生成本身零副作用

#### Scenario: 计划或文档包含 main 发布源

- **WHEN** host target plan 的面向用户命令或 notice 把 `main` 作为 install/update ref
- **THEN** 契约测试失败并阻止发布
