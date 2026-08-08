# 版本化发布、安装与更新生命周期设计

## 用户结果与边界

新用户复制官方一行命令后，得到一个来自不可变稳定 SemVer Release 的完整 Tenon：Codex 插件、CLI、
Skills、hooks、managed runtime 与 Dashboard 使用同一个版本身份。用户不需要 clone 仓库、安装项目依赖或
在本机执行构建。从 v1.0.2 起，既有用户只运行 `tenon update --codex` 即可发现并切换到最新稳定 Release。
已经发布的 v1.0.1 无法追溯获得同进程 self-reexec，因此只允许一次官方版本化安装器迁移，并明确说明
这是历史桥接，不把第二次命令或候选校验副作用伪装成一键更新。

`main` 只承担集成分支和 release candidate 资格检查，不再出现在公开安装 URL、Marketplace ref、更新
目标或运行时完成证据中。此次不改变 Claude Marketplace 的宿主能力，不删除项目 Change/OpenSpec、用户
规则、截图或其他用户数据，也不让 Tenon 直接写 Codex 私有插件 cache。

## 已验证事实

- 远端默认分支是 `main`；本轮审计后开放 PR 为零，本地 `main` 与 `origin/main` 一致。
- 最新已发布稳定版本是 `v1.0.1`，而当前 `main` 仍声明 `1.0.1` 且包含更多提交，证明分支名不能作为
  发布身份。
- `install.sh`、`nativeInstallPlan('codex')` 和 managed host desired-state 当前分别硬编码
  `main`、`--ref main` 与 `refs/heads/main`。
- 现有 `release-candidate.yml`、`release-writer.yml` 和 `release.yml` 已要求完整稳定
  `vX.Y.Z`、精确候选 SHA、版本清单一致、canonical CI 和 digest-bound payload，可直接复用。
- 现有 managed-release coordinator、WAL、候选资产校验、runtime 原子切换、Dashboard readiness 和补偿
  顺序可承载新流程；问题位于 release 目标解析和宿主 marketplace 重绑定，而不是缺少第二套更新器。
- v1.0.1 stable launcher 只派发一次当前 active CLI。旧 update 在候选激活后不会重新进入候选 updater；
  remote `main` 用户会遗留移动 ref，本地 marketplace 用户的 upgrade 还是 noop。这是已发布二进制的
  不可追溯边界，不能由 v1.0.2 源码安全改写。
- Codex 的公开 CLI 提供 marketplace/plugin 的 add、remove、upgrade 与 inventory；同名 marketplace add
  没有“原地修改 ref”的显式契约，因此跨标签切换必须建模为可恢复的重绑定步骤。

## 方案比较

| 方案 | 安装身份 | 更新发现 | 优点 | 风险/结论 |
| --- | --- | --- | --- | --- |
| 移动 `main` | 分支 HEAD | marketplace upgrade | 实现最少 | 同一命令随时间漂移，直接违反目标，拒绝 |
| 移动 `latest`/`v1` 标签 | 可变别名 | marketplace upgrade | URL 简短 | 标签可重写，版本号不能证明提交，拒绝 |
| 不可变 SemVer 标签 + GitHub stable Release 元数据 | `vX.Y.Z` | Releases API 返回 latest stable，再校验标签提交 | 身份明确、可回滚、可验证 draft/prerelease | 需要失败关闭的网络解析与 marketplace 重绑定；采用 |

## 选择的架构

官方安装命令从不可变标签读取脚本，例如：

```sh
/usr/bin/curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/v1.0.2/install.sh | /bin/bash -s -- --codex
```

标签内的 `install.sh` 默认且仅接受完整稳定 `vX.Y.Z`，默认 ref 与脚本所属版本一致。安装器只调用宿主
CLI 与已发布 bundle，不运行 `npm install`、`npm run build` 或源码入口。`tenon setup --codex` 从当前已
加载插件版本派生同一个固定标签，不再使用分支名。

`tenon update --codex` 通过可注入、超时受限的 GitHub Releases resolver 读取 latest stable，拒绝 draft、
prerelease、非完整稳定 SemVer、标签/manifest 不一致和无法证明的网络响应。resolver 冻结
`targetVersion`、`targetTag` 与 peeled target commit 后，现有 managed-release WAL 执行以下宿主步骤：

```text
resolve stable Release
        |
        v
plugin remove -> marketplace remove -> marketplace add --ref vX.Y.Z
        -> plugin add -> plugin inventory/version/root proof
        -> packaged asset verification -> managed runtime activation
        -> Dashboard readiness -> ready evidence
```

每个宿主 mutation 都有精确 desired-state：插件缺席、marketplace 缺席、marketplace 指向目标标签提交、
插件版本等于目标版本、inventory 根可验证。进程中断后从 WAL 的下一逻辑步骤恢复；不靠命令 stdout 或
“already exists”文本猜成功。宿主 cache 不做文件级回滚，已激活的 stable launcher/runtime 在宿主重绑定
失败时继续可用，并给出原命令重试路径。

