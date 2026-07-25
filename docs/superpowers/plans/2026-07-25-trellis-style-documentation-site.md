---
change: trellis-style-documentation-site
design-doc: docs/superpowers/specs/2026-07-25-trellis-style-documentation-site-design.md
locale: zh-CN
---

# Pipeline Lite 正式文档站与中文文档生成体系实施计划

## 交付边界

本计划同时交付：

1. 中文根路由、英文完整镜像的 VitePress 正式文档站；
2. GitHub Pages 构建/部署工作流；
3. 中文根 README 与英文镜像；
4. 版本化 Document Presentation Registry；
5. default 完整治理文档链及项目 spec scaffold、Loop 镜像、phase handoff 的中文默认生成；
6. 显式英文、simple/custom/history/update 兼容门禁。

不部署本地 Dashboard，不修改 document contract v1 或 ledger v1，不自动翻译历史 Change/Archive，不在真实 Pages 成功前宣称线上 URL。

## 原型决策

用户已明确授权“走推荐的所有流程”。因此采用原型先行：第一个 Build 子阶段先完成一个可丢弃/可升级的纵向 PoC，验证固定版本 VitePress 在真实 `/pipeline-worklfow/` base 下的中文/英文路由、本地搜索和静态 artifact，同时验证 Registry 能渲染一个中文 proposal。PoC 只有通过正常测试和架构检查后才保留为生产实现；否则删除，不让试验代码进入正式路径。

## Build 子阶段 1：Tracer Bullet / 原型纵向切片

目标：尽早打通“中文模板 → 新 Change”与“中文页面 → Pages 子路径 artifact”两条最小端到端链路。

### 1.1 先写失败测试

文件：

- `packages/kernel/src/documents/presentation-registry.test.ts`
- `packages/kernel/src/documents/document-template-renderer.test.ts`
- `packages/kernel/src/state/workflow-run-repository.test.ts`
- `packages/cli/src/init-workflow.integration.test.ts`
- `tools/check-docs.node-test.mjs`

行为：

- `zh-CN`/`en` catalog template/section/placeholder parity；
- 中文 proposal 渲染保持文件名、LF、末尾换行和稳定 token；
- default init 默认中文；显式英文可生成英文；
- simple 不产生 default 文档；
- `/pipeline-worklfow/` base 的最小中英文页面与 asset 路径可构建。

验证：

```bash
npx vitest run packages/kernel/src/documents/presentation-registry.test.ts \
  packages/kernel/src/documents/document-template-renderer.test.ts \
  packages/kernel/src/state/workflow-run-repository.test.ts
npx vitest run packages/cli/src/init-workflow.integration.test.ts
node --test tools/check-docs.node-test.mjs
```

### 1.2 建立最小 Registry 与 renderer

文件：

- `templates/documents/registry.v1.yaml`
- `templates/documents/locales/zh-CN.yaml`
- `templates/documents/locales/en.yaml`
- `templates/documents/schemas/registry.v1.schema.json`
- `packages/kernel/src/documents/presentation-registry.ts`
- `packages/kernel/src/documents/document-template-renderer.ts`
- `packages/kernel/src/documents/index.ts`
- `packages/kernel/src/index.ts`

实现：

- 解析并校验 Registry；
- 拒绝未知 template/locale/placeholder；
- locale 不能覆盖协议字段；
- 首个切片支持 proposal、design、tasks；
- renderer 为纯函数，输出确定 UTF-8 Markdown。

### 1.3 接入 default init

文件：

- `packages/kernel/src/state/default-openspec-scaffold.ts`
- `packages/kernel/src/state/workflow-run-repository.ts`
- `packages/kernel/src/workflow/run-types.ts`
- `packages/kernel/src/state/run-revision-codec.ts`
- `packages/kernel/src/state/store.ts`
- `packages/cli/src/commands/init.ts`
- `packages/cli/src/program.ts`

实现：

- 新增 `.pipeline-document-locale.json` 不可变 sidecar，并在 canonical current 前原子发布；
- canonical schema、YAML projection、document contract/ledger 不新增 locale 字段，确保旧 release 可回滚；
- 新 Change 默认 `zh-CN`，支持显式 `--document-locale zh-CN|en`；
- fallback scaffold 复用 Registry；
- missing-only、普通文件校验和并发语义保持。

