# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 产品身份真相源 SHALL 声明根入口 Skill

`product/identity.json` SHALL 以 `entrySkill` 声明唯一逻辑根入口。TypeScript 投影、Codex managed
block、doctor contract skill 集、adapter 与测试 SHALL 由该字段确定性派生。发布候选 SHALL 证明
该字段只解析到一个第一方 Skill，且不得通过第二入口 alias 掩盖漂移。

#### Scenario: 维护者修改根入口

- **WHEN** `entrySkill` 或插件 id 发生变化
- **THEN** `npm run generate:identity` 同时更新 TypeScript 与 Agent managed block 投影
- **AND** 未重新生成的仓库在 `npm run check:identity` 中失败
- **AND** doctor 与 adapter 无需手工同步字符串。

#### Scenario: 根入口投影一致

- **WHEN** 身份检查读取当前真相源
- **THEN** `skills/<entrySkill>/SKILL.md` 存在且名称匹配
- **AND** managed block 使用 `<plugin>:<entrySkill>`
- **AND** 根 `AGENTS.md` 的哨兵块与生成模板逐字一致。

### Requirement: 发行仓库 SHALL 不包含外部参考项目身份

仓库卫生检查 SHALL 扫描所有受版本控制的路径与可读文本，使用不可逆摘要维护受禁身份集合，
不得把受禁名称本身写入错误输出、测试源码或发行文档。任何命中 SHALL fail closed；Git 对象历史
不进入发行 payload，也不通过改写历史来伪造当前仓库清洁。

#### Scenario: 受控文件正文命中受禁身份

- **WHEN** 任一受版本控制文本包含受禁身份，大小写不同也视为命中
- **THEN** 仓库卫生检查失败并指出文件和命中类别
- **AND** 输出不回显受禁名称本身。

#### Scenario: 受控路径命中受禁身份

- **WHEN** Git 路径的任一片段包含受禁身份
- **THEN** 仓库卫生检查失败
- **AND** 该文件不得进入 bundle、npm tarball 或 GitHub Release。

#### Scenario: 当前仓库通过名称卫生检查

- **WHEN** 发布流水线枚举受版本控制路径并扫描正文
- **THEN** 路径与文本命中数均为零
- **AND** 检查作为 Release 前置门执行。
