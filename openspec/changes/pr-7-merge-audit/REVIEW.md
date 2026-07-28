# PR #7 合并审查

## Build · Dashboard `design-taste-frontend` 第一次审查

- 时间：2026-07-29 01:33–01:36（Asia/Shanghai）
- 运行入口：`http://127.0.0.1:19767/`
- 运行产物：当前 worktree 的 `packages/dashboard-app/dist` 与
  `packages/server/dist/dashboard.mjs`
- 项目：`/Users/a1234/.codex/worktrees/fc73/pipeline-worklfow`
- 页面：Progress → `pr-7-merge-audit` → Context Bundle 预算预览
- 覆盖：
  - 1200×814 浅色中文；
  - 390×844 浅色中文；
  - Darwin 可信读取能力缺失的真实 501 错误态；
  - 抽屉初始 focus、内部滚动与无页面横向溢出。

### Findings

| Severity | Finding | 处置 |
| --- | --- | --- |
| MEDIUM | 预览提交按钮静态使用 `bg-btn-hover`，把 hover token 当成 resting token，和 Dashboard 既有 primary action 状态词汇不一致。 | 改为 `bg-btn-bg`，仅在 `hover:` 使用 `bg-btn-hover`；transition 限定为背景色与 transform。 |
| MEDIUM | 错误 code 未声明断词；当前 390 px 视口尚未溢出，但更长的资源限制 code 会成为窄屏横向溢出风险。 | 预算错误与一般错误 code 均增加 `break-all`。 |

第一次截图：

- `/tmp/pr7-dashboard-desktop-first.png`
  (`sha256:84e686b587423a338f604b8470d0a2aec26409424b521ea0f318a7a76083aa87`)
- `/tmp/pr7-dashboard-preview-mobile-first.png`
  (`sha256:d0cdaee305f5ca46b6c13b8719130c0d8c6afea84239c8b6dff9eee98c48955b`)

## Build · 修复后第二次审查

- 定向测试：
  `ContextBundlePreview.test.tsx` 与 `ProgressDrawer.test.tsx`，17/17 通过。
- 生产构建：`npm run build:web` 通过。
- 视口与主题：
  - 390×844，浅色中文；
  - 768×900，深色英文；
  - 1440×900，浅色中文。
- 交互与可访问性：
  - 三个视口均 `documentElement.scrollWidth === innerWidth`；
  - 目标阶段、预算和提交按钮键盘可达；
  - HTML `min=1` 对 `0` 触发原生 range-underflow；
  - 修正预算后重试真实返回并呈现
    `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`；
  - 普通用户点击卡片打开抽屉后，初始 focus 在关闭按钮；Escape 关闭后 focus
    回到 `prg-cv-chg-pr-7-merge-audit`；
  - `prefers-reduced-motion: reduce` 下抽屉即时呈现
    `transform: matrix(1, 0, 0, 1, 0, 0)`，关闭后仍恢复 focus；
  - 唯一 console error 是被 UI 明确处理并按合同展示的 Darwin 501 HTTP 响应。
- 修复后截图：
  - `/tmp/pr7-dashboard-preview-mobile-second.png`
    (`sha256:f13896af4df177b60a44e345aea533cfd35c280eaf8d110c49e75ba4098ff96b`)
  - `/tmp/pr7-dashboard-preview-tablet-dark-en-second.png`
    (`sha256:01f535be4d3ada807a29dd862058746d6e6b45532001d02766ed57c04f48f53f`)
  - `/tmp/pr7-dashboard-preview-wide-light-zh-second.png`
    (`sha256:30176860300bda8063795b8ff59c63cfe9aa6019b4a960cd88a5dfcaa88f9368`)

结论：第二次 `frontend-design` + `design-taste-frontend` 审查未发现剩余
CRITICAL / HIGH / MEDIUM；两个 MEDIUM 均已修复并由真实运行态复核。

## Build · pre-Verify 全量收敛审查

### 比较边界