### 1.4 建立最小 VitePress 站点

文件：

- `docs-site/package.json`
- `docs-site/.vitepress/config.mts`
- `docs-site/.vitepress/theme/index.ts`
- `docs-site/.vitepress/theme/custom.css`
- `docs-site/content-manifest.mjs`
- `docs-site/scripts/sync-content.mjs`
- `docs-site/content/zh-CN/index.md`
- `docs-site/content/en/index.md`
- 根 `package.json`
- `package-lock.json`

实现：

- 固定精确 VitePress 版本；
- workspace 纳入 `docs-site`；
- base 固定 `/pipeline-worklfow/`；
- 中文根与 `/en/`；
- local search；
- 用两个最小页面验证导航、搜索和语言切换。

验证：

```bash
npm run docs:sync
npm run docs:build
npm run docs:smoke
```

### 1.5 原型去留门

成功信号：

- 两条切片都由失败测试变绿；
- Pages base 下 HTML、CSS、JS、语言链接和搜索索引可加载；
- default 中文化没有影响 simple；
- artifact 不包含 Dashboard server 或内部文档。

失败处理：

- VitePress 固定版本不满足要求则删除 PoC，切换已记录的 Starlight 备选；
- Registry 无法在不改 contract/ledger 的前提下接入则停止并回到 Spec，而不是把 locale 塞入治理协议。

**子阶段边界：此处建议 `/clear`。**

## Build 子阶段 2：完整中文治理文档链

### 2.1 扩展 Registry 覆盖全部文档 kind

文件：

- `templates/documents/registry.v1.yaml`
- `templates/documents/locales/zh-CN.yaml`
- `templates/documents/locales/en.yaml`
- `packages/kernel/src/documents/*.ts`
- 相应 golden fixtures/tests

覆盖：

- proposal、openspec design、tasks；
- Superpowers design、ADR；
- delta spec、Superpowers plan、implementation plan；
- verification report、applied spec。

测试：

- 两种 locale 的结构等价；
- OpenSpec、coverage、frontmatter 保留词不被翻译；
- workflow 阶段标题来自实际 id/label；
- 相同输入逐字节一致。

### 2.2 统一 `pipeline scaffold`

文件：

- `packages/kernel/src/scaffold/doc-scaffold.ts`
- `packages/kernel/src/scaffold/doc-scaffold.test.ts`
- `packages/cli/src/commands/scaffold.ts`
- `packages/cli/src/commands/scaffold.test.ts`
- `packages/cli/src/scaffold.integration.test.ts`

实现：

- 移除第二套硬编码标题；
- 复用 Registry；
- 保持 skip/append/overwrite 和 scaffold marker 语义；
- 支持 locale 选择且默认中文。

### 2.3 增加幂等 document scaffold 命令

文件：

- `packages/cli/src/commands/document.ts`
- `packages/cli/src/commands/document.test.ts`
- `packages/cli/src/program.ts`
- `packages/cli/src/program-help.ts`

行为：

- `pipeline document scaffold <change> <kind> [--locale ...]`；
- delta spec 必须显式传 `--capability <capability>`，不得从 Change 名或默认 scope 猜测；
- 只能为 effective document contract 中已声明的 kind 创建结构；
- 只创建缺失文件，不 record、不生成 Skill receipt；
- custom 未声明 kind 时 fail-loud；
- 创建父目录前逐级拒绝 symlink，目标使用原子 no-replace 发布。

### 2.4 统一其他 Markdown 生成入口

文件：

- `packages/kernel/src/loops/reconciliation-operations.ts`
- `packages/kernel/src/compress/compress.ts`
- `packages/kernel/src/compress/handoff.ts`
- `packages/cli/src/commands/handoff.ts`
- 相应 kernel/CLI 单元与集成测试

行为：

- 新建 Loop 受管镜像使用中文标题和真相源说明，marker/id 不变；
- handoff 人读摘要默认中文，并跟随 Change 固定的显式英文 locale；
- JSON 字段、路径、phase、压缩算法和原始文档内容不翻译；
- 不因 setup/update/reconciliation 自动翻译既有手写或历史段落。

