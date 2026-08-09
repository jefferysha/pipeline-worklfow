# Skill Content Resolution 增量规格

## ADDED Requirements

### Requirement: Bundled content resolution 绑定 canonical provenance

当 production content locator 从 selected plugin root 的 bundled `skills/` tree 返回内容时，它 SHALL 先从 canonical registry 解析 logical token 到 normalized physical source，再使用 canonical tree algorithm 验证 actual digest 与 declared `content_hash`。Registry missing/invalid、undeclared bundled path、unknown source 或 digest mismatch SHALL 视为 higher-tier content damaged 并失败关闭；不得下降到 runner-native 或 compatibility tier。External non-bundled fallback 的既有 trust-tier 语义保持不变。

#### Scenario: Bundled Skill 与 registry hash 匹配

- **WHEN** logical Skill token 解析到 registered bundled source 且 actual digest 匹配
- **THEN** locator 返回 selected release 内的 bundled content
- **AND** caller 接收原 logical Skill identity 与经过验证的 physical tree

#### Scenario: Bundled Skill hash 不匹配但 lower tier 有同名 Skill

- **GIVEN** selected release 的 bundled Skill 存在但 actual digest 与 registry 不匹配
- **AND** runner-native 或 compatibility tier 也存在同名 Skill
- **WHEN** production locator 解析该 token
- **THEN** 它以 provenance mismatch 失败
- **AND** 不读取或选择 lower-tier content

#### Scenario: Bundled root 出现未登记 Skill

- **WHEN** locator 将要返回 selected plugin root 内未被 canonical registry source ref 声明的 tree
- **THEN** 它失败关闭并标识 `unregistered-distributed-skill`
- **AND** 不把路径存在性当成 provenance 证明
