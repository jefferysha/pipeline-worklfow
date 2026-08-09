---
change: versioned-release-install-lifecycle-20260808
design-doc: docs/superpowers/specs/2026-08-08-versioned-release-install-lifecycle-design.md
---

# 版本化发布、安装与更新实施计划

## 目标与非目标

把 Tenon 的公开安装、Codex 更新、managed runtime 和 Dashboard 身份统一到不可变稳定 SemVer Release，发布下一版本并用公众一行命令真实卸载重装。复用现有 release workflow、host CLI、managed-release WAL 与 Dashboard coordinator；不新增包管理器，不直接写 Codex cache，不删除项目或用户数据。

原型决策：不插入一次性 prototype。release resolver、host command、desired-state、runtime installer 和 Dashboard starter 都已有可注入边界，可用失败优先的单元/集成测试直接验证真实状态机；一次性实现不会降低关键未知。

## Build 准入：冻结 Review 闭集

本段优先于后续历史子阶段。进入 Build 前，源码停止变更，由同一冻结 fingerprint 完成规格、并发/安全、N-1/发布、文档/架构四轴前置 Review；结果先去重，再形成下面唯一开放闭集。Build 不再边写边扩审。最终 Review 只检查矩阵是否落实以及本轮 diff 是否新引入直接违反已冻结规格的回归；相邻改进进入 backlog。只有新的安全 Critical 或必须改变既有语义时，才通过官方 `requirements-changed` 回到 Spec 更新本表。

| ID | 冻结缺口 | 先行失败证据 | 实现边界 | 完成验证 |
| --- | --- | --- | --- | --- |
| R01 | CLI/server 受控 dist 陈旧 | build 后 scoped diff 非零 | 最终源码上重建，不手改 dist | 连续两次 build 字节一致且 scoped diff=0 |
| R02 | 新 default Run 被降级为 V2 | 默认 policy snapshot 断言 V3/current fingerprint | 新 Run 始终 V3；旧 V1/V2 只读兼容隔离 | kernel snapshot/repository + 真实 N-1 gate |
| R03 | installer 未证明 exact published stable Release | unpublished/draft/prerelease 均零 host mutation | mutation 前查询官方 exact Release | bootstrap 测试和公网发布门 |
| R04 | tag OID 未证明最终为 commit | direct/annotated tree/blob 均拒绝 | 递归 peel 或隔离 fetch + `cat-file` | resolver 与 bootstrap object matrix |
| R05 | stable launcher 未持久化并重验 frozen Node identity | custom Node、安装后漂移、rollback/no-op | launcher contract、bootstrap、rollback、same-version 共用同一 identity | launcher/bootstrap/update 跨进程测试 |
| R06 | live owner 可因 heartbeat 被接管且 release 非 CAS | 暂停 live owner、PID reuse、successor replacement | PID start identity + 不回收 live owner + fencing/CAS release | installer/bootstrap 双进程 barrier |
| R07 | host observe→remove 非原子且 public/native 锁分裂 | inventory 返回后 mutation barrier | 所有 Tenon host mutation 共用锁；每次 mutation 紧邻前 fencing/CAS | public-vs-native 并发测试 |
| R08 | terminal audit 失败被吞 | selection 已提交、terminal append 单独失败 | 保留恢复 journal并返回 degraded，重试补 terminal | release-store/bootstrap audit recovery |
| R09 | 公网 acceptance 可与下一 Release 并发 | 两个 tag acceptance 的 latest 变化 | 仓库级串行或动态 latest identity | workflow checker + acceptance test |
| R10 | installer 网络证明无实际超时 | 挂起 Git/HTTP 且零 mutation | connect/overall/low-speed 有界超时 | bootstrap timeout test |
| R11 | architecture gate 失败 | `npm run check:architecture` 当前非零 | 按 lifecycle/rollback/transition 职责拆分 | architecture gate=0 + 定向回归 |
| R12 | 本次生产代码含非空/双重断言 | 静态门命中指定文件 | closed tuple、显式 bounds/codec narrowing | architecture/static gate=0 |
| R13 | release 文档仍称注册 `main` | docs checker 命中正式当前态描述 | immutable tag 文案 + 禁词门 | docs 12/12 + 全文入口扫描 |
| R14 | 中文卸载文档给出不存在命令 | CLI surface/文档命令不一致 | 区分宿主卸载与项目 scrubber | 双语文档命令检查 |
| R15 | 任意 Workflow/Pipeline 无可配置 Review 次数上限，且其他 Review Skill/E2E 可绕过固定 reviewer | 第三次 begin 在 max=2 时仍能启动；未 begin 即可派发第三方 Review/E2E | 冻结 `review_budget` + step `review_lanes`；默认 manifest/自定义 SkillRef 显式分类；Change 锁内聚合 begin/complete；run-bound override | parser/compiler/snapshot、Skill gate、reviewer+E2E 同 attempt、跨进程并发、恢复与耗尽 E2E |