### 2.5 更新 phase Skills

文件：

- `skills/openspec-propose/SKILL.md`
- `skills/pipeline-explore/SKILL.md`
- `skills/pipeline-spec/SKILL.md`
- `skills/pipeline-verify/SKILL.md`
- `skills/openspec-apply-change/SKILL.md`
- `skills/learn-record/SKILL.md`
- 相关 `skills/*/SKILL.md`

实现：

- 明确读取 Change 固定 locale；
- 引用共享 scaffold 命令/section key；
- 默认中文叙述，稳定 token 不翻译；
- 模板不能代表 Skill 已执行；
- producer、record、read、review 证据链不变。

### 2.6 历史和 workflow 兼容矩阵

文件：

- `packages/cli/src/init-workflow.integration.test.ts`
- `packages/cli/src/transition-custom-workflow.integration.test.ts`
- `packages/kernel/src/state/document-ledger.test.ts`
- `packages/kernel/src/state/workflow-run-repository.test.ts`
- 新增 Registry/locale 集成测试

覆盖：

- default `zh-CN`/`en`；
- simple 无 default docs；
- custom 无 contract；
- custom 三 kind；
- free/default 完整链；
- 旧英文/混排 Change；
- Archive 不变；
- 并发 init；
- 中途改全局 locale 不改当前 Change；
- 明确修改内容后 digest/read receipt 正常失效。

验证：

```bash
npx vitest run packages/kernel/src/documents packages/kernel/src/state
npx vitest run packages/cli/src/init-workflow.integration.test.ts \
  packages/cli/src/transition-custom-workflow.integration.test.ts
```

**子阶段边界：此处建议 `/clear`。**

## Build 子阶段 3：正式文档内容与站点产品化

### 3.1 建立公共内容 manifest 与目录

文件：

- `docs/usage/zh-CN/**`
- `docs/usage/en/**`
- `docs/usage/README.md`
- `docs-site/content-manifest.mjs`
- `docs-site/scripts/sync-content.mjs`
- `docs-site/scripts/check-content.mjs`

中文规范内容章节：

- 首页和产品概览；
- 安装、Codex、Claude Code、第一个任务；
- default/simple/free/custom 教程；
- routing、review、requirements-changed、verify-fail、恢复 Change；
- 核心模型、状态机、OpenSpec、Skill、evidence；
- CLI、schema、配置、目录、Dashboard、host matrix；
- 更新、迁移、备份、回滚、端口、安全、排障；
- 贡献、架构、测试、扩展和发布。

英文镜像逐页覆盖同一 slug、命令、约束和恢复语义。

### 3.2 配置完整导航、搜索与主题

文件：

- `docs-site/.vitepress/config.mts`
- `docs-site/.vitepress/theme/index.ts`
- `docs-site/.vitepress/theme/custom.css`
- `docs-site/components/**`（仅确有必要时）

实现：

- 中文根、英文 `/en/`；
- 顶栏、左侧导航、右侧目录、面包屑、上下页；
- `Cmd/Ctrl+K` local search 和中英文 UI；
- Pipeline Lite 品牌 token、深浅色、visible focus、reduced motion；
- 320px、平板和桌面布局；
- 404、编辑链接和 metadata。

### 3.3 生成 agent 入口

文件：

- `docs-site/scripts/generate-llms.mjs`
- `docs-site/public/llms.txt` 或构建期对应产物

行为：

- 仅从公开 manifest 生成；
- 按 locale/内容类型分组；
- 校验每个目标存在；
- 排除内部资料和未发布草稿。

### 3.4 文档站自动化测试

文件：

- `docs-site/scripts/smoke.mjs`
- `docs-site/scripts/audit-artifact.mjs`
- `docs-site/tests/docs-site.spec.ts`
- `tools/check-docs.mjs`
- `tools/check-docs.node-test.mjs`

覆盖：

- 双语 parity、孤儿页、断链、锚点；
- base path asset；
- 固定搜索查询；
- 禁止路径、绝对工作区路径、token 模式；
- artifact 大小预算；
- HTML `lang`、canonical/hreflang；
- 导航/页内目录/上下页。

