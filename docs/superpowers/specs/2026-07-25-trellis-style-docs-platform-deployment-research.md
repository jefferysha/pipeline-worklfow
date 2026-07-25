# Trellis 风格文档平台与部署方案研究

> 日期：2026-07-25  
> 研究范围：VitePress、Docusaurus、Astro Starlight、Mintlify、React/Vite 自建  
> 目标环境：Node.js 22、npm workspace、React/Vite、GitHub Pages project site  
> 证据边界：仅使用各项目官方文档、官方仓库、官方包信息与 GitHub 官方文档；评分和推荐属于基于这些证据及本仓约束的工程判断。

## 结论摘要

推荐采用 **VitePress 独立文档应用 + GitHub Pages 静态部署**，并保留现有 `docs/usage/` 作为公共文档唯一事实源，通过构建期同步或受控映射生成站点内容。

它不是视觉能力最强的方案，但最符合本仓当前边界：

- 当前 VitePress 文档要求 Node.js 22+，与本仓 Node 22 基线一致；它使用 Vite 构建，并输出纯静态站点。[VitePress Getting Started](https://vitepress.dev/guide/getting-started)、[What is VitePress?](https://vitepress.dev/guide/what-is-vitepress)
- GitHub Pages project site 的 `base: '/repository/'`、构建目录和官方 Actions 部署路径都有一等支持。[VitePress Deploy](https://vitepress.dev/guide/deploy)、[VitePress Site Config](https://vitepress.dev/reference/site-config)
- 默认主题内置基于 MiniSearch 的浏览器端全文搜索，不依赖 SaaS、服务端或社区插件，天然适合本地预览和离线静态站点。[VitePress Search](https://vitepress.dev/reference/default-theme-search)
- 内置多语言路由和多语言搜索配置；其能力不如 Starlight 的翻译回退完整，但已覆盖本项目第一版中英文站点的核心要求。[VitePress Internationalization](https://vitepress.dev/guide/i18n)
- VitePress 本身采用 MIT 许可，不绑定托管商。[VitePress Repository](https://github.com/vuejs/vitepress)

**Astro Starlight 是首选备选方案**：如果正式需求确认“翻译缺失自动回退”和大规模 Pagefind 索引比与本仓 Vite/Node 基线的直接契合更重要，应切换到 Starlight。

**不建议默认采用 Mintlify**。它最接近 Trellis 当前的文档创作和托管体验，但官方流程以 Mintlify 托管、GitHub App、账号和套餐为中心；离线导出及自托管位于 Enterprise 能力范围，不能把它当成一个无锁定的 GitHub Pages 静态生成器。[Mintlify Quickstart](https://www.mintlify.com/docs/quickstart)、[Mintlify Export](https://www.mintlify.com/docs/deploy/export)、[Mintlify Pricing](https://www.mintlify.com/pricing)

## 本仓约束与决策标准

### 已确认的本仓约束

- 根项目是 Node.js 22、npm workspace、ESM。
- 现有管理界面使用 React/Vite，但公共文档的主体是 Markdown，不需要强制复用 Dashboard 运行时。
- `docs/usage/` 已是公共使用文档的规范来源；`docs/adr/`、`docs/plans/`、`docs/superpowers/` 等包含内部决策与过程材料，不能默认全部发布。
- 已有文档链接与漂移检查。新站点必须接入这些门禁，而不是制造第二套可独立编辑的文档副本。
- 首选部署目标是 GitHub Pages project site，因此真实生产路径不是 `/`，而是 `/<repository>/`。
- 搜索必须能够在本地和纯静态托管中使用，不能以在线 SaaS 搜索作为基本可用性的前提。

### 评估权重

| 维度 | 权重 | 判定重点 |
| --- | ---: | --- |
| 静态部署与 project base path | 25% | GitHub Pages 官方路径、子路径资源和链接正确性、产物可审计 |
| i18n | 20% | 语言路由、导航/UI 翻译、缺失翻译处理、内容维护成本 |
| 本地/离线搜索 | 20% | 无服务端、无 SaaS、无登录时能否完成全文检索 |
| 本仓技术契合度 | 15% | Node 22、npm、Vite/React、Markdown 事实源和 workspace |
| 许可与托管锁定 | 10% | 开源许可、可迁移性、商业服务依赖 |
| 长期维护成本 | 10% | 升级面、插件数量、自建基础设施和内容同步复杂度 |

## Trellis 参考项目说明

Trellis 的产品仓库把文档站作为独立内容/站点边界处理，并指向单独的文档入口；其文档贡献说明要求维护 `docs.json`、MDX 内容和中英双语页面。[Trellis Repository](https://github.com/mindfold-ai/Trellis)、[Trellis Contribute to Docs](https://docs.trytrellis.app/contribute/docs)

这说明 Trellis 值得借鉴的是：

- 产品代码与文档发布边界分离；
- 文档配置、导航和内容都版本化；
- 中英文档具有明确的目录和同步规则；
- 合并到主分支后自动发布。

但这不能证明 Mintlify 是本仓最优方案。Trellis 的托管选择解决的是它自己的速度、协作和品牌目标；本仓还要求 GitHub Pages project base path、本地离线搜索、开源可自托管和最低锁定，决策权重不同。

## 方案对比

### 总表

| 方案 | GitHub Pages project base | i18n | 本地/离线搜索 | 默认构建产物 | 许可/锁定 | 维护成本 | 综合判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VitePress | 官方支持 `base` 和 Actions | 内置 locale；需自行定义翻译同步/根路由 | 内置 MiniSearch，纯浏览器端 | `docs/.vitepress/dist`（可配置） | MIT；无托管锁定 | 低 | **推荐默认方案** |
| Astro Starlight | Astro 官方支持 `site` + `base`；链接需正确处理前缀 | 内置语言选择、UI 翻译、RTL、缺失内容回退 | 默认 Pagefind，纯静态 | `dist` | MIT；无托管锁定 | 低至中 | **i18n/搜索优先时首选** |
| Docusaurus | 官方支持 `url` + `baseUrl` 和 Pages | 功能完整，但翻译目录和插件资源较多 | 官方首推 Algolia；本地搜索主要依赖社区插件 | `build` | MIT；无托管锁定 | 中至高 | React/版本化文档明确需要时选择 |
| Mintlify | 官方主路径是托管平台，不是 Pages project site | 支持多语言导航；缺失译文默认 404 | 本地预览完整搜索需登录；搜索服务在线化 | 托管发布；Enterprise 可导出包 | 内容可迁移，平台/组件/搜索/托管锁定高 | 表面低、迁移成本高 | 不作为默认开源部署方案 |
| React/Vite 自建 | Vite 官方支持 `base` 和 Actions | 全部自建 | 可集成 MiniSearch/Pagefind，但全部自建 | `dist` | Vite/MiniSearch/Pagefind 均可开源自托管 | **最高** | 仅品牌交互必须复用 React 时采用 |

### 加权评分

评分为 1–5 分，是工程决策估算，不是上游项目官方评级。

| 方案 | 部署 25% | i18n 20% | 搜索 20% | 契合 15% | 许可 10% | 维护 10% | 加权总分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| VitePress | 5.0 | 4.0 | 5.0 | 5.0 | 5.0 | 4.5 | **4.75** |
| Starlight | 4.5 | 5.0 | 5.0 | 4.0 | 5.0 | 4.0 | **4.63** |
| Docusaurus | 5.0 | 4.5 | 2.5 | 4.0 | 5.0 | 3.0 | **4.05** |
| React/Vite 自建 | 5.0 | 2.5 | 4.0 | 5.0 | 5.0 | 1.0 | **3.90** |
| Mintlify | 1.5 | 3.0 | 2.0 | 3.0 | 1.5 | 3.5 | **2.33** |

## 逐项研究

### 1. VitePress

#### 部署与构建

VitePress 官方部署文档明确支持 GitHub Pages。用户/组织站点使用 `/`，project site 使用 `base: '/repository/'`；官方示例通过 GitHub Actions 构建、上传并部署静态 artifact。默认构建输出为 `.vitepress/dist`，若文档根为 `docs`，则通常是 `docs/.vitepress/dist`。[VitePress Deploy](https://vitepress.dev/guide/deploy)

`base` 必须以 `/` 开头和结尾。主题资源和配置内 URL 可由 VitePress 自动补前缀，但内容中手写的绝对链接仍需要纳入 base-path 验收。[VitePress Site Config](https://vitepress.dev/reference/site-config)

#### i18n

VitePress 支持目录化 locale、各语言的 label/lang/link、主题级导航和侧栏配置，也支持为不同 locale 配置搜索文案和索引行为。[VitePress Internationalization](https://vitepress.dev/guide/i18n)

限制是：它提供路由和 UI 配置能力，但不提供 Starlight 那样明确的“页面翻译缺失时展示默认语言内容并提示未翻译”的完整内容回退。若所有语言都带路径前缀，根路径跳转也需要站点自行处理。

#### 搜索

默认主题内置 `provider: 'local'`，在浏览器中使用 MiniSearch 对预构建内容做模糊全文检索；无需 Algolia、服务端或账号。它还提供多语言搜索配置和内容转换钩子。[VitePress Default Theme Search](https://vitepress.dev/reference/default-theme-search)

#### 许可、版本与维护

VitePress 仓库采用 MIT 许可。[VitePress Repository](https://github.com/vuejs/vitepress)

需要注意一个版本风险：当前官网文档随主线演进并要求 Node.js 22+，而 npm 上稳定 `vitepress` 标签与仓库预发布线可能不同。[VitePress npm package](https://www.npmjs.com/package/vitepress) 因此实施时必须固定精确版本，并让 PoC 使用该版本对应的文档，不能只依据官网主线示例。

#### 对本仓的判断

它与本仓最契合，但“契合”指构建工具、Node 基线、Markdown 和静态发布契合，不代表要复用 React Dashboard 组件。文档站应保持独立轻量，避免把管理界面的运行时依赖带入公共文档。

### 2. Astro Starlight

#### 部署与构建

Starlight 是 Astro 的文档主题/集成。Astro 静态构建默认输出 `dist`，GitHub Pages 官方指南提供 Actions 部署，并要求 project site 配置 `site` 和 `base: '/repository'`。[Astro GitHub Pages Deploy](https://docs.astro.build/en/guides/deploy/github/)、[Astro Deploy](https://docs.astro.build/en/guides/deploy/)

Astro 官方特别提示：设置 `base` 后，应用内部页面链接也要包含该前缀。这使它比 VitePress 更需要严格的 base-path 链接测试。[Astro GitHub Pages Deploy](https://docs.astro.build/en/guides/deploy/github/)

当前 Astro 安装文档要求受支持的 Node.js 版本，并给出最低 22.12.0 的基线；这比本仓笼统的 `>=22` 更严格。[Astro Install and Setup](https://docs.astro.build/en/install-and-setup/) 若采用 Starlight，应把 docs workspace 的 engines 明确为 `>=22.12.0`，或验证锁定版本对 Node 22.0–22.11 的实际支持。

#### i18n

Starlight 内置语言选择器、locale 路由、导航和 UI 字符串翻译、RTL 支持。最有价值的差异是：可配置默认语言内容作为缺失译文的回退，并向读者显示该页尚未翻译的提示。[Starlight Internationalization](https://starlight.astro.build/guides/i18n/)

这能显著降低双语站点初期的“必须同时翻完才能发布”压力，也更适合逐页完善译文。

#### 搜索

Starlight 默认搜索由 Pagefind 提供，面向预渲染静态页面构建搜索索引。[Starlight Configuration](https://starlight.astro.build/reference/configuration/) Pagefind 是 MIT 许可的完全静态搜索库，不需要托管搜索基础设施。[Pagefind Repository](https://github.com/CloudCannon/pagefind)

相较把完整文档索引加载到浏览器内的轻量方案，Pagefind 更适合内容规模继续增长的站点。

#### 许可与维护

Starlight 仓库采用 MIT 许可。[Starlight Repository](https://github.com/withastro/starlight)

维护成本略高于 VitePress：多一层 Astro/Starlight 版本兼容，需要接受其内容集合和主题约定；但 i18n 回退和 Pagefind 都是内置路径，通常仍低于 Docusaurus 的插件组合或完全自建。

#### 对本仓的判断

如果双语缺失回退是上线硬要求，Starlight 的产品能力优于 VitePress。否则，为了减少新框架和 Node 小版本约束，VitePress 更稳妥。

### 3. Docusaurus

#### 部署与构建

Docusaurus 当前安装文档要求 Node.js 20+，支持 npm，并以 React 模板创建站点；生产构建输出到 `build`。[Docusaurus Installation](https://docusaurus.io/docs/installation)

官方部署文档明确支持 GitHub Pages，通过 `url` 和 `baseUrl: '/projectName/'` 配置 project site，并可通过 Actions 或部署分支发布。它还会生成 `.nojekyll`，避免 Jekyll 处理静态目录。[Docusaurus Deployment](https://docusaurus.io/docs/deployment)

#### i18n

Docusaurus 的 i18n 功能完整，可以分别翻译 docs、blog、pages 和 theme UI；翻译资源位于 `i18n/[locale]/...`，并通过 CLI 生成 JSON 资源。[Docusaurus i18n](https://docusaurus.io/docs/i18n/introduction)

优点是适合大型、版本化、多插件站点；代价是内容树、插件资源和 UI 翻译文件都需要同步维护。对于当前以 `docs/usage/` 为核心的中型文档集，这套结构偏重。

#### 搜索

Docusaurus 官方搜索文档把 Algolia DocSearch 作为主要集成，也列出 Typesense。离线/本地搜索主要通过社区插件实现，或者通过 swizzle 自定义 SearchBar，而不是官方内置的零配置本地全文索引。[Docusaurus Search](https://docusaurus.io/docs/search)

这不代表 Docusaurus 不能离线搜索，而是本仓必须额外承担第三方插件版本兼容、索引行为和安全维护。

#### 许可与维护

Docusaurus 软件采用 MIT 许可。[Docusaurus Repository](https://github.com/facebook/docusaurus)

它是五个方案中 React 复用能力最成熟的文档框架选项。如果将来明确需要文档版本化、博客、多产品文档或大量自定义 React 交互组件，额外复杂度可能合理；当前需求下并不划算。

### 4. Mintlify

#### Trellis 相似度

Mintlify 的内容模型、`docs.json`、MDX 组件、托管搜索和 GitHub 集成，与 Trellis 当前公开文档的贡献方式最接近。Mintlify 页面支持 MDX 和 React 组件，也可配置搜索关键词。[Mintlify Pages](https://mintlify.com/docs/pages)

因此，如果唯一目标是最快复制类似 Trellis 的托管编辑和视觉体验，Mintlify 是最直接的候选。

#### 部署与构建

Mintlify 官方快速开始流程要求创建账号、获得 `.mintlify.app` 站点，并安装 GitHub App；推送后由 Mintlify 自动部署。[Mintlify Quickstart](https://www.mintlify.com/docs/quickstart)

这与“在本仓 GitHub Actions 中生成静态 artifact，再部署到 GitHub Pages project path”不是同一种发布模型。官方文档没有给出把普通托管项目直接构建为 GitHub Pages project site 的标准路径。

Mintlify 提供离线导出，但官方说明该能力面向 Enterprise，导出包包含预渲染 HTML、`_next/static` 和运行脚本，且运行环境有独立 Node 要求。[Mintlify Export](https://www.mintlify.com/docs/deploy/export) 自托管也出现在 Enterprise 能力中。[Mintlify Pricing](https://www.mintlify.com/pricing)

#### i18n

Mintlify 支持按语言配置导航、语言标签和对应页面。但官方明确说明：如果某语言缺失对应页面，访问该路径会返回 404，不会自动回退到默认语言；内容同步需要团队自行维护。[Mintlify Internationalization](https://www.mintlify.com/docs/guides/internationalization)

#### 搜索与离线能力

本地 CLI 可以预览站点，但官方 CLI 文档说明，本地预览中启用搜索和 assistant 需要登录。[Mintlify CLI](https://www.mintlify.com/docs/cli) 其搜索 API 位于 Mintlify 服务端并使用 API key。[Mintlify Search API](https://www.mintlify.com/docs/api/assistant/search)

官方离线导出文档没有承诺托管搜索在完全断网的导出包中保持等价可用。因此在 PoC 证明前，不能把 Mintlify 计为满足“本地/离线全文搜索”。

#### 许可与锁定

Mintlify 官方文档内容仓库采用 MIT 许可，但这只能证明该内容仓库开放，不能证明 Mintlify 托管平台运行时整体开源。[Mintlify Docs Repository](https://github.com/mintlify/docs)

Markdown/MDX 正文具有一定可迁移性；但 `docs.json`、专有 MDX 组件、搜索、分析、assistant、部署和域名能力都形成平台依赖。对强调完整开源、自托管和 GitHub Pages 的本仓，不应把“内容文件在 Git”误判成“平台无锁定”。

### 5. React/Vite 自建

#### 可行性

Vite 官方静态部署指南支持 GitHub Pages，并要求 project site 设置 `base: '/repository/'`；默认生产构建输出 `dist`，官方示例使用 Actions 部署。[Vite Static Deploy](https://vite.dev/guide/static-deploy.html)

Vite、MiniSearch 和 Pagefind 都有开放许可，可组合出完全自托管的 React 文档站。[Vite Repository](https://github.com/vitejs/vite)、[MiniSearch Repository](https://github.com/lucaong/minisearch)、[Pagefind Repository](https://github.com/CloudCannon/pagefind)

#### 隐性成本

“使用现有 React/Vite”只省掉脚手架，不会自动获得成熟文档平台能力。团队仍需自行实现和长期维护：

- Markdown/MDX 编译、代码高亮和标题锚点；
- 文件路由、侧栏、面包屑、页内目录和上一页/下一页；
- i18n 路由、UI 翻译、缺失译文回退和 locale 切换；
- 搜索索引构建、分词、结果高亮和键盘交互；
- SEO metadata、sitemap、Open Graph、404 和重定向；
- 可访问性、移动端导航、暗色模式和打印样式；
- 外链/内链检查、base-path 兼容和内容版本化。

这些恰恰是 VitePress/Starlight 的核心价值。只有当文档需要大量复用当前 Dashboard 的业务组件，或视觉交互要求超出成熟主题可扩展范围时，自建才值得。

## 推荐目标架构

### 仓库结构

建议新增独立 npm workspace，而不是把文档站塞进现有 Dashboard：

```text
pipeline-worklfow/
├── docs/
│   ├── usage/                    # 公共内容唯一事实源
│   ├── adr/                      # 内部材料，不发布
│   ├── plans/                    # 内部材料，不发布
│   └── superpowers/              # 内部材料，不发布
├── docs-site/
│   ├── package.json              # 固定 VitePress 精确版本
│   ├── .vitepress/
│   │   ├── config.mts
│   │   └── theme/
│   ├── public/
│   └── .generated/               # 构建期生成，禁止人工编辑
└── package.json                  # npm workspace 与统一 docs scripts
```

不要复制一套可人工编辑的 `docs-site/content/`。推荐由确定性脚本在构建前把 `docs/usage/` 映射到 `.generated/`，补充站点 frontmatter、locale 导航和首页；CI 运行后必须保持 Git 工作区无漂移。这样可以同时做到：

- `docs/usage/` 继续服务仓库读者和现有检查；
- 站点只发布明确白名单内容；
- 内部 ADR、计划、研究和流水线证据不会意外公开；
- 生成站点所需的额外元数据不会污染规范正文。

若 VitePress PoC 证明可以直接以 `docs/usage/` 为内容根并安全排除全部内部目录，可去掉生成层；在验证前不应依赖复杂的跨目录隐式配置。

### 路由与 i18n

第一版建议：

```text
/pipeline-worklfow/              # 默认语言首页
/pipeline-worklfow/guide/...     # 默认语言文档
/pipeline-worklfow/en/...        # 第二语言文档
```

默认语言应由产品受众决定，不能仅按当前 README 的内容量决定。无论选中文还是英文为根语言，都应：

- 为每个 locale 独立生成导航和侧栏；
- 在页面 frontmatter 或清单中记录翻译对应关系；
- CI 检查孤立翻译、重复 slug 和断链；
- 允许未翻译页面暂时只存在于默认语言，但语言切换器必须给出明确状态，不能跳到 404；
- 不要求营销文案逐字同构，但 CLI 命令、配置字段和行为说明必须保持语义一致。

### 搜索

第一版采用 VitePress 内置 local search：

- 不引入 Algolia、搜索后端或外部账号；
- 构建时生成索引，浏览器端检索；
- 按 locale 配置搜索文案和索引；
- 排除内部内容、生成页和无价值锚点；
- 用真实 GitHub Pages base path 验证索引资源加载。

当公共文档规模或搜索包体达到预设阈值后，再评估切换 Starlight/Pagefind，避免过早为假设规模引入第二套搜索系统。

### GitHub Pages 部署

目标构建流程：

```text
npm ci
→ npm run docs:sync
→ npm run docs:check
→ npm run docs:build
→ npm run docs:smoke -- --base=/pipeline-worklfow/
→ upload-pages-artifact
→ deploy-pages
```

关键配置：

- `base` 使用真实仓库名 `'/pipeline-worklfow/'`；本仓名称中的 `worklfow` 拼写必须按远程仓库真实路径处理，不能擅自纠正。
- Pages workflow 使用最小 `pages: write` 和 `id-token: write` 权限。
- PR 只构建和测试，不部署生产。
- 主分支成功后部署；生产 environment 由 GitHub Pages 管理。
- 自定义域名启用后再评估把 `base` 切换为 `/`，不能让两种部署路径共享未经验证的配置。

GitHub 官方说明可以使用自定义 Actions workflow 构建并发布 Pages artifact。[GitHub Pages Custom Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### 质量门禁

站点进入主分支前至少通过：

1. 固定 Node/npm 环境下的 clean install 和生产构建；
2. 现有 `docs/usage/` 链接与漂移检查；
3. 站点生成后 Git 工作区无未提交变化；
4. 以 `/pipeline-worklfow/` 为前缀的 HTML、CSS、JS、图片和字体加载测试；
5. 两个 locale 的首页、导航、侧栏、语言切换和 404 测试；
6. 离线模式下的全文搜索测试；
7. 禁止发布路径扫描，确保 ADR、plans、superpowers 和 pipeline receipts 不在 artifact 中；
8. artifact 文件清单和大小阈值检查；
9. Playwright/真实浏览器的桌面、移动端、键盘和暗色模式验收；
10. 依赖许可和高危漏洞检查。

## 分阶段实施建议

### Phase 1：框架 PoC

- 固定 VitePress 精确版本；
- 仅接入 5–10 篇代表性文档；
- 配置真实 project base path；
- 验证中英文路由、local search、代码块、图片和内部链接；
- 记录生产 artifact 的大小和搜索索引大小。

### Phase 2：事实源与信息架构

- 定义 `docs/usage/` 到站点路由的显式清单；
- 增加确定性同步器和禁止编辑生成目录的检查；
- 完成首页、快速开始、安装、workflow、CLI、UI、排障和贡献指南导航；
- 定义 locale 对应关系和缺失翻译政策。

### Phase 3：CI/CD 与验收

- 增加 Pages build/deploy workflow；
- 增加 base-path、离线搜索和禁止发布路径测试；
- 在临时 Pages 环境或等价子路径服务器做真实浏览器验收；
- 只有 artifact 内容审计通过后才启用主分支生产部署。

### Phase 4：视觉增强

- 以 Trellis 的清晰信息架构和产品化呈现为参考，而不是复制其专有组件；
- 优先做品牌 token、首页 hero、功能卡片、流程图和命令示例；
- 保持正文使用标准 Markdown/VitePress 能力，减少难迁移的自定义组件；
- 只有经用户验证的高价值交互才进入自定义主题。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| VitePress 官网主线与 npm 稳定版能力漂移 | 配置按错误版本实现 | 固定精确版本；PoC 引用对应版本文档；Renovate/Dependabot 单独升级 |
| project base path 下出现绝对链接 | Pages 生产 404 | 子路径服务器和 HTML/asset 扫描纳入 CI |
| `docs/usage/` 与站点内容形成双源 | 文档互相矛盾 | 只允许生成目录；构建后零漂移检查 |
| 内部文档被意外发布 | 泄露过程信息或不稳定设计 | 内容白名单；artifact 禁止路径扫描 |
| 双语内容不同步 | 用户看到过期说明或 404 | 翻译映射清单、locale parity 检查、明确 fallback |
| local search 随内容增长变重 | 首屏或检索性能下降 | 记录索引预算；超过阈值时评估 Starlight/Pagefind |
| 自定义主题过度 | 升级困难、迁移成本上升 | 使用设计 token 和浅层扩展；正文避免专有 MDX |

## 开放问题

1. 公共站默认语言应是中文还是英文？这决定根路由、SEO canonical、语言切换和翻译回退策略。
2. `docs/usage/` 是否必须继续保持当前目录为唯一事实源，还是允许将公共正文迁入独立 `docs-site/` 后由根目录生成兼容入口？
3. GitHub Pages 的真实仓库 slug 是否确定为 `pipeline-worklfow`，以及近期是否计划启用自定义域名？
4. 第一版是否需要文档版本化、博客或大量可执行 React 组件？若需要，Docusaurus/自建的权重会显著上升。
5. 可接受的搜索 artifact 体积和离线加载预算是多少？这决定 MiniSearch 何时需要升级为 Pagefind。

## 最终建议

采用以下决策：

1. **选择 VitePress** 作为正式开源文档站生成器；
2. **独立 `docs-site` workspace**，不与现有 Dashboard 共用生产入口或构建产物；
3. **保留 `docs/usage/` 为唯一事实源**，使用白名单和确定性生成层；
4. **使用内置 local search**，第一版不依赖 Algolia/Mintlify 搜索；
5. **使用 GitHub Pages Actions**，以真实 `'/pipeline-worklfow/'` 做全链路验收；
6. **把 Starlight 保留为架构升级点**：当缺失翻译回退或大规模 Pagefind 成为硬要求时再切换；
7. **不默认采用 Mintlify**：可以借鉴 Trellis 的信息架构和视觉体验，但不接受 Enterprise 自托管、托管搜索和平台组件带来的锁定；
8. **不自建完整 React 文档框架**，除非先证明成熟文档框架无法满足必须的交互需求。

这条路线提供了接近 Trellis 的产品化文档体验，同时保留 GitHub Pages、静态 artifact、离线搜索、开源许可和可迁移内容的工程控制权。
