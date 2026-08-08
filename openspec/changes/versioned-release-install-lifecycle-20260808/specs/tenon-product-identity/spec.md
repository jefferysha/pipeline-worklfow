# OpenSpec 增量规格

## ADDED Requirements

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