验证：

```bash
npm run docs:check
npm run docs:build
npm run docs:smoke
```

**子阶段边界：此处建议 `/clear`。**

## Build 子阶段 4：README、Dashboard 语言边界与 Pages

### 4.1 重写仓库首页

文件：

- `README.md`
- `README.en.md`
- `README.zh-CN.md`（兼容入口或删除前的明确重定向说明）

实现：

- 中文根 README；
- 完整英文镜像；
- 安装、快速开始、模式、架构、文档、贡献、安全、许可证；
- 未部署前不写虚假线上 URL；
- GitHub 自动展示根 README，无需额外首页配置。

### 4.2 说明 Dashboard locale 边界

文件：

- `packages/dashboard-app/src/i18n/translations.ts`
- `packages/dashboard-app/src/solution/SolutionView.tsx`
- `packages/dashboard-app/src/solution/SolutionView.test.tsx`

内容：

- Dashboard `zh/en` 是 UI 偏好；
- 治理文档 locale 在 Change 创建时固定；
- 二者不隐式联动；
- 链接到正式文档或仓库内回退入口。

### 4.3 GitHub Pages workflow

文件：

- `.github/workflows/docs-pages.yml`

实现：

- PR build/check；
- 仅非 PR 且 ref 为 `refs/heads/main` 时执行 `configure-pages`、`upload-pages-artifact`、`deploy-pages`；
- feature branch 的 `workflow_dispatch` 只构建验证，不能取得部署权限；
- 最小权限、environment、concurrency；
- deploy 依赖所有内容与 artifact 审计；
- 不复用 Dashboard server bundle。

### 4.4 文档检查与发行资产

文件：

- `package.json`
- `package-lock.json`
- `tools/check-docs.mjs`
- `tools/check-comment-honesty.sh`
- `.github/workflows/ci.yml`
- release/bundle freshness 相关测试与清单

实现：

- `docs:sync/check/build/smoke`；
- `check:document-templates`；
- CI 的 `zh-CN × en × default/simple/custom` 最小矩阵；
- 确认模板与 locale 资源进入插件 release；
- 自动更新只换 release 模板，不写项目历史。

验证：

```bash
npm run check:docs
npm run check:document-templates
npm run docs:check
npm run docs:build
```

**子阶段边界：此处建议 `/clear`。**

## Build 子阶段 5：集成、清理与交付候选

### 5.1 全链端到端样例

在临时目录验证：

1. clean install；
2. `pipeline setup --codex`；
3. 新建 default Change，检查全部阶段的中文 scaffold/Skill 指令；
4. 新建英文 Change；
5. 新建 simple；
6. 新建声明三个 kind 的 custom；
7. 运行 update，比较既有 Change/Archive 摘要；
8. 构建站点并在 `/pipeline-worklfow/` 子路径启动。

### 5.2 移除重复真相源

删除或替换：

- Kernel 的英文 `FILES` 常量；
- doc-scaffold 的独立标题表；
- Skills 中重复章节模板；
- 可人工编辑的站点副本；
- README 中失效的英文默认假设。

保留：

- 旧英文 fixtures，仅用于历史兼容测试；
- 稳定英文协议 token；
- Dashboard 独立 UI 翻译字典。

### 5.3 Build 出口

- 更新 `tasks.md` 的 Build 项；
- 运行定向测试、全量 typecheck/build/test；
- 记录 `build_sha`；
- 重读全部设计、ADR、delta spec 和 plan；
- 进入 Verify，不在 Build 宣称浏览器或 Pages 已通过。

## Verify 计划

### 自动化

```bash
npm run check:architecture
npm run check:comments
npm run check:docs
npm run check:document-templates
npm run typecheck:web
npm run build
npm run test:all
npm run test:hooks
npm run docs:check
npm run docs:build
npm run docs:smoke
```

### 真实浏览器

- 中文首页、英文首页；
- 320px、768px、1440px；
- 键盘搜索、菜单、语言切换、上下页；
- 深浅色与 reduced motion；
- base `/pipeline-worklfow/`；
- 离线搜索；
- 404；
- 浏览器 console/network 无错误。

### 安装/更新

