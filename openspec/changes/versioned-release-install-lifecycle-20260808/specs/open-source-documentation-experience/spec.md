# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 安装文档 SHALL 提供可复现的版本化一行命令

README、中文/英文安装文档、quickstart 和文档站 SHALL 使用同一个已发布稳定版本的一行安装命令，不得用 `main` 作为脚本 URL 或 Marketplace ref。发布版本变化时 SHALL 由确定性检查同步并验证全部公开投影。

#### Scenario: 新用户从 README 安装

- **WHEN** 用户复制 README 的 Codex 安装命令
- **THEN** URL 明确包含当前稳定 `vX.Y.Z`
- **AND** 文档说明安装消费预构建 Release、不需要源码编译
- **AND** 中文与英文入口指向同一个版本身份

#### Scenario: 文档版本落后于 manifests

- **WHEN** README/正式文档中的安装标签与当前 release manifests 不一致或仍出现 `main/install.sh`
- **THEN** docs/identity/release 门禁失败
- **AND** 不发布漂移的版本

### Requirement: 安装文档 SHALL 解释 Dashboard 启动与打开行为

安装和更新文档 SHALL 说明 Dashboard 在 managed runtime 发布后自动启动并等待健康，但只有交互式首次 setup 尝试自动打开。curl/CI、手动 update 和后台 update SHALL 给出 URL 与 `tenon dashboard --open`，不承诺弹出浏览器。

#### Scenario: curl 安装完成

- **WHEN** 用户通过官方 curl 管道完成安装
- **THEN** 终端显示 Dashboard 已验证 URL 和 `tenon dashboard --open`
- **AND** 文档不要求用户从源码启动 Dashboard

#### Scenario: 自动打开失败

- **WHEN** 交互式 setup 无法调用系统浏览器
- **THEN** 文档和 CLI 都把已验证 URL 作为恢复路径
- **AND** 不把浏览器失败描述为插件或 runtime 安装失败
