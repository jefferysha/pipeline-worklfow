# 设计

## Explore 结论

- 官方一行安装命令直接固定到不可变 `vX.Y.Z/install.sh`；标签内安装器默认绑定自身版本，不查询 `main`。
- 从 v1.0.2 起，`tenon update --codex` 是唯一的一键更新入口，从官方 GitHub Releases 元数据解析 latest stable，并在任何宿主 mutation 前冻结版本、标签和提交。
- 已发布的 v1.0.1 启动器只派发一次旧 active CLI，无法在同一进程内执行后来才激活的 v1.0.2 updater。该历史边界使用一次官方 `v1.0.2/install.sh` 迁移；禁止借校验脚本、Dashboard side effect 或第二次隐式命令伪装一键成功。
- Codex 固定 ref 的跨版本切换建模为 managed WAL 中的 plugin remove、marketplace remove、目标标签 add、plugin add 和 inventory proof；不假设同名 add 或 upgrade 会改变 ref。
- 现有 release workflows、managed release coordinator、候选资产校验、runtime 原子切换、Dashboard readiness 与补偿顺序全部复用，不另建发布器或更新器。
- Release 携带已构建并受版本控制的 CLI、server 与 Dashboard 资产；用户安装期间不运行依赖安装或源码构建。
- Dashboard 始终启动并等待健康：交互式首次 setup 可自动打开；curl 管道、CI、手动 update 与后台更新不自动打开，但打印 URL 与 `tenon dashboard --open`。
- `main` 只用于证明候选已合并并通过 canonical CI；标签创建后，安装、更新和 evidence 不允许引用分支。

## 风险

- tag、manifest 版本和 payload 内容漂移，会让相同版本号对应多个实际行为。
- Codex Marketplace 已登记为本地路径或旧 ref 时，普通 upgrade 可能继续沿用错误来源。
- 当前会话不会热加载新插件；卸载或重装期间必须保留可恢复 launcher/runtime，并提示新开会话。
- v1.0.1 的旧 `main`/local marketplace updater 无法由尚未执行的候选代码安全追溯增强；迁移文档若仍承诺单次旧 updater 收敛，会制造不可实现契约。
- `candidate-resolved` 后宿主或候选可能被外部修改；仅复用 journal 路径/evidence 会把同版本第三 payload 激活。
- v1.0.1 journal 的 Dashboard identity 没有 `serverVersion`；新解码器必须接受旧形状，但恢复时仍重新探测并证明版本，不能补造证据。
- PATH 中空项、相对项或当前目录可劫持裸 `node`/`bash`；安装器和稳定 launcher 必须冻结并执行可信绝对路径。
- 自动打开浏览器在 CI、远程主机或无图形环境中可能失败或造成干扰。
- 发布/Tag 是外部状态；必须在完整验证和用户授权范围内执行，并保留失败恢复路径。

## 架构边界

- GitHub Releases resolver 只读发现 latest stable，失败时零 mutation；Git 标签/peeled commit 提供 ref 身份证明。
- Codex CLI 独占 marketplace/plugin 写入；Tenon WAL 冻结 desired-state 并验证 inventory，不直接编辑宿主 cache。
- managed runtime coordinator 独占候选发布、selection、Dashboard ownership/readiness、ready evidence 与补偿。
- candidate journal 只保存恢复输入，不是永久证明；每次从 `candidate-resolved` 恢复以及 activation 前都重新验证候选资产、冻结标签和宿主 marketplace/plugin identity。
- journal codec 向后读取 v1.0.1 Dashboard identity；缺失的 `serverVersion` 只能触发重新探测，不能直接满足 readiness 或完成证据。
- 安装器在 mutation 前冻结可信 `node`、`bash`、`git` 与宿主 CLI 的绝对路径；生成 launcher 使用绝对 Node 路径与系统绝对 shell，不再依赖运行时 PATH 搜索。
- release workflows 独占 tag/Release 创建；`main` 是候选资格，不是发行通道。

## 状态与恢复

`unresolved -> resolved -> host-rebinding -> candidate-verified -> runtime-active -> dashboard-ready -> evidence-committed`。
resolved 前失败不产生写入；重绑定中断保留 WAL 且旧 stable launcher/runtime 可用；候选或 Dashboard 身份不可证明时不提交 ready evidence；同版 latest update 幂等返回。

`candidate-resolved` 是可恢复 checkpoint 而不是信任终点。恢复必须重新观察宿主、重新检查候选 payload，并再次证明 frozen tag；旧 Dashboard identity 缺版本时必须经过健康探测补齐当前证据。任何第三状态都保留 WAL 并失败关闭。

## Dashboard 决策

- 首次交互 setup：以命令开始前“没有有效 managed runtime”为判据，readiness 后尝试自动打开；候选是否已在宿主 cache 验证不影响首次判定，失败只提示手动 URL。
- curl/CI：不自动打开，明确显示健康 URL 和 `tenon dashboard --open`。
- 手动/后台 update：不自动打开，避免每次升级打断用户；继续完成 Dashboard runtime 切换与健康检查。

## 已关闭问题

- `v1.0.1` 是最新已发布 Release，而 `main` 已前进但仍声明 `1.0.1`；因此分支不能证明发布内容。
- Codex CLI 没有同名 marketplace 原地改 ref 的公开契约；选择可恢复的 remove/add 重绑定并逐步验证 desired-state。
- 安装不做 latest 发现，版本由不可变 URL 固定；update 只接受官方非 draft、非 prerelease、完整稳定 SemVer Release，失败关闭且不回退 `main`。
- 当前 setup 默认打开、手动 update 也打开、auto update 不打开；目标行为改为只有交互式首次 setup 自动打开。
- 项目 `tenon uninstall` 与宿主 plugin 删除不是同一层。本轮真实新用户验收只删除宿主 Tenon plugin/marketplace，再用官方命令重装；项目证据和用户数据不动，managed runtime 保留可恢复性。
- 已发布 v1.0.1 不能安全自修改为新版 updater：远程 `main` 用户的旧命令最多激活新 payload 但仍留下移动 ref，本地 marketplace 用户甚至不会获取候选。唯一诚实且可审计的迁移是执行一次官方版本化安装器；安装到 v1.0.2 后，后续升级均由单条 `tenon update --codex` 完成。

## Explore 产物

- `docs/superpowers/specs/2026-08-08-versioned-release-install-lifecycle-design.md`
- `docs/adr/2026-08-08-versioned-release-install-lifecycle-20260808-explore.md`
