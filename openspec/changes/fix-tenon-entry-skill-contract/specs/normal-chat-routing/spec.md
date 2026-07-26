# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 正常开发对话 SHALL 分派到真实存在的产品根入口

Codex 的生成式 Agent managed block SHALL 从产品身份真相源确定根入口 Skill，且正常开发对话的
静态指令 SHALL 调用完整引用 `tenon:tenon`。仓库根 `AGENTS.md` 与静态 adapter SHALL 消费同一
生成模板；任何漂移 SHALL 在构建、adapter 测试和发布前失败。

#### Scenario: 普通开发请求触发 default workflow

- **WHEN** UserPromptSubmit 路由一个新的开发目标到 default workflow
- **THEN** Agent 规则要求先调用 `tenon:tenon`
- **AND** 根入口创建或恢复精确 Change 后再分派当前 phase Skill
- **AND** Todo 一级项来自真实七阶段图而不是脱离流程的通用列表。

#### Scenario: 仓库规则被手工改坏

- **WHEN** `AGENTS.md` managed block 与生成模板不一致
- **THEN** 产品身份 freshness 检查失败并指出漂移
- **AND** 候选不得打包或发布。

#### Scenario: 静态 adapter 安装规则

- **WHEN** 无原生插件能力的 Codex 目标运行静态 adapter
- **THEN** adapter 读取同一生成模板写入 managed block
- **AND** 哨兵外用户内容保持不变
- **AND** 规则不引用不存在的 Skill 或已废弃 CLI。
