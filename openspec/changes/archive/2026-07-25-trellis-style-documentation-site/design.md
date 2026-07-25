# 设计

## 已确认方向

本 Change 建设独立的纯静态 VitePress 文档站，不发布现有 Dashboard。文档站与本地 server、`/api`、SSE、token、工作区文件系统和 agent 会话完全解耦，产物可以在 GitHub Pages project site 的 `/pipeline-worklfow/` 子路径独立运行。

公开文档采用中文优先策略：

- 根路由和仓库根 `README.md` 使用中文；
- `/en/` 提供结构、命令和行为说明完整对应的英文镜像；
- 两种语言共享稳定 slug、导航清单和自动 parity 检查；
- 命令、文件路径、配置字段和代码标识符保持原样；
- 第一版只描述当前主线，不引入文档版本化、博客或外部搜索服务。

插件治理文档采用“治理合同与呈现模板分离”的架构：

- document contract/ledger 继续决定文档 kind、owner、producer、path、digest 和 read receipt；
- 新增版本化 Document Presentation Registry，决定稳定 section key、可见标题、提示和 locale 文案；
- 新 Change 创建时先以不可变 `.pipeline-document-locale.json` sidecar 固定 locale，默认 `zh-CN`；
- renderer 只创建缺失文件，不能覆盖、翻译或重哈希既有 Change/Archive；
- simple/custom workflow 只根据自己的 document contract 生成文档，不能继承 default 的七阶段文档集合。

首轮 Verify 证明 locale 不能作为可选字段加入严格 canonical schema：旧 release 会因未知字段拒绝回滚读取。sidecar 在 canonical current 提交前原子 no-replace 发布，既作为初始化保留位，又允许旧 release 安全忽略。

## 研究依据

Explore 使用三个相互独立的研究面：

1. Trellis、Kubernetes、GitLab、Diátaxis、VitePress 与 Docusaurus的信息架构和本地化模式；
2. VitePress、Starlight、Docusaurus、Mintlify 和 React/Vite 自建方案的部署、i18n、搜索、许可与维护成本；
3. 本仓 README、usage guide、Dashboard、Kernel scaffold、Skills、hooks、CLI、document contract、测试和发行资产的真实调用链。

研究表明，现有英文/混排问题不是单点漏翻译，而是 Kernel 两套硬编码 scaffold、Skills 内嵌章节模板和多个独立 i18n 面共同造成的系统性问题。只把 `# Proposal` 改成中文会留下其他入口并继续产生漂移。

## 关键业务规则

1. 中文是新生成治理文档和公开站点的默认语言；英文是公开站点的完整镜像，不是残缺回退。
2. `open`、`explore`、event id、DocumentKind、producer、账本字段、文件名、frontmatter key、`coverage` 字段和 OpenSpec 的 `ADDED/MODIFIED/REMOVED Requirements` 等协议 token 不翻译。
3. Registry 只能控制展示结构和默认提示，不能伪造 Skill 已执行、文档已登记、文档已读取或 review 已通过。
4. locale 只影响新建内容；自动更新、setup 和全局 locale 切换不得改写既有 Change 或 Archive。
5. `tasks.md` 的可见阶段标题来自实际 workflow 的 label/id；custom workflow 不套用 default 七阶段表。
6. 公开站点只发布显式白名单内容。`docs/adr/`、`docs/superpowers/`、pipeline receipts 和本地控制面资料默认排除。
7. GitHub Pages workflow 只在 `main` 构建成功后部署，使用最小 `pages: write` 与 `id-token: write` 权限；PR 只验证不发布。
8. 未完成真实 Pages 发布前，README 和站点不能宣称一个已上线 URL。
9. `delta-spec` scaffold 必须显式取得真实 capability；所有 document scaffold 在创建目录前逐级拒绝 symlink，并以原子 no-replace 发布目标文件。
10. Registry/locale YAML 是呈现真相源，运行时 TypeScript 由生成器确定性产生；检查器必须拒绝生成结果漂移。

## 内容生命周期与发布状态

### 治理文档

