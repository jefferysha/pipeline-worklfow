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
- v1.0.1 native `setup/update` journal 没有 `serverVersion`、`stableTarget` 或 `dashboardPort`；新解码器必须接受精确旧形状，但恢复时仍重新探测并证明版本，不能补造证据。
- PATH 中空项、相对项或当前目录可劫持裸 `node`/`bash`；安装器和稳定 launcher 必须冻结并执行可信绝对路径。
- 自动打开浏览器在 CI、远程主机或无图形环境中可能失败或造成干扰。
- 发布/Tag 是外部状态；必须在完整验证和用户授权范围内执行，并保留失败恢复路径。
- rollback 若把 previous payload 的旧 bootstrap 重新安装为 active，会同时恢复旧 schema 限制与 PATH 裸 shell 攻击面；rollback 只能切 selection，不能降级 bootstrap。
- selection 与两个 stable launcher 分别原子仍可形成撕裂 pair；恢复必须识别精确 old/new partial，不能将第三状态视为可修复。
- audit terminal 事件早于 selection 提交或静默忽略损坏尾行，会把未成功/旧事件冒充为 latest 成功。
- 真实公开 v1.0.1 不识别当前 workflow plan v3；Release 门禁必须固定公开 N-1 身份并拒绝缺失时 skip。

## 架构边界

- GitHub Releases resolver 只读发现 latest stable，失败时零 mutation；Git 标签/peeled commit 提供 ref 身份证明。
- Codex CLI 独占 marketplace/plugin 写入；Tenon WAL 冻结 desired-state 并验证 inventory，不直接编辑宿主 cache。
- 公开 `install.sh` 在 packaged CLI 尚不可用的窄 bridge 内使用独立 machine-state journal 与存活 owner
  lease：先记录 frozen target 和 before inventory，再逐 phase remove/add；恢复只接纳精确 before/desired，
  第三状态不删除。进入 packaged setup 后继续使用 managed release WAL。
- managed runtime coordinator 独占候选发布、selection、Dashboard ownership/readiness、ready evidence 与补偿。
- candidate journal 只保存恢复输入，不是永久证明；每次从 `candidate-resolved` 恢复以及 activation 前都重新验证候选资产、冻结标签和宿主 marketplace/plugin identity。
- journal codec 向后读取 v1.0.1 `setup/update` WAL 与 Dashboard identity；缺失字段只能触发 successor 证明和重新探测，任何 successor 证明前的 WAL 改写都被禁止。
- 安装器在 mutation 前冻结可信 `node`、`bash`、`git` 与宿主 CLI 的绝对路径；生成 launcher 使用绝对 Node 路径与系统绝对 shell，不再依赖运行时 PATH 搜索。
- 可执行冻结还必须记录 realpath、device/inode/mode/owner、size/change identity 与完整父目录身份，每次 spawn 前复验；executable 自身 group/world-write、非 root/当前用户 owner、非 sticky world-write 父目录和不同 owner 的 group-write 父目录失败关闭，同 owner package-manager 根保留兼容，否则 Homebrew 新用户路径会被错误拒绝。
- Windows 不套用 POSIX uid/mode 信任判据，而以 realpath/file identity/change identity 复验；batch host
  shim 的 `cmd.exe` 作为第二个冻结 executable。Doctor 与 Dashboard 必须消费与 setup/update 相同的
  Host/Bash/Git/Node 绑定，不得从 pathname 或 `process.execPath` 重解析。
- stable launcher 替换使用 capture-and-validate + no-replace publication：先原子移走实际当前对象并复核它仍属于 checkpoint/committed 字节，再以 exclusive publish 写入；proof 后出现的第三方对象不得被 rename 覆盖。
- release workflows 独占 tag/Release 创建；`main` 是候选资格，不是发行通道。
- stable Release `published` 事件触发只读、无 secrets 的公网验收，从该 tag 原样安装两次，再执行
  `tenon update --codex` 并复证 runtime/doctor/Dashboard identity 与外部用户状态零漂移。

## 状态与恢复

