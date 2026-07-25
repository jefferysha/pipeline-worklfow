# 验证报告

## 验证范围

- 冻结实现基线：`workspace:sha256:f21d26f879af9de05f533bfdf9b2304c1778b1257efef95252a3223269e61b52`
- 范围：Document Presentation Registry、Change locale、文档 scaffold、handoff/Loop 中文呈现、VitePress 双语站、README、GitHub Pages、发行包与安装/更新兼容。
- 独立验证轨：代码/架构/安全审查、真实浏览器 E2E、视觉与无障碍审查。
- 判定规则：任何 P1/High 阻断项或真实用户路径失败，Verify 必须失败并返回 Build。

## 执行命令

- `npm run check:comments`
- `npm run check:architecture`
- `npm run check:default-workflow-freshness`
- `npm run check:docs`
- `npm run check:document-templates`
- `npm run typecheck:web`
- `npm run build`
- `npm run docs:sync`
- `npm run docs:check`
- `npm run docs:build`
- `npm run docs:smoke`
- `npm run test:all`
- `bash tools/test-hooks.sh`
- `bash tools/test-adapters.sh`
- `bash tools/verify-skills.sh`
- `bash tools/test-bundle.sh`
- `npm run oracle`
- `git diff --check`
- fresh VitePress preview 下对 30 个双语路由执行桌面、320px、375px 浏览器检查，并验证语言切换、搜索和键盘跳转。
- 在临时目录创建中文默认 Change、中文项目 scaffold、中文 handoff，以及显式英文对应样本。

## 结果

- 构建前验证：定向 locale/scaffold/handoff/loop 测试 `145/145` 通过；setup/update/runtime/template 测试 `85/85` 通过。
- 全量测试：kernel/CLI 等 `5133` 项通过、`5` 项条件性跳过；Web `933` 项通过。既有 React `act(...)` 警告未伪装为失败。
- hooks `426` 项、adapters `262` 项、bundle `21` 项通过；oracle 双运行 `0` 个不一致。
- 文档同步、内容校验、构建、静态 smoke、类型检查、架构检查和 `git diff --check` 通过。
- fresh preview 的 30 个桌面路由与 60 个移动端路由均为 HTTP 200、locale/H1 正确、无控制台错误、无页面级横向溢出；中英文语言切换、英文固定搜索词和 skip-link 初始聚焦通过。
- 临时新 Change 的 proposal/design/tasks、项目规格 scaffold 和 handoff 默认中文；显式英文基本路径可生成。
- 综合结论：**FAIL**。代码、E2E、视觉三个独立验证轨均发现阻断问题，不允许进入 Ship。

## 失败与阻塞

### P1 / High 阻断

1. `WorkflowRunRepository` 在 transition 重建 `RunMetadata` 时遗漏 `documentLocale`，显式英文 Change 第一次转换后会丢失语言固定值。
2. canonical schema 仍为 v1 却扩展严格闭集字段，旧 rollback runtime 会把新状态识别为损坏，版本兼容策略不完整。
3. `pipeline document scaffold` 只检查最终目标，未阻止父目录 symlink 逃逸仓库；缺失文档写入也不是原子发布。
4. delta spec scaffold 把 Change 名当 capability 名，无法正确覆盖 capability 与 Change 名不同或多 capability 的情况。
5. `.github/workflows/docs-pages.yml` 的手动触发没有同时限制 `refs/heads/main`，feature branch 可请求生产部署。
6. 中文文档站内容深度尚未达到已批准规格：多篇中文任务页明显短于英文镜像，内容类型和“目标/前置/步骤/结果/验证/失败/下一步”未被门禁验证。
7. 中文真实搜索 `19765` 返回 0 个结果，当前 smoke 只是静态字符串近似，产生假阳性。
8. 4178 旧 preview 的两个核心 JS 资源 404，导致搜索、主题切换和移动导航失效；fresh 4179 正常，说明交付预览需要重启后复验。
9. 深色模式首页主 CTA 白字与 `#42c5a9` 背景对比度约 `2.14:1`，低于 WCAG AA。

### P2 / 中等问题

1. 模板本地化不完整：中文模板仍有 `[pending]`，英文 delta/plan 含“待填写”，英文 tasks 仍可能使用中文 workflow label。
2. Registry 运行时定义与发行 YAML 资产是两套可漂移真相源，现有检查未比较实际 prompt、路径和文案。
3. 旧 Change 缺少 locale metadata 时直接回退中文，可能让历史英文 Change 的新增文档混入中文。
4. 中文规范事实没有被 CI 对等校验；README 的部分中文导航仍指向英文页面。
5. fragment 锚点、真实 locale 搜索、安全扫描、主题 accessible name、中文 VitePress 内置文案和 skip-link 落点验证存在盲区。
6. 375px 首页四列表格可读性差，中文逐字换行且英文 token 有截断风险。
7. 裸 `--document-locale` 被静默当成默认中文，应 fail-loud。

## 剩余风险

- 尚未在 GitHub Pages 真实环境验证 CDN、部署权限和最终公开 URL。
- 尚未完成屏幕阅读器、200% 缩放和 Windows 高对比模式人工验收。
- 修复实现后必须重新冻结 Build 基线并完整重跑三条独立验证轨；本报告不能作为后续修订的通过证据复用。
- 本次失败将通过 `verify-fail` 正常返回 Build，不修改或绕过任何 review receipt、fingerprint 或文档 digest guard。

## 第二轮 Verify：修复后冻结基线

- 冻结实现基线：`workspace:sha256:54f3e4060aa14c477edb663b0ed6375ef38cb8e8f8427ad21b1daab6e8701f1d`
- 全量验证：`5142` 项后端/CLI/kernel 测试通过，`5` 项真实认证场景如实跳过；`933` 项 Web 测试通过。
- 分发验证：bundle `21/21`、hooks `426/426`、adapters `262/262`、skills inventory 和 golden oracle `0` 差异通过。
- 文档验证：15 个双语页面、30 个公开路由、VitePress build、project base、静态 smoke、链接、模板和架构门禁通过。
- 独立轨道：代码审查、Codex CLI、真实 Chrome E2E、视觉/无障碍审查均完成；综合结论仍为 **FAIL**。

### 第二轮阻断项