```text
解析项目/用户默认 locale
        ↓
原子固定 locale sidecar
        ↓
document contract 选择必需 kind
        ↓
Registry + locale 字典渲染缺失骨架
        ↓
真实 Skill 填写正文
        ↓
document record → read receipt → review → transition
```

- locale 固定后，中途修改全局设置只影响以后创建的 Change。
- 旧 Change 没有 locale sidecar 时，从 proposal/design/tasks 的一致 H1 推断并固定；混合语言必须 fail-loud。
- 显式翻译现有活跃 Change 属于单独操作，必须重新登记 digest，并重新取得后续 read receipt。
- Archive 不接受自动翻译。

### 公开文档

```text
中文规范内容 + 英文镜像 + 导航清单
        ↓
内容、链接、语言 parity 与协议事实检查
        ↓
VitePress 构建
        ↓
base-path / 搜索 / 禁止发布路径检查
        ↓
Pages artifact
        ↓
main 成功构建后部署
```

## 目标信息架构

第一层按用户意图组织，第二层使用 Pipeline Lite 真实领域词汇：

- 首页：产品定位、执行模式、五分钟快速开始、学习路径；
- 开始使用：安装、Codex、Claude Code、首个任务、Dashboard、更新与卸载；
- 教程：Default、Simple、Free、Custom、恢复 Change；
- 操作指南：选择 workflow/track、review gate、需求回退、verify 失败、AFK/Loop、诊断；
- 概念与架构：核心对象、七阶段状态机、OpenSpec、Skill provenance、review receipt、本地优先和 adapter fidelity；
- 参考：CLI、workflow/track schema、document contract、配置、目录、Dashboard API/SSE、宿主矩阵、退出码；
- 运维与安全：升级迁移、备份回滚、端口/token、故障排查、安全模型；
- 贡献：开发环境、包边界、测试、扩展 workflow/track/skill/adapter、发布；
- 发布说明：Changelog、迁移、弃用。

每一页只承担教程、操作指南、概念解释或参考中的一个主要意图。页内 H2/H3 由右侧目录呈现；移动端全站菜单与“本页内容”分开。

## 页面与交互设计

- 顶栏：品牌、文档入口、搜索、语言、GitHub；
- 左侧：全局分组导航、当前路径展开；
- 正文：面包屑、标题、描述、内容、相关下一步；
- 右侧：当前页 H2/H3；
- 底部：上一篇/下一篇、编辑入口、更新时间；
- 搜索：VitePress local search，`Cmd/Ctrl+K`，当前语言索引优先，命令/错误码/路径支持精确命中；
- 主题：Pipeline Lite 自有品牌 token、浅层 VitePress 主题扩展、深浅色、reduced motion；
- 响应式：桌面四区布局；移动端独立菜单、可见搜索入口和可触达语言切换；
- 可访问性：跳过导航、语义标题、键盘焦点、对比度、可见焦点、ARIA 名称和正确 `html lang`。

## 内容真相源

第一版不允许两套可人工编辑的公开正文。公共内容以显式 manifest 管理中文规范页与英文镜像，并由确定性同步器生成到 `docs-site/.generated/`。同步器只允许白名单路径，构建后由 CI 校验无漂移。公开页面可以解释 `docs/adr`、`docs/superpowers` 等治理路径，但这些内部文件本身不得被 glob 或复制进 artifact。

现有 `docs/usage/` 将迁移为中文规范内容并建立英文对应目录；兼容入口继续存在，但不再把同一页面分别手工复制到站点目录。内部 ADR、研究、计划和报告不进入 manifest。

## 方案比较

| 方案 | 优点 | 代价 | 决策 |
| --- | --- | --- | --- |
| VitePress | Node/Vite/Markdown 契合；官方支持 Pages base；内置本地搜索和 i18n；MIT | 缺少原生多版本与翻译回退治理 | 采用 |
| Astro Starlight | i18n 回退和 Pagefind 更强；MIT | 新增 Astro 内容模型和更严格 Node 小版本边界 | 保留为规模升级点 |
| Docusaurus | React、版本化、插件生态成熟 | 当前场景更重；本地搜索通常需要额外集成 | 暂不采用 |
| Mintlify | 最接近 Trellis 当前托管体验 | 托管、搜索、组件和 Enterprise 导出锁定；不适合 Pages 默认路径 | 不采用 |
| React/Vite 自建 | 视觉自由、可复用 React | 需要长期自建路由、搜索、i18n、SEO、无障碍和文档治理 | 不采用 |