- 基线：`origin/main@8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
- 待冻结分支起点：`af34df116ba2db7785b7abfb80bf459cbd55359f`
- 范围：PR #7 原始 Context Bundle 能力、PR #6 合入后的 Verification Evidence
  共存、最终 WIP 的全部源码、测试、文档、canonical state、生成物和 oracle 兼容更新。
- 规则：根 `AGENTS.md`、`.agent-rules/COMMON.md`、`.agent-rules/FRONTEND.md`、
  `.agent-rules/BACKEND.md`。
- 规格：本 Change proposal/design/delta spec、ADR、实施计划，以及
  `context-bundle-budget-preview` 主规格。

### Standards / Rules / Architecture / Security findings

首轮独立全量审查发现并修复：

| Severity | Finding | 处置与证据 |
| --- | --- | --- |
| HIGH | `transition -> set -> set` 后 canonical head 没有 O(1) 的可信摘要锚，篡改最新 revision 可能逃过同步读取。 | 增加 opaque-tail head anchor、pre-anchor 与 N-1 stale anchor 有界兼容读取；64 revision 与 8 MiB 上限 fail-closed；篡改/缺失/伪造 stale anchor 对抗测试。 |
| HIGH | TransitionRecord 解析未完整绑定 `from/to/workflow/effects`，摘要一致但 schema 恶意漂移缺少封闭验证。 | 增加并复用 closed-schema parser，完整绑定 transition 字段；加入 digest-consistent schema corruption 测试。 |
| MEDIUM | Dashboard 在 root/change/phase 切换时可能短暂保留上一 Change 的成功预览。 | `ProgressDrawer` 以 root/change/phase 作为预览组件 identity key；rerender 测试验证同步清空、旧请求 abort 与新默认加载。 |
| MEDIUM | server 错误日志可能带出不可信 path/cause。 | 日志仅保留稳定错误 code 和 `REDACTED`；恶意 path/root 测试确认 stderr 不泄露。 |
| MEDIUM | persisted ledger path 需要在进入可信读取器前统一拒绝。 | `document-path.ts` 提供唯一 project-relative validator，ledger parser 复用；非法路径稳定映射 409 `LEDGER_MISSING`。 |
| MEDIUM | preview 成功与 422 路径在并发 canonical mutation 时可能返回旧快照。 | 成功和错误路径均复核 `revisionId + stateDigest`；状态变化统一 409，新增两个 snapshot-barrier 测试。 |
| LOW | 新 Dashboard hash assets 未跟踪时，提交态会引用不存在资源。 | 生成物已从最终源码重建；提交必须原子包含新 JS/CSS、旧 hash 删除与 `dist/index.html`。 |

规则/架构复审最终结论：

- `0 Critical / 0 High / 0 Medium / 1 Low`；
- 唯一 Low 是提交原子性提醒，不是剩余产品缺陷；
- 新 hash assets、旧 hash 删除和 `dist/index.html` 已纳入同一待提交工作树。

最终门禁运行时新增的 oracle compatibility diff 又经过独立增量复审。首轮正确抓到
一个 High：最初的归一正则会忽略只有 base64url 外形、但不满足产品 closed schema 的
畸形 transition-head anchor；同时 stub 对 `pre_verify_review_result` 没有限定
`pending/pass`。最终修复为：

- 独立 validator 解码 canonical base64url，要求五字段 closed schema；
- anchor 必须匹配 `runId/sequence/recordId`，并位于 state metadata 后、可选合法
  pre-Verify anchor 后的 logical opaque-tail 首行；
- pre-Verify anchor 同样验证 closed schema 及 revision/revisionId；
- validator 或 YAML 归一执行错误直接令 YAML 面 FAIL；
- stub 生成真实五字段 anchor，并封闭 pre-Verify 枚举；
- malformed、错位置、合法 anchor + 业务字段漂移三个负例都必须抓红。

增量复审最终结论：Standards 与 Spec 均为
`0 Critical / 0 High / 0 Medium / 0 Low`；新增 validator 已列入待提交文件集合。

### Spec / compatibility findings

首轮独立规格复审发现的 anchor 构建、pre-anchor/N-1、生成物、严格预算解析和
规格 EOF 问题均已关闭。最终结论：

- `0 Critical / 0 High / 0 Medium / 0 Low`；
- `--budget-bytes` 真实 CLI 拒绝 `1.5`、`12bytes`、`0` 和超安全整数；
- Dashboard 产物与隔离重建逐字一致；server/CLI 产物归一化绝对 source path 后一致；
- success 与 422/error 均执行 canonical snapshot barrier；
- Linux-only fd-relative HTTP 验证明确交给必需 CI，不把 Darwin skip 伪报为通过。

### Dashboard visual 复审

- 独立 visual reviewer 最终结论：`0 Critical / 0 High / 0 Medium / 0 Low`。
- identity key 修复后重跑三个 Dashboard 测试文件：75/75 通过。
- 第二轮 `frontend-design` + `design-taste-frontend` 覆盖浅/深主题、中/英文、
  390/768/1440 三视口、键盘、focus restore、Escape、reduced motion 与错误重试。

### 最终机器门禁

| Gate | 结果 |
| --- | --- |
| `npm run build` | PASS；CLI/server/Dashboard 生成物来自最终源码。 |
| `npm test` | 320 files，5520 passed，14 honest skips，0 failed。首次高并发暴露镜像 attestation 和 5 秒 hook timeout 后，先重建 `sandcastle:test` 并隔离复跑，再次完整全量转绿。 |
| `npm run test:web` | 59 files，1052 passed，0 failed；仅既有 React `act` / GSAP warning。 |
| `npm run typecheck:web` | PASS。 |
| `npm run check:architecture` | PASS；639 production files，5 个既有 size-only exceptions。 |
| `npm run check:comments` | PASS。 |
| `bash tools/test-bundle.sh` | 31 passed，0 failed，含真实 N-1 双向兼容。 |
| `bash tools/test-hooks.sh` | 482 passed，0 failed。 |
| `bash tools/test-adapters.sh` | 272 passed，0 failed。 |
| `bash tools/verify-skills.sh` | PASS；65 路径引用、62 skill 目录、62 registry token。 |
| `npm run oracle` | 五组 legacy/new 双跑全部一致，0 差异。新增 transition-head anchor 仅按精确合法内部行归一，全部业务字段继续逐字比较。 |
| oracle harness | 16/16 PASS；合法 anchor、malformed/错位置/业务漂移抓红、mirror、corrupt 抓红、PM 声明演进、degraded 与 fixture staging 全覆盖。 |
| `npm run check:docs` | 9 node tests + 39 canonical Markdown 检查通过。 |
| `npm run docs:check` | 44 个公开源产物确定性、16 个双语页面/32 路由通过。 |
| `npm run docs:build` / `npm run docs:smoke` | PASS。 |
| `tenon document status pr-7-merge-audit` | 截至 Build 的全部文档和读取证据完整。 |
| `git diff origin/main --check` | PASS。 |

14 个全仓 skip 的边界：

- 缺 `CLAUDE_CODE_OAUTH_TOKEN` 的真 agent-in-sandbox 路径；
- `TENON_REQUIRE_REAL_CODEX!=1` 的 canonical CI 专属真实 Codex 路径；
- Darwin 上 Linux-only `openat2`/fd-relative server 路径。

这些均有显式 `[HONEST SKIP]`，并要求由 GitHub 必需 Linux CI 覆盖；不计为本地通过。

### pre-Verify 决策

完整 diff 的 Standards、Spec、Rules、Architecture、Security 与 Dashboard visual
Critical/High/Medium 已全部清零。生成物已稳定，未运行 writer 已退出，Build 可登记
`pre_verify_review_result=pass`；登记后若产品源码、配置、迁移或生成物再变化，必须重置并重跑本节。

## Verify-fail 修复后的 Build 收敛审查

### 失败项修复

- OpenSpec delta 已把 canonical spec 中五条既有 Requirement 改为完整
  `MODIFIED Requirements`，只把 Context Bundle preview 与 Verify Evidence 共存声明为
  `ADDED Requirements`。
- 无 hardlink 隔离 archive/apply 成功，真实结果为 `1 ADDED + 5 MODIFIED`；应用后的
  `context-bundle-budget-preview` strict validation 通过，六个 Requirement 标题唯一。
- `docs/TEST-REALITY.md` 的 `ContextBundlePreview.test.tsx` 计数已由 15 修正为 16；
  Superpowers design 已把 trusted reader 的真实行数修正为 323，并记录信任边界保持单文件凝聚的
  理由。
- TDD 红测先证明英文 default workflow 仍显示 `05 · 验证`、`Approve into 交付` 等混合标签；
  最小实现仅以 `executionModel === 'phase-manifest'` 选择 `phases.*`，不使用语言、字符或 workflow
  名启发式；`step-graph` 继续保留作者 `labelByStep`。
- 节点、前进动作、回退动作与运行中徽章统一传递同一个 rules 对象；回归测试同时覆盖 default 的
  `Verify` / `Approve into Ship` / `Build` / `Running Build` 和 custom 的 `人工复核` /
  `Approve into 发布`。

### 修复后独立全量审查

| Track | 结论 | 证据 |
| --- | --- | --- |
| Spec / correctness | `0 Critical / 0 High / 0 Medium / 0 Low` | 首轮发现 proposal 仍把 audit delta 分类为 New、Modified 无；Change 以 `requirements-changed` 回 Spec，修正为 New 无、Modified `context-bundle-budget-preview`，重新登记/读取 proposal 与 tasks，取得新的 exact `spec-complete` delegated receipt 后复审全零。 |
| Rules / architecture / security | `0 Critical / 0 High / 0 Medium / 0 Low` | 完整复核 Host/root/change、fd-relative `O_NOFOLLOW`、资源上限、canonical snapshot barrier、ledger/compiler、前端 DTO 拒绝与请求身份；后端重点 7 files / 359 passed / 9 条平台条件 skip。 |
| Dashboard `frontend-design` + `design-taste-frontend` | `0 Critical / 0 High / 0 Medium / 0 Low` | 上一轮唯一英文混入中文 Low 已关闭；本轮修复没有改变 CSS、布局、焦点或动画，上一轮 1440/1024/768/390、亮暗主题、键盘、reduced-motion 的完整浏览器矩阵仍适用。 |

依赖安全观察：`npm audit` 在未变更的仓库依赖基线中仍报告 5 moderate、1 high、1 critical；
本 PR 相对 `origin/main` 没有 `package.json` 或 lockfile 变化，审查未把它伪装成本 PR 引入的
finding。批量 release 前仍须在最新 main 上重新执行依赖安全审计；若基线仍存在，必须以独立
Change 修复或形成明确阻塞，不得静默发布。

### 修复后机器门禁

| Gate | 结果 |
| --- | --- |
| TDD focused red → green | 红测按预期因 default 英文阶段标签混合失败；最小实现后 focused 通过。 |
| 相关 Dashboard 测试 | 73/73 通过；独立复审扩展定向集合 4 files / 142 tests 通过。 |
| Web 串行全量 | 59 files / 1053 tests 通过。 |
| Web 默认并行全量 | 59 files / 1053 tests 通过；上一轮 focus 时序观察未复现。 |
| `npm run typecheck:web` | PASS。 |
| `npm run build` | PASS；最终 Dashboard 为 `index-BALST8TZ.js` / `index-vq5iwRxt.css`。 |
| `npm test` | 320 files / 5520 passed / 14 honest conditional skips / 0 failed。 |
| 架构、注释、workflow freshness、hygiene | 全部 PASS；architecture 为 639 production files / 5 个既有 size-only exceptions。 |
| hooks / adapters / skills / N-1 bundle | 482 / 272 / 62 skill dirs / 31 全部通过。 |
| oracle | 五组 fixture 0 inconsistencies；兼容演进说明保持可判定。 |
| docs | `check:docs`、`docs:check`、`docs:build`、`docs:smoke` 全部 PASS。 |
| OpenSpec | Change strict PASS；隔离 archive/apply `+1 / ~5`；应用后 capability strict PASS。 |
| 生成物 | `index.html` 与 `index-BALST8TZ.js` 独立重建逐字一致；旧 hash 删除与新 hash/HTML 原子纳入待提交集合。 |
| `git diff origin/main --check` | PASS。 |

### 真实生产 Dashboard 复核

- 入口：`http://127.0.0.1:19768/`，确认服务来自当前
  `/Users/a1234/.codex/worktrees/fc73/pipeline-worklfow` 的 production build。