1. OpenSpec delta 的 12 个 Requirement 正文缺少严格校验器要求的显式 `SHALL/MUST` 规范句；现有主 spec 还错误使用 delta-only header，官方 apply/archive 合并器拒绝回灌。
2. Document Presentation Registry 的 renderer 仍硬编码 section 顺序，schema/checker 没有验证 Registry、catalog 和运行时结构同源；当前已有 section key 漂移但门禁假绿。
3. `pipeline scaffold spec --spec-dir` 与 `pipeline document scaffold` 仍存在 Change 根或父路径 symlink/项目边界竞态，可能向仓库外写入或覆盖文件。
4. Pages artifact audit 不是严格 allowlist，有限扩展扫描无法拒绝额外 receipt、内部文档或未知敏感文件。
5. VitePress 没有实现规格要求的 breadcrumb；首页缺少 `<main>` landmark。
6. 中文站仍暴露英文可访问标签，包括 `Main Navigation`、`mobile navigation`、`extra navigation`、`Copy Code`、`Permalink to` 和 `Display detailed list`。
7. 带中文 fragment 切换英文会保留不匹配的中文 hash，破坏对应页面深链。
8. 自定义 workflow 使用 default phase id 时，显式 label 会被默认 label 覆盖；历史 locale 推断对自定义 H1 过窄。
9. Loop reconciliation 会在普通 ensure 中把已有英文受管段替换为中文，违反 setup/update 不自动翻译历史内容的要求。
10. 项目 Skill 文案对显式英文 Change 仍有“始终写中文”的冲突指令，可能生成混合语言文档。

### 第二轮已通过的真实浏览器证据

- 30/30 路由 HTTP 200，`html lang`、H1、title、内部链接和资源均正确，控制台零 error/warning。
- 中文搜索 `18765`、`review gate`、`.pipeline-document-locale.json` 均有准确结果。
- 320×800 与桌面明暗主题无页面级横向溢出；表格和代码块保持局部滚动。
- 抽样正文与 CTA 对比度达到 AA，键盘焦点可见，主题、语言与移动菜单基本操作可用。

### 第二轮处理决定

本轮不得进入 Ship。按真实状态机走 `verify-fail → build → requirements-changed → spec`，先修复 OpenSpec
结构和所有实现阻断项，再重新冻结基线并执行第三轮独立 Verify。本报告保留两轮失败事实，不能被后续
通过结论覆盖或改写。

## 第三轮 Verify：体系性复审

- 冻结实现基线：`workspace:sha256:ab49368c186ac825d557e9b74447972bf8068b6690ad197fbb1f7f45e6b1b4ab`
- 全量回归：kernel/CLI/server 等 `5148` 项通过、`5` 项需要真实认证的场景如实跳过；Web `933` 项通过。
- 分发回归：bundle `21/21`、hooks、adapters、skills inventory 与 golden oracle 全部通过。
- 文档回归：10 类模板 × 2 locale、16 个双语页面、32 个公开路由、确定性同步、静态构建、project base 与 OpenSpec strict 校验通过。
- 独立轨道：代码/安全审查、真实 Chromium E2E、视觉/无障碍审查和只读 Codex CLI 审查全部完成。
- 综合结论：**FAIL**。既有正向门禁仍未覆盖下列负向安全与可访问性问题，不得进入 Ship。

### 第三轮阻断项

1. `pipeline init` 会跟随预置 Change symlink。临时仓真实负向复现把 locale sidecar、canonical state、OpenSpec scaffold 和 ledger 写入仓库外。
2. proposal 使用纯中文自定义机器章节，`openspec show --deltas-only` 因缺少 OpenSpec 1.6 所需的 `## Why` / `## What Changes` 失败；strict 与 official show/archive/apply 尚未形成同一闭环。
3. Pages smoke 对任意 `assets/**/*.js|css|woff2` 放行。注入 `dist/assets/internal-receipt.js` 后检查仍通过，不是严格闭集 allowlist。
4. 中文 16 个路由仍暴露 `Main Navigation`；正文页另有 `Sidebar Navigation`、`Pager`；搜索弹层仍有 `Close search`、`Display detailed list`、`up arrow`、`down arrow`、`enter`、`escape`。
5. breadcrumb 只有“文档首页 / 当前页”，缺少规格要求的 locale 对应内容分组。
6. `scaffold spec --strategy overwrite` 先删除旧文件再逐个发布，异常时可留下缺失或半套 scaffold；路径检查与发布之间仍有 TOCTOU 风险。
7. 首页以 `<main>` 包住完整 VitePress Layout，导致 header、导航和 footer 落入 main landmark，语义范围不正确。
8. 显式英文 Change 的部分 phase Skill 仍存在无条件“用中文记录”的冲突句，可能让 agent 生成混合语言文档。

### 第三轮已通过的浏览器与视觉证据

- 32/32 路由、32 页面与 38 个静态资源全部成功；无效路由正确返回 404。
- 每页单一 main、正文页 breadcrumb、H1、`html lang`、base、图片和跨语言 fragment 清理通过。
- 中文/英文搜索、键盘结果导航、无结果态和移动菜单通过；617 个逐路由网络事件无失败或截断。
- 320px 与桌面明暗主题无页面级水平溢出；表格保持局部滚动；最低对比度浅色 `5.21`、暗色 `5.99`。
- 无 console、page、request 或 HTTP 错误。视觉层无 High/Critical，首页中文 Hero 断行仅记为 P3。
- 截图：`/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-docs-recheck-QmNKIx/`。

### 第三轮处理决定

本轮按 `verify-fail` 返回 Build，并因 proposal 机器章节和 apply 边界属于文档契约修订，继续走
`requirements-changed` 返回 Spec。修复必须增加真实负向测试：预置 Change symlink、未知 artifact、
official OpenSpec show/archive/apply、中文静态/运行时可访问名称、breadcrumb 分组和 overwrite 中断恢复。

## 第四轮 Verify：最新冻结基线