## Document Presentation Registry

建议结构：

```text
templates/documents/
├── registry.v1.yaml
├── locales/
│   ├── zh-CN.yaml
│   └── en.yaml
└── schemas/
    └── registry.v1.schema.json
```

Registry 保存稳定模板 id、DocumentKind、路径规则、section key、placeholder 和 missing-only 策略；locale 文件只保存读者可见标题、提示和默认任务文案。两种 locale 的 template、section、placeholder 必须完全等价。

Kernel 提供纯 renderer 和 schema/parity validator。`pipeline init`、`pipeline scaffold` 及 phase Skill 的幂等 scaffold 命令消费同一 renderer，不再维护重复英文常量。Skill 仍负责填充有意义的内容并以真实 producer 登记。

## README 与 GitHub Pages

根 `README.md` 改为中文开源首页，首屏提供定位、安装、快速开始、宿主选择、核心能力、文档入口、贡献和许可证；`README.en.md` 为完整英文对应稿。GitHub 会自动在仓库首页渲染根 README。

Pages 使用独立 workflow：

```text
npm ci
→ docs:sync
→ docs:check
→ docs:build
→ docs:smoke --base=/pipeline-worklfow/
→ upload-pages-artifact
→ deploy-pages
```

站点 `base` 固定使用真实仓库 slug `'/pipeline-worklfow/'`。将来启用自定义域名时另行调整，不在本 Change 预设。

## 失败与恢复

- Registry schema/parity/placeholder 不合法：构建失败并报告模板 id 与 locale；
- 未知 locale：CLI 给出明确诊断并按已固定的兼容策略处理，不能静默混合语言；
- 已有目标文件：missing-only 跳过，绝不覆盖；
- 双语页面缺失、slug 不匹配或链接失效：PR 检查失败；
- Pages base 资源或搜索索引失效：artifact smoke 失败，不部署；
- artifact 包含未登记内部文件、receipt、私钥、Bearer/query token 或用户目录绝对路径：安全检查失败，不上传；
- verify 发现产品声明与 CLI 行为不一致：退回 Build 修复，不用文案掩盖。

## 性能与安全

- 第一版使用静态 HTML、CSS、JS 和本地搜索，无数据库、服务端和第三方搜索请求；
- 记录 HTML/JS/CSS、搜索索引和总 artifact 大小，设置回归预算；
- 站点不包含 token、用户数据、工作区路径、内部 receipts 或写 API；
- Pages workflow 固定依赖版本，权限最小化，部署 environment 使用 GitHub Pages；
- 自定义主题保持浅层，避免引入大型 Dashboard 运行时。

## 术语与语言边界

中文正文使用“工作流（workflow）”“阶段（phase）”“变更（Change）”“轨道（track）”等首次双写术语；命令与 schema 中继续使用英文 token。OpenSpec 的机器操作标题保留英文，requirement、scenario 的叙述内容使用中文。`proposal.md` 等文件名不翻译。

## 已采用的保守默认

用户已经授权按推荐方案继续，因此 Explore 对低风险开放问题采用以下默认：

- 默认 locale：`zh-CN`；
- 英文镜像：首版完整，不采用渐进缺页；
- locale 固定：使用独立、不可变、版本化 sidecar，不改 canonical schema、document contract v1 或 ledger v1；
- 首版范围：覆盖 default 完整治理链；simple/custom 只覆盖其声明的 kind；
- 文档站：当前主线、无博客、无版本化、无外部搜索、无自定义域名；
- `llms.txt`：首版纳入；
- Dashboard 语言：继续是独立 UI 偏好，不能隐式改变 CLI 文档 locale。

## 反向审查