- 1280×720、英文、light/dark 两主题均显示
  `Open / Explore / Spec / Build / Verify / Ship / Archive`，页面不存在中文 default phase
  标签。
- `documentElement.scrollWidth === innerWidth === 1280`，页面无横向溢出。
- PR #7 抽屉打开时焦点在 `Close details`；关闭后焦点返回原 PR #7 卡片。
- Context Bundle 与 Verify Evidence 在抽屉内保持共存；Darwin 可信 reader 仍按合同显示安全 501。
- 最终浏览器 console 日志为空；无新增 warning/error。

### 新 Build 决策

完整待冻结 diff 当前为 296 个路径，互斥分类为 docs 11、Change/governance 231、canonical
spec 1、tests 12、dist 5、source/tools 36。产品、配置、生成物与 release asset 已稳定；本节
通过后先提交并普通推送，只有该精确 head CI 成功后才完成最后 Build task、登记
`pre_verify_review_result=pass`，并对随后生成的治理 head 再取得一轮精确 CI，之后才能冻结新的
Verify SHA。

产品/审查 head `532a062a5f9b0281e309ff9701e627ba12d78e14` 已正常推送；GitHub CI run
`30395329457` 在 7m38s 后成功。源码与正式生成物新鲜度、clean install、文档、sandcastle
attestation、root/Web tests、hooks、adapters、skills、迁移 CAS、N-1 bundle 与 golden oracle
全部通过；仓库未提供真实 Codex secret，H14 使用工作流明确的 honest-skip 分支。

