# Pipeline Lite 正式文档站与中文文档生成体系设计

> 日期：2026-07-25  
> Change：`trellis-style-documentation-site`  
> 阶段：Explore  
> 状态：推荐方案已确定

## 目标

把当前分散的 README、usage guide、Dashboard Overview 和治理文档模板，升级为两个边界清楚、可独立验证的产品面：

1. 一个类似成熟开源项目文档产品的中文优先、英文完整镜像静态站点；
2. 一个由版本化 Registry 统一驱动的中文治理文档生成体系。

公开站点负责学习、查阅和传播；治理文档负责 Change 内的计划、证据和审计。两者共享真实产品术语，但不共享运行时、权限或发布边界。

## 用户结果

新用户从 GitHub 仓库首页可以：

- 判断 Pipeline Lite 解决什么问题；
- 用 `pipeline setup --codex` 或对应宿主命令完成安装；
- 在五分钟内完成第一个任务；
- 理解 default、simple、free 和 custom workflow 的边界；
- 搜索 review gate、OpenSpec、Skill、端口、更新和故障处理；
- 在相同页面上下文切换中文与英文；
- 确认文档中的行为来自当前代码和测试，而不是营销推断。

维护者可以：

- 用单一内容清单控制公开范围；
- 在 PR 中发现断链、语言缺页、错误 base path、内部资料泄露和产品声明漂移；
- 让新 Change 的 proposal、design、tasks、spec、ADR、plan、report 和 applied spec 默认使用中文；
- 保留历史文档、ledger、digest 和 read receipt 的审计完整性。

## 事实与假设

### 已验证事实

- 现有 `docs/usage/` 是英文任务手册，没有完整中文镜像。
- 根 README 目前英文为主，另有独立中文文件。
- Dashboard Overview 是本地控制面的一部分，依赖本地 API/SSE，不能直接作为公共文档站。
- Kernel 至少有两套独立文档 scaffold；phase Skills 还各自内嵌章节结构。
- document contract/ledger 只治理 kind、path、producer、digest 和 read receipt，并不提供 locale。
- simple workflow 没有 default 的 OpenSpec 文档链；custom workflow 只治理自己声明的 document contract。
- GitHub Pages project site 需要使用真实仓库名 `/pipeline-worklfow/` 作为 base。
- VitePress 支持静态 Pages 部署、目录化 i18n 和无 SaaS 的本地搜索。

### 本 Change 采用的假设

- 首版只维护当前主线，不做多版本文档和博客。
- GitHub Pages 是默认公共部署目标；自定义域名以后单独决策。
- 中文读者是默认受众，英文必须完整但位于 `/en/`。
- 搜索应完全静态、无账号、无外部遥测。
- Registry 首版覆盖完整 default 文档链；simple/custom 仍以自己的合同为准。

## 三种架构方案

### 方案 A：VitePress + Document Presentation Registry

独立 `docs-site` workspace 使用 VitePress；公共 Markdown 由 manifest 白名单同步。Kernel 和 Skills 统一消费版本化 Registry，Change 固定 locale。

优点：

- 与 Node 22、npm workspace、Vite 和 Markdown 直接契合；
- 本地搜索、i18n、侧栏、页内目录和 Pages base 均有成熟能力；
- 文档内容、治理模板和协议层边界明确；
- 无托管锁定，静态产物可审计。

代价：

- 需要建设双语 parity、同步器、Registry schema 和 golden 测试；
- VitePress 原生不负责多版本文档和复杂翻译回退。

### 方案 B：Astro Starlight + 独立翻译模板

用 Starlight 的 i18n 回退和 Pagefind 构建站点，但治理文档仍通过各 Skill 模板维护。

优点：

- 缺失翻译回退和大规模静态搜索更强；
- 文档站能力成熟。

代价：

- 引入 Astro 内容模型与更严格的 Node 小版本边界；
- 没有解决插件内部生成语言分散的根因；
- 站点与治理文档仍有两套翻译架构。

### 方案 C：Mintlify/Trellis 路线或 React 自建

Mintlify 能最快获得类似 Trellis 的托管体验；React 自建能最大化视觉自由。

优点：

- Mintlify 产品化程度高；
- React 自建可完全控制交互。

代价：

- Mintlify 的托管、搜索、组件和导出能力形成平台锁定；
- React 自建必须长期维护文档路由、搜索、i18n、SEO、无障碍和升级；
- 两者都不能自动解决治理文档的 locale 真相源问题。

## 选择

采用方案 A。它以最低长期锁定同时解决“公共文档产品”和“插件生成语言”两个根因。Starlight 只在内容规模或翻译缺失回退成为硬需求时重新评估。