- 如果只做站点而不修生成链，新的中文文档仍会被英文 scaffold 污染；
- 如果把 locale 塞进 canonical、document contract 或 ledger，会破坏旧 release 回滚或把展示偏好变成治理协议；
- 如果自动翻译历史文档，会使 digest/read receipt 失效并破坏审计；
- 如果复用 Dashboard 作为公网文档，会暴露本地控制面边界；
- 如果使用 Mintlify 复制 Trellis 外观，会引入当前需求不需要的托管锁定；
- 如果英文镜像没有 parity 门禁，“双语”会迅速变成两个不一致的产品说明；
- 如果 Pages 只在根路径测试，project base 下的资源、链接和搜索会在生产失效。

```coverage
touches:
L1_api: waived -> 静态文档站不新增公共运行时 API；Registry 仅通过既有 CLI/application 边界消费
L2_data: waived -> 不引入数据库；仅新增版本化模板、不可变 locale sidecar 和静态内容
L3_rules: filled -> #关键业务规则
L4_state: filled -> #内容生命周期与发布状态
L5_errors: filled -> #失败与恢复
L6_security: filled -> #性能与安全
L7_perf: filled -> #性能与安全
L8_deps: filled -> #方案比较
L10_terms: filled -> #术语与语言边界
```

## 第二轮 Verify 后的架构收口

第二轮独立审查证明“已有门禁全绿”仍不足以证明体系完整，新增以下不可绕过的不变量：

1. OpenSpec delta 必须同时通过 strict validate 和临时副本 archive/apply 演练；Requirement 正文包含
   `SHALL/MUST`，`MODIFIED` 保留既有 scenario identity，主 spec 只使用 `## Requirements`。
2. Registry 的 template section 图、locale catalog 和运行时 renderer 只能有一个生成源；
   schema、codegen freshness 和运行时测试必须捕捉 section key、顺序和 placeholder 漂移。
3. 所有会写文档的入口共享“可信项目根 + 逐级 no-symlink + containment + 原子发布/安全 overwrite”
   原语；locale pin 不能先于根路径验证。
4. Pages artifact 是“允许的固定构建资产 + manifest 推导页面”的闭集，未知扩展、二进制或 receipt
   也必须被拒绝，而不是只扫描可读文本。
5. 中文 locale 覆盖浏览器可访问层，不只覆盖正文：导航、搜索、复制、permalink、移动菜单、
   breadcrumb 和 landmark 都必须被真实浏览器验收。
6. Change-pinned locale 优先于默认中文；custom workflow 显式 label 优先于 default id 本地化；
   setup、update 和 reconciliation 不改变已有受管内容的语言。

## 第三轮 Verify 后的架构收口

第三轮独立代码审查、Codex 审查和真实浏览器验收进一步证明：路径“看似受保护”、产物“扩展名受限”、
页面“只有一个 main”或正文“已经中文”都不是充分条件。最终实现必须同时满足以下约束：

1. `pipeline init` 在创建 Change 目录、locale sidecar 或 canonical state 之前，必须从已验证的真实项目根
   开始逐级拒绝现存 symlink。预先存在的 `openspec/changes/<name>` symlink 必须在任何外部写入前失败。
2. OpenSpec 的 `Why`、`What Changes`、`Capabilities`、`Impact`、`ADDED Requirements`、
   `Requirement` 和 `Scenario` 是机器协议键，任何 locale 都保持官方拼写；标题下的说明、requirement
   与 scenario 正文才跟随 Change-pinned locale。检查器必须同时执行官方 `show`、strict validate 和
   隔离副本 apply/archive 演练，不能只相信一个宽松通过的命令。
3. 规格应用只有一个权威边界：Verify 在隔离临时副本完成无副作用演练，Ship 对主规格执行幂等应用并
   写 `applied-spec` receipt，Archive 对已应用变更使用官方 `--skip-specs`。重复运行 Ship 必须是 no-op，
   不得因 `ADDED` 已存在而失败或重复 requirement。
4. Pages artifact allowlist 必须由 manifest、固定 public 文件和本次 VitePress 构建实际声明的资源精确
   推导；`assets/` 下扩展名合法但未声明的文件同样失败。门禁必须包含注入未知 `.js` 的反例测试。
