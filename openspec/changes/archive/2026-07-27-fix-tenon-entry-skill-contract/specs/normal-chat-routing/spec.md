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

### Requirement: 持续执行授权 SHALL 绑定精确 Change

正常对话 SHALL 只把共享 prompt classifier 识别出的显式持续执行意图写为 canonical authority。
authority SHALL 绑定精确 Change 与 host session、可撤销且不得跨 Change 继承。拒绝或修改意图
SHALL 优先于批准短语。持续授权 SHALL NOT 跳过 Skill、OpenSpec 文档读写收据、guard、
verification 或 exact phase/event review request；只有这些证据完整后，系统 MAY 为同一 Change
写入带授权来源和时间的 delegated review receipt。

#### Scenario: 用户授权当前 Change 自主完成

- **WHEN** 用户明确要求当前 Change 后续无需例行询问并执行完成
- **THEN** session activation 写入只属于该 Change 的版本化 authority
- **AND** 每个 review phase 仍先生成精确 event 的 request 与完整证据
- **AND** delegated acknowledgement 可引用该 authority 后推进。

#### Scenario: 新目标不继承旧授权

- **GIVEN** Change A 具有有效持续授权
- **WHEN** 用户提出独立目标并创建 Change B
- **THEN** Change B 使用普通交互模式
- **AND** A 的 authority 不能确认 B 的任何 review event。

#### Scenario: 用户撤销持续授权

- **WHEN** 用户要求恢复逐步确认或撤回自主执行
- **THEN** 当前 Change 的 authority 被规范化撤销
- **AND** 后续 review 恢复人工确认门。
