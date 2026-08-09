# Tenon 产品身份规格

## Purpose

定义 Tenon 在命令、插件、分发、运行时目录、Dashboard、文档和发布链路中的唯一现行产品身份，
同时隔离宿主标准目录、历史审计事实和有期限迁移通道。
## Requirements
### Requirement: 现行产品面 SHALL 使用单一 Tenon 身份

品牌显示名、CLI、插件、Marketplace、公开 npm 包 basename、Skill 前缀、运行时应用目录、
环境变量前缀、Dashboard、仓库 URL 与 Pages base SHALL 由一个版本化产品身份真相源派生，
并分别使用 `Tenon`、`tenon`、`tenon@tenon`、`tenon-`、`.tenon/`、`TENON_`、
`jefferysha/tenon` 与 `/tenon/`。无法直接 import 真相源的 JSON、shell、Markdown 和构建配置
SHALL 使用确定性生成并通过 freshness 校验的投影。

#### Scenario: 任一产品投影发生漂移

- **WHEN** CLI、manifest、Dashboard、文档或发行配置中的现行身份与产品身份真相源不一致
- **THEN** 构建或发布检查失败并指出漂移文件
- **AND** 不允许激活或发布该候选。

#### Scenario: 用户运行公开命令

- **WHEN** 用户查看帮助、安装、更新、诊断、Dashboard 或 hook launcher
- **THEN** 唯一公开 CLI basename 是 `tenon`
- **AND** 最终 Tenon 包不提供 `pipeline`、`pipeline-lite` 或第二短别名。

### Requirement: 宿主身份 SHALL 与 Tenon 产品身份解耦

Tenon SHALL 保留 Codex、Claude 等宿主定义的标准配置和 Skill 发现目录；产品全局改名不得把
`.codex`、`.agents`、`.claude` 等宿主目录改为 `.tenon`。宿主 selector 只决定安装所有权，
不得裁剪完整插件能力。

#### Scenario: 用户选择 Codex

- **WHEN** 用户执行 Tenon 的 Codex 安装
- **THEN** 宿主 inventory 与配置仍使用 Codex 标准路径
- **AND** 产品控制面、launcher、日志和显示身份使用 Tenon。

### Requirement: 历史事实 SHALL 与现行身份残留分开审计

现行源码、公开文档、manifest、launcher 和生成 bundle 中不得残留旧产品入口。已归档 Change、
不可变 ledger、Git 历史与有期限的 migration manifest MAY 保留旧名称作为历史事实。
残留扫描 SHALL 显式分类并 fail-loud，不得通过全仓替换破坏历史证据。

#### Scenario: 旧名称出现在现行发布文件

- **WHEN** 旧品牌、旧 CLI、旧插件或旧仓库标识出现在非历史、非迁移专用的发布文件
- **THEN** identity 检查失败并列出文件与分类
- **AND** 候选不得发布。

#### Scenario: 旧名称只出现在归档 ledger

- **WHEN** 残留扫描命中不可变审计历史
- **THEN** 检查把它标为历史允许项
- **AND** 不改写其内容或 digest。

### Requirement: 默认 Dashboard 端点 SHALL 保持唯一

品牌迁移 SHALL 继续使用 `127.0.0.1:18765` 作为唯一默认 Dashboard 端点，并通过 active release
与 state scope 健康契约确认所有权。不得为 Tenon 新建第二套前端、第二个默认端口或并行常驻服务。

#### Scenario: Tenon 接管既有 Dashboard

- **WHEN** 受验证 Tenon release 激活
- **THEN** 18765 健康响应同时匹配预期 release 与 state scope
- **AND** 旧身份进程只有在验证真实 listener owner 后才被接管。

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

### Requirement: Tenon Release identity SHALL 在所有现行产品面一致

根 package、workspace packages、Codex/Claude plugin manifests、Marketplace manifests、安装器默认 ref、npx bootstrap ref、managed runtime source、Dashboard health 和正式文档 SHALL 投影同一个稳定 SemVer Release。版本标签 SHALL 是 `v<version>`，任何不一致 SHALL 阻止候选发布。

#### Scenario: 维护者准备 v1.0.2

- **WHEN** release candidate 输入标签 `v1.0.2`
- **THEN** 所有现行版本投影都精确等于 `1.0.2` 或 `v1.0.2`
- **AND** 构建后的 CLI、server、Dashboard 与 source manifests 无 diff

#### Scenario: 安装器仍引用 main

- **WHEN** identity audit 在公开 installer、host plan、正式文档或 update desired-state 中发现 `main` 作为交付 ref
- **THEN** audit 失败并报告精确文件
- **AND** 历史归档事实不被误判为现行发布投影

### Requirement: 运行态版本 SHALL 可由公开健康面证明

完成 setup/update 后，宿主 plugin inventory、`tenon runtime status`、`tenon doctor --json` 和 Dashboard `/api/health` SHALL 能共同证明当前稳定版本。任一面版本不一致 SHALL 被报告为未收敛，而不是成功完成。

#### Scenario: 正式重装终验

- **WHEN** 维护者从已发布标签完成宿主卸载与全新安装
- **THEN** plugin inventory 来源不是本地 path 或移动分支
- **AND** runtime source version、doctor 与 Dashboard health 都等于发布版本
- **AND** `/api/snapshot` 可读取且开放 PR 审计为零

#### Scenario: 公开 runtime status 证明当前版本

- **WHEN** 用户执行 `tenon runtime status --json`
- **THEN** active identity 显示经过完整性验证的 release schema、release id、payload digest、host 和 source plugin version
- **AND** v2 release 显示 stable tag 与 commit，previous identity 使用同一严格投影
- **AND** 不需要读取私有 `release.json` 才能与 plugin inventory、doctor 和 Dashboard 对账
