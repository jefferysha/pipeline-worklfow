# Tenon 产品身份增量规格

## ADDED Requirements

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