## 第二轮 Verify-fail 后的 Build 修复

### TDD 与最小实现

第二轮真实 production Chromium 两次关闭父抽屉时，焦点恢复结果为 `[false, true]`。随后用
production URL 逐步隔离出主根因：首次抽屉由 URL 中已经选中的 Change 自动打开，没有 click
事件，因此 `triggerRef` 从一开始就是空；第二次由用户点击卡片打开，才有可恢复的 trigger。
此外，快照刷新也可能替换打开时保存的卡片 DOM，因此实现还必须覆盖原 trigger 已断开、同一
逻辑卡片已有新连接节点的退化场景。

TDD 严格执行：

1. 新增
   `reduce：原触发卡被同 key 新节点替换后，Esc 把焦点归还当前连接的卡片`，首次运行按预期
   失败，`document.activeElement` 为 `body`；
2. production 浏览器仍暴露首次 URL auto-open 失败后，再新增
   `路由直接选中 Change 自动打开抽屉，关闭后把焦点归还对应卡片`，该红测同样按预期失败且
   active element 为 `body`；
3. 每张 `WorkflowCanvas` 卡片增加完整 `data-drawer-trigger-key`，值为
   `change@root`；
4. 抽屉打开时保存当前完整 key；cleanup 仍优先原连接节点，否则从当前 DOM 的显式 trigger
   集合中按完整 key 精确匹配 auto-open 目标或 replacement 并聚焦，不按文本、Change 名或
   模糊 selector 猜测；
