# Trellis 风格开发者文档站信息架构研究

> 日期：2026-07-25  
> 阶段：Explore 独立研究  
> Track：frontend  
> 研究对象：Trellis 官方中英文文档、Kubernetes、GitLab、Docusaurus、VitePress、Diátaxis  
> 证据边界：仅使用项目官方文档、官方贡献指南或框架官方文档；页面结构是研究日快照

## 决策问题

Pipeline Lite 如果建设独立开发者文档站，应如何组织信息架构、全局与页内导航、搜索、多语言和内容深度，既保留 Trellis 文档的低上手门槛，又避免在功能增长后形成超长页面、混合内容类型和翻译漂移？

## 结论摘要

推荐采用“**任务入口 + 内容类型 + 产品领域**”三层结构：

1. 首页和 Getting Started 先让用户完成安装、宿主选择、首个任务和结果验证。
2. 主导航按用户意图划分为教程、操作指南、概念、参考和排障，再在各类型下使用 Pipeline Lite 的真实领域词汇。
3. 桌面使用顶栏、左侧全局导航、正文、右侧页内目录；移动端把全局导航和页内目录分别收进可识别的入口。
4. 搜索从同语言的本地全文索引开始，支持 `Cmd/Ctrl+K`、标题/章节/正文权重和键盘操作；不把生成式问答作为第一版必需能力。
5. 英文作为规范源，中文使用相同稳定路径镜像；关键上手链路要求双语发布门禁，非关键页面允许明确标注翻译状态和回退。
6. 每一页只承担一种主要阅读意图。长短不以固定字数裁决，而以“是否混入多个内容类型、页内目录是否失去扫描性、用户是否需要在无关内容间跳跃”决定拆分。
7. 提供 `llms.txt`/Markdown 入口可以帮助 agent 发现内容，但它是 HTML 导航和可访问搜索的补充，不能代替面向人的信息架构。

这些是针对 Pipeline Lite 的设计建议，不是对 Trellis 品牌、文案或栏目名称的复制。

## 研究方法

