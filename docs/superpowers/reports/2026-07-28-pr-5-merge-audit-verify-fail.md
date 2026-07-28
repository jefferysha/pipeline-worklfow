# PR #5 合并审计验证报告（失败）

> Change：`pr-5-merge-audit`
> 冻结构建：`9bccbda03c11e57d81ae8626b06d318fa9aef501`
> 对比基线：`origin/main`
> 当前结论：失败，必须回到 Build/Spec 修复后重新冻结并全量验证

## 结论

冻结提交没有发现 Critical，但四轨聚合仍包含 Reviewer 1 个 Medium、视觉轨 1 个 Medium，
且 E2E 轨没有取得单次完整浏览器 harness exit 0。按照 `tenon-verify` 的全量聚合规则，
本轮不得进入 Ship。持续授权下采用安全默认值：修复，不接受偏差。

本轮不在 Verify 修改实现或规格。报告登记后将通过精确的 `verify-fail` review receipt 返回
Build，再用 `requirements-changed` 回到 Spec，统一修正 ADR、1024px Workbench 阶段入口、
测试矩阵和相关低风险文档偏差，之后重新冻结并完整执行全部轨道。

## 验证身份与冻结边界

- 页面标题：`Tenon Dashboard`
- 生产实例项目 root：
  `/Users/a1234/.codex/worktrees/8d07/pipeline-worklfow`
- 目标 Change：`pr-5-merge-audit`
- 目标 phase：`verify`
- 冻结 SHA：
  `9bccbda03c11e57d81ae8626b06d318fa9aef501`
- PR #5 GitHub head：
  `9bccbda03c11e57d81ae8626b06d318fa9aef501`
- GitHub CI：`CI/verify` 7m48s 成功；Documentation Pages `build` 成功；PR 条件下
  `deploy` 正常 skipped。
- 主线 repo-zero-output 全文件指纹开始和结束均为
  `850918f9f53e963e350e0c0ec5cbccc9161fd318a9462216d7b362c9477a1e8a`。
- Reviewer 与 E2E 轨各自的前后指纹完全一致。视觉轨没有写仓库，只写 `/private/tmp`，
  但其局部 diff 指纹观察到并发治理证据漂移，因此该轨本身也不能判 PASS；主线全文件指纹
  复核未发现实际内容漂移。

## 冻结对象与生成物绑定

本报告把同一 Git 冻结对象、源码、OpenSpec、生成产物和真实页面身份绑定到
`9bccbda03c11e57d81ae8626b06d318fa9aef501`。冻结提交中的生产 HTML 引用：

- `packages/dashboard-app/dist/assets/index-BSnN9hmu.js`
- `packages/dashboard-app/dist/assets/index-CNztQXbb.css`
- `docs-site/public/images/dashboard-progress.webp`

隔离副本从该 SHA 直接建立，`npm run build` exit 0，重新生成相同命名的 JS/CSS；真实生产
Dashboard 同时返回正确标题、root 和 Change。WebP 已由 1440×900 身份校验页面生成，
视觉轨确认没有旧状态条或错误项目内容。

## 工程与行为证据

所有会写生成物的命令均在
`/private/tmp/tenon-pr5-e2e.kfuUbw/repo` 隔离副本运行：