5. 中文公开页的浏览器可访问层必须完整中文，包括 `Main Navigation`、`Sidebar Navigation`、`Pager`、
   `Close search`、`Display detailed list` 和搜索键盘提示。breadcrumb 至少包含首页、内容分组和当前页；
   首页的 `main` 只能包裹主内容，不能把全局 header、nav 或 footer 纳入主 landmark。
6. `scaffold spec --strategy overwrite` 必须以同目录暂存树、完整验证和单次可恢复提交实现事务语义；
   失败或竞争不能留下半套文档，也不能在安全检查后跟随被替换的路径。
7. 显式英文 Change 的全部 phase Skill 都必须遵循 `documentLocale=en`，不能保留任何无条件“使用中文”
   指令。N-1 已发布运行时必须能够读取当前 release 创建的 canonical state；展示性扩展不得进入旧严格
   schema，兼容性门禁要运行真实旧 bundle，而不是仅检查当前解码器。
8. Registry 是呈现结构的单一真相源。CLI 只能引用生成的 template/path/label 投影，不得维护一套会与
   Registry 漂移的 kind 映射或默认标题常量。

## 第六轮 Verify 后的架构收口

1. overwrite 的顶层 envelope 只解决可信 rename 锚点，不能天然防止旧快照覆盖 sibling 更新。事务必须
   在复制前记录目录 identity 与内容 digest，复制后验证 stage，original 移入 backup 后再验证 backup；
   任一 CAS 不一致都恢复 backup、清理私有 stage/lock 并 fail-loud。
2. Change 初始化发布不拥有竞争方创建的最终目录项。检查后出现普通目录或 symlink 时一律拒绝覆盖，
   只清理自身候选；外部 symlink target 和竞争目录保持逐字不变。
3. N-1 的真实含义是可执行的完整 release payload。固定元数据必须列出闭集入口，从固定 commit 原样
   抽取 CLI、templates、skills、hooks、adapters、server/SPA 与 bootstrap，校验后运行真实旧 CLI。
4. 早期主规格应用是一次历史迁移，不应伪装成 Ship 前 no-op。迁移 receipt 固定 base commit、raw/
   normalized/current/expected digest 和官方操作计数；Verify 只重建并校验，Ship 使用 CAS 原子落期望
   主规格并生成 document-contract 拥有的 applied-spec，Archive 使用 `--skip-specs`。

## 第七轮 Verify 后的架构收口

1. 顶层 envelope 会移动不属于本操作的 sibling 命名空间；Unix 上已经打开的文件描述符在 rename 后
   仍可写旧 inode，因此任何“再算一次 digest”都不能证明 sibling 已静止。overwrite 的发布所有权必须
   收窄到目标 `specDirectory`，只复制、替换和恢复该目录；sibling Change/目录从不被移动，因而其并发
   更新不需要参与本事务的 CAS。目标目录自身仍使用持久 receipt、同文件系统 stage/backup 和可信父路径
   身份检查，失败时保持目标旧集合或完整新集合。
2. 主规格迁移不是说明性脚本。Ship 必须调用一个可执行 migration gate，由同一原子发布原语在受管锁内
   校验 observed digest、发布 expected bytes、复核 after digest 并返回结构化 changed/no-op receipt；
   guard 未执行、CAS 漂移或 receipt 缺失时不得生成 `applied-spec` 或进入 Archive。
3. Codex Skill 证据解析以宿主真实完成态为协议输入。除数值 exit code 外，当前
   `custom_tool_call_output` 内容块的首个状态必须识别 `Script completed` 为成功、`Script failed` 为失败；
   混合或未知状态 fail-closed，不能因为后续正文偶然含 `exit=0` 而误放行。
4. Dashboard 阶段画布的首要任务是显示当前执行位置。首次加载或当前 phase 变化时，桌面横向 viewport
   必须将 current stage 定位到可视区中央附近；移动端、用户后续手动滚动和 reduced-motion 不依赖动画，
   不改变状态语义。
