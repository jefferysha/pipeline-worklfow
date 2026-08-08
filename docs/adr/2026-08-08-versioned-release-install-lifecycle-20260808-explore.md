# ADR：以不可变稳定 SemVer Release 作为 Tenon 唯一交付身份

## Status

Accepted for Spec.

## Context

Tenon 当前公开安装、Codex Marketplace 注册和 managed host desired-state 都依赖 `main`。已发布的
`v1.0.1` 与仍声明 `1.0.1`、但包含更多提交的 `main` 证明：版本号、实际源码和新用户安装效果可能漂移。
现有 release workflow 已能严格验证稳定标签、精确提交、版本清单、CI 和 payload digest；现有
managed-release coordinator 也已具备 WAL、资产校验、runtime 原子切换、Dashboard readiness 与补偿。

## Decision

Tenon 的公开安装、更新目标、Marketplace ref 与运行时 evidence 统一使用不可变完整稳定 SemVer 标签。
`main` 只作为已合并 release candidate 的资格输入，不能作为用户交付源。

标签内的官方 `install.sh` 默认绑定自身 `vX.Y.Z`；`tenon update --codex` 从官方 GitHub Releases
元数据解析 latest stable，并在任何 mutation 前冻结目标标签、版本和 peeled commit。跨版本更新通过
Codex 公开 CLI 在现有 managed-release WAL 中执行 plugin/marketplace 的显式移除、目标标签重新登记、
插件安装和 inventory 验证；不直接写宿主 cache，也不另建更新器。

Dashboard 始终在 runtime 激活后等待 readiness。首次交互 setup 可自动打开；curl 管道、CI、手动 update
和后台 auto-update 不自动打开，统一打印健康 URL 与 `tenon dashboard --open`。

## Consequences

- 相同版本号可证明同一个标签提交和已构建 payload，新用户与现有用户效果可复现。
- update 新增 Release 元数据解析和 marketplace 重绑定状态，但沿用现有 WAL、postcondition 与补偿边界。
- update 解析失败在宿主 mutation 前失败关闭；重绑定中断时旧 stable launcher/runtime 仍可用并可原命令恢复。
- 发布后的真实卸载/重装才能构成最终新用户证据；本地源码运行和本地 marketplace 不计通过。
- 文档、host target plan、测试和 release 门禁必须拒绝任何面向用户的 `main` 发布源。

## Rejected alternatives

- 继续使用 `main`：同一命令随分支推进而改变，无法以版本号证明内容。
- 使用可变 `latest` 或 `v1` 标签：别名可重写，回滚与审计都缺少不可变身份。
- 只把 install URL 固定到标签、update 继续 marketplace upgrade：固定 ref 不会自动变成下一标签，可能成功
  返回但仍安装旧版本。
- 直接编辑 Codex 配置/cache：越过宿主所有权边界，无法依赖公开 CLI 的兼容与 inventory 证明。
