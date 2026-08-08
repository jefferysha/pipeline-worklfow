# 设计

## Explore 结论

- 官方一行安装命令直接固定到不可变 `vX.Y.Z/install.sh`；标签内安装器默认绑定自身版本，不查询 `main`。
- `tenon update --codex` 是唯一的一键更新入口，从官方 GitHub Releases 元数据解析 latest stable，并在任何宿主 mutation 前冻结版本、标签和提交。
- Codex 固定 ref 的跨版本切换建模为 managed WAL 中的 plugin remove、marketplace remove、目标标签 add、plugin add 和 inventory proof；不假设同名 add 或 upgrade 会改变 ref。
- 现有 release workflows、managed release coordinator、候选资产校验、runtime 原子切换、Dashboard readiness 与补偿顺序全部复用，不另建发布器或更新器。
- Release 携带已构建并受版本控制的 CLI、server 与 Dashboard 资产；用户安装期间不运行依赖安装或源码构建。
- Dashboard 始终启动并等待健康：交互式首次 setup 可自动打开；curl 管道、CI、手动 update 与后台更新不自动打开，但打印 URL 与 `tenon dashboard --open`。
- `main` 只用于证明候选已合并并通过 canonical CI；标签创建后，安装、更新和 evidence 不允许引用分支。

## 风险

- tag、manifest 版本和 payload 内容漂移，会让相同版本号对应多个实际行为。
- Codex Marketplace 已登记为本地路径或旧 ref 时，普通 upgrade 可能继续沿用错误来源。
- 当前会话不会热加载新插件；卸载或重装期间必须保留可恢复 launcher/runtime，并提示新开会话。
- 自动打开浏览器在 CI、远程主机或无图形环境中可能失败或造成干扰。
- 发布/Tag 是外部状态；必须在完整验证和用户授权范围内执行，并保留失败恢复路径。

## 架构边界

- GitHub Releases resolver 只读发现 latest stable，失败时零 mutation；Git 标签/peeled commit 提供 ref 身份证明。
- Codex CLI 独占 marketplace/plugin 写入；Tenon WAL 冻结 desired-state 并验证 inventory，不直接编辑宿主 cache。
- managed runtime coordinator 独占候选发布、selection、Dashboard ownership/readiness、ready evidence 与补偿。
- release workflows 独占 tag/Release 创建；`main` 是候选资格，不是发行通道。

## 状态与恢复

`unresolved -> resolved -> host-rebinding -> candidate-verified -> runtime-active -> dashboard-ready -> evidence-committed`。
resolved 前失败不产生写入；重绑定中断保留 WAL 且旧 stable launcher/runtime 可用；候选或 Dashboard 身份不可证明时不提交 ready evidence；同版 latest update 幂等返回。

## Dashboard 决策

- 首次交互 setup：readiness 后尝试自动打开，失败只提示手动 URL。
- curl/CI：不自动打开，明确显示健康 URL 和 `tenon dashboard --open`。
- 手动/后台 update：不自动打开，避免每次升级打断用户；继续完成 Dashboard runtime 切换与健康检查。

## 已关闭问题

- `v1.0.1` 是最新已发布 Release，而 `main` 已前进但仍声明 `1.0.1`；因此分支不能证明发布内容。
- Codex CLI 没有同名 marketplace 原地改 ref 的公开契约；选择可恢复的 remove/add 重绑定并逐步验证 desired-state。
- 安装不做 latest 发现，版本由不可变 URL 固定；update 只接受官方非 draft、非 prerelease、完整稳定 SemVer Release，失败关闭且不回退 `main`。
- 当前 setup 默认打开、手动 update 也打开、auto update 不打开；目标行为改为只有交互式首次 setup 自动打开。
- 项目 `tenon uninstall` 与宿主 plugin 删除不是同一层。本轮真实新用户验收只删除宿主 Tenon plugin/marketplace，再用官方命令重装；项目证据和用户数据不动，managed runtime 保留可恢复性。

## Explore 产物

- `docs/superpowers/specs/2026-08-08-versioned-release-install-lifecycle-design.md`
- `docs/adr/2026-08-08-versioned-release-install-lifecycle-20260808-explore.md`
