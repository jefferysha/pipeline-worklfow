# ADR：Tenon 整包更新事务与所有权边界

- 日期：2026-07-26
- 状态：Accepted
- Change：`rename-pipeline-lite-to-tenon`
- 替代范围：细化并替代 `2026-07-24-resilient-plugin-runtime-explore.md` 与
  `2026-07-24-single-plugin-host-install-updates.md` 中关于更新补偿边界的描述

## 背景

Tenon 同时依赖宿主 Marketplace、自己的 content-addressed runtime、用户稳定启动器和
`127.0.0.1:18765` Dashboard。把这些对象误当成一个可以整体回滚的事务，会产生两个错误：

1. Tenon 无法安全恢复 Codex/Claude 私有插件缓存，却可能对用户声称“全部已回滚”。
2. 只恢复 runtime selection 而不恢复启动器字节、Dashboard 进程和项目工作区边界，会留下
   split-brain 状态。

因此，更新不能靠不断增加失败分支兜底，必须先确定每个状态对象的唯一所有者，再由一个协调器
按顺序提交可证明的边界。

## 决策

公开更新入口只有 `tenon update --<native-host>`。手动更新和 opt-in 自动更新调用同一命令、
同一候选校验和同一 managed commit；不再提供第二套 `--self-update`。

### 所有权矩阵

| 状态对象 | 唯一写入者 | Tenon 能否回滚 | 失败后的真实语义 |
| --- | --- | --- | --- |
| Codex/Claude Marketplace 与插件缓存 | 对应宿主 CLI | 否 | 明确报告宿主边界已提交；不读取、复制或恢复私有缓存 |
| Tenon immutable release 与 active selection | `RuntimeReleaseStore` | 是 | 只对精确 activation 做 CAS 补偿 |
| Tenon data/state/config、项目注册表、凭证、Dashboard token/pid | kernel `resolveProductPaths` 定位；各领域 store 写入 | 按各 store 契约 | 全部位于平台标准 Tenon 产品域，不借用任何宿主目录 |
| `~/.local/bin/tenon{,-hook}` | `RuntimeInstaller` | 是 | 捕获存在性、字节和 mode；只在仍为 before/committed 所有权状态时恢复 |
| Dashboard 候选进程与 18765 服务 | Dashboard coordinator | 是 | readiness 失败先终止候选，再恢复 previous release 服务 |
| 已登记项目工作区 | 用户显式 `tenon sync` | 否且不得尝试 | update 只读扫描并输出逐项目同步命令 |

### 提交顺序

1. 宿主刷新自己的 Marketplace/插件 inventory。
2. Tenon 从宿主 inventory 取得候选根，不推断私有 cache 路径。
3. 校验完整 payload，再复制到 Tenon 自己的 content-addressed release store。
4. 原子提交 runtime selection 和稳定启动器。
5. 启动候选 Dashboard，并用 release identity + machine state scope 做 readiness。
6. readiness 成功后才宣告整包更新完成；随后只读报告需要显式同步的项目。

宿主提交是外部前置事务，不属于 Tenon 的回滚域。第 3 至 5 步属于 Tenon managed transaction；
任一步失败都保持或恢复 previous verified runtime。审计记录必须同时写明
`host=in-progress|committed` 与 `managed=unchanged|restored|indeterminate`，不得用“更新失败”
掩盖边界。`in-progress` 表示宿主命令已经开始，但 Tenon 尚未从 authoritative inventory 证明提交结果；
此时同样不猜测或改写宿主缓存。

### npx 与 Marketplace release channel

npx 包固定下载其自身发布 tag 对应的 `install.sh`，并内嵌该脚本的 SHA-256；下载内容必须先通过
host、大小、shebang 与 digest 校验。经验证的脚本仍把宿主 Marketplace 注册到 `main` 稳定发行通道，
而不是把宿主永久钉死在 npx 包的 tag。这样 npx 与直接 Marketplace 安装在执行时消费同一个候选
digest，后续 `tenon update` 也不会因为 Marketplace ref 固定在旧 tag 而失去升级能力。

