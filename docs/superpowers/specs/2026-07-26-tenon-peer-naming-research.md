# Tenon 同类项目命名与升级机制调研

> 调研日期：2026-07-26
> 用途：为 `rename-pipeline-lite-to-tenon` 的品牌、CLI、包、运行时目录与升级迁移边界提供一手证据
> 结论置信度：高（所有关键结论均来自固定提交的仓库源码、README 或包清单）

## 1. 范围与固定基线

本报告只回答五个问题：

1. 产品品牌名与 CLI 名是否一致；
2. npm 包、插件/Skill id 是否与品牌解耦；
3. 运行时目录、配置文件、环境变量前缀是否与品牌解耦；
4. 发布与升级是多入口还是单一入口；
5. 对一次不保留旧命令别名、但又必须让既有用户自动迁移到 Tenon 的重命名，哪些机制可直接采用。

固定源码基线：

| 项目 | 默认分支 | 固定提交 | 提交日期 | 提交说明 |
| --- | --- | --- | --- | --- |
| mindfold-ai/Trellis | `main` | [`12e279a8af00456b1d0d4e3d0f7f59e7b702202e`](https://github.com/mindfold-ai/Trellis/tree/12e279a8af00456b1d0d4e3d0f7f59e7b702202e) | 2026-07-24 | `0.6.9` |
| rpamis/comet | `master` | [`84038b0d6b7c185b233f0f36b294ae74dd9121d0`](https://github.com/rpamis/comet/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0) | 2026-07-25 | `feat: strengthen Native sequential clarification (#233)` |

方法：对两个固定提交做浅克隆，完整阅读 README、package manifest、CLI 注册、安装路径、更新、自更新和迁移实现。没有把官网营销文案或搜索摘要当作实现证据。

## 2. 结论先行

两者都没有把公开品牌名、CLI basename、运行时前缀做成彼此无关的用户概念。相反，它们都采用同一词根贯穿用户可见面：

| 维度 | Trellis | Comet | 对 Tenon 的结论 |
| --- | --- | --- | --- |
| 产品品牌 | Trellis | Comet | 使用 `Tenon` |
| CLI | `trellis`，另有短别名 `tl` | 仅 `comet` | 仅 `tenon`，不增加短别名 |
| npm 包 | `@mindfoldhq/trellis`，另有 `@mindfoldhq/trellis-core` | `@rpamis/comet` | 一个公开分发包 `@<publisher>/tenon`；内部 workspace 可私有 |
| Skill/命令前缀 | `trellis-*`、`/trellis:*` | `comet-*`、`/comet` | `tenon-*`、`/tenon` |
| 项目运行时根 | `.trellis/` | `.comet/`；Native 产物默认 `docs/comet/` | `.tenon/`；产物位置可配置，但所有权元数据仍归 `.tenon/` |
| 配置/环境前缀 | `.trellis/config.yaml`、`TRELLIS_*` | `.comet/config.yaml`、`COMET_*` | `.tenon/config.yaml`、`TENON_*` |
| 宿主目录 | 由 Cursor/Codex/Claude 等适配器决定 | 由平台注册表决定 | 保留 `.codex`、`.agents` 等业界宿主目录，不能改成 `.tenon` |
| CLI 与项目资产升级 | `trellis upgrade` + `trellis update` 两入口 | `comet update` 单入口，CLI 自升级需显式 `--self-update` | 采用 Comet 型单入口：`tenon update [--self-update]` |
| 路径重命名 | 有版本化 `rename`/`rename-dir` manifest | 有 canonical/legacy 目录发现与精确清理 | 采用所有权校验、候选验证、失败回滚；不长期保留旧命令 |

关键判断：

- **对外不应解耦**：品牌、CLI basename、Skill 前缀、运行时根和配置前缀应统一为 `tenon`。对外解耦会让安装、诊断、日志搜索和文档认知成本上升。
- **对内应该解耦**：这些值必须由一个 `ProductIdentity`/manifest 真相源生成，而不是在源码、模板、测试、README、Dashboard 中散落字符串。Trellis 已集中目录常量，Comet 已集中平台路径注册，但两者都没有展示一次完整品牌迁移。
- **宿主路径必须独立**：Codex 的 `.agents/skills` 与 `.codex`、Claude 的 `.claude` 等属于宿主契约，不跟随 Tenon 品牌改名。
- **自动更新与“最终无旧兼容面”并不冲突**：需要一个一次性迁移桥，但迁移桥应发布在旧分发通道中；最终 Tenon 包本身只暴露 `tenon`，不暴露 `pipeline` 或 `pipeline-lite` 别名。

## 3. Trellis：品牌一致，但发布包与升级入口分层

### 3.1 品牌、CLI、包名

Trellis README 的安装命令是 `npm install -g @mindfoldhq/trellis@latest`，初始化入口是 `trellis init`；即 npm scope 使用组织名，包 basename 与产品/CLI 一致。[README_CN.md L54-L65](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/README_CN.md#L54-L65)

CLI 包清单进一步确认：

- 包名：`@mindfoldhq/trellis`；
- 主命令：`trellis`；
- 额外短别名：`tl`；
- CLI 依赖另一个公开包 `@mindfoldhq/trellis-core`。

证据见 [packages/cli/package.json L1-L13](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/package.json#L1-L13) 与 [L54-L62](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/package.json#L54-L62)。

因此 Trellis 的“包名与品牌解耦”只发生在 npm scope：发布者是 `mindfoldhq`，basename 仍是 `trellis`。它不是把产品名、CLI 名、包 basename 设计成三套概念。

### 3.2 运行时目录与配置前缀

Trellis 把项目根目录集中定义为 `DIR_NAMES.WORKFLOW = ".trellis"`，再由该常量构造 workspace、tasks、spec、scripts、agents 等路径。[packages/cli/src/constants/paths.ts L1-L24](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/constants/paths.ts#L1-L24) [L44-L64](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/constants/paths.ts#L44-L64)

这说明：

- 目录实现有一定内部集中度；
- 但公开运行时目录仍直接使用品牌词根；
- 配置文件和 managed block 也使用 `.trellis/config.yaml` 与 `TRELLIS:START/END`，并非品牌中立协议。[packages/cli/src/commands/update.ts L104-L123](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/update.ts#L104-L123)

### 3.3 平台选择与宿主目录

`trellis init` 通过 `--claude`、`--codex`、`--cursor` 等平台参数选择安装对象，而不是把所有宿主都塞入同一品牌目录。[packages/cli/src/cli/index.ts L70-L99](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts#L70-L99)

Codex 安装器把共享 Skills 写到 `.agents/skills/`，Codex 专属 Skills/agents/hooks/config 写到 `.codex/`。[packages/cli/src/configurators/codex.ts L145-L181](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/configurators/codex.ts#L145-L181) [L201-L246](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/configurators/codex.ts#L201-L246)

可采纳点：`tenon setup --codex` 选择平台，平台 registry 决定 `.agents`/`.codex` 等宿主路径；不能因为全局品牌替换而重命名宿主标准目录。

### 3.4 升级不是一个入口

Trellis 明确区分：

- `trellis update`：更新项目配置与命令，并通过 `--migrate` 执行重命名/删除；
- `trellis upgrade`：全局安装当前 npm 包的目标 tag/version。

证据见 [packages/cli/src/cli/index.ts L154-L183](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts#L154-L183) 与 [L184-L209](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts#L184-L209)。

全局升级目标从当前包清单读取 `PACKAGE_NAME`，然后执行 `npm install -g <package>@<tag>`；stable/beta/rc 会跟随当前通道。[packages/cli/src/commands/upgrade.ts L37-L71](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/upgrade.ts#L37-L71) [L109-L147](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/upgrade.ts#L109-L147)

这套逻辑适合“包名不变”的版本升级，却不能自动跨到一个全新的 npm 包名：旧 CLI 从旧 `package.json` 读取的仍是旧包名。Tenon 若更换包名，仅复制这段实现会把既有用户永远留在旧分发通道。

### 3.5 文件/Skill 重命名机制值得采用

Trellis 的 migration manifest 支持 `rename`、`rename-dir`、`delete` 和带 hash 白名单的 `safe-file-delete`；并明确区分自动迁移、需确认、冲突与跳过。[packages/cli/src/types/migration.ts L1-L29](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/types/migration.ts#L1-L29) [L84-L111](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/types/migration.ts#L84-L111)

目录重命名只有在旧目录存在 manifest 所有权证据时才自动执行；用户自建而恰好同名的目录会跳过。新旧目标同时存在且含用户内容时会报告冲突，不强行覆盖。[packages/cli/src/commands/update.ts L1490-L1509](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/update.ts#L1490-L1509) [L1554-L1598](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/update.ts#L1554-L1598)

一个真实例子是 `trellis-spec-bootstarp` 更正为 `trellis-spec-bootstrap`：同一 release manifest 枚举每个平台的旧、新 Skill 目录，并保留历史 manifest 中已经发布过的旧拼写，不改写历史。[0.6.0-beta.23.json L1-L30](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/migrations/manifests/0.6.0-beta.23.json#L1-L30)

可采纳点：

- Tenon 的旧资产迁移必须有“由本产品创建”的所有权证据；
- 冲突时停止，而不是全局字符串替换后覆盖用户文件；
- 已发布的迁移清单、归档文档和历史 ledger 中出现旧品牌属于历史事实，不应为了搜索结果为零而重写。

不采纳点：

- 不采用 `tl` 这类第二 CLI 别名；
- 不采用 `update` 与 `upgrade` 两个用户入口；
- 不把旧 `pipeline` 命令作为 Tenon 包的长期 deprecated alias。

## 4. Comet：单包、单 CLI、单更新入口

### 4.1 品牌、CLI、包和分发内容

Comet 的包清单把公开身份收敛为：

- npm 包 `@rpamis/comet`；
- 唯一 bin `comet`；
- 单包携带 `dist`、`bin`、`assets`、`eval` 和 postinstall。

证据见 [package.json L1-L24](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/package.json#L1-L24) [L50-L81](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/package.json#L50-L81)。

CLI 根命令也显式注册为 `comet`。[app/cli/index.ts L58-L64](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/cli/index.ts#L58-L64)

仓库快照中没有独立的 Claude/Codex plugin manifest 作为第二产品身份；分发身份主要由 npm 包、`comet-*` Skills/Rules/Hooks 与平台安装 manifest 共同表达。因此它更接近“一个公开包内打包完整插件资产”，与 Tenon 的目标一致。

### 4.2 运行时根与可配置产物根

Comet 项目配置使用 `.comet/config.yaml`，全局安装登记使用 `~/.comet/installations.json`。[platform/install/project-registry.ts L51-L63](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/project-registry.ts#L51-L63)

Native 工作流默认把产物放在 `docs/comet/`，但允许通过 `comet init --root artifacts` 改成 `artifacts/comet/`。[README-zh.md L149-L153](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README-zh.md#L149-L153)

这是一种有用的“有限解耦”：

- 控制面/所有权元数据仍有稳定 `.comet/` 根；
- 用户产物根可以配置；
- 产物子目录仍带 `comet`，避免与用户普通文档混淆。

对 Tenon 应采用同样边界：`.tenon/` 是不可歧义的控制面；文档/证据根可配置，但默认子目录仍使用 `tenon`。

### 4.3 平台 id 与宿主路径真正解耦

Comet 的平台 registry 把 `id`、显示名、Skill 目录、全局 Skill 目录、配置目录、检测路径与 OpenSpec tool id 分开建模。[platform/install/platforms.ts L10-L42](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/platforms.ts#L10-L42)

Codex 的当前约定尤其明确：

- canonical Skills：`.agents`；
- legacy Skills：`.codex`；
- Codex 配置：`.codex`；
- 平台检测：`.codex`。

见 [platform/install/platforms.ts L83-L98](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/platforms.ts#L83-L98)。

它还按 canonical Skill root 分组，确保共享同一路径的多个平台只有一个确定 owner，避免多平台安装互相覆盖。[platform/install/skill-root-owner.ts L38-L53](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/skill-root-owner.ts#L38-L53) [L75-L98](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/skill-root-owner.ts#L75-L98)

这是 Tenon 必须采用的解耦：品牌 identity 与宿主 platform identity 分离；`tenon setup --codex` 选择 Codex adapter，但落盘位置遵守 Codex 标准，不发明 `~/.tenon/codex/skills` 作为宿主 Skill 根。

### 4.4 `comet update` 是单入口，但不会偷偷升级 npm

Comet 把项目/全局 Skills、所有已登记项目与 npm 自升级统一挂在 `comet update` 下；CLI 自升级由显式 `--self-update` 开启，`--skip-self-update` 可明确关闭。[app/cli/index.ts L152-L166](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/cli/index.ts#L152-L166)

README 对语义的说明更严格：

- 只刷新当前项目默认不修改 npm 安装；
- `--self-update` 才升级 CLI；
- 自更新拒绝降级；
- 安装前在隔离目录验证候选包；
- 安装失败尝试恢复精确旧版本。

见 [README-zh.md L267-L280](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README-zh.md#L267-L280)。

源码证据：

- npm 包名与官方 registry 作为明确常量：[app/commands/update.ts L47-L65](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/commands/update.ts#L47-L65)；
- 安装前把候选包下载到临时前缀并验证 `--version`、`workflow resolve` 与 `native` 命令：[app/commands/update.ts L747-L845](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/commands/update.ts#L747-L845)；
- 安装失败后恢复精确旧版本，并恢复项目 package/lock 元数据：[app/commands/update.ts L912-L992](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/commands/update.ts#L912-L992)。

可采纳点：

- Tenon 只提供一个 `tenon update` 心智入口；
- npm 自更新必须是可观察且可关闭的明确步骤；
- 新包先隔离安装并运行 contract smoke，再替换当前包；
- 替换失败必须恢复旧包和 package/lock 元数据；
- 已登记项目的资产刷新与 CLI 包升级分开报告状态，不能把“CLI 成功”误报成“所有项目已更新”。

不采纳点：

- 不采用 Comet 当前硬编码 `PACKAGE_NAME` 的方式作为品牌真相源；Tenon 应从生成的 identity manifest 读取；
- 不把 legacy 目录列表永久保留为运行时兼容面，只允许一次性迁移桥使用。

## 5. 两个项目都没有证明“跨品牌自动升级”

本次固定快照没有发现 Trellis 或 Comet 曾把公开品牌、npm 包名、CLI basename、配置根和 Skill 前缀同时改成另一个品牌。

能确认的只是：

- Trellis 能在**包名不变**时升级自身，并对产品拥有的文件/目录做版本化重命名；
- Trellis 对外部平台改名采用过 deprecated 参数别名，例如 Windsurf → Devin，但这是平台参数兼容，不是 Trellis 自身改名。[packages/cli/src/cli/index.ts L81-L83](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts#L81-L83) [L129-L140](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts#L129-L140)；
- Comet 能在**包名不变**时安全自更新、迁移 legacy 宿主目录并刷新多项目资产；
- 两者都没有提供“旧 npm 包自动转移到新 npm 包且旧 CLI 立即消失”的现成范例。

所以不能把“同类项目支持 update”推断成“直接把 package/bin 全局替换后，既有用户会自动到 Tenon”。旧二进制只知道旧 registry identity；如果旧通道没有迁移信息，它不会凭空发现新包。

## 6. Tenon 推荐方案

### 6.1 最终公开身份

最终发布物应只有一套公开 identity：

```text
品牌              Tenon
CLI               tenon
npm package       @<publisher>/tenon
plugin id         tenon
Skill prefix      tenon-
项目控制面根      .tenon/
项目配置          .tenon/config.yaml
全局安装登记      ~/.tenon/installations.json
环境变量前缀      TENON_
Dashboard         Tenon
文档命令          tenon ...
```

其中 npm scope `<publisher>` 是发布组织身份，可以与品牌不同；basename 必须是 `tenon`。

仓库内部可以继续使用多个 workspace 包，但只允许一个公开安装包。内部包若必须发布，应采用 `@<publisher>/tenon-*` 并由主包锁步管理；基于“完整插件全部打包在一起”的当前目标，更推荐让内部 workspace 保持 `private`，主包携带 CLI、Dashboard、Skills、hooks、adapters、templates 和 migration metadata。

### 6.2 一次性迁移桥，而不是长期兼容别名

要同时满足“既有用户自动更新”和“Tenon 不兼容旧命令”，推荐两段式切换：

1. **旧分发通道发布最后一个迁移版本**
   该版本仍由既有用户的旧自动更新机制获取，但唯一职责是识别 Tenon cutover：
   - 在临时目录安装 `@<publisher>/tenon@<target>`；
   - 校验 `tenon --version`、`tenon setup --help`、状态读取与 Dashboard smoke；
   - 记录旧包、旧二进制和旧资产清单；
   - 安装 Tenon；
   - 调用一次性 `tenon migrate-from-legacy` 或等价内部入口；
   - Tenon 验证通过后卸载旧包；
   - 任一步失败都恢复精确旧版本与安装元数据。

2. **Tenon 正式包不提供旧命令**
   `@<publisher>/tenon` 的 `bin` 只能含 `tenon`。不提供 `pipeline`、`pipeline-lite`、短别名或 deprecated wrapper。迁移桥存在于旧通道，不是 Tenon 的永久兼容 API。

如果完全不发布第一段迁移桥，那么“旧用户自动更新到新包”在技术上无法成立；只能要求用户手工重新安装 Tenon。

### 6.3 资产迁移规则

Tenon 的迁移应组合 Trellis 与 Comet 的长处：

1. 由版本化 manifest 列出每个受管旧路径与新路径；
2. 只有旧 manifest/hash/安装登记证明产品所有权时才自动移动；
3. 用户数据和历史归档只复制/保留，不做无依据删除；
4. 新旧目标冲突时停止并输出精确路径；
5. 先备份控制面和 package/lock 元数据；
6. 先验证候选 Tenon 包，再变更当前安装；
7. 新 CLI、项目控制面、Skills、hooks、adapters、Dashboard 全部健康后才清理旧产品资产；
8. 历史 archive、已发布 migration manifest、ledger 和旧 change 名中的旧品牌不重写；它们不是当前产品兼容面，而是审计事实。

### 6.4 单一更新入口

推荐命令契约：

```bash
# 刷新当前项目已安装的 Tenon 资产，不隐式变更 npm 包
tenon update

# 先安全升级 Tenon 包，再刷新当前项目资产
tenon update --self-update

# 刷新安装登记中的所有项目
tenon update --all-projects

# 新安装按宿主显式选择
tenon setup --codex
tenon setup --claude
```

自动更新服务可以调用同一应用服务，但必须把两个结果分开建模：

```text
package_update: updated | skipped | failed
project_assets: updated | partial | failed
```

UI 只有在二者均完成时才能显示“已更新”；不能把包更新成功等同于 Skills/hooks/Dashboard 已刷新。

## 7. 采纳与不采纳清单

### 采纳

- 采用 Trellis 的路径常量集中化思想，但提升为完整的 identity manifest；
- 采用 Trellis 的版本化 rename manifest、所有权/hash 判断和冲突停止；
- 采用 Comet 的一个公开包、一个 CLI、一个 `update` 入口；
- 采用 Comet 的候选包隔离验证、精确版本回滚与 package/lock 元数据恢复；
- 采用 Comet 的平台 registry 与 canonical Skill root owner；
- 保持 Codex/Claude 等宿主目录与 Tenon 品牌目录解耦；
- 保持公开产品词根在 CLI、Skill、配置、Dashboard、文档中一致。

### 不采纳

- 不采用 Trellis 的 `tl` 短别名；
- 不采用 `update`/`upgrade` 双入口；
- 不在 Tenon 包中保留旧 `pipeline` 命令或 `pipeline-lite` plugin/Skill id；
- 不把 npm 包名、运行时根、环境变量等身份字符串散落硬编码；
- 不用全局文本替换修改历史归档、已发布迁移清单或审计 ledger；
- 不把旧目录检测永久留在主运行路径；
- 不在候选包未验证、项目资产未迁移时先卸载旧包。

## 8. 对当前 Change 的直接验收标准

`rename-pipeline-lite-to-tenon` 至少应验证：

1. 新安装只生成 `tenon` 命令，`package.json.bin` 无旧入口；
2. CLI、npm basename、plugin id、Skills、Dashboard、README/文档站、配置根和环境前缀均为 Tenon identity；
3. `.codex`、`.agents`、`.claude` 等宿主标准目录保持不变；
4. 一个 identity manifest 能生成/校验 CLI、包、模板、测试和 Dashboard 品牌常量；
5. `tenon update --self-update` 具备候选验证、失败回滚和项目资产独立状态；
6. 旧用户的跨包升级由旧分发通道的一次性迁移桥完成；
7. Tenon 最终包不携带旧命令别名；
8. 当前产品源码和生成分发物无旧 identity；历史 archive/ledger 的旧词仅作为不可变审计事实保留。

## 9. 来源索引

- [Trellis README（固定提交）](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/README_CN.md)
- [Trellis CLI package manifest](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/package.json)
- [Trellis CLI 注册](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/cli/index.ts)
- [Trellis 路径常量](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/constants/paths.ts)
- [Trellis 升级实现](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/upgrade.ts)
- [Trellis 迁移类型与实现](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/types/migration.ts)
- [Comet README（固定提交）](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README-zh.md)
- [Comet package manifest](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/package.json)
- [Comet CLI 注册](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/cli/index.ts)
- [Comet 更新与回滚实现](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/commands/update.ts)
- [Comet 平台路径 registry](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/platforms.ts)
- [Comet canonical Skill root owner](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/platform/install/skill-root-owner.ts)