`unresolved -> resolved -> host-rebinding -> candidate-verified -> runtime-active -> dashboard-ready -> evidence-committed`。
resolved 前失败不产生写入；重绑定中断保留 WAL 且旧 stable launcher/runtime 可用；候选或 Dashboard 身份不可证明时不提交 ready evidence；同版 latest update 幂等返回。

`candidate-resolved` 是可恢复 checkpoint 而不是信任终点。恢复必须重新观察宿主、重新检查候选 payload，并再次证明 frozen tag；旧 Dashboard identity 缺版本时必须经过健康探测补齐当前证据。任何第三状态都保留 WAL 并失败关闭。rollback 与 candidate/stored payload 校验必须消费冻结的 Bash/Node 物理证明，不能以 `process.execPath` 或 pathname 相等代替。

## Review 闭集协议

为避免把末端 Review 当成需求发现阶段，本 Change 采用以下固定顺序：

1. Spec 先冻结语义、失败模型和验收矩阵；矩阵同时覆盖 Release/Tag、宿主并发、managed WAL、可信可执行文件、N-1、Dashboard、公开文档、架构门和受控 dist。
2. 前置 Review 期间源码保持冻结；所有 C/H/M 先去重、定级并映射到规格、文件、失败测试和验证命令，形成唯一 Build 闭集。
3. Build 只处理冻结条目，每项严格执行 red → green → refactor；不得在实现中临时扩大成功语义或降低断言。
4. 只有源码、测试、文档和 dist 全部稳定且 fingerprint 固定后才进入最终 Review。最终 Review 只接受两类阻断：冻结条目未满足，或本轮 diff 新引入且直接违反已冻结规格的回归。
5. 与当前规格无直接关系的相邻改进进入 backlog，不滚入本轮；若发现新的安全 Critical 或确需改变已冻结语义，则只允许通过一次官方 `requirements-changed` 回到 Spec，更新矩阵后重新冻结。
6. 任一审查对移动 checkout 不得给出 PASS/FAIL；所有 verdict 必须绑定单一 HEAD、完整 fingerprint 和零漂移复算。

该协议不降低质量门：它把发现前移、标准冻结并限制末端范围，从而避免“修一批、扩一批、反复回 Build”。

## 可配置 Review 预算

- Workflow 定义增加版本化 `review_budget`，缺省也使用有限默认值；effective plan 与 V3 snapshot 冻结它，避免运行中随 live workflow 漂移。
- Workflow 的每个自动复核 step 显式声明 `review_lanes`；默认轨的 Skill manifest 与自定义 Workflow
  SkillRef 都使用显式 Review 分类，禁止从 `review`/`verify`/`e2e` 等名称片段推断。
- Pipeline 可对尚未开始的 scope 做审计化 override，范围固定为 1–20；不能低于已用次数，也不能在 active attempt 中途改写。
- 自动 Review 采用 begin/complete 两阶段：begin 在 Change 锁内占用次数并绑定 step、candidate fingerprint、冻结 lane 集与 attempt id；complete 绑定 pass/fail、聚合 lane 结果、报告路径与 digest。
- 同一 candidate 恢复复用 active attempt，不重复计数；不同 candidate 和并发 contender 不得共享 attempt。
- Standards/Spec reviewer、安全复核、E2E/API/browser/visual acceptance 和发布候选验收是同一候选
  attempt 的并行 lanes，不按工具数量分别扣次；Build 内 TDD/unit/typecheck/lint 是实现反馈，不扣 Review 次数。
- 官方 Review Skill、reviewer agent 与 E2E runner 的派发前置条件统一为 active attempt；第三方 Skill
  通过 Workflow 显式分类进入 lane，因此不依赖 Tenon 预知其名字。
- 预算耗尽先于 Reviewer 派发失败关闭。持续自主授权不能自行提高上限；只能输出显式的需求回退、审计化 override、人工接受风险或终止入口。
- 人类 `review request/acknowledge` 继续只表达出口授权；自动 attempt budget 是独立事实，两者不得合并成一个状态字段。

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
