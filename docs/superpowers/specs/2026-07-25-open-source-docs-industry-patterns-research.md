# 开源 README、使用文档与解决方案页行业模式研究

> 研究日期：2026-07-25  
> 研究范围：AI coding workflow / developer-tool 开源项目  
> 一手来源：4 组（Trellis、Comet、uv、GitHub 官方文档）  
> 置信度：高（结构性结论）；中（竞品页面会持续迭代，数量型声明仅视为研究日快照）

## 执行摘要

成熟的开源开发者工具不会让 README、完整文档和解决方案页承担同一种职责：

- **README 是仓库转化入口**：一句话说明价值，给出可信徽章、60 秒快速开始、核心能力和下一步链接。GitHub 官方也建议 README 聚焦项目用途、价值、上手、帮助和维护者，把长篇内容拆到专门文档中。[GitHub README 指南](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- **文档站是任务型知识库**：按“开始使用 → 概念 → 工作流/教程 → 参考 → 运维与排障 → 社区”组织，而不是按代码包罗列。Trellis 和 Comet 都采用这种分层，并为高级架构、配置、场景和 FAQ 提供独立页面。[Trellis Docs](https://docs.trytrellis.app/) · [Comet Docs](https://docs.comet.rpamis.com/)
- **解决方案页负责解释问题与差异**：Hero、问题、核心价值、工作流、产品证据、适用场景、安装 CTA 依次推进；技术细节通过链接进入文档，不能复制一份超长 README。
- **安装必须是矩阵而非单一路径**：主路径保持最短，同时覆盖宿主、平台、版本固定、更新、卸载和故障诊断。uv 的官方文档把安装方式、升级、补全、卸载和下一步形成完整闭环，是可借鉴的成熟模式。[uv Installation](https://docs.astral.sh/uv/getting-started/installation/)
- **所有可量化和兼容性声明必须有真相源**：支持的平台数量、Workflow 阶段、默认端口、自动更新、测试数量等不得手写后长期漂移；应从 registry、manifest、CLI help 或 CI 产物生成或校验。

建议本项目采用“一套事实、三种阅读路径”：README 面向首次访问者，`docs/` 面向操作者和贡献者，解决方案页承担产品叙事；三者共享命令片段、能力矩阵和声明清单。

## 研究问题与方法

本次研究回答以下问题：

1. 同类项目如何在首屏说明价值并建立信任？
2. README 应包含什么、哪些内容应下沉到文档站？
3. 多宿主、多 Workflow、多安装方式如何清晰呈现？
4. 架构、教程、FAQ、贡献、安全和版本更新如何形成完整闭环？
5. 哪些竞品做法值得采用，哪些做法容易制造认知负担或不可验证声明？

方法：

- 深读 Trellis 官方仓库 README、文档首页、贡献指南和 Changelog。
- 深读 Comet 官方仓库 README 与文档首页，比较其 Native/Classic、安装、CLI、状态和恢复内容。
- 使用 uv 官方安装文档作为跨平台安装、升级和卸载的信息架构基准。
- 使用 GitHub 官方 README、社区健康与安全指南校准开源仓库的最低标准。
- 只使用项目维护方、GitHub 或产品官方文档；未使用聚合榜单、二手教程或社区转载作为结论依据。

## 一手来源

### 1. mindfold-ai/Trellis

- [官方仓库与 README](https://github.com/mindfold-ai/Trellis)
- [官方文档首页](https://docs.trytrellis.app/)
- [官方贡献指南](https://github.com/mindfold-ai/Trellis/blob/main/CONTRIBUTING.md)
- [官方 Changelog](https://docs.trytrellis.app/changelog)

可借鉴点：

- README 首屏是“Logo → 一句话定位 → 用户问题 → 文档/语言入口 → 徽章 → 演示”，信息密度高但阅读顺序清楚。
- `Why Trellis?` 用“能力 / 改变什么”的结果导向表格，不从内部模块开始讲。
- Quick Start 仅保留安装、初始化和宿主选择三个动作，再把细节导向专门页面。
- 文档站分为 Start Here、Advanced、Use Cases、Marketplace、Community，并提供架构、定制、配置、FAQ 和速查表。
- Changelog 每个版本含发布日期、增强、修复和升级命令，便于用户完成更新而不只阅读变更。

注意点：

- README 顶部徽章较多，包含社区、Issue/PR 计数和“Ask AI”入口。对新项目而言，过多动态徽章会稀释构建状态、版本和许可证等高价值信号。
- README 的极简结构适合转化，但安全、兼容性、更新策略等内容必须由文档站和社区文件补齐。

### 2. rpamis/comet

- [官方仓库与 README](https://github.com/rpamis/comet)
- [官方文档首页](https://docs.comet.rpamis.com/)
- [官方贡献指南](https://github.com/rpamis/comet/blob/master/CONTRIBUTING.md)
- [官方 Changelog](https://github.com/rpamis/comet/blob/master/CHANGELOG.md)

可借鉴点：

- 清楚区分两种独立工作流，并解释各自适用条件，避免把“轻/重”错误理解为升级关系。
- README 覆盖安装、快速开始、命令、平台矩阵、Skill、状态管理、工作流、项目结构、开发、路线图和社区，功能可发现性很强。
- 文档站将“理解系统”和“五阶段工作流”拆开，并单列轻量预设、恢复排障、实践场景和 FAQ。
- 快速开始采用三步卡片：安装 CLI、项目初始化、在 coding agent 中调用入口；对多宿主产品尤其有效。
- 文档提供 `llms.txt` 和文档 MCP 接入方式，形成“人读文档 + agent 检索文档”的双路径。

注意点：

- README 同时承担产品首页、完整手册、基准报告和 CLI 参考，篇幅很长；首次访问者容易在主价值和高级能力之间失焦。
- 量化基准声明应始终紧邻实验设计、样本、版本和可复现报告；不能让营销摘要脱离证据页。
- 平台数量、命令选项和目录矩阵变化频繁，适合从 registry/CLI 自动生成，不适合人工复制到多个页面。

### 3. Astral uv

- [官方安装指南](https://docs.astral.sh/uv/getting-started/installation/)
- [官方 Guides 信息架构](https://docs.astral.sh/uv/guides/)
- [官方 Concepts 信息架构](https://docs.astral.sh/uv/concepts/)
- [官方 Reference 信息架构](https://docs.astral.sh/uv/reference/)

可借鉴点：

- 明确区分 Guides、Concepts 和 Reference：教程解决任务，概念解释模型，参考提供精确接口。
- 安装页同时覆盖主安装器、包管理器、容器和源码安装，并把版本固定、升级、Shell 补全、卸载及下一步放在同一闭环。
- 安装命令旁说明其副作用和替代方式，例如可先检查安装脚本、不同安装来源采用不同升级方式。

### 4. GitHub 官方开源仓库规范

- [About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Setting up your project for healthy contributions](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions)
- [Quickstart for securing your repository](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository)

校准结论：

- README 至少回答“做什么、为什么有用、如何开始、哪里求助、谁维护”。
- 仓库内链接应优先使用相对链接，以保证 GitHub 分支浏览和本地 clone 后都能工作。
- README 不应成为全部文档的容器；长文档应拆分。
- 健康开源项目还需要 License、CONTRIBUTING、Code of Conduct、Support、Issue/PR 模板等社区入口。
- `SECURITY.md` 应说明支持版本和私密报告漏洞的方法。研究日检查 Trellis 与 Comet 的公开根目录和 `.github/` 均未发现 `SECURITY.md`；这应视为竞品缺口，而不是可复制模式。

## 对比矩阵

| 维度 | Trellis | Comet | uv / GitHub 基准 | 本项目建议 |
| --- | --- | --- | --- | --- |
| 首屏定位 | 一句话 + 用户痛点，清晰 | 能力完整，但首屏信息较多 | GitHub 要求先说用途和价值 | 一句话价值 + 一句证据边界，不从“7 phase”术语开场 |
| 徽章 | 丰富，含版本、下载、License、社区、Issue/PR | 重点更多放在版本公告与基准 | 徽章不是目的，社区文件更关键 | 仅保留 Release、CI、License、Node、Docs；Coverage 有稳定公开源才加 |
| 快速开始 | 3 个命令 | 3 步卡片 + 工作流选择 | uv 主路径短，安装矩阵下沉 | README 60 秒主路径；文档列 Codex/Claude/其他宿主矩阵 |
| 工作流解释 | 4-phase loop，简洁 | Native/Classic + 五阶段，详尽 | Guides/Concepts/Reference 分工 | 首屏展示四种模式；各模式单独教程，默认七阶段再展开 |
| 架构 | 文档站高级章节 | README 内含状态、目录和工作流树 | Concepts 解释模型 | README 只放一张高层图，细节进入 Architecture 文档 |
| 教程 | Real-World Scenarios | 分阶段、恢复、CI/CD、大 PRD | Guides 按任务组织 | 用“第一次任务、简单任务、自由模式、自定义 Workflow、恢复中断”五条主线 |
| CLI 参考 | 文档速查 | README 中较完整 | Reference 单列 | 由 `pipeline --help` 生成/校验独立参考页 |
| FAQ | README + docs | docs 分组 | Support/Discussions 分工 | README 只留前 5 个阻塞采用的问题，完整 FAQ 下沉 |
| 贡献 | 独立 CONTRIBUTING，含环境、检查、PR | 独立贡献指南 | GitHub 社区健康文件 | 独立贡献、行为准则、支持、安全政策与模板 |
| 版本更新 | 独立版本页含升级命令 | README/CHANGELOG | uv 区分安装来源的升级方式 | 单列升级/自动更新/固定版本/回滚语义 |
| 可验证声明 | 主要是能力和平台声明 | 含大量平台与基准声明 | 官方指南强调稳定入口 | 建立 claim registry，CI 检查文档与真相源一致 |

## 推荐的信息架构

### README.md：仓库转化入口

推荐顺序：

1. **品牌区**
   - 产品名与短标语。
   - 一句话价值主张：谁使用、解决什么问题、以什么独特方式解决。
   - 英文主 README；如提供中文，使用 `README.zh-CN.md` 并在首屏互链。
2. **信任条**
   - npm/release version。
   - canonical CI 状态。
   - License。
   - Node.js 支持版本。
   - Docs 状态或文档入口。
3. **Hero 演示**
   - 一张真实 Dashboard 截图或不超过 30 秒的终端录屏。
   - 禁止用无法从真实运行复现的概念图充当产品截图。
4. **Why**
   - 以用户问题组织：长任务漂移、旧 Change 误恢复、Skill 未真实执行、文档未被读取、状态不可审计。
   - 用“问题 → Pipeline Lite 的改变”表格表达。
5. **60 秒快速开始**
   - 安装。
   - `pipeline setup --codex` 主路径。
   - 在正常对话中触发第一个任务。
   - 一个状态检查命令。
6. **选择正确模式**
   - Default：完整治理。
   - Simple：短任务。
   - Free：自由执行入口。
   - Custom：自定义 DAG / 文档契约。
   - 用“适用 / 不适用 / 是否生成 OpenSpec”三列比较。
7. **核心能力**
   - CLI 与状态机。
   - Workflow / Track 路由。
   - OpenSpec 与文档证据。
   - Skill 真实执行与 provenance。
   - Review / HITL。
   - Dashboard。
   - AFK 自动化与 loops。
   - Adapters、hooks、channel compatibility、tap diagnostics。
   - 安装、不可变发布与自动更新。
8. **How it works**
   - 一张高层图展示 normal chat → router → workflow plan → phase skills/docs/review → dashboard/audit。
   - 只解释稳定概念，目录、schema 和 API 下沉。
9. **文档导航**
   - Install、First Task、Workflows、Dashboard、Architecture、CLI、Troubleshooting、Contributing。
10. **项目健康**
    - Support、Security、Contributing、Code of Conduct、Roadmap/Changelog、License。

README 不应放入：

- 每个 CLI flag 的完整列表。
- 所有 manifest/schema 字段。
- 全部内部包和目录说明。
- 全量测试日志或会持续变化的通过数量。
- 没有复现链接的性能百分比。

### 完整文档站：任务型知识库

```text
Start here
├── What is Pipeline Lite?
├── Installation
├── First task with Codex
├── First task with Claude
└── Upgrade from an existing installation

Concepts
├── Workflow, Track, Change and Session
├── Routing and explicit resume
├── Effective Workflow Plan
├── State machine and transitions
├── OpenSpec documents and read receipts
├── Skill provenance and trust roots
├── Review gates and continuous delegation
└── Release, installation and auto-update model

Workflows & tutorials
├── Default seven-phase workflow
├── Simple task workflow
├── Free mode
├── Custom workflow
├── Normal-chat triggering
├── Requirements-changed and verify-fail loops
├── Resume interrupted work
└── Build a custom workflow from scratch

Product modules
├── CLI
├── Kernel and persistence
├── Dashboard and port/runtime model
├── Hooks and host adapters
├── Automation / AFK
├── Loops
├── Channel compatibility
└── Tap diagnostics

Reference
├── CLI commands
├── Manifest schema
├── Track and workflow schema
├── State and document contracts
├── Environment variables
├── Filesystem layout
├── Dashboard API / SSE
├── Host capability matrix
└── Exit codes and JSON output

Operations
├── Update and version pinning
├── Uninstall
├── Doctor / diagnostics
├── Troubleshooting
├── Recovery and rollback
├── Security model
└── Compatibility and release policy

Contributing
├── Development setup
├── Architecture and package boundaries
├── Test strategy
├── Adding a host adapter
├── Adding a workflow or Skill
└── Release process

Community
├── FAQ
├── Support
├── Security reporting
├── Code of Conduct
├── Changelog
└── Roadmap
```

写作模板应统一：

- 每个教程：**目标 → 前置条件 → 步骤 → 预期输出 → 验证 → 常见失败 → 下一步**。
- 每个概念页：**定义 → 为什么存在 → 不变量 → 示例 → 与相邻概念的关系**。
- 每个参考页：**精确签名/字段 → 默认值 → 边界条件 → 错误语义 → 兼容性**。
- 每个排障页：**症状 → 无副作用诊断 → 原因 → 修复 → 恢复/回滚**。

### 开源解决方案页：面向采用决策

推荐单页叙事：

1. **Hero**
   - 结果导向标题，例如“让 coding agent 的长任务可恢复、可验证、可审计”。
   - 副标题说明它是本地优先的 workflow/state/guard 层，不是另一个代码模型。
   - 主 CTA：Get started；次 CTA：View on GitHub。
   - 可复制的 `pipeline setup --codex` 命令。
2. **问题证据**
   - 长对话漂移。
   - 旧任务错误恢复。
   - prompt 声称执行 Skill 但无真实证据。
   - 阶段、Todo 和 UI 状态不一致。
3. **解决方案**
   - 外部状态机。
   - Effective Workflow Plan。
   - OpenSpec + Skill + document receipt。
   - 精确 review receipts。
   - Dashboard 与 audit trail。
4. **模式选择器**
   - Default / Simple / Free / Custom 四张卡。
   - 切换后展示步骤、适用任务、生成文档和人工确认点。
5. **工作原理**
   - normal chat → routing → Change → phase → evidence → transition。
   - 用交互图或简洁时间线，不展示内部类图。
6. **产品模块**
   - CLI、Dashboard、Automation、Loops、Adapters、Diagnostics。
   - 每张卡链接到对应文档。
7. **兼容性与安装**
   - 宿主能力矩阵；Codex 为首要示例。
   - 明确 project/global scope、安装目录、版本固定、自动更新和卸载。
8. **可信证据**
   - CI、测试类别、浏览器验收、跨平台 hook/adapters。
   - 只显示能链接到 CI 或可复现报告的数字。
9. **安全与控制**
   - 本地优先、review gate、fail-closed 边界、secret 处理、明确恢复。
   - 链接到 `SECURITY.md` 和安全模型文档。
10. **开源 CTA**
    - Star / Read docs / Contribute。
    - License、贡献指南和支持渠道。

视觉建议：

- 采用开发者工具风格的真实终端和 Dashboard 组合，不使用泛化 AI 渐变或虚构统计。
- 首屏仅一个主动作；代码复制与 Docs/GitHub 为辅助动作。
- 桌面、平板、移动端均保证命令可复制，Workflow 图在窄屏降级为纵向时间线。
- 页面无需为每个内部包做 feature card；卡片应对应用户任务或可感知结果。

## 徽章与可信度策略

推荐首屏最多 5 个徽章：

1. npm/latest release。
2. canonical CI。
3. license。
4. Node.js engine。
5. documentation。

条件性徽章：

- Coverage：仅在公开、稳定且与主分支绑定时添加。
- Downloads：可作为采用度信号，但不能替代质量证明。
- Security scan：仅在实际启用并维护结果时添加。

不建议：

- Issue/PR 实时计数。
- 多个重复的 Star/社区徽章。
- 无维护责任的“production ready”“enterprise grade”徽章。
- 无稳定落地页的“Ask AI”按钮。

徽章必须链接到可解释其含义的目标页面，不能只展示图片。

## 安装与使用教程标准

### README 主路径

主路径只演示一个真实、稳定、最常见的宿主：

```bash
# Install the CLI
npm install -g <published-package>

# Install Pipeline Lite for Codex in the current project
pipeline setup --codex

# Verify the installation
pipeline doctor
```

上面仅是推荐信息结构；最终命令和包名必须从实际 CLI help/package manifest 核实后再发布。

### 文档安装矩阵

| 维度 | 必须说明 |
| --- | --- |
| 宿主 | Codex、Claude、其他已通过 adapter conformance 的宿主 |
| Scope | project / user-global；默认值和适用场景 |
| 平台 | macOS、Linux、Windows/WSL 的真实支持等级 |
| 版本 | latest、固定版本、离线/不可变 release |
| 更新 | 自动更新何时发生、如何检查、如何禁用/固定 |
| 卸载 | 删除哪些文件、保留哪些项目状态、如何恢复 |
| 迁移 | 旧安装和旧 state 如何升级 |
| 验证 | doctor/status/version 与预期输出 |
| 故障 | PATH、权限、宿主 hook 能力、端口冲突、网络失败 |

每个宿主教程必须回答：

- 安装到了哪里。
- 安装了哪些 Skill、hook、规则和 CLI。
- 正常对话如何触发。
- 如何进入 Simple、Free 或 Custom。
- 如何明确恢复指定 Change。
- 如何查看 Todo、当前 phase 和 Dashboard。
- 哪些 review 需要人工确认，持续授权的边界是什么。
- 更新失败、版本不一致或端口冲突如何诊断。

## 功能模块覆盖清单

README 的能力概览和文档站的模块页应覆盖以下公开能力，但必须以当前代码和测试为准：

| 模块 | 用户问题 | 最少文档 |
| --- | --- | --- |
| CLI | 如何安装、初始化、查看状态、转换和诊断？ | Quickstart、Command reference、exit codes |
| Kernel / state | 为什么任务可恢复且不会错误串线？ | 状态机、Change identity、CAS/locking、transition |
| Workflow / Track | 如何选择 Default、Simple、Free、Custom？ | 选择矩阵、每个 Workflow 教程、custom schema |
| OpenSpec / documents | 哪些文件会生成、何时读取、如何归档？ | 文档生命周期、ownership、hash/read receipt |
| Skills / provenance | 如何证明 Skill 真实执行？ | Skill resolution、trust roots、receipt、失败语义 |
| Review / HITL | 什么情况下暂停、持续授权允许什么？ | review event、acknowledge、delegation boundary |
| Dashboard | 为什么任务显示 running/waiting，如何使用端口？ | 启动、状态语义、端口、SSE、鉴权 |
| Automation / AFK | 无人值守如何排队、执行、恢复？ | admission、runner、cancel/retry、凭据边界 |
| Loops | 如何治理迭代、无进展和验证回退？ | loop model、budgets、termination、evidence |
| Hooks / adapters | 不同 coding agent 能力有何差异？ | host matrix、setup paths、hook behavior |
| Channel compatibility | 历史/实验 event bus 如何定位？ | compatibility boundary、非默认用途 |
| Tap diagnostics | 如何诊断 LLM 流量而不泄露秘密？ | opt-in、TLS/WS、redaction、trace retention |
| Distribution / update | 新用户如何获得完整插件并持续更新？ | immutable release、update policy、pin/rollback |
| Security | 本机服务、文件、shell、Git、凭据如何受保护？ | threat model、SECURITY.md、reporting path |

## 可验证声明清单

建议新增机器可读的 documentation claim registry，至少包含：

| 声明 | 唯一真相源 | 建议验证 |
| --- | --- | --- |
| Workflow 阶段和边 | `templates/manifest.yaml` / generated artifact | docs codegen freshness |
| 默认/可路由 Track | track/workflow registry | generated comparison table |
| 宿主支持与安装目录 | adapter registry | adapter conformance tests |
| CLI 命令和参数 | Commander command tree | generated CLI reference |
| Node.js 版本 | root `package.json#engines` | README snippet check |
| 发布版本 | package/release manifest | release workflow |
| 默认 Dashboard 端口 | server/CLI configuration | documented default test |
| 自动更新语义 | installer/update contract | install/update integration tests |
| Skill 数量和列表 | `skills-lock.json` / bundle manifest | `verify-skills` output |
| 测试数量 | CI run artifact | 不在长期文案中硬编码 |
| 性能或可靠性数字 | 版本化 benchmark report | reproduction command + dataset |
| License | `LICENSE` + package metadata | repository health check |

发布门禁应检查：

- README 中的命令能在干净环境执行。
- 所有相对链接和图片存在。
- 宿主矩阵与 adapter registry 一致。
- Workflow 图与 manifest 一致。
- `--help` 与 reference 页面一致。
- README、文档站和解决方案页没有相互冲突的默认值。
- 任何测试/性能数字都带 CI 或版本化报告链接。

## FAQ 推荐问题

README 保留最影响采用的 5 个问题：

1. Pipeline Lite 与 `AGENTS.md`、普通 Skill 或单纯 prompt 有什么不同？
2. 每个任务都会运行完整七阶段并生成 OpenSpec 吗？
3. Simple、Free、Default 和 Custom 应如何选择？
4. 它会自动恢复旧 Change 或修改我的代码吗？
5. Codex、Claude 和其他 coding agent 的能力是否完全一致？

完整 FAQ 再覆盖：

- 正常对话如何触发。
- 如何明确恢复、暂停或切换 Change。
- 为什么 UI 是 waiting 而不是 running。
- review gate 与持续授权。
- Skill 安装和更新。
- 默认端口及冲突处理。
- 文档生成、读取和归档。
- 离线/固定版本。
- 卸载与残留状态。
- 安全和漏洞报告。

## 贡献、安全与版本更新最低标准

建议公开仓库具备：

- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md` 或 README 中明确支持渠道
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `CHANGELOG.md` 或版本化 release notes
- 明确的 versioning、support 和 deprecation policy

`SECURITY.md` 至少写明：

- 当前支持的版本。
- 哪些问题属于安全漏洞。
- 私密报告渠道，禁止要求在公开 Issue 中披露。
- 预期响应窗口。
- 协调披露流程。

版本页统一包含：

- 版本与发布日期。
- 新增、变更、修复、安全。
- Breaking changes / migration。
- 升级命令。
- 固定版本与回滚方式。
- 相关 PR/Issue 或可复现证据。

## 推荐的交付边界

第一版应优先交付：

1. 重写的根 README。
2. 完整文档目录和最关键的 Start Here / Concepts / Workflows / Operations 页面。
3. 一个响应式开源解决方案页。
4. 缺失的社区健康文件。
5. 文档链接、命令和声明一致性检查。

不应在第一版用静态文案承诺：

- 未正式发布的包名或仓库 URL。
- 没有 conformance 测试的宿主。
- 无公开 CI 证据的测试数量。
- 没有基准报告的效率提升百分比。
- “零配置”“永不丢失”“完全自动”等绝对保证。

## 开放问题

1. 对外产品名、npm 包名、GitHub 仓库 URL 和主分支名最终分别是什么？当前工作目录名 `pipeline-worklfow` 含拼写差异，不能直接作为品牌或安装声明。
2. 第一版公开承诺支持哪些宿主和操作系统？应以 adapter conformance 与干净安装测试为准，而不是以仓库中存在目录为准。
3. README 是否采用英文主文档 + `README.zh-CN.md`，文档站是否同步双语？这会决定导航、搜索和发布工作量。
4. 安全漏洞的私密报告渠道和支持版本是什么？没有该信息无法完成符合 GitHub 建议的 `SECURITY.md`。
5. 解决方案页的 canonical 部署域名和发布机制是什么？在确定前，应把站点设计为可静态部署且不写死生产 URL。

## 最终建议

采用 Trellis 的“短 README + 清晰价值 + 场景入口”，吸收 Comet 的“多 Workflow、恢复、架构和完整教程”，采用 uv 的“安装/升级/卸载闭环”，并补上 GitHub 官方要求的社区与安全文件。最关键的差异化不是写得更多，而是让所有页面都能回答同一个问题且不漂移：**用户发起任务后，系统选择了哪个 Workflow、实际执行了什么、生成并读取了哪些证据、为什么可以安全推进。**