5. 两条红测均由最小实现转绿；`ProgressView`、`WorkflowCanvas`、`useProgressDrawer` 三文件
   80/80 通过。

### `frontend-design` / `web-design-guidelines` / `design-taste-frontend` 评修复

本轮改动没有改变布局、配色或视觉层级，只补强现有卡片与抽屉的焦点所有权。第一次评估发现的
唯一 Low 就是已由第二轮 Verify 报告记录的偶发焦点丢失；没有 Critical/High/Medium。
修复后对当前 production build 重新复评：

- URL：`http://127.0.0.1:19917/`，health 返回 `scope=global`、`version=1.0.1`；
- 真实当前 root 与 `pr-7-merge-audit`，`prefers-reduced-motion: reduce`；
- 普通打开/关闭连续 5 次，焦点恢复 `[true, true, true, true, true]`；
- 原 trigger 被同 key 新节点替换后，replacement 焦点恢复 `true`；
- 390×844 下 document/body 均为 `390/390`，无横向溢出；
- 非预期 console error 为 0；
- 桌面与移动端 fresh 截图、JSON 结果位于
  `/private/tmp/tenon-pr7-build3-browser/`。

复评结论：`0 Critical / 0 High / 0 Medium / 0 Low`。新增 data attribute 不改变可见 UI，
完整 key 只承担内部焦点恢复身份，不引入新视觉噪声、布局漂移或不明确交互。

### 强制隔离 OpenSpec 演练

本轮使用 `mktemp -d`、`git clone --no-local --no-hardlinks`，并在可写命令前断言
`pwd -P` 精确等于隔离目录：

`/private/tmp/tenon-pr7-build3-openspec.i71oBK/repo`

隔离 `show/strict/archive/apply/applied strict` 全部通过，结果仍为
`1 ADDED + 5 MODIFIED`、6 个唯一 Requirement。共享 status 指纹在命令前后均为
`b7765500c2157b7dece54c1ac0bd67d0514912b2aeca0e26f609ad60579bd4df`，
没有再次发生共享写入。完整日志：
`/private/tmp/tenon-pr7-build3-openspec.i71oBK/isolated-run.log`。

### 修复后机器门禁

| Gate | 结果 |
| --- | --- |
| focused TDD | replacement 与 URL auto-open 两条红测均按预期失败；最小实现后 3 files / 80 tests 全绿。 |
| root tests | 320 files / 5520 passed / 14 honest conditional skips。 |
| Web 默认与串行 | 各 59 files / 1055 passed。 |
| `npm run build` / `typecheck:web` | PASS；该轮 Dashboard 正式资产为 `index-Jcubgc0D.js`。 |
| architecture / comments / docs / hygiene / identity / templates / workflow freshness | 全部 PASS；architecture 为 639 production files、5 个既有 size-only exception。 |
| hooks / adapters / skills / bundle | 482 / 272 / 62 skill dirs / 31 全绿。 |
| migration CAS | 13/13 PASS。 |
| oracle | 五组 legacy/new fixture 0 inconsistencies；harness 16/16 PASS。 |
| OpenSpec | 显式隔离目录断言，Change strict、archive/apply 与 applied spec strict 全部 PASS。 |
| production Chromium | 连续 5 次原生焦点恢复及 1 次 replacement fallback 全绿；390px 无溢出、无非预期 console error。 |
| `git diff --check` | PASS。 |