| 命令或检查 | 结果 |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run build` | exit 0；workspace、web、server、CLI bundle 全部成功 |
| 定向 Vitest（App、Nav、WorkflowCanvas、SolutionView、TrafficPanel、drawer、serverIntegration） | exit 0；7 files / 106 tests |
| `npm run test:web` | exit 0；53 files / 980 tests |
| 真实 `/api/health`、SPA、`/api/snapshot`、traces empty、未鉴权写入 | exit 0；200/200/200/200/401 与预期一致 |
| 720/721 Chromium 临界断言 | exit 0 |
| GitHub `CI/verify` | success |
| GitHub Documentation Pages `build` | success |

720px 观察值：

- `max-width:720px=true`
- `min-width:720.02px=false`
- 底部导航 `fixed`、720×72
- evidence/modules 为 1/1 列
- `scrollWidth=clientWidth=720`

721px 观察值：

- `max-width:720px=false`
- `min-width:720.02px=true`
- 左侧 rail `sticky`、88×900
- evidence/modules 为 5/2 列
- `scrollWidth=clientWidth=721`

隔离测试仍输出既有 React `act(...)`、少量 GSAP target 和 Vite >500k chunk warning；
没有测试失败。`npm ci` 报告 7 个既有依赖审计项；本 PR 没有依赖或 lockfile 变化，本轮没有
执行自动升级或跨主版本修复。

## E2E 轨

结论：**FAIL/BLOCKED；产品 finding 0**。

真实 Dashboard 在 `127.0.0.1:18925` 启动并于结束后停止。主路径、Progress drawer、
明暗主题、五个一级页面、loading、500 error、SSE 自动恢复和 720/721 临界行为均实际观察，
截图与 trace 位于 `/private/tmp/tenon-pr5-e2e.kfuUbw/`。

三次完整 `browser-e2e.mjs` 均因验收脚本状态假设 exit 1，而不是产品断言失败：

1. drawer scrim 正确拦截底层 settings，脚本仍尝试点击底层控件。
2. Projects 入口按产品语义清空 root 后，脚本仍假设 Progress 立即存在。
3. error 状态解除 EventSource 拦截后已自动恢复，脚本仍等待已经消失的“重试”按钮。

本轮没有获得单次完整 browser harness exit 0，也没有浏览器 empty 截图，因此 E2E 证据门不能
判 PASS。empty 由真实空项目 `/api/snapshot` 与通过的 App/Onboarding 测试覆盖，但不能替代
缺失的浏览器整轨成功。

E2E 真实工作区指纹：

- tracked files：3050 → 3050
- SHA-256：
  `023049e39f84b84730f04565b7f31860ca66ffe1f114b6083ed5ba6ece964ed3`
  → 相同
- `git status` 前后 `cmp`：exit 0
- HEAD 前后均为冻结 SHA

## Reviewer 轨

Reviewer 全量审查 `origin/main...9bccbda` 的 260 个文件：

- OpenSpec / pipeline 证据 166 个
- Dashboard 84 个
- 文档 9 个
- 文档站截图 1 个

没有 backend/API、依赖或 lockfile 变化；生成 CSS 含预期的
`max-width:720px` 与 `min-width:720.02px`。结论：
**FAIL；Critical 0 / High 0 / Medium 1 / Low 3**。

### M1：Accepted ADR 与冻结实现不一致

- `docs/adr/2026-07-28-pr-5-merge-audit.md`

ADR 仍声明“单一 `mobile` variant”，但修订后 design/spec 与冻结实现已采用互补的
`mobile <=720px` 和 `desktop >=720.02px`。Accepted 决策证据与实际交付漂移，必须修订 ADR，
重新登记、读取并通过 `requirements-changed` 复核。

### Reviewer Low

1. 实施计划的定向命令没有包含 `SolutionView.test.tsx`，且只检查 mobile query；应同步验证
   mobile 与 desktop 生产 CSS。
2. ADR 对 Lucide 全局线宽真相源的表述没有说明已有显式 `strokeWidth={1.75}` 仍与全局默认兼容。
3. `Nav.tsx` 注释仍称窄屏“收为纯图标”，与实际带短标签的移动底栏不一致。

## 视觉轨

视觉轨覆盖 1440、1024、720、721、390，明暗主题，Projects、Progress、AFK、Workbench、
Machine，键盘焦点，loading、empty、error 和 reduced-motion。证据目录：
`/private/tmp/pr5-visual-verify-9bccbda/`。

已确认：

- loading、empty、error、重试恢复均有可读反馈。
- 720px 为底部导航并留出 88px 主内容空间；721px 恢复左 rail。
- Tab 焦点有可见 3px focus ring。
- reduced-motion 下导航无 transition，位移交互为 `transform:none`。
- 主内容未发现 emoji；明暗主题、层级、间距和主要交互态总体一致。

结论：**FAIL；Critical 0 / High 0 / Medium 1 / Low 0**。

### M2：1024px Workbench 第七阶段入口缺乏发现性

1024px 下七阶段导航容器 `clientWidth=886`、`scrollWidth=1024`；“归档”按钮位于
`x=1013..1125`，在标准视口内基本不可见。虽然容器可横向滚动，但页面没有滚动提示，核心第七
阶段入口发现性不足。Spec 需要明确中等宽度下全部阶段入口的可发现性，实现需提供可验证的布局
或滚动提示。

## Codex CLI 轨

第一次把 2.4MB 完整 diff 送入 Codex CLI 时，进程按真实限制 exit 1：

`Input exceeds the maximum length of 1048576 characters`

随后按降级路径审查全部手写源码、测试、docs、OpenSpec 与生成物统计；压缩 bundle 和 WebP
由隔离构建、hash 和视觉轨覆盖。Codex 结论仍为 FAIL，主要因为 stdin 本身没有携带冻结 SHA
到生成物的独立 manifest，并对 i18n、主题测试、行为证据和 WebP 语义提出疑问。

聚合裁决：

- 冻结 SHA/生成物绑定已由本报告、隔离构建、GitHub head 和真实页面身份补齐，不另计产品 finding。
- hardcoded session/trace 文案不属于本次明确收窄的“捕获记录加载态”义务，不扩大为全页面翻译。
- 720/721、主题、错误恢复、reduced-motion 与 WebP 语义已由独立 E2E/视觉证据覆盖。
- `themeContrast.test.tsx` 没有分别约束 system dark、explicit light 与 `--btn-bg`，作为下一轮
  测试加固项采用；本轮本就因 M1/M2 和 E2E harness 失败。
- `(720px, 720.02px)` 是 Chromium 可表示 CSS viewport 的量化边界修复；真实 720/721 行为已
  证明，不把理论空隙单独列为产品 Medium。

## OpenSpec 隔离应用演练

真实工作区：

- `openspec` 版本：1.6.0。
- `openspec show pr-5-merge-audit --json --deltas-only`：exit 0。
- `openspec validate pr-5-merge-audit --strict`：exit 0。
- 演练前后 `openspec/specs/dashboard-ui-ux-system/spec.md` digest 均为
  `e8588281864394aef8c438e85d6011a74e9992c9fea52f587aa707e779483f67`。

隔离副本 `/private/tmp/tenon-pr5-verify.PartaO/archive-copy`：

- `openspec archive pr-5-merge-audit --yes --json`：exit 0。
- `specsUpdated=true`，4 条 modified requirements 被应用。
- `openspec validate dashboard-ui-ux-system --type spec --strict`：exit 0。

隔离副本 `openspec validate --all --strict` 同时报告 12 个通过、12 个既有无关项失败。
这些历史项不由本 Change 引入，也不把它们描述为通过；目标规格已单独 strict validate。

## 逐文件 capability 回读

以下覆盖表由
`git diff --name-only origin/main...9bccbda03c11e57d81ae8626b06d318fa9aef501`
生成。组内每个实际改动文件均已映射并逐组回读：

| 改动文件或完整文件组 | capability spec | 回读 |
| --- | --- | --- |
| `docs-site/public/images/dashboard-progress.webp` | `dashboard-ui-ux-system` | ☑ |
| `docs/adr/2026-07-28-dashboard-ui-ux-overhaul.md` | `dashboard-ui-ux-system` | ☑ |
| `docs/research/2026-07-28-dashboard-ui-ux-audit.md` | `dashboard-ui-ux-system` | ☑ |
| `docs/superpowers/{plans,reports,specs}/2026-07-28-dashboard-ui-ux-overhaul*` | `dashboard-ui-ux-system` | ☑ |
| `docs/adr/2026-07-28-pr-5-merge-audit.md` | `repository-architecture-compliance` | ☑ |
| `docs/superpowers/{plans,specs}/2026-07-28-pr-5-merge-audit*` | `repository-architecture-compliance` | ☑ |
| `openspec/changes/archive/2026-07-28-dashboard-ui-ux-overhaul/{proposal,design,tasks,REVIEW,applied-spec}.md` | `dashboard-ui-ux-system` | ☑ |
| archived original Change `specs/dashboard-ui-ux-system/spec.md` | `dashboard-ui-ux-system` | ☑ |
| archived original Change `.pipeline-documents.json` | `document-evidence-contract` | ☑ |
| archived original Change `.pipeline-history.jsonl` 与 transitions | `interaction-and-skill-provenance` | ☑ |
| archived original Change `.pipeline-run/**` 与 workflow plan | `dashboard-execution-provenance` | ☑ |
| archived original Change `.pipeline*.json/yaml` 其余治理文件 | `dashboard-execution-provenance` | ☑ |
| `openspec/changes/pr-5-merge-audit/{proposal,design,tasks,REVIEW}.md` | `repository-architecture-compliance` | ☑ |
| audit Change `specs/dashboard-ui-ux-system/spec.md` | `dashboard-ui-ux-system` | ☑ |
| audit Change `.pipeline-documents.json` | `document-evidence-contract` | ☑ |
| audit Change `.pipeline-history.jsonl` 与 transitions | `interaction-and-skill-provenance` | ☑ |
| audit Change `.pipeline-run/**` 与 workflow plan | `dashboard-execution-provenance` | ☑ |
| audit Change `.pipeline*.json/yaml` 其余治理文件 | `dashboard-execution-provenance` | ☑ |
| `openspec/specs/dashboard-ui-ux-system/spec.md` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/dist/index.html` 与 `dist/assets/*` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/App.tsx`、`App.test.tsx`、`index.css`、`i18n/translations.ts`、`themeContrast.test.tsx` | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/advanced/*`（冻结 diff 中 2 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/afk/*`（冻结 diff 中 2 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/machine/*`（冻结 diff 中 3 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/progress/*`（冻结 diff 中 12 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/shared/*`（冻结 diff 中 8 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/shell/*`（冻结 diff 中 8 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/solution/*`（冻结 diff 中 2 个文件） | `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/workbench/*`（冻结 diff 中 46 个文件） | `dashboard-ui-ux-system` | ☑ |

## 未覆盖与残余风险

- 未取得单次完整 browser harness exit 0；下一轮必须修正外部 harness 的状态假设并重跑。
- 没有本轮浏览器 empty 截图。
- 未做 Firefox/WebKit 或真实屏幕阅读器人工验收。
- E2E 隔离环境为 Node v24.18.0，不是声明的 Node 22 精确版本。
- Vite 主 bundle 仍有既有大 chunk warning；本 PR 没有新增大型依赖。
- PR 不改依赖，但 `npm ci` 的既有审计结果需要在独立依赖维护 Change 处理。

## 回退决定

下一轮必须：

1. 修订并重新登记 ADR，使其与互补断点实现一致。
2. 在 Spec 中明确 1024px Workbench 全部七阶段入口的可发现性，并修复实现/测试。
3. 修正计划命令、Nav 注释和 Lucide 线宽说明。
4. 加固三条主题解析路径与 `--btn-bg` 对比度测试。
5. 修正仓库外浏览器 harness 的状态假设，获得单次完整 exit 0。
6. 重新执行 Reviewer、E2E、Codex 和视觉四轨全量冻结审查。