`candidate-resolved` 只冻结恢复输入。无论是首次执行还是进程恢复，在 activation 前都必须重新证明 frozen
tag、宿主 marketplace/plugin identity、候选 manifest 与 payload digest；journal 中旧 evidence 不替代当前
观察。v1.0.1 journal 的 Dashboard identity 若缺少 `serverVersion`，解码器保留其恢复坐标，但只有重新健康
探测得到的精确版本才能满足 readiness。

v1.0.1 setup WAL 还可能缺少 frozen stable target。版本化 installer 必须先证明 successor tag/commit，再用原
transaction id 把旧 WAL 原子转换成新的 preparing-host 事务；在此之前不得 stop Dashboard 或清 WAL。
保留 transaction id 使 `starting-dashboard` 空探针之后迟到的旧进程仍能按 old release identity 被 successor
事务精确识别。successor target 解析失败时旧 runtime、Dashboard 和 WAL 全部保持不变。

旧 host-convergence v2/v3 receipt 也不提供新版本完成证明。若 installer 已把宿主重绑到更高稳定版本，setup
先发布并验证新 runtime/Dashboard，再用新 release supersede 旧 receipt；旧 SessionStart proof 不授权提前删除。
正常 cleanup 则在一个 managed transaction 内执行“完整预证明 → legacy receipt 升级为 pending v4 → 官方
remove → 完整后证明 → completed v4”，completed 永远晚于清理后复证。

安装器在 mutation 前解析并冻结可信绝对 `node`、`bash`、`git` 和宿主 CLI；稳定 launcher 使用绝对 Node
路径与绝对系统 shell。PATH 中的空项、相对项或 cwd 程序不得在预检后重新夺回执行权。

## 关键规则

1. 公开安装 URL、Codex Marketplace ref、update target 和 ready evidence 必须绑定同一个完整稳定 SemVer
   标签；任何一个位置出现 `main` 都是发布门禁失败。
2. Release 标签必须不可变并 peel 到 release candidate 已批准的精确提交；manifest、插件清单、runtime
   source version 和 Dashboard `/api/health` 版本必须一致。
3. latest resolver 只接受官方仓库的非 draft、非 prerelease Release；网络、schema、SemVer 或 tag 证明
   失败时不执行任何新的宿主 mutation。
4. 安装与更新只通过 `codex plugin ...` 管理宿主状态；Tenon 不直接修改 Codex 私有配置/cache。
5. 跨标签更新必须显式重绑定 marketplace；普通 upgrade 不得被当成切换固定 ref 的证据。
6. 候选完整性、managed runtime 原子切换、Dashboard readiness 和 ready evidence 继续复用现有 coordinator。
7. 真实新用户验收必须先通过宿主 CLI 删除当前 Tenon 插件及 marketplace，再执行已发布标签的一行安装；
   不能用当前工作区 bundle 或本地 marketplace 替代。
8. 重装不得删除项目 Change/OpenSpec、用户修改、截图或 Tenon 的可回滚 managed release；项目同步仍由
   用户显式运行 `tenon sync`。
9. `tenon update --codex` 在已经是 latest stable 时幂等完成，不重复重绑或制造新 runtime release。
10. `main` 可以作为发布工作流验证“候选已经合并且 CI 通过”的输入，但 tag 创建后用户交付只认版本标签。
11. v1.0.1 到 v1.0.2 是一次显式版本化安装器迁移；v1.0.2 起的每次正常升级只需单条
    `tenon update --codex`。不得用验证脚本或 Dashboard 启动副作用修改宿主状态。
12. `candidate-resolved` 后的每次恢复都重新证明宿主与候选；旧 WAL 只提供恢复坐标，不提供永久身份背书。
13. 安装器和 launcher 只执行冻结的绝对工具路径；disabled 的同版本插件登记属于可修复状态，不得在
    remove/add 收敛之前错误拒绝。
14. 旧 WAL/receipt 的迁移不得补造历史 frozen target；successor target 必须先证明，任何 Dashboard stop、
    旧插件 cleanup 或 completed receipt 都必须发生在对应证明与 durable checkpoint 之后。

## 状态与失败模型

更新目标状态为 `unresolved -> resolved -> host-rebinding -> candidate-verified -> candidate-revalidated ->
runtime-active -> dashboard-ready -> evidence-committed`。`resolved` 前失败为纯只读失败；`host-rebinding` 之后失败保留 WAL，
不伪称回滚宿主 cache；`runtime-active` 后 Dashboard 无法证明 readiness 时按现有 coordinator 补偿或进入
indeterminate，不发布 ready evidence；`evidence-committed` 后清理失败不撤销已经公开的稳定状态。

版本状态只有三类：`current`（已是 latest stable）、`upgrade`（目标版本更高）、`downgrade-rejected`
（远端/latest 低于当前版本或不满足稳定 SemVer）。常规 update 不自动降级；显式 runtime rollback 仍只在
本机已验证 managed releases 间切换，不改变宿主 marketplace 的发布目标。

## Dashboard 生命周期