## 总体架构

```text
                     ┌─────────────────────────────┐
                     │   Document Contract/Ledger  │
                     │ kind/path/producer/hash/read│
                     └──────────────┬──────────────┘
                                    │ 决定需要什么
                                    ▼
┌──────────────────────┐   ┌────────────────────────────┐
│ Change documentLocale│──▶│ Document Presentation      │
│ default: zh-CN       │   │ Registry + locale catalogs │
└──────────────────────┘   └──────────────┬─────────────┘
                                          │ 只渲染缺失结构
                                          ▼
                               ┌────────────────────────┐
                               │ Real phase Skill       │
                               │ fills meaningful body  │
                               └───────────┬────────────┘
                                           ▼
                                 record/read/review

┌──────────────────────────┐   manifest/sync   ┌─────────────────────┐
│ zh-CN canonical content │──────────────────▶│ VitePress docs-site │
│ en complete mirror       │                  │ local search/i18n   │
└──────────────────────────┘                  └──────────┬──────────┘
                                                        ▼
                                              GitHub Pages artifact
```

## Registry 设计

Registry 由稳定语义和 locale 文案两部分组成：

```text
templates/documents/
├── registry.v1.yaml
├── schemas/registry.v1.schema.json
└── locales/
    ├── zh-CN.yaml
    └── en.yaml
```

稳定层只允许：

- template id；
- DocumentKind；
- 路径模式；
- section key 与顺序；
- placeholder；
- 动态数据来源；
- missing-only 创建策略。

locale 层只允许：

- 可见标题；
- 说明与 TODO 提示；
- workflow label 的展示；
- 示例的叙述文字。

两种 locale 必须有完全相同的 template、section 和 placeholder key。locale 文件不得覆盖协议路径、kind、phase/event、producer、metadata key 或 marker。

## Locale 解析

优先级：

1. CLI 显式参数；
2. 项目级 `documents.locale`；
3. 用户级 Pipeline 配置；
4. 明确接入的宿主语言信号；
5. 产品默认 `zh-CN`。

解析结果在创建 Change 时先原子固定到 `.pipeline-document-locale.json`。该不可变 sidecar 不进入严格 canonical schema，旧 release 回滚时可以安全忽略。Dashboard 的 `localStorage` 语言只是浏览器展示偏好，不能隐式改变 CLI 或 Kernel。

sidecar 是初始化保留位：同 locale 的崩溃重试可以继续，不同 locale fail-loud；canonical current 不得先于 sidecar 提交。没有 sidecar 的历史 Change 从一致的 proposal/design/tasks H1 推断一次，混合语言拒绝自动选择。

## 文档类型覆盖

首版 Registry 覆盖：

- proposal；
- openspec design；
- tasks；
- Superpowers design；
- ADR；
- delta spec 骨架；
- Superpowers plan；
- implementation plan；
- verification report；
- applied spec。

OpenSpec 操作词、frontmatter key、coverage block 和 producer id 继续使用英文稳定 token。中文只覆盖读者叙述层。

## 公开站点结构

```text
docs-site/
├── package.json
├── .vitepress/
│   ├── config.mts
│   └── theme/
├── public/
│   ├── llms.txt
│   └── brand assets
└── .generated/
    ├── index.md
    ├── start/
    ├── tutorials/
    ├── guides/
    ├── concepts/
    ├── reference/
    ├── operations/
    ├── contributing/
    ├── releases/
    └── en/
```

`.generated/` 只能由同步器写入。公开内容 manifest 明确列出 source、locale、slug、title、description、content type 和导航位置。内部目录不参与 glob，避免配置错误把过程资料发布出去。公开指南可以提及治理目录的名字，但不能复制其未登记文件内容。

## 视觉方向

借鉴 Trellis 的渐进披露、稳定搜索入口、左侧全局导航和右侧页内目录，但使用 Pipeline Lite 自有品牌：

- 高对比中性底色与绿色/青色流程强调色；
- 首页用真实状态机、执行模式和命令示例建立产品心智；
- 卡片只用于路径选择和可比较能力，不把正文切成营销碎片；
- 代码块、提示、危险告警和状态 badge 使用一致 token；
- 动效只用于菜单、搜索和主题切换，尊重 reduced motion；
- 不复制 Trellis 的图形、命名、文案或专有组件。

## 导航与内容深度

一级导航按用户意图：

1. 开始使用；
2. 教程；
3. 操作指南；
4. 概念与架构；
5. 参考；
6. 运维与安全；
7. 贡献；
8. 发布说明。

每页只选择一个主要内容类型：

- 教程：连续完成一个目标；
- 操作指南：解决一个具体任务；
- 概念：解释模型、不变量和边界；
- 参考：提供精确接口、字段、默认值与错误语义。