- Codex 安装；
- 模板随 release 存在；
- default 中文、显式英文；
- simple/custom 文档边界；
- update 前后历史 Change/Archive hash 一致；
- 不伪造 Skill/record/read/review。

### 独立审查

审查重点：

- 公开 artifact 是否泄露本地控制面或内部材料；
- locale 是否污染 contract/ledger；
- 文档是否与真实 CLI、端口和 workflow 一致；
- 英文镜像是否完整；
- Pages workflow 是否权限最小、失败不部署。

## 回滚

- 站点：保留上一成功 Pages artifact；禁用新 deploy workflow 不影响 Dashboard。
- Registry：renderer 可回退到上一 release；不能以回滚为由改写已创建 Change。
- locale sidecar：旧 run/canonical schema 不变；旧 release 可忽略 sidecar，当前 release 从 sidecar 或一致历史 H1 恢复。
- 内容：manifest/source 同提交回滚，生成目录重新构建。
- 依赖：VitePress 固定版本，单独回退 lockfile 与 docs workspace。

## 完成条件

- 所有 delta spec 场景有测试或人工验收证据；
- 新 default Change 的完整治理链默认中文；
- 显式英文、simple、custom 和历史兼容通过；
- 文档站双语、搜索、响应式、无障碍和 base path 通过；
- Pages workflow 已配置，但只有真实部署成功后才声明线上地址；
- README 在 GitHub 根目录可自动展示并进入正式文档；
- 无未说明的失败、跳过或剩余风险。

```coverage
touches:
L1_api: filled -> #Build-子阶段-2完整中文治理文档链
L2_data: filled -> #Locale-解析
L3_rules: filled -> #文档类型覆盖
L4_state: filled -> #Locale-解析
L5_errors: filled -> #风险控制
L6_security: filled -> #GitHub-Pages
L7_perf: filled -> #搜索
L8_deps: filled -> #三种架构方案
L10_terms: filled -> #文档类型覆盖
```

## Build 子阶段 6：第二轮 Verify 阻断项收口

### 6.1 Registry 与 OpenSpec 结构

- 让 registry、schema、catalog 经过同一校验与 codegen 生成完整运行时结构，删除 renderer 的第二套 section 图；
- 覆盖 section key、顺序、placeholder、default/custom workflow label 与英文 Change；
- 把 OpenSpec strict validate 和临时 archive/apply 演练加入验证事实。

### 6.2 全部文档写入口的路径安全

- 抽取项目根可信路径与逐级 no-symlink 原语；
- 同时应用到 `pipeline scaffold spec --spec-dir`、document scaffold 和 locale pin；
- 覆盖绝对/相对 traversal、Change 根 symlink、父级 symlink、检查后替换与 overwrite 外部删除。

### 6.3 公开 artifact 与生成确定性

- 从 manifest、VitePress 固定资产和明确 public 资产计算完整 artifact allowlist；
- 未知文件、内部 receipt、source map 和敏感内容一律 fail-loud；
- 连续同步两次比较文件清单与 digest，并校验 Pages main-only/minimal permissions。

### 6.4 中文浏览器 UI 与语义结构

- 扩展 VitePress 主题，为 breadcrumb、首页 `<main>`、中文导航/复制/permalink/搜索/移动菜单提供完整文案；
- 语言切换对 fragment 做对应映射或安全移除；
- 用真实浏览器重新覆盖 30 路由、搜索、键盘、320px、明暗主题和辅助技术名称。

### 6.5 历史与显式英文兼容

- custom workflow 显式 label 优先；历史 H1 采用脚本/多文档一致性推断，模糊时 fail-loud；
- Loop ensure 保持已有受管段字节；显式迁移另行处理；
- 所有 phase Skill 按 Change-pinned locale 写正文，不用“默认中文”覆盖显式英文。

**子阶段边界：完成定向红绿测试后建议 `/clear`，再运行全量 Build 门禁。**

## Build 子阶段 7：第三轮 Verify 阻断项与生命周期收口

### 7.1 初始化可信根与 N-1 回滚

文件：

- `packages/kernel/src/state/store.ts`
- `packages/kernel/src/state/workflow-run-repository.ts`
- `packages/cli/src/init-workflow.integration.test.ts`
- `tools/test-bundle.sh`

