# 提案

## Why

Pipeline Lite 已有双语 README 和一组按任务组织的 Markdown 使用手册，但还没有达到成熟开源开发者工具应有的正式文档产品水平。读者无法像使用 Trellis 文档站那样按章节连续阅读、跨页面搜索、在对应上下文切换语言，也没有一个稳定的在线文档地址。

同时，插件当前生成的 proposal、design、tasks、spec、ADR、实施计划和验证报告大量使用英文，与主要使用中文协作的项目习惯不一致，增加了阅读和复核成本。OpenSpec 又要求 `Why`、`What Changes`、`Capabilities`、`Impact` 等固定机器标题，因此需要明确区分“协议键保持兼容”和“人读正文默认中文”，不能简单翻译或硬编码全部标题。

## What Changes

- 建设独立的 VitePress 多页文档站，提供章节侧栏、页内目录、上下页、本地全文搜索、响应式布局、深浅主题和中英文对应路由。
- 提供安装、核心模型、工作流选择、default/simple/free/custom、OpenSpec 与证据、skills、hooks、Dashboard、自动化、loops、CLI、排障、安全、更新、贡献和发布等完整教程及参考资料。
- 使用仓库自有静态产物和最小权限 GitHub Actions 部署到 GitHub Pages，不发布本地控制面 API。
- 将根 `README.md` 作为 GitHub 仓库首页，并链接到在线文档；同时提供完整英文镜像。
- 新增版本化 Document Presentation Registry，将 proposal、design、tasks、delta spec、ADR、计划、验证报告和 applied spec 的结构与语言集中治理；新 Change 默认固定为 `zh-CN`。
- 让插件生成的第一方治理 Markdown 默认使用中文；显式英文 Change 保持英文一致性；OpenSpec 和其他机器协议键保持稳定英文。
- 增加自动化与真实浏览器门禁，覆盖中文可访问名称、导航层级、严格静态产物闭集、原子写入、symlink 边界、版本回滚兼容和官方 OpenSpec 生命周期。
- 发布 `llms.txt`，为 agent 提供受控、可校验的公开文档发现入口。

### 范围外

- 不把本地 Dashboard 控制面、写 API、SSE、agent 会话或宿主凭证暴露到公网。
- 不复制 Trellis 的品牌、文案、专有素材或源代码。
- 在仓库所有者启用 Pages 且真实部署成功前，不宣称一个已经可访问的公开 URL。
- 不破坏性翻译或重写历史归档证据；语言治理从当前 Change 和后续新生成文档开始。
- 不借文档改造改变无关的工作流语义或重做 Dashboard 其他操作视图。
- 不翻译 phase/event、document kind、producer、文件名、账本字段、frontmatter key、coverage 字段和 OpenSpec 操作词等机器协议标识。

### 验收信号

干净检出后可以构建独立的双语静态文档产物；GitHub Actions 能以最小权限部署该产物；文档站通过桌面端、移动端、键盘和无障碍验收；文档中的产品声明能由当前仓库事实支撑；GitHub 仓库首页自动展示中文根 `README.md` 并能进入在线文档；新建 Pipeline Change 时生成的治理文档默认全部为中文，simple/custom workflow 不会被错误注入 default 文档，历史 Change 与 Archive 的字节和摘要不被安装、更新或切换语言改写；官方 OpenSpec 能解析、验证、演练应用并完成无重复变更的归档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `open-source-documentation-experience`：把现有开源入口扩展为正式双语文档产品、GitHub Pages 交付、中文默认治理文档呈现及其安全、兼容和证据生命周期。

## Impact

- 影响文档 Registry、Kernel/CLI scaffold 与初始化链、phase skills、Loop/handoff 人读输出、VitePress 文档站、根 README、GitHub Pages workflow、发行资产和相应测试。
- OpenSpec 机器标题继续使用官方固定英文键，正文、提示、任务、ADR、计划和报告默认中文；该例外属于解析协议，不是英文文档回退。
- Verify 只在隔离临时副本演练 delta 应用；Ship 负责对主规格执行幂等应用并生成 receipt；Archive 在规格已应用后使用 `--skip-specs` 归档，避免重复应用。
