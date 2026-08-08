# 提案

## Why

当前 Codex 安装把 Tenon Marketplace 绑定到 `main`，导致新用户、更新用户与开发者本地源码可能消费不同的提交。Tenon 需要以明确的稳定版本号作为唯一发布身份，让安装、更新、回滚和 Dashboard 都能证明自己来自同一个不可变 Release。

## What Changes

- 将公开安装与一键更新从 `main` 通道迁移到明确的稳定 SemVer Release。
- 确保新用户无需 clone、安装依赖或本地编译即可完成 Codex 插件、CLI、Skills、hooks、managed runtime 和 Dashboard 安装。
- 用真实“卸载当前安装 → 官方版本化命令全新安装 → 一键更新”路径验收新用户一致性。
- 明确 Dashboard 在交互安装、非交互/CI 更新和后续手动访问中的启动与提示行为。
- 不删除项目中的 Change、Archive、OpenSpec、用户规则、截图或其他用户数据。

## Capabilities

### New Capabilities

- `versioned-plugin-release-lifecycle`：以稳定版本号统一安装、更新、回滚和运行时身份。

### Modified Capabilities

- `plugin-distribution`：公开安装和更新只消费不可变稳定 SemVer Release。
- `plugin-runtime`：managed release source、候选校验和运行时完成证据绑定同一版本标签。
- `host-target-plan`：Codex 安装/更新计划展示版本化 marketplace 重绑定步骤，不再展示 `main`。
- `open-source-documentation-experience`：复制即用命令固定到已发布版本，并说明 Dashboard readiness 与打开策略。
- `tenon-product-identity`：版本号、标签、插件清单、runtime 与 Dashboard identity 必须一致。

## Impact

影响公开 `install.sh`、Codex Marketplace 注册与更新命令、版本解析器、版本清单、Release 门禁、managed runtime 选择、安装验收、文档及 Dashboard 启动提示。现有 Release workflow 继续负责“候选已合并且通过 CI”的资格验证，但发布和用户安装身份只认不可变稳定标签。该变更属于发布基础设施和公共 CLI 契约，必须保留旧 release 回滚能力，并由宿主 CLI 独占其插件 cache。