- 冻结实现基线：`workspace:sha256:eb2b1eb76b34d8c18f344ee97e4dc6dbb6b0c03c13338da141edfd96c7e58ff6`。
- 全量构建与测试：`npm run build` 通过；kernel/CLI/server 等 `5152` 项通过，`5` 项真实认证场景如实跳过；Web `933` 项通过。
- 分发与契约：bundle `21/21`、hooks `426/426`、adapters `262/262`、skills inventory、architecture、comments、document templates、docs checks 与 golden oracle `0` 差异通过。
- OpenSpec：`show --deltas-only` 识别 `13` 个 delta，Change strict 通过；隔离副本在修正历史主 spec 的 `Purpose/Requirements` 机器标题后，官方 archive 成功应用 `9 added + 4 modified`，真实主规格总 digest 前后均为 `d356f16da9d8d81bae7849cce3eaf054de864b47501d81b271182a82696e0e93`。
- E2E 独立轨：32/32 双语路由、38 个静态资源、中文搜索、主题、320/375px、键盘、404、629 个网络事件与 console 检查通过。
- 视觉独立轨：P0/P1/P2 为 `0`，无 High/Critical；中英文客户端往返后的导航、侧栏、翻页、breadcrumb、复制与 permalink 文案均正确恢复。
- 只读 Codex 轨：发现一个有效 P2 安全阻断；另一个锁竞态指控经接口契约与全部生产调用方回读判定为误报。
- 综合结论：**FAIL**。存在路径竞态安全阻断，不得进入 Ship。

### 第四轮阻断项

1. `packages/kernel/src/state/default-openspec-scaffold.ts` 在 `pipeline init` 已提交 canonical Change、但 fallback proposal/design/tasks 尚未创建的窗口，直接对 `dirname(target)` 执行递归 `mkdir` 并发布文件。若 Change 根在该窗口被替换为 symlink，路径会跟随到仓库外。该入口尚未复用 `ensureTrustedProjectDirectory`，也没有覆盖“init 与 scaffold 之间替换根目录”的负向测试。

### 逐文件规范回读

本轮按 `git status --short` 与 `git diff --name-only` 逐项回读；以下映射覆盖当前全部变更文件与新增文件：

| 文件范围 | 对应 capability spec | 回读与 diff 比对 |
| --- | --- | --- |
| `README*.md`、`docs-site/**`、`docs/usage/**`、`.github/workflows/docs-pages.yml`、Dashboard Overview 源码/测试/构建产物 | `openspec/specs/open-source-documentation-experience/spec.md` | 已完成 |
| `templates/documents/**`、`packages/kernel/src/documents/**`、locale/scaffold/handoff/Loop 源码与测试、相关 Skills | `openspec/specs/open-source-documentation-experience/spec.md`、`declarative-document-governance/spec.md`、`document-evidence-contract/spec.md` | 已完成 |
| `packages/kernel/src/state/**`、`packages/kernel/src/workflow/**`、`packages/cli/src/commands/document*`、`init*`、`scaffold*` 与对应集成测试 | `declarative-document-governance/spec.md`、`effective-workflow-plan/spec.md`、`workspace-verification-integrity/spec.md` | 已完成 |
| `hooks/router.sh`、`hooks/breadcrumb.sh`、`hooks/host-session-binding.sh`、session/terminal hook 测试 | `normal-chat-routing/spec.md`、`plugin-runtime/spec.md` | 已完成 |
| `packages/automation/**`、Loop reconciliation 与 handoff 相关文件 | `automation-loop-init/spec.md`、`effective-workflow-plan/spec.md` | 已完成 |
| `package*.json`、CI、bundle/server/dashboard dist、`tools/**`、`docs/CONTRACT.md` | `plugin-distribution/spec.md`、`plugin-runtime/spec.md`、`repository-architecture-compliance/spec.md` | 已完成 |
| Change 的 proposal/design/tasks/delta、ADR、Superpowers 研究/设计/计划/报告 | `open-source-documentation-experience/spec.md` 与当前 Change delta | 已完成 |

### 第四轮处理决定

本轮必须通过 `verify-fail` 返回 Build。修复应让 fallback OpenSpec scaffold 接收可信项目根，并在任何
`mkdir`、locale pin、文件发布或 ledger 写入前拒绝被替换的 Change 根；新增真实临时目录负向测试后，
重新冻结新的 workspace baseline 并重跑代码、E2E、视觉与 OpenSpec 隔离演练。

## 第五轮 Verify：崩溃恢复与 fallback 修复后复审

- 冻结实现基线：`workspace:sha256:b909655a91fc2448558f72a7a2c2f87ab07d605052c9d2329d84350af32e2ffe`。
- 构建与分发：`npm run build`、bundle `23/23`、hooks `426/426`、adapters `262/262`、
  skills inventory、architecture、comments、docs build/check/smoke 和 oracle `0` 差异通过。
- 测试：全量 Vitest 在并行重负载下出现 2 个资源敏感失败（5 秒 timeout、SIGINT exit code
  `null`），其余 `5153` 项通过、`5` 项诚实跳过；两个失败文件随后独占串行复跑 `16/16` 通过。
  Web `933/933` 通过，既有 React `act(...)` 警告未伪装为失败。
- OpenSpec：`show --deltas-only` 识别 `13` 个 delta，当前 Change strict 通过。隔离副本的普通
  archive 因主规格已被早期流程提前应用而正确拒绝重复 ADDED；`--skip-specs` 归档演练成功。
- E2E 独立轨：最终 **PASS**。隔离首装、中文默认文档、receipt、迁移、N-1、32 个双语路由、
  搜索、base path 与 artifact 安全检查通过。一次把 `node_modules` 软链回主仓的非自足副本被
  敏感路径扫描拒绝；使用实体本地依赖的主仓和实体副本对照均通过，因此判定为安全门按预期工作。