非回归矩阵固定覆盖：v1.0.1 setup/update WAL 与 receipt bridge、disabled registration、candidate/host/payload 漂移、same-version Dashboard-only 修复、rollback/launcher crash、Windows host+`cmd.exe`、Doctor/Dashboard frozen executables、公开重复安装、用户项目数据零修改。任何 R 项没有“失败测试 → 最小实现 → 定向绿 → 更宽门”四段证据，不得标完成。R15 优先于 R01-R14 实现，因为后续 Standards/Spec/security/E2E/browser 等全部 Review lanes 必须先受同一候选预算约束；Build 内 TDD/type/lint 自检不扣次数。

**此处建议 /clear；后续 Build 必须从 R01-R15 闭集开始，不再从历史子阶段继续扩展。**

## 子阶段 1：Tracer bullet 打通稳定 Release 到 managed runtime

先写失败测试，让一个注入的 `v1.0.2` stable Release 从 resolver 进入 `tenon update --codex`，冻结 tag/commit，经过 Codex plugin/marketplace 重绑定 WAL，最终由 inventory/version/root/asset 证明候选并激活 managed runtime。最初使用 fake host 与最小候选目录，但贯穿 resolver、命令计划、desired-state、coordinator 和 runtime selection，不按层横向堆积。

1. 在 `packages/cli/src/commands/stable-release.ts`（新文件）定义严格稳定 SemVer/Release DTO、版本比较、latest resolver 接口与生产 GitHub HTTPS 实现；通过 `SetupEnv` 或显式依赖注入超时和响应读取。
2. 在 `packages/cli/src/commands/stable-release.test.ts` 先覆盖 success、draft、prerelease、非法 tag、repo/schema 漂移、timeout/network、peeled commit 不匹配、同版、升级和降级拒绝。
3. 扩展 `plugin-host.ts`、`update.ts`、`managed-host-observation.ts`、`managed-host-desired-identity.ts` 与 `managed-host-command.ts`，让 Codex update plan 使用冻结目标，并为 plugin absent、marketplace absent、目标 tag commit、plugin target version 建模 desired-state。
4. 扩展 `update.test.ts`、`managed-host-observation.test.ts`、`managed-host-command.test.ts` 和 `release-store.integration.test.ts`，覆盖完整纵向成功链路及每一步中断恢复，断言不会调用 `refs/heads/main`。

验证：`npm test -- --run packages/cli/src/commands/stable-release.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/managed-host-observation.test.ts packages/cli/src/commands/managed-host-command.test.ts`。

回滚：删除 resolver 注入并恢复旧命令计划即可回到现状；在测试全绿前不运行真实宿主 mutation。

**此处建议 /clear**

## 子阶段 2：固定版本 setup、安装器与只读计划

1. 让 `nativeInstallPlan` 接受当前已发布插件版本并生成 `--ref vX.Y.Z`；从 `CliDeps.pluginVersion` 或候选 manifest 注入，不在业务代码复制常量。
2. 修改 `install.sh`：默认 ref 为当前稳定标签，只允许完整稳定 SemVer（Codex），禁止 `main`/commit/prerelease 作为正式默认；保留可测试 dry-run，确保只运行预构建 bundle。
3. 调整 `setupHost.ts`、`host-plugin-convergence.ts`、`host-target-plan.ts` 及调用方，使 setup/update 的 host steps 和 notice 诚实展示版本解析/重绑定且无 `main`。
4. 先更新 `tools/install-bootstrap.node-test.mjs`、`host-target-plan.test.ts`、`setup.test.ts`、`program.test.ts`，覆盖干净安装、重复安装、旧 local/main marketplace 收敛、CLI 缺失与零源码构建。

验证：`node --test tools/install-bootstrap.node-test.mjs && npm test -- --run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/host-target-plan.test.ts packages/cli/src/program.test.ts`。

回滚：保留旧已发布 tag 可重新安装；不重写任何已有 tag。

