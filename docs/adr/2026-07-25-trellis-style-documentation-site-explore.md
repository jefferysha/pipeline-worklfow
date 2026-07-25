# ADR：正式文档站与中文治理文档采用双层架构

> 日期：2026-07-25  
> 状态：已接受  
> Change：`trellis-style-documentation-site`

## 背景

Pipeline Lite 已有 README、英文 usage guide 和本地 Dashboard Overview，但缺少可搜索、可深链、可部署的正式公共文档站。插件生成的治理文档同时存在英文和中英混排，其根因分散在 Kernel scaffold、CLI scaffold 和 phase Skills，无法通过单点翻译可靠修复。

本项目还必须保护 document contract、ledger、digest、read receipt、simple/custom workflow 边界和历史 Archive。语言能力不能改变这些治理协议。

## 决策

采用两个相互独立、通过真实产品术语连接的层：

1. 使用独立 VitePress workspace 建设中文根路由、英文 `/en/` 完整镜像的静态文档站；使用本地搜索和 GitHub Pages project site 部署。
2. 新增版本化 Document Presentation Registry，统一治理文档的稳定章节结构和 `zh-CN`/`en` 展示文案；新 Change 默认固定 `zh-CN`。

document contract/ledger 继续作为治理真相源，Registry 只负责呈现。renderer 只创建缺失文件；已有 Change、Archive 和已登记 digest 不自动翻译或改写。协议 token、文件名和 OpenSpec 操作词保持英文稳定值。

## 备选方案

### Astro Starlight

i18n 回退和 Pagefind 更强，但引入新的内容模型和 Node 小版本边界；当前规模下收益不足。保留为文档规模增长后的升级点。

### Docusaurus

版本化和 React 生态成熟，但第一版不需要多版本、博客或复杂 React 组件，本地搜索还需要额外集成。

### Mintlify

最接近 Trellis 的托管体验，但不符合 GitHub Pages、离线搜索、开源可自托管和低锁定目标。

### 继续使用 Markdown 或公开 Dashboard

纯仓库 Markdown 缺少完整导航、搜索和部署体验；Dashboard 依赖本地 API/SSE，公开会混淆并扩大控制面。

### 只翻译现有硬编码

无法覆盖所有 Skill 产物，也不能提供 locale parity、版本或历史兼容保证。

## 后果

### 正面

- 公共文档拥有成熟导航、搜索、多语言和 Pages 部署能力；
- 中文生成从会话偏好变成确定、可测试的产品行为；
- simple/custom 与 default 文档链继续隔离；
- 历史证据和 ledger schema 保持兼容；
- 内容和站点无托管锁定，可在任意静态主机迁移。

### 负面

- 需要维护 Registry schema、双语 catalog、golden 和内容 manifest；
- 英文完整镜像增加内容维护成本；
- VitePress 不直接解决多版本文档，未来若成为硬需求需重新评估；
- GitHub Pages 真实上线仍依赖仓库设置和一次成功部署，代码合并本身不等于已发布。

### 约束

- 不把 locale 放入 document contract v1 或 ledger v1；
- 不从 Dashboard `localStorage` 隐式推断 CLI locale；
- 不在 setup/update 时改写项目内既有文档；
- 不发布 `docs/adr`、`docs/superpowers`、receipts 或本地控制面；
- 不在真实部署成功前宣称线上 URL。