| 场景 | 启动/升级 Dashboard | 自动打开浏览器 | 必须输出 |
| --- | --- | --- | --- |
| 交互式首次 `tenon setup`（命令开始前无有效 managed runtime） | 是，等待 readiness | 是；失败不回滚健康 runtime | 已验证 URL、失败时手动 URL |
| 官方 curl 管道安装 | 是，等待 readiness | 否，管道/非交互不抢占桌面 | 已验证 URL、`tenon dashboard --open` |
| CI/无图形环境 setup | 是，等待 readiness | 否 | URL、健康结果、手动命令 |
| 手动 `tenon update` | 是，原子切换后 readiness | 否 | 新版本、URL、需要新会话 |
| 后台 auto-update | 是，原子切换后 readiness | 否 | 可审计日志，不弹浏览器 |

自动打开只发生在 readiness 之后。浏览器打开失败是可恢复的提示，不把已健康的 Dashboard 判成安装失败。
无论是否打开，成功输出都提供 `http://127.0.0.1:<port>/` 和 `tenon dashboard --open`。

## Assumptions / Decision Log

- 假设：GitHub Releases API 是“已发布稳定版本”的权威发现面；Git 标签只证明 ref，不单独证明 Release。
- 假设：Codex CLI 不承诺同名 marketplace add 会修改 ref，因此显式 remove/add 是唯一可审计的公开重绑定。
- 决策：新安装的默认版本写在不可变标签内；安装不需要 latest 网络查询，复制的 URL 本身就是版本选择。
- 决策：update resolver 在任何 mutation 前冻结目标版本、标签和提交；不以 `main` 或移动标签作 fallback。
- 决策：手动 update 不自动打开 Dashboard，避免每次升级打断用户；首次交互 setup 保留即时发现体验。
- 决策：当前插件的真实卸载与正式重装放在版本发布后执行，确保验收的是公众可复制命令。
- 决策：v1.0.1 的一次性迁移使用同一条官方 `v1.0.2/install.sh`；完成后所有更新回到 `tenon update`。
- 决策：首次 setup 是否打开浏览器由命令开始前的 managed runtime 状态决定，不由候选是否已验证推断。

## 红队自检

- Release API 返回 draft、prerelease、`v1.0`、带 build metadata 或仓库外 URL时，resolver 必须失败且零 mutation。
- 标签在解析后被重写时，target commit 与最终 marketplace HEAD 不一致，WAL postcondition 必须拒绝提交。
- 插件 remove 成功、marketplace remove/add 中断时，stable launcher 与旧 managed runtime 仍可运行，原 update
  命令可按 WAL 恢复。
- marketplace 已是目标 tag 但插件 inventory 仍是旧版本时，不能因 HEAD 匹配跳过 plugin reinstall。
- CLI 返回 0 但 inventory root/version 或打包资产不匹配时，不能激活 runtime。
- Dashboard 端口被非受管进程占用时，不得 stop/adopt；返回 indeterminate 并保留 journal。
- curl 管道、`CI=1`、后台 auto-update 不调用 OS browser opener；健康 URL 仍必须可操作。
- 从本地 path marketplace 或开发 checkout 执行验收不算新用户通过。
- v1.0.1 的旧 updater 不得被测试伪装成同进程重绑定成功；验收必须分别覆盖一次性 installer bridge 与
  v1.0.2 起的真实单命令 update。
- `candidate-resolved` 后修改 host root、ref、HEAD、clean 状态或同版本 payload，恢复必须在 activation 前拒绝。
- PATH 含空/相对项且 cwd 提供恶意 `node`/`bash` 时，安装器与 launcher 仍只执行预先冻结的绝对程序。

## 验收矩阵

定向单元/集成测试覆盖稳定 Release 解码、严格 SemVer、超时/网络/schema/draft/prerelease、目标冻结、
标签提交校验、fresh setup、同版幂等、跨版 marketplace 重绑定、每一步 WAL 恢复、inventory/version/root/
asset 不一致、candidate-resolved 后漂移、v1 journal 兼容、可信可执行文件、disabled registration 修复、
无 `main` 发布源、Dashboard 五类场景、open 失败降级和 host target plan。发布前还运行完整
build、bundle、skills、docs、release-workflow 与 clean-install 门禁；发布后在真实用户配置上执行官方卸载、
标签一行安装、重复安装、`tenon update --codex`、doctor、plugin inventory、runtime status、Dashboard
`/api/health`/`/api/snapshot` 和开放 PR 为零的终验。

```coverage
touches: release-distribution, native-host-plugin, managed-runtime, dashboard-lifecycle
L1_api:      filled -> #选择的架构
L2_data:     filled -> #状态与失败模型
L3_rules:    filled -> #关键规则
L4_state:    filled -> #状态与失败模型
L5_errors:   filled -> #红队自检
L6_security: filled -> #关键规则
L7_perf:     waived -> 本地单用户发布协调无新增吞吐目标；网络调用仅要求有界超时
L8_deps:     filled -> #选择的架构
L10_terms:   filled -> #用户结果与边界
```