**此处建议 /clear**

## 子阶段 3：Dashboard 启动/打开策略与诊断

1. 为 setup 环境增加可注入的交互/CI 判定或显式 browser policy，默认只在交互式首次 setup 打开；`update.ts` 手动与 auto 路径都传 `openBrowser=false`。
2. 在 Dashboard readiness 成功但不打开时输出已验证 URL 与 `tenon dashboard --open`；browser opener 失败保持 runtime 成功并给出同一恢复路径。
3. 更新 `setup.test.ts`、`update.test.ts`、`release-coordinator.test.ts` 和 Dashboard starter 测试，覆盖交互 setup、curl/CI、手动 update、auto update、open failure、非受管端口与现有 managed Dashboard。

验证：`npm test -- --run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/commands/dashboard.test.ts`。

回滚：browser policy 只影响打开动作，不影响 managed Dashboard readiness 或 selection。

**此处建议 /clear**

## 子阶段 4：版本 1.0.2、公开文档与发布门禁

1. 将根、workspaces、Codex/Claude/Marketplace manifests、lockfile、docs site、npx bootstrap 和生成 identity 的现行版本同步到 `1.0.2`，运行项目既有版本生成/同步脚本。
2. 把 README、中文/英文 installation、quickstart、CLI reference、release notes 与 docs checks 中的官方命令统一为 `v1.0.2/install.sh`，说明不源码编译及 Dashboard 策略。
3. 强化 `tools/product-identity.node-test.mjs`、release workflow checks 和 docs content checks，拒绝现行公开面中的 `main/install.sh`、`--ref main` 与版本漂移，同时允许历史/归档事实。
4. 运行 build 并提交所有受控 `dist` 资产，验证 source 与生成产物无 diff。

验证：`npm run check:identity && npm run check:release-workflows && npm run check:docs && npm run build && git diff --exit-code -- packages/cli/dist/tenon.mjs packages/server/dist/dashboard.mjs packages/dashboard-app/dist`。

回滚：在 tag 创建前可回退版本提交；tag/Release 一旦发布不可移动，只能发布更高修复版本。

**此处建议 /clear**

## 子阶段 5：完整验证、合并、版本发布和真实重装

1. 运行定向测试、`npm test`、`npm run test:web`、build、bundle、skills、docs、adapter、migration、oracle、clean-install 和 OpenSpec/release 门禁；完成安全/代码审查。
2. 创建非 draft PR，等待 canonical CI，处理 review threads，合并到 `main`，确认开放 PR 为零且本地 `main` 与远端一致。
3. 从已合并且 canonical CI 成功的精确 `main` SHA dispatch `release-candidate.yml`，输入 `tag=v1.0.2`；等待 writer 创建不可变 tag 和 GitHub Release，验证 release/tag/commit/assets/digest。这里 `main` 只证明候选资格，用户交付源是 `v1.0.2`。
4. 记录当前真实 plugin/marketplace/runtime/Dashboard；用 `codex plugin remove tenon@tenon --json` 和 `codex plugin marketplace remove tenon --json` 删除宿主安装，保留项目与 managed runtime。
5. 执行 README 的 `v1.0.2` 一行命令；验证重复安装、`tenon update --codex -y` 同版幂等、`codex plugin list --json` 来源、`tenon doctor --json`、runtime status、`/api/health`、`/api/snapshot`、新会话提示及项目数据保留。

验证：GitHub Release `v1.0.2` 非 draft/prerelease且 tag peel 到已合并 SHA；开放 PR `[]`；插件、runtime、Dashboard 均报告 `1.0.2`，来源无本地 path/`main`，新用户命令未构建源码。

回滚：若发布前失败则不创建 tag；若发布后安装失败，保留 v1.0.1 和旧 managed runtime，修复后发布更高 patch，绝不移动或覆盖 v1.0.2。

**此处建议 /clear**

## 子阶段 6：Verify 失败后的兼容与信任边界修复

1. 先更新 `release-coordinator.test.ts`、`update.test.ts` 与 `managed-release-journal.test.ts`，覆盖
   candidate-resolved 后 host/payload 漂移拒绝、v1.0.1 缺 `serverVersion` WAL 的可恢复读取和重新健康证明。
2. 为 coordinator 增加 activation 前候选复证回调；update/setup 在首次和恢复路径都重新证明 frozen tag、
   marketplace/plugin identity、candidate version 与 payload digest，旧 journal evidence 只作恢复输入。