先增加失败测试：预先把 `openspec/changes/<name>` 建为仓库外 symlink，再运行当前源码和发行 bundle
的 `pipeline init`；断言非零退出、外部目录 digest 不变、没有 locale/canonical/YAML 半状态。把项目根解析、
Change 根逐级 `lstat`、containment 和写入句柄约束收敛到共享原语，并在任何 `mkdir` 前调用。

随后使用上一已发布 bundle 读取当前版本新建的最小 Change，记录版本、命令和退出码；如果旧 runtime
仍因 `runMetadata`、document profile 或 fingerprint 扩展拒绝读取，则把展示字段移出严格 canonical，
不在解码器里增加“忽略所有未知字段”的宽松后门。

验证：

```bash
npx vitest run packages/cli/src/init-workflow.integration.test.ts packages/kernel/src/state
bash tools/test-bundle.sh
```

### 7.2 OpenSpec 机器协议与单一应用边界

文件：

- `templates/documents/locales/zh-CN.yaml`
- `templates/documents/locales/en.yaml`
- `templates/documents/registry.v1.yaml`
- `packages/kernel/src/documents/**`
- `skills/openspec-propose/SKILL.md`
- `skills/pipeline-verify/SKILL.md`
- `skills/openspec-apply-change/SKILL.md`
- `skills/pipeline-archive/SKILL.md`
- `tools/check-document-templates.mjs`
- 对应单元/集成测试

Registry 中 OpenSpec proposal 的 `Why`、`What Changes`、`Capabilities`、`Impact` 改为不可本地化的
机器 section；中文 catalog 只提供正文提示。检查器必须运行 `openspec show --json --deltas-only`，
避免 strict validate 的假阳性。

Verify 改为在隔离临时副本完成 official archive/apply 演练且不写真实主 spec；Ship 成为唯一真实应用
边界，先比较 delta 与主 spec，完全一致时记录 no-op，不一致时幂等合并；Archive 在存在有效
applied-spec receipt 时调用 `openspec archive --skip-specs`。当前工作区在早期 Verify 写入了一个
与当前 delta 并非逐字/语义完全等价的主规格，因此必须增加机器迁移 receipt：从固定 Git base
规范化旧机器标题，在隔离目录用官方 archive 重建期望主规格并固定 digest。Verify 只运行 check；
Ship 以 observed-current digest 做 CAS，原子 reconcile 到 expected digest 后生成正式 applied-spec。

验证：

```bash
openspec show trellis-style-documentation-site --json --deltas-only
openspec validate trellis-style-documentation-site --strict
npm run check:document-templates
```

### 7.3 精确 Pages artifact 闭集

文件：

- `docs-site/scripts/smoke.mjs`
- `docs-site/scripts/audit-artifact.mjs`
- `tools/check-docs.node-test.mjs`

从同步 manifest、固定 `public` 文件、生成 HTML 对 asset 的引用和 VitePress 构建 manifest 计算精确集合；
任何未引用额外文件都失败。测试在 `dist/assets/` 注入 `internal-receipt.js`、合法字体和未知二进制，
三个反例都必须被拒绝并报告相对路径。

验证：

```bash
node --test tools/check-docs.node-test.mjs
npm run docs:build
npm run docs:smoke
```

### 7.4 中文可访问层、breadcrumb 与 landmark

文件：

- `docs-site/.vitepress/config.mts`
- `docs-site/.vitepress/theme/index.ts`
- `docs-site/.vitepress/theme/DocsLayout.vue`
- `docs-site/.vitepress/theme/Breadcrumbs.vue`
- `docs-site/.vitepress/theme/custom.css`
- `docs-site/tests/docs-site.spec.ts`

为中文 locale 显式提供主导航、侧栏、分页、搜索关闭/详情、方向键、确认和退出文案；在 hydration 后
检查最终 accessibility tree，不能只替换静态 HTML 字符串。breadcrumb 从公开 manifest/nav 推导内容
分组并输出首页→分组→当前页。首页只替换主题内容插槽为 `<main>`，不包裹 DefaultTheme 的全局布局。