- 视觉/浏览器独立轨：**FAIL**。32 个正式路由、明暗主题、320/375px、搜索、键盘焦点、语言切换、
  fragment 清理、breadcrumb、上下页和安全检查通过，但中文未知路由的 404 正文仍为英文，且页面
  没有 `<main>` landmark。截图：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-docs-final-PLn7xp/zh-404-desktop.png`。
- 代码/安全独立轨：**FAIL**，无 Critical，复现 3 个必须回 Build 的实现问题。只读 Codex CLI
  审查在独立轨已判失败后终止，未虚构 PASS 结论。
- 综合结论：**FAIL**。不得进入 Ship。

### 第五轮阻断项

1. 中文 404 页面仍显示 `PAGE NOT FOUND`、英文引语和 `Take me home`，并且 `mainCount=0`。
2. 有 host `session_id` 但没有精确 binding 的新会话，泛化“继续执行”仍会回退仓库级
   `.pipeline-active`；只读复现返回本 Change 的 `intent: resume`。精确会话绑定没有真正形成
   fail-closed 隔离。
3. default OpenSpec fallback 仍是“校验路径后按路径发布”。调用前 symlink 测试已通过，但校验与
   `link` 之间替换 Change 根的 TOCTOU 没有被目录身份或同一 init 事务消除。
4. overwrite scaffold 的事务在 `beforeCommit` 后父目录被替换时可报 `ENOENT`，旧目录、stage 和
   receipt 留在被移走的父目录，而新的正式 `docs/specs` 路径缺失；现有测试未覆盖父目录身份替换和
   rollback failure。

### 第五轮审计说明

- 主规格在早期 Verify 已被提前应用，这是既成历史偏差；当前 Verify 没有再次写真实主规格。Ship 必须
  用逐 capability before/after digest 和 `no-op` 结果生成真实 `applied-spec.md`，Archive 只能
  `--skip-specs`。该收据能恢复可追溯性，但不会把早期越界描述成未发生。
- 冻结 N-1 reader 是离线硬门，真实上一发行版在本机可用时也通过；干净 CI 尚未固定下载/缓存一个
  真实上一发行版 artifact。此项作为发行增强保留，不覆盖本轮四个确定性阻断。
- 第五轮按真实 `verify-fail` 返回 Build；必须增加新会话无 binding、检查后根替换、父目录替换、
  rollback failure 和中文 404 的负向测试，再冻结新基线重跑全部独立轨。

## 第六轮 Verify：原子初始化、顶层事务与双语 404 修复后复审

- 冻结实现基线：`workspace:sha256:0025ab9b91f74522202bc2cbd24f71db90fcc0032c4e02e6393841f34a54c1b3`。
- 全量自动门禁：第二次完整 Vitest 为 `295/295` 文件、`5157` 项通过、`5` 项真实认证场景诚实跳过；
  Web `933/933`、hooks `429/429`、adapters `262/262`、bundle `23/23`、document templates、
  architecture、comments、default workflow freshness、docs check/build/smoke 和 oracle `0` 差异通过。
  首次并行重负载中的 Tap SIGINT `code=null` 用例随后独占连续三次 `7/7` 通过，第二次全量也通过。
- OpenSpec：official show 识别 `13` 个 delta，strict 通过；隔离副本使用 `--skip-specs` 的官方 archive
  成功，未修改真实主规格或当前 Change。
- E2E 独立轨：**PASS**。实体依赖隔离副本完成 32/32 路由、双语搜索、project base、default init、
  host-session 隔离、overwrite 恢复和真实 N-1 本机交叉读取。
- 视觉独立轨：**PASS**。中英文未知路由均返回 HTTP 404，语言、唯一语义 main、文案、返回链接、
  键盘焦点、skip link、主题与 320/375px 响应式通过；P0/P1/P2 为 0。
- 代码/安全独立轨：**FAIL**，Critical 为 0；发现两个必须回 Build 的并发/发行阻断，以及两个需要
  在下一次冻结与 Ship 收据中闭环的生命周期问题。
- 综合结论：**FAIL**。不得进入 Ship。

### 第六轮阻断项

1. overwrite 为抵抗父目录替换而把发布 envelope 扩大到整个 `openspec/`，但复制快照后若
   `openspec/changes/**` 有并发写入，整体替换会把该写入回退。事务必须在 original move 后核验
   backup 与初始快照，发现任何并发漂移就原样回滚并保留恢复证据。
2. CI 的 N-1 fixture 只从固定 commit 提取 `packages/cli/dist/pipeline.mjs`；旧 CLI 运行时还需要
   同版本 `templates/manifest.yaml` 等完整 release payload。按 CI 形状真实运行得到 `22/23`，
   `ENOENT templates/manifest.yaml`，因此必须固定并校验完整旧 payload。
3. 独立审查计算出的当前 workspace fingerprint 与冻结值不一致；下一轮 Build 必须重新执行合法
   `build-complete` 冻结，并由 Verify 出口 barrier 复算，不能沿用本轮基线。
4. 主规格早期被 Verify 越界应用的历史事实仍需要机器绑定的迁移审计证据；正式 `applied-spec.md`
   仍只能由 Ship 生成 no-op/同语义收据，Archive 继续使用 `--skip-specs`，不得反写历史。

### 第六轮处理决定

按 `verify-fail` 返回 Build。先增加并发 sibling 写入不丢失、完整 N-1 payload 和 raced symlink
fail-loud 回归，完成红绿重构与全量门禁后重新冻结；下一轮代码审查必须基于新基线，并把历史应用
迁移证据与 Ship 的正式 applied-spec owner 边界分开验证。

## 第七轮 Verify：长会话凭据与第六轮阻断修复后复审

- 冻结实现基线：`workspace:sha256:1acb46d6ab601176aec69edfaa8ee25477d52f340900f4cebc099c753982cb7d`；
  三条独立轨起止复算一致，没有评审移动靶。
- 全量自动门禁：`npm run build` 通过；Vitest `295/295` 文件、`5159` 项通过、`5` 项真实认证场景
  诚实跳过；Web `933/933`、hooks `429/429`、adapters `262/262`、bundle `23/23`、architecture、
  comments、document templates、docs check/build/smoke 和 oracle `0` 差异通过。
- OpenSpec：official show 识别 `13` 个 delta，strict 通过；机器迁移 receipt 重建为
  `verified-pending`。隔离副本使用 `--skip-specs` 的官方 archive 成功，真实 Change 和主规格未被
  Verify 修改。
- E2E 独立轨：**PASS**。完整 N-1 payload 的 13 个发行入口齐全，当前/上一发行版均可读取新 Change；
  setup/update dry-run、稳定 hook、default/simple/free/custom workflow、中文治理文档、Dashboard 健康
  入口、32/32 文档路由和双语搜索索引通过。
- 视觉/浏览器独立轨：**FAIL（P2）**。文档站的中英文、搜索、中文 404、320px 深色、键盘焦点和
  无横向溢出通过；fresh Dashboard 的运行中/等待中语义正确，移动端通过，但 1440px 首屏没有自动
  定位当前 Verify 阶段，需要横向滚动约 780px 才能看到当前卡片。
- 代码/安全独立轨：**FAIL（High 3）**，Critical 为 `0`。冻结基线、竞争 symlink、完整 N-1 payload、
  架构与注释门禁均通过，但发现三个可重复的并发/宿主 ABI 阻断。
- 综合结论：**FAIL**。不得进入 Ship。

### 第七轮阻断项

1. overwrite envelope 在 backup digest 校验后仍允许已经打开 sibling 文件描述符的 writer 写入旧 inode；
   事务随后发布 stage 并删除 backup，导致该并发更新不可见。现有校验只覆盖路径型提交前写入，不是
   真正的 sibling 原子 CAS。
2. `reconcile-spec-application.mjs --apply` 在 digest 复核与普通 `rename` 之间仍有竞态，且迁移器尚未
   成为 Ship 的机器 guard。JSON 中的 `shipPolicy` 说明不能替代可执行门禁和正式 `applied-spec.md`。
3. 当前 Codex Desktop 的真实 `custom_tool_call_output` 成功/失败状态使用 `Script completed` /
   `Script failed` 内容块；凭据解析器仍只接受数值 `exit_code` 或旧文本模式。按真实 ABI 构造的已完成
   Skill read 返回空集合，仍可能让缺 PostToolUse 的长会话永久卡在“Skill 未执行”。
4. Dashboard 桌面阶段轨没有在首次呈现时把当前 phase 滚入可视区；状态已经是“验证运行中”，但首屏
   仍停在早期阶段，造成用户感知为任务没有推进。

### 第七轮浏览器证据

- fresh Dashboard 使用 `18766` 验证：运行中 `1`、等待中 `0`，当前任务显示“验证运行中/终端运行中”；
  临时服务已关闭，既有 `18765` 服务未被修改。
- 文档与 Dashboard 截图位于
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-final-verify-HwJRhE/`，包括中文首页、搜索、
  404、320px 深色、Dashboard 首屏、滚动到当前阶段和移动端。
- 尚未验证远程 GitHub Pages；只有提交并推送 `main` 后的 Actions 部署成功和公开 URL HTTP/浏览器
  复核才能记为通过。

### 第七轮处理决定

按真实 `verify-fail` 返回 Build。下一轮必须用不会移动 sibling 命名空间的发布边界或等价 MVCC 设计
消除 open-FD 丢更新，用可执行 CAS/Ship guard 绑定主规格迁移，按当前宿主内容块解析完成态并增加真实
ABI fixture，同时让 Dashboard 初始定位当前 phase。修复后重新冻结并重跑三条独立验证轨。

## 第八轮 Verify：阶段定位与迁移 CAS 修复后复审

- 冻结实现基线：`workspace:sha256:cd3d46668e51d0d38719021d1a813c107858778ca499b25c941c50554c498330`；
  E2E 轨起止复算一致，所有独立轨均只读当前冻结工作区。
- 全量自动门禁：`npm run build` 通过；Vitest `5161` 项通过、`5` 项真实认证场景诚实跳过；
  Web `934/934`、hooks `429/429`、adapters `262/262`、bundle `23/23`、architecture、comments、
  document templates、docs check/build/smoke、OpenSpec strict 和 oracle `0` 差异通过。
- E2E 独立轨：**PASS**，可计数自动断言 `865/865`；完整 N-1 payload `13/13`，setup/update/runtime
  `78/78`，新增 migration CAS `2/2`，overwrite、当前 Codex ABI 和 Ship Skill 编排定向回归通过；
  fresh Dashboard 与 32/32 双语文档路由、搜索索引均返回 HTTP 200。
- 视觉/浏览器独立轨：**PASS**，P0/P1/P2 为 `0`。1440px 首次加载时 Verify 完整居中可见，
  `running=1`、`waiting=0`；用户手动横向滚动后等待 2.6 秒未被单轨自身抢回。中英文、深色、
  375px、搜索、导航和键盘路径通过。
- 代码/安全独立轨与只读 Codex 轨：**FAIL**。正向测试未覆盖最终 rename 窗口、路径信任边界、
  运行时 Ship guard 和多工作流滚动隔离，确认下列阻断问题。
- 综合结论：**FAIL**。不得进入 Ship。

### 第八轮阻断项

1. `specScaffoldTransaction` 已正确把事务所有权收窄到 `specDirectory`，外部 sibling 命名空间和其
   open-FD 更新能够保留；但目标目录自身的旧 inode 在 digest 校验后仍可被预先打开的 FD 写入，
   随后 backup 被删除，更新会丢失。现有 open-FD 测试只覆盖目标目录外 sibling，未覆盖目标目录内窗口。
2. `spec-migration-cas.mjs` 没有可信项目根/普通父目录约束，父目录 symlink 可把 CAS 写到仓库外。
   同时最终 digest 检查和 `rename` 之间仍有 TOCTOU，竞争写可在检查后被静默覆盖。
3. migration lock 的 stale 回收与 finally 清理没有 owner token、PID/start-time 或 inode 身份校验；
   两个回收者可根据旧观察删除新持有者的锁并同时进入临界区。
4. `reconcile-spec-application.mjs` 没有验证 receipt 的 `change` 等于 CLI `--change`，也没有把
   `mainSpecPath`、`deltaSpecPath` 和 Change source 约束为仓库内可信普通路径。
5. Ship 迁移门只存在于 `pipeline-ship/SKILL.md` 的文字与 `verify-skills.sh` grep；运行时
   `ship-complete` guard 仍不检查 migration receipt、受管执行结果、`effect` 或 after digest，
   因而可跳过迁移直接推进。
6. Codex content-array 若同时含 `Script failed` 和结构化 `exit_code: 0`，当前解析器会先接受首个
   数值状态；多个相互冲突的结构化 exit code 也没有 fail-closed。
7. Dashboard 单工作流首次定位和手动滚动稳定性已通过真实浏览器，但多个 workflow 共用一个组合
   dependency key；任一组 phase 变化会重新滚动全部 viewport，覆盖其他组的用户滚动位置。

### 第八轮浏览器与 E2E 证据

- Dashboard fresh 端口 `18766`、文档 preview `43186`；验收后均已关闭，既有 `18765` 未改动。
- 截图目录：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-verify-round8-axeM0X/`。
- 远程 GitHub Pages 尚未部署；只有最终提交并推送 `main` 后的 Actions 和公开 URL 复核才能记为通过。
- 未实际修改用户全局 Codex/Claude 安装；由当前 bundle dry-run、隔离发布、真实上一发行版 payload
  与 adapter 临时安装 E2E 覆盖，不虚构外部宿主结果。

### 第八轮处理决定

按真实 `verify-fail` 返回 Build。下一轮必须把文件迁移升级为仓库锚定、owner-bound lock 和
无检查后覆盖窗口的提交协议；把 migration receipt/result 变成运行时 Ship guard 的机器证据；
让 Codex ABI 对冲突状态 fail-closed；按 workflow 单独记录首次定位，避免一组变化重滚其他组；
并增加目标目录内 open-FD、symlink escape、最终 CAS race、stale-lock 双回收、绕过 Ship guard、
冲突 ABI 和多组滚动的负向回归。

## 第九轮 Verify：不可变 Workflow 快照首轮复审

- 冻结实现基线：`workspace:sha256:82c0e831d5483227e7cc70fb72c8c1f9f42ebc115f9801b0607bf5074c0dc41d`。
- 自动门禁：Vitest `5171` 项通过、`5` 项真实认证场景诚实跳过；Web `935/935`、hooks
  `429/429`、adapters `262/262`、bundle `23/23`、migration CAS `7/7`、architecture、
  comments、document templates、docs check/build/smoke 和 oracle `0` 差异通过。
- 综合结论：**FAIL**。只读 Codex 轨在独立复核开始后发现冻结快照消费链遗漏，基线随即作废；
  其他独立轨已停止，未把未完成的审查伪装为 PASS。

### 第九轮阻断项

1. `packages/server/src/snapshot.ts` 的 Dashboard 聚合路径只把 workflow 指纹传给
   `resolveBoundEffectiveWorkflowPlan`，没有传 `StateStore.read()` 已附加的不可变 workflow snapshot。
   因而 workflow 升级或删除后，CLI 可继续旧 Change，但 UI 仍会因当前定义漂移而把同一 Change 判坏。
2. `packages/kernel/src/state/initial-change-publish.ts` 在 `assertMissing(finalChangeDir)` 后使用普通目录
   `rename`；POSIX 可在检查后出现空目标目录时替换它。初始化发布仍缺少对目标名的无覆盖所有权协议，
   需要把竞争方存在与正式 Change 发布严格区分。

### 第九轮处理决定

按真实 `verify-fail` 返回 Build。修复 Dashboard 快照消费链并增加 workflow 定义删除后的 UI 投影回归；
同时收紧初始化目录发布的独占所有权与竞争测试。完成后重新冻结基线并从头执行独立代码、E2E、视觉和
只读 Codex 复核。

## 第十轮 Verify：冻结 Workflow 快照与初始化发布修复后复审

- 冻结实现基线：`workspace:sha256:85ddc74b0f891980f5b377425d6eb68a5785d13d6fe7b53e47eb7a2bf4d703a1`；
  代码、E2E 与视觉轨起止复核一致，没有评审移动靶。
- 自动门禁：全量 Vitest `296/296` 文件、`5173` 项通过、`5` 项真实认证场景诚实跳过；Web
  `935/935` 通过；全栈构建、architecture、comments、document templates、docs check/build/smoke
  与 `git diff --check` 通过。
- E2E 独立轨：**PASS**。bundle 首装 `23/23`、setup/update/runtime/workflow/中文文档
  `127/127`、normal-chat 与 hooks `429/429`、文档站 `32/32` 路由、隔离 setup/update dry-run、
  fresh Dashboard 和冻结基线复核全部通过。
- 视觉/浏览器独立轨：**FAIL（P2 2 项）**。文档站双语、主题、搜索、键盘、320px、404 和
  project base 通过；Dashboard 运行中 `1`、等待中 `0`、当前 Verify 居中和七阶段语义正确。
- 代码/安全独立轨：**FAIL（Important 2 项）**，Critical 为 `0`。只读 Codex CLI 轨在其他
  独立轨已经确定失败后终止，未把不完整审查伪装为 PASS。
- OpenSpec 即时回灌：受 CAS 保护的第一次应用返回 `changed`，第二次返回 `no-op`，主规格摘要
  收敛为 `bce48df61787d8d9960b3b133dde538eb6417446f01dd9a17157329622ca0789`；正式
  `applied-spec.md` 仍由后续 Ship owner 生成。
- 综合结论：**FAIL**。不得进入 Ship。

### 第十轮阻断项

1. `tools/spec-migration-cas.mjs` 只在加锁前验证可信父路径。校验后把项目内父目录替换为指向仓库外
   的 symlink，并在外部放入相同摘要文件时，后续 `rename/link` 会沿新路径修改外部文件。必须把
   父目录设备号/inode/realpath 身份绑定到整个 CAS 提交窗口并补确定性负向测试。
2. custom Workflow 的 CLI、Server 与 Dashboard 已消费初始化时冻结的
   `workflowPlanSnapshot`，但 `pipeline` Skill 的恢复说明仍要求读取可变
   `.pipeline/workflows/<workflow>.yaml` 决定 Skill DAG。Workflow 更新或删除后，Agent 与运行时会
   使用不同图。必须提供 snapshot-aware 的公共 plan/step 命令，并让 Skill、Todo 与 dispatch 只消费它。
3. Dashboard 在 375px 英文模式下 `scrollWidth=441`、`clientWidth=375`，产生页面级横向溢出；
   中文状态 tab 还会逐字竖排。窄屏 tab 必须允许局部滚动或稳定换行，但不得扩大页面宽度。
4. Dashboard 切到英文后仍显示“进度”“按工作流筛选”“项目/流程/阶段/工作流/终端运行中/打开”等
   中文文案，设置区也混用“深色/中文”。必须补齐此路径的 locale 资源和真实浏览器断言。

### 第十轮处理决定

按真实 `verify-fail` 返回 Build。修复必须保持冻结 workflow 为单一执行真相、把迁移 CAS 绑定到可信
目录身份，并同时修复 Dashboard 窄屏与英文 locale；随后重新冻结新基线，从头执行代码、E2E、视觉和
只读 Codex 四轨复核。

## 第十一轮 Verify：冻结计划公共入口与 Dashboard 修复后复审

- 冻结实现基线：
  `workspace:sha256:4911cf243c18f9d34d6216f64cab9e8f888d390d75311b530b51c8e64aec98f3`；
  代码、E2E 与视觉轨起止复核一致。
- 全量自动门禁：全量 Vitest `297/297` 文件、`5176` 项通过、`5` 项真实认证场景诚实跳过；
  Web `939/939`、hooks `429/429`、bundle `23/23`、migration CAS `9/9`、全栈构建、
  architecture、comments、document templates、docs check/build/smoke 和 `git diff --check` 通过。
- E2E 独立轨：**PASS**。可计数断言 `665/665`；冻结 Workflow 计划、真实 dist CLI、完整
  N-1 payload、setup/update/runtime、default/simple/free/custom、中文文档、32/32 文档路由和
  fresh Dashboard 健康入口均通过。
- 视觉/浏览器独立轨：**PASS**，P0/P1/P2 为 `0`。Dashboard 375px 中英文无页面级横向溢出，
  状态页签保持单行局部滚动，Progress、Canvas、Settings 英文可见文案不再混入中文；当前 Verify
  居中且运行中 `1`、等待中 `0`。文档站双语、320px、深色、搜索、键盘、base path 和中文 404
  通过。
- 代码/安全独立轨：**FAIL（Important 1、Minor 1）**，Critical 为 `0`。公开冻结 Workflow
  计划入口已经关闭上一轮 Agent/运行时分图缺陷，但迁移 CAS 的目录身份检查仍不能消除
  check-to-syscall 窗口。
- Codex CLI 轨：已启动只读复核，但当前全局安装仍是上一发行版 `0.2.0`，其旧 Skill 与本工作区
  新协议不一致，且本机 Codex 日志数据库/模型缓存报告异常；本轮不把该异常进程伪装为 PASS。
- 综合结论：**FAIL**。不得进入 Ship。

### 第十一轮阻断项

1. `tools/spec-migration-cas.mjs` 虽在关键操作前后复验 target parent 的
   `dev/ino/realpath`，实际移动和发布仍使用 pathname-based `rename/link`。攻击进程可在最后一次
   身份检查返回后、系统调用进入内核前把父目录替换成仓库外 symlink；发布会跟随新父路径在仓库外
   创建 expected 内容。事后检查只能发现漂移，不能撤销已经发生的仓库外写入。该问题必须改为由
   已验证目录句柄锚定的 `openat/linkat/renameat`（或等价原生原语）执行，不能继续增加前后路径检查。
2. `docs/CONTRACT.md` 仍把 custom `check` 描述为运行时读取可变
   `.pipeline/workflows/<workflow>.yaml`；当前真实实现已优先消费 WorkflowRun 冻结快照，契约需要同步。

### 第十一轮浏览器与 E2E 证据

- Dashboard 临时端口 `18769`、E2E 健康入口 `19880`；文档临时端口 `43189`、E2E 路由入口
  `4183`。验收后均已关闭，既有 `18765` 未修改。
- 视觉截图目录：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-verify-round11-pxDuDX/`。
- 尚未验证远程 GitHub Pages；只有最终提交并推送 `main` 后的 Actions 和公开 URL 复核才能记为通过。
- 未真实改写用户全局 Codex/Claude 安装；setup/update 使用当前 bundle 的隔离目录与 dry-run 验证。

### 第十一轮处理决定

按真实 `verify-fail` 返回 Build。把历史主规格迁移的提交边界收敛为目录描述符锚定的原生事务，
让任何父目录 rename/symlink 竞争都只能失败关闭且零仓库外写入；同步修正文档契约后重新冻结，
从头执行代码、E2E、视觉与 Codex 降级语义清晰的独立复核。

## 第十二轮 Verify：目录 FD 锚定迁移复审

- 冻结实现基线：
  `workspace:sha256:0739b79affbfac2bbaa26339f874f2b538c6d04a57b96a482016073ab0080dbe`；
  代码、E2E 与视觉轨起止复核一致。
- 全量自动门禁：Vitest `297/297` 文件、`5176` 项通过、`5` 项真实认证场景诚实跳过；
  Web `939/939`、hooks `429/429`、adapters `262/262`、bundle `23/23`、migration CAS
  `10/10`、oracle `0` 差异、全栈构建、architecture、comments、document templates、
  docs check/build/smoke 和 `git diff --check` 通过。
- E2E 独立轨：**PASS**。可计数断言 `604/604`；macOS Apple Clang 真实编译并执行 native helper，
  两次 reconcile 均为 `no-op`，冻结 Workflow dist 黑盒、完整 N-1 payload、setup/update/runtime、
  default/simple/free/custom、中文文档、32/32 文档路由和 fresh Dashboard 通过。
- 视觉/浏览器独立轨：**PASS**，P0/P1/P2 为 `0`。Dashboard 375px 中英文无全局横溢，
  tab 单行局部滚动，英文 Progress/Canvas/Settings 无中文混入，当前 Verify 居中且运行中 `1`、
  等待中 `0`；文档站双语、320px、深色、搜索、键盘、base path 和中文 404 通过。
- 代码/安全独立轨：**FAIL（Important 4）**，Critical/Minor 为 `0`。上一轮狭义的父路径 symlink
  导航问题已经关闭，但内容线性化、owner lock、发行边界和结果 evidence writer 仍有确定性缺陷。
- Codex CLI 轨：本机 `logs_2.sqlite` 损坏、model cache schema 漂移且 Skill 上下文被压缩；
  该轨输出不能代替独立 reviewer 结论，本轮按降级记录，不伪装 PASS。
- 综合结论：**FAIL**。不得进入 Ship。

### 第十二轮阻断项

1. native helper 在 `file_equals_fd(target, observed)` 后关闭目标 FD，经过 `MOVING` controller 窗口后
   直接 rename。此窗口对同 inode 写入 `concurrent` 时，事务错误返回 `changed`，正式目标变为
   expected，recovery 却保存 concurrent；`beforeDigest` 仍声称 observed。必须把 observed 恢复证据
   做成独立内容快照，并在 rename 线性化之后再次比对移走 inode；漂移时拒绝并恢复竞争内容。
2. helper 获取 owner lock 后，cleanup 只凭固定文件名 unlink。竞争方删掉旧 lock 并创建新 lock 时，
   当前事务会删除新 owner 的文件。必须保存 lock 的 `dev/ino`，每个提交点复验，释放前仅删除同一
   inode；身份漂移时保留竞争方 lock 并失败关闭。
3. `pipeline-ship` 把仓库历史迁移脚本写成所有安装用户的强制命令，但 managed release 没有分发
   reconcile/CAS/C helper；helper 还只支持 macOS/Linux 且依赖 `/usr/bin/cc`，与公开 Windows
   安装位置冲突。该迁移属于本仓一次性 release-maintenance，不是插件用户能力；必须从打包 Skill
   公共流程剥离，安装包只消费已完成的主规格与 typed evidence guard。
4. `spec-application-result.json` 仍通过路径检查后的 `writeFile(temp) + rename(result)` 覆盖发布，
   父目录在检查后换成仓外 symlink 时仍可写出仓库或覆盖外部结果。一次性迁移结果必须改为已审计
   receipt 的只读验证，删除 pathname writer；不得为写结果再开第二套较弱事务。

### 第十二轮浏览器与 E2E 证据

- Dashboard 视觉端口 `18770`、E2E 端口 `19881`；文档视觉端口 `43190`、E2E 端口 `4184`。
  验收后均已关闭，既有 `18765` 仍为 HTTP 200，未被修改。
- 视觉截图目录：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-verify-round12-4MJhVh/`。
- 远程 GitHub Pages 尚未部署；真实全局宿主安装未改写，setup/update 使用隔离目录和 dry-run。

### 第十二轮处理决定

按真实 `verify-fail` 返回 Build。下一轮将恢复证据从可继续被旧 FD 改写的原 inode 改为独立 observed
快照，以 rename 后复核确定线性化点；owner lock 按 inode 释放；公共 Ship Skill 只消费已提交的 typed
migration evidence，不执行未分发的一次性仓库工具；删除结果 pathname writer。完成确定性反例、
Linux/macOS 编译和发行边界测试后重新冻结。

## 第十三轮 Verify：发行边界修复后的冻结基线复审

- 冻结实现基线：
  `workspace:sha256:323bc6cf1c89e316d9ac6641aada45454c372bd3414e8547843f550af54e6cc2`。
- 代码/安全独立轨：**PASS**，Blocker `0`、Important `0`、Nit `1`。第十二轮的内容线性化、
  owner lock、公开 Ship Skill 发行边界和结果 evidence writer 四项问题均已关闭。
- 浏览器独立轨：**PASS**，P0/P1/P2 均为 `0`。文档站首页、中文指南、安装页、导航、主要链接、
  320px 响应式和 hydration 通过；浏览器控制台、页面和请求错误为 `0`。
- E2E 隔离轨：migration CAS `13/13`、Darwin 原生编译、Linux musl/glibc 编译、runtime
  `15/15`、bundle `23/23`、managed payload 闭集、双语文档构建与 smoke 全部通过，可计数断言
  `54/54`。
- 主执行轨：Vitest `297/297` 文件、`5176` 项通过、`5` 项真实认证场景诚实跳过；Web
  `939/939`、hooks `429/429`、bundle `23/23`、migration CAS `13/13`、全栈构建、文档、
  architecture、comments 和 `git diff --check` 通过。
- 综合结论：**FAIL（冻结基线漂移）**。冻结之后主执行轨再次运行会重写受指纹约束的构建产物，
  实时工作区指纹变为
  `workspace:sha256:6c4f16dbe701fa150734970f135a82e814ecfefacf9259fab5e165fb3297b94b`，
  不再等于本轮冻结基线。即使产物内容和功能门禁均通过，也不能对旧验收靶发布 PASS。

### 第十三轮处理决定

按真实 `verify-fail` 返回 Build。在当前构建产物稳定后重新登记并冻结，不再在新冻结点之后运行会写
工作区的生成或构建命令；下一轮只使用只读测试、隔离副本构建和浏览器服务完成最终复验。

## 第十四轮 Verify：稳定冻结靶只读复验

- 冻结实现基线：
  `workspace:sha256:6c4f16dbe701fa150734970f135a82e814ecfefacf9259fab5e165fb3297b94b`。
  canonical `build_sha`、验收前后实时 `fingerprintWorkspace` 与 Verify phase 三重一致。
- 代码/安全独立轨：**PASS**，Blocker `0`、Important `0`、Nit `0`。Git 状态集合与第十三轮
  一致，重新冻结后没有源码或产品配置变化，`git diff --check` 通过。
- E2E 隔离轨：**PASS**。关键实现摘要与第十三轮已验快照完全相同，复用相同内容哈希下的
  `54/54` 隔离证据；再次只读确认公开 Ship Skill 无内部迁移工具依赖、结果 pathname writer 已删除、
  managed payload 闭集正确。
- 浏览器独立轨：**PASS**。只使用既有文档站产物启动预览，没有执行 build；首页、中文快速开始、
  1440px 和 320px 响应式通过，console、page error、request failed 均为 `0`。
- Codex CLI 第三轨：本机只读复核通道仍受 `logs_2.sqlite` 损坏、model cache schema 漂移和旧版
  Skill 上下文限制，不能作为独立结论；按允许的降级语义记录，由独立代码审查、E2E、浏览器验收和
  主执行轨共同支撑最终通过，不伪造该通道的发现。
- 综合结论：**PASS**。Blocker `0`、Important `0`；仅保留 Vite 单 chunk 大于 500KB 和一次高并发
  测试默认 5 秒超时的非阻断观察，后者在单文件与主执行轨全量重跑中均通过。

### 第十四轮浏览器与发布边界证据

- 浏览器临时端口 `43207`，验收后已关闭；既有 `18765` 未修改。
- 截图目录：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/pipeline-verify-round14-browser/`。
- 主仓 Verify 窗口没有运行任何会重写工作区的构建命令，末次复算仍为冻结 SHA。
- 远程 GitHub Pages 仍需在提交并推送 `main` 后由 Actions 和公开 URL 复核。