这能避免“一个页面同时解释架构、教安装、罗列全部 CLI”的混合长页。

## 搜索

第一版使用 VitePress local search：

- 当前 locale 独立索引；
- `Cmd/Ctrl+K` 与移动端可见入口；
- 标题权重大于章节，章节大于正文；
- 命令、错误码、配置键和文件路径支持精确命中；
- 结果显示页面、章节和摘录；
- 草稿、重定向和重复生成页不入索引；
- 固定查询集验证安装、更新、review gate、verify-fail、端口和常见配置键。

## GitHub Pages

Pages workflow 使用官方 artifact 部署模型：

- PR：install、sync、check、build、smoke，不 deploy；
- 仅非 PR 且 `github.ref == 'refs/heads/main'`：相同验证通过后 upload artifact 和 deploy；手动运行 feature branch 只构建；
- 权限：`contents: read`、`pages: write`、`id-token: write`；
- environment：`github-pages`；
- concurrency：同一环境只保留最新部署；
- base：`/pipeline-worklfow/`；
- 输出：仅静态站点，不含 server、Dashboard API 或 receipts。

## README

根 README 改为中文默认，内容保持开源首页而不是完整手册：

- 一句话定位；
- 当前能力与适用边界；
- 安装和宿主选择；
- 五分钟快速开始；
- workflow 模式；
- 架构概览；
- 正式文档入口；
- 贡献、行为准则、安全和许可证。

英文完整稿使用 `README.en.md`，两者由检查器验证关键命令和链接一致。GitHub 自动渲染根 README，因此不需要额外设置“仓库首页”。

## 测试策略

1. Registry schema、locale parity、禁止翻译 token；
2. renderer 的 zh-CN/en golden、确定性、UTF-8、missing-only、原子发布、父路径 symlink 拒绝和并发；
3. default/simple/custom init 矩阵；
4. 所有 phase 文档同一 Change locale 的端到端证据链；
5. 历史 ledger/Change/Archive 不变；
6. 公共 manifest、双语 slug、链接和孤儿页检查；
7. `/pipeline-worklfow/` base 下的 asset、导航、搜索和 404；
8. artifact 禁止路径和大小预算；
9. 桌面、移动端、键盘、深浅色、语言切换和 reduced motion 浏览器验收；
10. clean install、bundle、setup/update 后模板资源完整且不改项目历史。

## 风险控制

| 风险 | 控制 |
| --- | --- |
| 双语内容漂移 | manifest 对应关系、关键命令抽取、slug/parity CI |
| 英文 scaffold 回归 | Registry golden + init/scaffold/Skill 端到端测试 |
| 历史证据被翻译 | missing-only、archive immutability、digest 回归测试 |
| custom 被套 default 文档 | document contract 能力判断矩阵 |
| Pages 子路径 404 | 子路径静态服务器与浏览器 smoke |
| 内部材料泄露 | 白名单同步器与 artifact 禁止路径扫描 |
| 搜索包体增长 | 索引与总 artifact 预算；超阈值评估 Pagefind |
| 框架升级困难 | 精确固定版本、浅层主题、自定义组件最小化 |

## 决策记录

- 默认语言：中文；
- 英文策略：完整镜像；
- 框架：VitePress；
- 搜索：本地；
- 部署：GitHub Pages project site；
- 文档版本：当前主线；
- locale 固定：Change 独立不可变 sidecar；
- 协议字段：不翻译；
- 历史内容：不自动改写；
- Dashboard：不公开部署；
- agent 入口：首版提供 `llms.txt`。

```coverage
touches:
L1_api: waived -> 静态站不新增运行时 API；Registry 经现有应用边界消费
L2_data: waived -> 无数据库，仅新增版本化模板和 Change 不可变 locale sidecar
L3_rules: filled -> #Registry 设计
L4_state: filled -> #Locale 解析
L5_errors: filled -> #风险控制
L6_security: filled -> #GitHub Pages
L7_perf: filled -> #搜索
L8_deps: filled -> #三种架构方案
L10_terms: filled -> #文档类型覆盖
```

## 第二轮 Verify 后的强制修订

第二轮独立审查将以下内容提升为架构不变量：

- OpenSpec delta 必须 strict validate，并在临时副本中成功完成 archive/apply 演练；
- Registry、schema、locale catalog、生成 TypeScript 和 renderer 共享同一 section 图；
- 所有 Markdown 写入口在 locale pin、mkdir、write、link、rename 或 remove 前验证可信项目根和全路径无 symlink；
- Pages artifact 采用闭集 allowlist，未知文件或扩展同样被拒绝；
- 中文公开页覆盖正文与可访问 UI，包含 breadcrumb、landmark、permalink、复制、搜索、移动导航和语言 fragment；
- custom label、显式英文 Change 和历史受管段的既有语言优先于默认中文。