真实浏览器覆盖 32 个 locale 路由的桌面与 320px，检查单 main、breadcrumb 层级、全部中文可访问名称、
搜索键盘流程、控制台和网络。

### 7.5 overwrite 事务与 Registry 消费投影

文件：

- `packages/kernel/src/scaffold/doc-scaffold.ts`
- `packages/cli/src/commands/scaffold.ts`
- `packages/cli/src/scaffold.integration.test.ts`
- `packages/kernel/src/documents/generate-presentation-registry.mjs`
- Registry 生成产物及 CLI 消费方

overwrite 先在目标同一文件系统生成完整暂存树，校验普通文件、digest、containment 和无 symlink 后，
以可恢复目录切换提交；任一步失败都保留原集合。注入 publish 前失败、EEXIST、父级替换和并发执行，
验证全有或全无以及临时目录可回收。

扩展 Registry codegen 输出 document kind→template/path 和 default workflow label 投影，让 CLI/renderer
共同消费；删除手写平行映射并用 freshness 测试防漂移。

### 7.6 最终 Build 门禁

定向测试转绿后运行：

```bash
npm test
npm run test:web
npm run build
npm run check:architecture
npm run check:comments
npm run check:default-workflow-freshness
npm run check:document-templates
npm run docs:check
npm run docs:build
npm run docs:smoke
bash tools/test-hooks.sh
bash tools/test-adapters.sh
bash tools/test-bundle.sh
node tools/reconcile-spec-application.mjs
```

同时运行官方 OpenSpec show/strict/隔离 archive 演练和干净安装 setup/update 测试。任何失败都停留 Build，
不得用更新报告或删除 review marker 绕过。

**子阶段边界：TDD 定向修复完成后建议 `/clear`；全量 Build 门禁通过后再进入 Verify。**

## 子阶段 8：第七轮 Verify 阻断修复

### 8.1 收窄 overwrite 事务所有权

先在 `packages/cli/src/commands/specScaffoldTransaction.test.ts` 增加 open-FD sibling 写入反例，证明
当前顶层 envelope 会丢更新。将 stage/backup/lock 绑定到目标 `specDirectory`，目标父路径只做可信
identity 锚点，不复制或移动 sibling。保留 crash recovery、父路径竞态和全有或全无测试。

验证：`npx vitest run packages/cli/src/commands/specScaffoldTransaction.test.ts`

### 8.2 可执行主规格 migration gate

为 `tools/reconcile-spec-application.mjs` 抽出可测试的锁定 CAS 发布边界，补检查后并发写入反例；Ship
skill/门禁必须实际调用并消费结构化 receipt，只有 changed/no-op 且 after digest 等于 expected 才生成
`applied-spec.md`。CI 和隔离 Ship 演练覆盖未运行、漂移、重复执行与恢复。

验证：migration 定向 Node 测试、`node tools/reconcile-spec-application.mjs`、隔离 `--apply` 两次。

### 8.3 当前 Codex transcript ABI

在 `packages/cli/src/codexSkillReceipt.test.ts` 使用真实内容数组 fixture 覆盖 `Script completed`、
`Script failed`、混合状态和 failed 正文含 `exit=0`；修改 `codexTranscriptEvidence.ts` 的完成态判定，
保持旧 function/custom ABI 兼容和未知形状 fail-closed。

验证：`npx vitest run packages/cli/src/codexSkillReceipt.test.ts`

### 8.4 Dashboard 当前阶段定位

在 `WorkflowCanvas.test.tsx` 先写当前 phase 位于第 5/7 列时的失败测试；实现仅在首次加载或 phase 变化时
对横向 viewport 执行确定性定位，不使用强制动画，不影响用户后续滚动。重建 Dashboard 后复查 1440px
和 375px。

验证：聚焦 Web 测试、Dashboard build、真实浏览器截图。

### 8.5 第八轮冻结与门禁

四项红绿重构完成后，重跑 build、全量 Vitest/Web、hooks、adapters、bundle、完整 N-1、OpenSpec
show/strict/隔离 archive、docs check/build/smoke、architecture、comments、Oracle 和三条独立 Verify。

**子阶段边界：四项定向修复转绿后建议 `/clear`；全量门禁通过后再进入 Verify。**