3. 先更新 `install-bootstrap.node-test.mjs` 与 `launchers.test.ts`，覆盖 disabled exact registration、空/相对
   PATH 与 cwd 恶意 `node`/`bash`；再让 installer 和 launcher 只执行已冻结的绝对程序。
4. 先更新 `setup.test.ts`、`host-target-plan.test.ts` 与 clean-install acceptance 测试，覆盖“宿主候选精确但
   pre-transaction runtime 为空”的首次打开、setup 计划的条件 remove/rebind 诚实投影，以及 acceptance
   失败后的 Dashboard 清理。
5. 更新 README/安装文档：v1.0.1 只走一次 `v1.0.2/install.sh` legacy bridge；从 v1.0.2 起每次更新都走
   单条 `tenon update --codex`。禁止把无法追溯修改的旧进程描述成新版自迁移。
6. 重建 CLI/server/Dashboard 受控资产，运行定向、全量、clean install、跨进程恢复和 release identity 门禁。
7. 用真实磁盘形状 v1.0.1 native setup/update WAL 与 v2/v3 convergence receipt 补充恢复矩阵：所有旧 phase
   均先通过向后兼容 decoder；successor resolver 失败时原 WAL 字节不变；证明成功后同一 transaction 原子转换
   为 setup/preparing-host；并覆盖 `starting-dashboard` 迟到进程、已重绑 v1.0.2 宿主的一次性 runtime bridge、
   cleanup 前 v4 升级，以及 completed receipt 只能在 cleanup 后完整复证之后提交。

验证：`node --test tools/install-bootstrap.node-test.mjs && npx vitest run packages/cli/src/commands/update.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/release-coordinator.test.ts packages/cli/src/runtime/managed-release-journal.test.ts packages/cli/src/runtime/launchers.test.ts && npm run build && npm test && npm run test:web && npm run test:clean-install`。

回滚：所有 coordinator/codec 修复保持 schema version 1 向后读；若新复证失败则保留 WAL 与旧 active runtime，
不回退到旧的 fail-open activation。launcher/installer 变更只在正式安装或 activation 提交时覆盖产品自有文件。

**此处建议 /clear**

## 子阶段 7：Verify 红队发现的回滚、launcher、audit 与 N-1 收口

1. 先在 `release-store.integration.test.ts`、`bootstrap.test.ts` 与 `launchers.test.ts` 增加失败测试：
   真实 v1.0.1 rollback 不得降级 bootstrap；selection 提交后在两个 launcher 的 rename/chmod
   任一边界崩溃，只有精确 old/new partial 可恢复，第三状态仍失败关闭。
2. 调整 RuntimeReleaseStore 与 stable bootstrap：rollback 只原子切换 verified previous selection，
   保留当前双读 v1/v2、绑定 `/bin/bash` 的 hardened bootstrap；恢复器按文件精确区分
   checkpoint/committed 内的 old/new partial pair，再幂等收敛到两个 launcher 都精确。
3. 为 activation/rollback audit 引入 prepared→selection committed→terminal success 顺序；CLI 与 bootstrap
   对截断/损坏尾行报 `auditCorrupt`，不把更早记录冒充 latest。`update-native.ts`
   的 failure audit 写入失败必须输出稳定 warning，不覆盖原始 update error。
4. 扩展 `tenon runtime status --json` 的已验证 public identity：active/previous 都输出
   release schema/id、payload digest、host、source version 与 v2 stable target；文本模式显示版本/标签。
5. 将 installer/native host 工具冻结从 pathname 升级为 realpath + dev/inode/mode/owner +
   完整父目录身份，每次 spawn 前复验；拒绝非 sticky world-write 与不同 owner 的 group-write，
   保留同 owner Homebrew `0775` 根兼容，并补绝对可写 PATH、symlink/inode-swap barrier 测试。
6. 修正 OpenSpec delta：用 `MODIFIED Requirements` 替换 canonical 中公开
   `main/install.sh` 和旧 `pipeline` launcher 条款；archive rehearsal 后断言不再存在相反规格。
7. 固定真实公开 v1.0.1 的 commit、完整 payload 与 CLI digest 到 N-1 release gate，
   禁止本机 previous 替代或缺失时 skip；修复 v3 workflow plan 的 N-1 可读写兼容投影，
   使真实 v1.0.1 `status`/`set`/bundle 契约全绿。