## 第三轮 Verify 后的强制修订

- `pipeline init` 把 Change 根本身视为不可信输入：如果目标或任一父级是 symlink，必须在 locale pin、
  mkdir、canonical/YAML 或文档写入前失败，且仓库外零副作用；
- OpenSpec proposal 保留官方 `Why`、`What Changes`、`Capabilities`、`Impact` 机器标题，正文默认中文；
  门禁同时运行官方 `show`、strict validate 与隔离副本 apply/archive；
- Verify 只做隔离演练，Ship 是主规格唯一的幂等应用边界并生成 receipt，Archive 在已应用后
  `--skip-specs`，三阶段不得重复应用 delta；
- artifact 允许集合从 manifest 与构建声明精确推导，不能把 `assets/**/*.{js,css,woff2}` 当作白名单；
- 中文可访问层覆盖全部导航、分页、搜索关闭/详情和键盘提示，breadcrumb 包含内容分组，首页主 landmark
  不包裹全局 header/nav/footer；
- overwrite 采用同目录事务暂存与可恢复提交，竞争或故障不能留下部分文件集；
- 显式英文 Skill 指令端到端一致；使用真实 N-1 bundle 验证回滚读取；
- Registry codegen 同时生成 CLI 所需的 kind/path/label 投影，删除并行硬编码映射。

## 第五轮 Verify 后的强制修订

- 全新且未绑定的 host session 对通用“继续执行”采取 fail-closed，不再借仓库级
  `.pipeline-active` 恢复无关 Change；显式点名仍是最高优先级；
- 新 Change 的 canonical state、YAML、locale、governance、ledger 与 default OpenSpec 骨架全部
  在私有 sibling 中构建；同名初始化先用名称锁串行化，最终名称用原子 `mkdir` 独占，文件用
  hard-link no-replace 发布，canonical `current.json` 最后成为官方读取提交点，空目录竞态也
  不能被静默替换；
- overwrite scaffold 的事务边界提升为项目根直接子级的完整顶层 envelope；回滚目标被未知内容
  占用时保留 receipt/stage/backup 并拒绝覆盖；
- Registry codegen 携带可解释 layout，renderer 不再按 template id 维护第二套 section 图；
- CI 从固定 Git commit 提取逐字节校验的真实 N-1 已发布 CLI，并记录 release id、插件版本与读取结果；
- 404 在客户端运行时提供中英文语义化 `<main>`、正确 project base 返回路径，并纳入真实浏览器验收。

## 第六轮 Verify 后的强制修订

- 顶层 overwrite envelope 使用内容摘要与目录身份的两次 CAS：复制后的 stage 必须等于初始快照，
  original 移入 backup 后必须仍匹配同一快照；任何 sibling Change 更新或父目录替换都回滚并
  fail-loud，禁止整体替换覆盖并发状态；
- 初始化提交点出现普通目录或 symlink 都视为竞争方获胜，候选只清理自己的私有目录，不主动
  unlink 或替换未知目录项；
- N-1 门禁从固定 commit 重建发行闭集声明的完整 payload，并从其中的真实 CLI 路径执行跨版本读取，
  不再把孤立 bundle 文件伪装成可运行 release；
- 对早期 Verify 已写主规格的历史偏差建立独立迁移审计：以固定 Git base、显式机器标题规范化和
  官方 OpenSpec archive 重建期望主规格。Verify 只校验 receipt 与 CAS 摘要；Ship 才执行原子
  reconciliation 并生成正式 `applied-spec.md`，Archive 继续 `--skip-specs`。

## 第七轮 Verify 后的强制修订

- overwrite 不再移动顶层 envelope。事务所有权收窄到目标 `specDirectory`，sibling Change 和其他目录
  永远留在原命名空间；目标目录继续使用同文件系统 stage/backup、持久 receipt、可信父路径身份和恢复。
- 主规格 migration 必须成为 Ship 的可执行 guard：在受管锁内验证 observed digest、原子发布 expected
  bytes、复核 after digest并返回结构化 changed/no-op；说明性 `shipPolicy` 不能替代执行证据。
- Skill receipt 同时支持数值 exit code 与真实 Codex 内容块完成态；`Script completed` 成功、
  `Script failed` 失败，混合或未知形状 fail-closed。
- Dashboard 阶段画布首次加载或 phase 改变时自动将 current stage 定位到横向可视区，用户不需要先
  横向滚动才能确认任务正在运行。
