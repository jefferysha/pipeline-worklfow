# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 公开安装 SHALL 从版本标签提供完整预构建产品

官方安装命令 SHALL 从不可变稳定 SemVer 标签读取 `install.sh`。该脚本 SHALL 安装同标签的完整 Codex 插件并运行打包 CLI；用户机器 SHALL NOT 需要 clone 仓库、安装 workspace 依赖、调用构建命令或从源码入口启动 Tenon。

#### Scenario: 干净 Codex 用户安装正式版本

- **WHEN** 用户执行固定到 `vX.Y.Z/install.sh` 的官方一行命令
- **THEN** installer 只调用受信任 PATH 中的 Codex CLI、Node 和标签内已发布 bundle
- **AND** 安装后的插件包含 CLI、server、Dashboard、Skills、hooks 和 manifests
- **AND** 命令历史不包含 `npm install`、`npm run build` 或本地源码路径
- **AND** installer 与生成的稳定 launcher 执行冻结的绝对 Node/Bash/host CLI 路径，不重新从 cwd 或相对 PATH 解析程序

#### Scenario: 标签内版本身份漂移

- **WHEN** install 脚本默认 ref、根 package、Codex/Claude plugin manifest 或 workspace package 版本与标签不一致
- **THEN** release/identity 门禁失败
- **AND** 该候选不得成为正式安装命令

#### Scenario: 同版本插件登记存在但被禁用

- **WHEN** 预检发现 Tenon plugin/marketplace 版本与目标一致但 plugin registration 被禁用
- **THEN** installer 把它视为可修复状态并通过公开 remove/add 收敛
- **AND** 不在任何 mutation 前错误拒绝本次安装

### Requirement: 正式新用户验收 SHALL 使用宿主级卸载与版本化重装

稳定 Release 发布后 SHALL 在真实用户路径验证：通过宿主 CLI 删除现有 Tenon plugin 和 Tenon marketplace，执行公开版本化一行安装，重复安装，并执行 `tenon update --codex`。该验收 SHALL 保留项目 Change/OpenSpec、用户规则、截图和可恢复 managed runtime。

#### Scenario: 维护者验收公众安装命令

- **WHEN** 新稳定 Release 已发布且维护者开始最终安装验收
- **THEN** 维护者先记录当前 plugin、marketplace、launcher、runtime 和 Dashboard 身份
- **AND** 仅通过 Codex 公开 CLI 删除 Tenon plugin/marketplace
- **AND** 从 GitHub 已发布标签执行 README 中完全相同的一行命令
- **AND** 最终 inventory 不指向本地 marketplace、开发 worktree 或 `main`

#### Scenario: 重装失败

- **WHEN** 宿主 plugin 已删除但正式安装在网络或候选校验阶段失败
- **THEN** 项目数据和旧 managed runtime 保持不变
- **AND** 稳定 launcher 提供重试或 runtime 诊断路径