被拒绝的替代方案是“npx 把宿主 Marketplace 固定到自身 tag”。它能让首次下载看似更严格，却会让
宿主的正常 update 永远停留在旧 tag；除非删除并重建宿主 Marketplace，而那会扩大不可回滚的宿主
事务窗口。

### 启动器补偿

启动器提交前捕获两个文件的存在性、内容和权限。补偿只接受两类当前状态：

- 与提交前快照完全一致；
- 内容等于本次 committed 内容（允许写入后、`chmod` 前的中间权限）。

任何第三方内容修改都会拒绝覆盖并进入可诊断失败。首装失败时，提交前不存在的启动器必须删除；
既有安装失败时，必须恢复精确旧字节和旧 mode。

### Dashboard 补偿

后台启动 API 返回候选 child 的可终止句柄。readiness 失败必须先终止该 child，随后补偿 runtime，
再从 previous immutable payload 恢复唯一 18765 服务。不能只修改 selection 而遗留失败候选进程，
也不能把一个未验证的旧端口响应当成成功。

### 项目同步

更新过程不得修改任何项目的 Change、OpenSpec、workflow 或 `.pipeline-version`。注册表只用于
只读发现；路径去重、绝对路径校验和 shell-safe 命令渲染后，向用户显示显式 `tenon sync`。

### 产品机器状态

Tenon 自有机器状态只能由 kernel 的 `resolveProductPaths` 解析。macOS 使用
`~/Library/Application Support/tenon`，Linux 使用带 `tenon` 命名空间的 XDG data/state/config，
Windows 将本机 data/state 与 roaming config 分开。项目注册表与凭证位于 config root，
Dashboard token/pid 与 selection/audit 位于 state root，不得写入 `~/.claude`、`~/.codex` 或
其他宿主目录。`TENON_RUNTIME_HOME` 是测试与运维隔离的唯一覆盖；不再存在 Dashboard 专属第二套
Home。安装器解析一次后，通过版本化 `TENON_RUNTIME_ROOTS` 契约把精确 root 元组传给稳定 launcher、
bootstrap 与子进程，bootstrap 不再复制一套平台路径算法。三个单 root 环境变量只由该契约派生给
shell hook 与冻结 N−1 bootstrap，当前路径解析器不得把它们当输入。Dashboard 单例作用域哈希必须
绑定 canonical `stateRoot`。

## 被拒绝方案

### Tenon 直接备份并恢复宿主插件缓存

拒绝。缓存格式和并发语义属于宿主私有契约，跨版本复制会把 Tenon 变成另一个宿主包管理器。

### 保留 `--self-update` 作为修复后门

拒绝。它会形成第二版本源、第二事务和第二自动更新状态，最终重现 split-brain。

### Dashboard 失败时仅恢复 launcher

拒绝。运行中的候选 child 和 18765 listener 仍可能属于失败 release，UI 与 CLI 会指向不同版本。

### 自动同步全部已登记项目

拒绝。更新后台任务没有修改用户工作区、OpenSpec Change 或未提交文件的授权。

### 把 Tenon 注册表、凭证或 Dashboard 状态放进宿主目录

拒绝。宿主目录属于宿主 CLI 的发现、凭证与缓存契约；借用它们会让纯 Codex 安装仍依赖
Claude 目录，并让卸载、迁移和回滚无法证明所有权。

## 后果

- 宿主缓存可能已经更新，而当前会话和 managed runtime 仍继续使用 previous release；这是明确、
  可审计的边界，不是“部分回滚成功”的模糊状态。
- 修复入口仍是同一个稳定 `tenon` launcher 与 previous verified runtime，不依赖额外后门。
- 更新实现需要失败注入测试覆盖首装、部分 launcher 写入、候选校验、activation、Dashboard readiness、
  previous Dashboard 恢复、项目只读扫描和 N−1 fixture。
- 只有新的宿主会话加载新 skills/hooks；运行中会话不热切换。