验证：先运行每个新增用例确认红，再运行 `npx vitest run packages/cli/src/runtime/launchers.test.ts packages/cli/src/runtime/bootstrap.test.ts packages/cli/src/runtime/release-store.integration.test.ts packages/cli/src/runtime/release-store-codecs.test.ts packages/cli/src/commands/update.test.ts`、`tools/test-bundle.sh`、OpenSpec archive rehearsal、`npm run build`、全量 core/web/clean-install/release 门禁。

回滚：保留 v1 manifest/payload 双读，不删除 previous release；新恢复只覆盖产品自有且精确匹配 checkpoint/committed 的 launcher 字节，任何外部修改继续失败关闭。

**此处建议 /clear**

## 子阶段 8：Pre-Verify executable 与 launcher 最后一跳收口

1. 在 `runtime.test.ts` 先证明 `runtime repair --rollback` 会把冻结 Bash 的物理 assert 传入 installer；symlink/inode 漂移时零 runner spawn、零 selection mutation。
2. 让 `verifyReleasePayload` 显式接收冻结 Node path；`inspectCandidatePayload`、staged payload、stored release 和 bootstrap check 全部在每次 Node spawn 前调用同一 verifier，并用不同于 `process.execPath` 的 runner 测试证明四次调用不旁路。
3. 收紧 TypeScript 与 `install.sh` 的 executable identity：拒绝文件自身 group/world-write 和非 root/当前用户 owner，绑定 size/change identity，覆盖同 inode truncate/rewrite。
4. 把 launcher replace/restore 改为 capture actual object → 验证 checkpoint/committed → exclusive no-replace publish。proof 后外部写入必须保留第三方字节并使事务 indeterminate，不得静默覆盖。
5. 用 `MODIFIED Requirements` 明确补偿恢复 selection/launchers/Dashboard 但保留当前 hardened bootstrap；隔离 archive 后重新检索 canonical，确保不再要求恢复旧 bootstrap。

验证：`npx vitest run packages/cli/src/commands/runtime.test.ts packages/cli/src/commands/native-host-command-binding.test.ts packages/cli/src/runtime/release-payload.test.ts packages/cli/src/runtime/launchers.test.ts packages/cli/src/runtime/release-store.integration.test.ts`、`node --test tools/install-bootstrap.node-test.mjs`、`npm run build`、architecture/identity/release/OpenSpec 门禁和隔离 archive rehearsal。

回滚：任何物理证明或 launcher CAS 无法成立时保留 selection/WAL 并失败关闭；不得回退 pathname-only verifier、rename-overwrite 或 previous bootstrap 安装。

**此处建议 /clear**

## 子阶段 9：公开 bridge WAL、跨平台 trust 与最终公网验收

1. `install.sh` 在任何宿主 remove/add 前创建 machine-state bridge journal，记录 target tag/commit、
   before inventory 与 phase；存活 owner lease 串行化同宿主安装，dead owner 可由下一次命令原子接管。
2. 每一步只接纳 journal before 或可权威证明的 desired postcondition；add 已提交但 phase 未写入时重跑
   直接 adopt，非目标第三状态保留且失败关闭。packaged setup 成功后才删除 bridge journal。
3. native executable resolver 在生产环境只接受 physical binding；Windows 对 host shim 与 `cmd.exe`
   双重冻结并由真实 Windows CI 执行，POSIX owner/write 规则不错误套到 Windows mode/uid。
4. Doctor、candidate verifier、Dashboard start/restore/compensation 全部消费同一冻结 Host/Bash/Git/Node
   对象，每次 spawn 紧邻前 assert；任何漂移都不执行目标程序。
5. Release published 后由独立只读 workflow 从精确 stable tag 跑 public clean acceptance：安装两次、
   `tenon update --codex`、doctor/runtime/Dashboard 身份和外部用户状态零漂移。

验证：`node --test tools/install-bootstrap.node-test.mjs tools/check-release-workflows.node-test.mjs`、
`npx vitest run packages/cli/src/commands/native-host-command-binding.test.ts packages/cli/src/commands/doctor-product-identity.test.ts packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/runtime/launchers.test.ts`、
Windows CI、`npm run build`、全量 core/web/local clean install 与发布后 public clean install。

回滚：bridge journal 或 executable proof 不可读时保留宿主与 journal 原状并非零退出；不得删除第三状态、
退回 pathname-only spawn 或绕过 public Release 验收。

**此处建议 /clear**