- 从 [Trellis 中文文档首页](https://docs.trytrellis.app/zh) 开始，核对全局栏目、页内目录、搜索、语言路径和 `llms.txt`。
- 深读 [安装与首个任务](https://docs.trytrellis.app/zh/start/install-and-first-task)、[日常命令与规范](https://docs.trytrellis.app/zh/start/everyday-use)、[架构全景](https://docs.trytrellis.app/zh/advanced/architecture)、[真实业务场景](https://docs.trytrellis.app/zh/start/real-world-scenarios)、FAQ 和 Changelog。
- 使用 Kubernetes 官方文档校准内容类型和大规模本地化；使用 GitLab 官方文档校准工作流导航、元数据和治理。
- 使用 Docusaurus、VitePress 官方文档比较多语言与搜索的实现能力；使用 Diátaxis 校准不同阅读意图。
- 将“页面中可直接观察或官方明确说明的内容”标为事实，将面向 Pipeline Lite 的取舍标为建议。

## 一、Trellis 文档站事实观察

### 1. 信息架构

**事实**

Trellis 中文站的左侧全局导航分为：

- 开始使用；
- 进阶；
- Use Cases；
- Resource Marketplace；
- 社区。

“开始使用”只有少量高价值入口：产品概览、安装与首个任务、工作原理、命令/升级/任务/规范、真实业务场景。随后才进入架构、配置、定制 Workflow、Command、Sub-agent、Hook、Skill、Marketplace 和附录参考。首页正文同时提供产品定位、传统方式对比、核心概念速览和快速开始入口。[中文首页](https://docs.trytrellis.app/zh) · [英文首页](https://docs.trytrellis.app/)

**解释**

这形成了由“为什么需要”到“第一次成功”再到“定制和参考”的渐进披露。产品内部对象没有在第一层导航全部平铺，因此新用户能先建立最小心智模型。

**风险**

“进阶”承载架构、功能定制、配置、团队协作、速查、Schema、FAQ 等多种意图，随着页面继续增加，会变成过宽的收纳类别。中文导航中也可以观察到中英文标签混用；这可能是术语保留，也可能是翻译覆盖不完整，至少需要显式术语策略。

### 2. 导航模型

**事实**

- 顶栏提供站点入口、搜索、语言/发布相关入口、Changelog、Tech Blog 和 GitHub。
- 左侧栏提供全站层级；当前页面在对应分组中出现。
- 内容较长的页面有“在此页面”目录；安装页的目录能直接到安装、升级、平台配置、首个任务和远程模板等二三级标题。
- 页面底部或正文中提供相关下一步链接。
- 搜索在全站持续可见，页面显示 `Cmd/Ctrl+K` 快捷入口。
- 站点发布 [`llms.txt`](https://docs.trytrellis.app/llms.txt)，列出文档页、Markdown URL、OpenAPI 和可选资源；页面还提供面向 ChatGPT 的打开入口。

**解释**

全局导航回答“这个站点有什么”，页内目录回答“这页有什么”，搜索回答“我已经知道关键词”。三者承担不同发现路径，不能互相替代。`llms.txt` 增加了 agent 发现路径，但其超长平铺列表不适合直接作为人的主导航。

### 3. 搜索模式

**事实**

Trellis 页面持续显示搜索入口和键盘快捷键，搜索与当前语言站点共同出现。公开页面表明该站由 Mintlify 构建，但本研究没有获取其索引配置、排序权重、无结果分析或中文分词策略，因此不能断言搜索质量和语言隔离方式。

**解释**

可发现性设计是明确的，底层检索质量则仍是未知项。仅看到搜索框不足以证明长尾术语、命令、错误码和中英文混搜能够正确命中。

### 4. 多语言模式

**事实**

- 英文内容位于根路径，例如 `/start/install-and-first-task`；中文使用 `/zh/...` 镜像路径。
- 英文与中文首页、安装页保留基本一致的栏目和标题结构。
- 两种语言都包含站点导航、页面目录和搜索入口。
- 中文页仍保留 `How It Works`、`Use Cases`、`Resource Marketplace` 等英文标签。

**解释**

稳定镜像路径有利于语言切换、链接对应和搜索分区。结构对称不等于内容同步；仍需要来源版本、翻译状态和差异检查，防止命令或兼容矩阵只在一种语言更新。

### 5. 内容深度模式

**事实**

- 安装页不仅包含安装，还包含升级、平台矩阵、初始化情形、首个任务、目录结构和远程模板。[安装与首个任务](https://docs.trytrellis.app/zh/start/install-and-first-task)
- “命令、升级、任务与规范”页包含多级页内目录，横跨命令参考、任务生命周期、Schema、上下文配置和规范编写，是明显的长篇综合页。[日常命令与规范](https://docs.trytrellis.app/zh/start/everyday-use)
- 架构、场景、FAQ、附录和版本记录各自有独立页面，避免所有深层内容都挤入首页。[架构全景](https://docs.trytrellis.app/zh/advanced/architecture) · [真实业务场景](https://docs.trytrellis.app/zh/start/real-world-scenarios) · [FAQ](https://docs.trytrellis.app/zh/advanced/appendix-f)
- Changelog 按版本独立成页，能够保存升级时间线和版本上下文。[v0.6.8](https://docs.trytrellis.app/zh/changelog/v0.6.8)

**解释**

Trellis 的内容深度足以覆盖首次使用到内部模型，优点是一个入口可以完整回答相邻问题；代价是任务、概念、参考和解释可能共处一页，使读者难以判断应顺序阅读还是精确查阅。

## 二、成熟开源文档站对照

| 来源 | 可验证事实 | 对 Pipeline Lite 的启示 |
| --- | --- | --- |
| [Kubernetes 文档首页](https://kubernetes.io/docs/home/) | 全局区分 Getting started、Concepts、Tasks、Tutorials、Reference，并提供版本和多语言切换。 | 大规模内容不能只按产品模块分组；用户意图是稳定的第一层。 |
| [Kubernetes 页面内容类型](https://kubernetes.io/docs/contribute/style/page-content-types/) | Concept、Task、Tutorial 有不同结构；Task 强调单一操作和前置条件，Tutorial 覆盖更大目标，Concept 解释模型并链接到任务。 | 为每种文档类型建立模板与检查，而不是让作者自由混合。 |
| [Kubernetes 本地化指南](https://kubernetes.io/docs/contribute/localization/) | 本地化有最小内容集、独立内容目录、站点字符串、版本基线和人工复核；允许从关键页面开始渐进扩展。 | 中文不必等待全站完成才发布，但必须声明覆盖范围、来源版本和人工复核状态。 |
| [GitLab 全局导航](https://docs.gitlab.com/development/documentation/site_architecture/global_nav/) | 最高层导航以工作流为主；集中式导航数据有评审、CI 检查和“页面未入导航”报告。 | 导航应成为受治理的数据契约，新增页面必须决定位置或显式排除。 |
| [GitLab 页面元数据](https://docs.gitlab.com/development/documentation/metadata/) | 页面记录 title、description、所属 stage/group；元数据可服务首页、搜索摘要、列表和所有权。 | 最小 frontmatter 应包含内容类型、描述、领域、所有者、语言状态和更新时间。 |
| [Diátaxis](https://diataxis.fr/) | 明确区分 Tutorial、How-to、Reference、Explanation 四种用户需求，并建议围绕这些需求组织文档。 | 适合作为内容边界，不必照搬英文栏目名；中文导航可表达为“教程、操作指南、参考、原理”。 |
| [Docusaurus i18n](https://docusaurus.io/docs/i18n/introduction) | 正文按完整文件翻译以保留上下文；主题/导航标签单独翻译；支持独立语言构建、`hreflang` 和 RTL，不默认承担自动语言检测。 | 内容翻译与 UI 文案分层；语言选择应可预测，不强制基于浏览器自动跳转。 |
| [Docusaurus 搜索](https://docusaurus.io/docs/search) | 官方支持 Algolia DocSearch，也列出自托管/本地搜索替代；版本和语言可用于过滤搜索结果。 | 搜索方案必须明确索引边界和刷新时效，不能只选择一个搜索 UI。 |
| [VitePress 搜索](https://vitepress.dev/reference/default-theme-search) | 内建基于浏览器索引的模糊全文搜索，也支持 Algolia；可配置多语言搜索 UI、排除页面和字段权重。 | 文档规模较小时本地搜索足够，并更符合无后端、低运维的初始边界。 |
| [VitePress i18n](https://vitepress.dev/guide/i18n) | 语言目录映射稳定 URL，可为每种语言配置 `lang`、标题、描述和主题；语言记忆/自动跳转由部署层显式决定。 | 路由、`html lang`、搜索语言和语言记忆必须作为同一个合同验证。 |

## 三、推荐的 Pipeline Lite 信息架构

以下为**建议**，不是对竞品现状的描述。

```text
首页
├── 产品定位
├── 选择执行模式
├── 5 分钟快速开始
└── 文档路径

开始使用
├── 安装与系统要求
├── 为 Codex 配置
├── 为 Claude Code 配置
├── 第一个受治理任务
├── 打开并理解 Dashboard
└── 更新、固定版本与卸载

教程
├── 完成一个 Default 工作流
├── 完成一个 Simple 任务
├── 使用 Free 模式
├── 创建 Custom Workflow
└── 恢复中断的 Change

操作指南
├── 选择 Workflow 与 Track
├── 处理 Review Gate
├── 修改需求并返回 Spec
├── 处理 Verify 失败
├── 配置 AFK 与 Loop
└── 诊断 hooks / adapters / dashboard

概念与架构
├── Workflow、Track、Change、Session
├── 七阶段状态机
├── OpenSpec 与文档证据
├── Skill provenance 与信任根
├── Review receipt 与人工边界
├── 本地优先持久化
└── Adapter fidelity

参考
├── CLI
├── Workflow / Track schema
├── 状态、ledger 与文档合同
├── 配置与环境变量
├── 文件系统布局
├── Dashboard API / SSE
├── 宿主能力矩阵
└── 退出码与 JSON 输出

运维与安全
├── 更新与迁移
├── 备份、恢复与回滚
├── 本机端口、Host 与 token
├── 故障排除
├── 兼容与发布策略
└── 安全模型

贡献
├── 开发环境
├── 包边界与架构
├── 测试现实
├── 添加 Workflow / Track / Skill
├── 添加 Host Adapter
└── 发布流程

发布说明
├── Changelog
├── 迁移指南
└── 已弃用与移除
```

### 导航规则

1. 顶栏只保留品牌、主文档入口、版本、语言、搜索、GitHub；避免把产品全部模块塞入顶栏。
2. 左侧导航以用户意图为第一层，以产品领域为第二层，默认展开当前路径并保持当前位置。
3. 右侧目录只展示当前页 H2/H3；移动端提供独立“本页内容”按钮，不能与全站菜单混为一个抽屉。
4. 每页提供面包屑、上一篇/下一篇、最后更新时间、编辑入口和所属版本。
5. 导航标题使用用户能预测结果的名词或主动动词；禁止“其他”“更多”“高级”长期容纳无关页面。
6. 每个发布页面都必须进入导航、索引页或被 frontmatter 显式标记为不进入导航；CI 检查孤儿页和坏链。

### 搜索规则

第一阶段建议采用构建期生成的本地搜索索引：

- `Cmd/Ctrl+K` 打开，完整键盘导航，移动端有可见入口；
- 当前语言优先，默认不把中英文结果混成一列；
- 标题权重高于 H2/H3，H2/H3 高于正文；
- 结果展示内容类型、页面标题、章节路径和短摘录；
- 命令、错误码、配置键、文件路径和缩写保留精确匹配；
- 支持 `search: false` 排除草稿、重定向页和重复生成内容；
- 无结果状态提供拼写建议、相关入口和“反馈缺失文档”链接；
- 搜索索引与站点构建同批产出，避免爬虫延迟造成新文档不可搜。

当页面规模、搜索分析或多版本索引需求超过本地索引能力时，再评估 Algolia DocSearch 或可自托管方案。生成式问答只有在能够返回来源、限定版本/语言、披露不确定性并维护隐私边界后才进入范围。

### 多语言规则

1. 英文是内容规范源，中文保持相同语义路径，例如 `/guides/review-gates` 与 `/zh/guides/review-gates`。
2. 路由切换优先跳到对应页面；没有翻译时明确说明回退到英文，不能静默跳回首页。
3. 页面记录 `source_revision`、`translation_status` 和 `last_reviewed`；命令、版本、兼容矩阵变更触发翻译过期检查。
4. 首页、安装、首个任务、更新、安全和排障属于双语最低发布集，缺失任一语言则阻止对应版本发布。
5. 导航、搜索 UI、可访问名称、SEO 元数据和正文分别管理，但必须在同一语言验收中一起验证。
6. 设置正确的 `html lang`、canonical 和 `hreflang`；不根据浏览器语言强制重定向，记住用户显式选择。
7. 产品术语建立中英文 glossary；命令、路径和 schema 字段不翻译，解释文字翻译。

### 内容深度规则

采用四类页面模板：

| 类型 | 回答的问题 | 必备结构 |
| --- | --- | --- |
| 教程 | 我第一次如何完成一个完整目标？ | 目标、前置条件、连续步骤、检查点、完成结果、下一步 |
| 操作指南 | 我现在如何完成一个具体动作？ | 适用条件、步骤、预期输出、验证、失败恢复、相关指南 |
| 概念/原理 | 系统为什么这样工作？ | 定义、动机、不变量、关系图、边界、示例、相关任务 |
| 参考 | 精确接口是什么？ | 签名/字段、默认值、约束、错误语义、兼容性、示例 |

拆页信号：

- 同一页同时教首次上手、解释架构并列出完整 CLI；
- 页面目录需要超过两级才能理解层次；
- 用户完成单一任务必须跨过大段不相关内容；
- 一个小功能更新会迫使多语言版本修改多个远距离章节；
- 搜索结果常落在综合页，却无法让标题和摘要说明具体答案。

不应仅因页面“长”就拆分。架构解释、端到端教程和迁移指南可能天然较长；只要它们围绕单一意图、目录可扫描、步骤连续，就可以保留为一页。

## 四、Trellis 模式的采用与舍弃

### 建议采用

- 少量高价值 Start Here 页面和渐进披露；
- 顶部搜索、左侧全局导航、右侧页内目录的职责分离；
- 英文根路径与中文镜像路径；
- 上手、架构、场景、参考、FAQ、Changelog 形成完整闭环；
- 为 agent 提供 `llms.txt` 和 Markdown 友好入口；
- 用真实命令、目录和生命周期解释产品，而不是只写营销文案。

### 不直接复制

- Trellis 的产品隐喻、品牌词、栏目文案和视觉资产；
- 把大量不同内容类型长期收进“进阶”；
- 把安装、升级、平台矩阵、目录结构和完整首个项目持续扩展在同一页；
- 中英文导航标签混用而没有术语规范；
- 把 ChatGPT/AI 问答入口置于来源清晰的关键词搜索之前；
- 让 `llms.txt` 成为一份无分组、无版本边界的超长清单。

## 五、候选实现路径

| 方案 | 优点 | 代价 | 当前判断 |
| --- | --- | --- | --- |
| VitePress 独立文档站 | 静态、轻量、本地搜索和 i18n 路径直接；适合 Markdown-first 项目 | 原生版本化和复杂内容治理需要自行补充 | 若第一阶段目标是双语静态文档与本地搜索，优先候选 |
| Docusaurus 独立文档站 | 文档版本、多语言、搜索生态和插件成熟 | 配置、构建和内容插件模型更重 | 若确认需要同时维护多个已发布版本，优先于 VitePress |
| 继续只用仓库 Markdown / Dashboard Overview | 无新部署面，和本地产品一致 | 缺少公共搜索、全局 IA、SEO、多语言路由和可分享深链接 | 可保留为产品内摘要，不足以承担完整公开文档站 |

框架选择应在发布目标、版本策略、托管边界确定后做决策，不能仅因 Trellis 使用某一托管平台就跟随。

## 六、验证与治理建议

- 链接检查：内部链接、锚点、语言对应页、重定向和 canonical。
- 导航检查：孤儿页、重复 URL、无效层级、超过约定深度的节点。
- 内容检查：每页有且只有一个主要内容类型、标题和 description。
- 真相检查：CLI 示例从 `--help` 或测试夹具校验；端口、Workflow 阶段、宿主能力来自代码真相源。
- 多语言检查：关键页面齐全、`html lang` 正确、source revision 未过期、搜索不串语言。
- 搜索验收：安装、更新、review gate、verify-fail、默认端口、常见错误码和配置键作为固定查询集。
- 可访问性：键盘搜索、焦点管理、标题层级、跳转链接、移动端菜单、对比度和 reduced motion。
- Agent 入口：`llms.txt` 只列 canonical 页面，携带语言和版本边界，并在构建时校验链接。

## 证据表

| 证据 | 支持的结论 | 置信度 |
| --- | --- | --- |
| Trellis 中英文首页与左侧导航 | Start Here → Advanced → 场景/市场/社区的渐进结构；双语镜像 | 高 |
| Trellis 安装、日常使用、架构、场景、FAQ、Changelog | 内容深度充足，但部分综合页混合多种阅读意图 | 高 |
| Trellis `llms.txt` | 提供 agent 发现和 Markdown/OpenAPI 路径 | 高 |
| Kubernetes 首页与页面类型指南 | Concepts / Tasks / Tutorials / Reference 分工及页面模板 | 高 |
| Kubernetes 本地化指南 | 渐进本地化、最低内容集、版本基线和人工复核 | 高 |
| GitLab 导航和元数据指南 | 工作流导航、集中治理、页面所有权和自动检查 | 高 |
| Docusaurus / VitePress 官方文档 | i18n、语言路由、本地/托管搜索的可实现能力 | 高 |
| Trellis 搜索 UI 的公开页面 | 搜索入口和快捷键存在 | 高 |
| Trellis 搜索相关性、索引更新和中文分词 | 未取得配置或质量数据 | 未知 |

## 开放问题

1. 文档站要只描述当前 `main`，还是必须并行维护稳定发布版和 `main/next`？这会直接影响 VitePress 与 Docusaurus 的选择。
2. 第一版是否授权公共托管、域名、搜索服务和部署流水线，还是只交付可本地构建的站点资产？
3. 中英文是否要求全站同步，还是采用“关键链路强制双语、其余页面渐进翻译”的策略？
4. 搜索必须完全本地/无遥测，还是允许 Algolia 等外部索引服务？若允许，需确定隐私、索引刷新和版本隔离边界。
5. `llms.txt`、Markdown 页面和未来 AI 问答是否属于首版验收，还是在人的导航与关键词搜索稳定后再加入？

## 一手来源清单

- [Trellis 中文文档](https://docs.trytrellis.app/zh)
- [Trellis 英文文档](https://docs.trytrellis.app/)
- [Trellis llms.txt](https://docs.trytrellis.app/llms.txt)
- [Kubernetes Documentation](https://kubernetes.io/docs/home/)
- [Kubernetes Page content types](https://kubernetes.io/docs/contribute/style/page-content-types/)
- [Kubernetes Localization](https://kubernetes.io/docs/contribute/localization/)
- [GitLab Global navigation](https://docs.gitlab.com/development/documentation/site_architecture/global_nav/)
- [GitLab Documentation metadata](https://docs.gitlab.com/development/documentation/metadata/)
- [Docusaurus i18n](https://docusaurus.io/docs/i18n/introduction)
- [Docusaurus Search](https://docusaurus.io/docs/search)
- [VitePress Internationalization](https://vitepress.dev/guide/i18n)
- [VitePress Search](https://vitepress.dev/reference/default-theme-search)
- [Diátaxis](https://diataxis.fr/)