下一步必须对完整待冻结 diff 执行独立 Standards、Spec、Rules/Architecture/Security 与 Dashboard
视觉复审；所有 C/H/M/L 清零、提交普通推送并取得新 exact-head CI 后，才可登记
`pre_verify_review_result=pass` 并重新冻结。

### 独立预审 Low 与最终修复

第三轮独立预审没有接受上述局部结论为最终 PASS。Spec 与 Rules/Architecture/Security 两轨分别
独立复现同一生命周期缺口，并由规则轨补充 owner scope 缺口：

1. 点击 A 打开抽屉后，route/popstate 在抽屉仍打开时切到 B；旧 A trigger 仍连接，cleanup 会把
   焦点错误还给 A；
2. replacement fallback 从全 document 查找，若另一个 ProgressView 或过渡期旧 root 有相同完整
   key，可能跨 owner 聚焦。

TDD 新增两条红测并在旧实现上同时稳定失败：

- `点击打开 A 后路由切到 B，Esc 把焦点归还 B 而不是仍连接的 A 卡片`；
- `原触发卡被同 key 新节点替换后，只在当前 ProgressView 内归还焦点`，在当前 owner 前放置
  相同完整 key 的外部节点。

最小修复以当前 `returnKeyRef` 为真相：只有仍连接且
`trigger.dataset.drawerTriggerKey === returnKey` 的旧 trigger 才可优先；fallback 只在
`rootRef.current` 内按完整 key 精确匹配。没有把用户输入拼进 selector，也不跨已卸载 owner
恢复焦点。

修复后的最终证据：

| Gate | 结果 |
| --- | --- |
| focused TDD | 3 files / 81 tests PASS。 |
| root tests | 320 files / 5520 passed / 14 honest conditional skips。 |
| Web 默认与串行 | 各 59 files / 1056 passed。 |
| build / typecheck / architecture | PASS；正式资产为 `index-C8TGqQ2X.js`，architecture 639 files / 5 个既有 size-only exception。 |
| production Chromium | 首次 route auto-open 关闭聚焦 PR #7；点击 PR #7 后 popstate 切 PR #6，关闭精确聚焦 PR #6；owner 外相同 key 节点不获焦点，当前 ProgressView replacement 获焦点。 |
| production identity | `http://127.0.0.1:19918/` 真实引用 `./assets/index-C8TGqQ2X.js`；console 仅有 Darwin Context Bundle 受控 501 资源记录。 |
| screenshot | `/private/tmp/tenon-pr7-build4-browser.lBNsle/final-focus.png`。 |

新 hash JS、`index.html` 与旧 hash 删除必须作为一个原子提交；在最终预审前全部 staged，禁止出现
只提交 HTML 而漏掉内容寻址资产的状态。

### 最终独立增量复审

| Track | 结论 | 关闭证据 |
| --- | --- | --- |
| Spec / correctness | `0 Critical / 0 High / 0 Medium / 0 Low` | 当前 return key 优先、旧 trigger key 等值约束、owner-scoped fallback 与两条新回归均独立复核；focused 81/81，dist 重建零漂移。 |
| Rules / Architecture / Security | `0 Critical / 0 High / 0 Medium / 0 Low` | 生命周期、owner scope、完整 `change@root` identity、静态 selector、Context Bundle 既有信任边界和 staged 原子集合均通过；cached diff check PASS。 |
| Dashboard `frontend-design` + `web-design-guidelines` + `design-taste-frontend` | `0 Critical / 0 High / 0 Medium / 0 Low` | production A→B route、首次 auto-open、owner 外 duplicate、当前 replacement、嵌套 modal、键盘、reduced motion、响应式和正式 asset 均通过；没有布局、主题、语言或视觉层级回归。 |

完整 Build diff 至此没有未关闭的 C/H/M/L。下一门禁是提交、普通推送并等待该精确 product/review
head 的 GitHub CI；在 CI 成功前，最后 Build task 和 `pre_verify_review_result` 必须继续保持 pending。
