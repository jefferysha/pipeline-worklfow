# Host Target Plan Center Build 审查

## 审查边界

- 比较基线：`origin/main` / `2d103e330f847e003ff5909097d892f5722cca04`
- 能力：`host-target-plan`
- 轴线：Standards（项目规则、架构、安全、可访问性）与 Spec（delta spec 全部 scenario）
- UI 实机：Tenon Dashboard `1.0.1`，`http://127.0.0.1:18766/?view=hostPlan`
- 视口：桌面 `1440×900`、移动 `390×844`

## 第一轮问题与修复

| 严重度 | 问题 | 修复 | 复验 |
| --- | --- | --- | --- |
| MEDIUM | Dashboard decoder 接受 DTO 额外键及与 argv 不一致的 `display`，不满足严格客户端契约 | 对 catalog/target/plan/command/step 增加 exact-key、host 白名单、kind/scope/flag、一致 display、token 前缀与去重校验 | 新增失败测试后修绿；focused 13/13 |
| MEDIUM | empty 状态没有 Spec 要求的 retry 操作 | empty card 增加语义 button，复用 catalog refresh 状态机 | 组件红测后修绿；浏览器模拟空 catalog 显示 retry |
| MEDIUM | 12 张目标卡全部结束后才显示操作/计划，移动端选 Codex 后需越过其余 11 张卡 | 把选中卡扩展为 full-span，并把操作/计划面板直接插入其后；拆分 `HostOperationPlanPanel` 保持组件大小边界 | 桌面/移动截图复评；选中卡之后立即出现操作和计划 |
| LOW | Clipboard adapter 同步抛错时会逃逸 React event | 使用 Promise microtask 统一同步异常与 rejected promise | 新增同步抛错测试并显示复制失败公告 |

## 第二轮 frontend-design / design-taste-frontend 复评

- 层次：标题 → 目标卡 → 高亮选中目标 → 操作 → 命令/步骤/notices，任务路径连续。
- 状态：catalog loading/empty/error/retry 与 plan loading/error/retry/ready 均有独立可见反馈；切换目标清除陈旧计划。
- 视觉系统：完全复用既有 card、border、fill、accent 和语义色 token；未引入独立主题或装饰噪音。
- 响应式：`390px` 下单列，`documentElement.scrollWidth === clientWidth === 390`；长命令只在 code block 内滚动。
- 可访问性：原生 button、`aria-pressed`、operation `role=group`、status/alert、可见 `focus-visible` ring；浏览器实测焦点 ring 为 `rgb(109, 155, 251) 0 0 0 2px`。
- 安全：页面没有执行入口；唯一动作是复制顶层人工命令；server/客户端均失败关闭。
- 浏览器控制台：最终路径 error logs 为 0。

结论：第二轮无 CRITICAL / HIGH / MEDIUM；LOW 已处理，无遗留 UI finding。

## Verify 回环发现与修复

冻结提交 `e32cf7f924cf3964e46bc942e9dff31192733d4a` 的首轮 Verify 结论为
FAIL，已通过确切 `verify-fail` review receipt 返回 Build。下表记录本轮修复；新的浏览器与
对抗式全量复验必须在重新提交、冻结之后执行，不沿用旧冻结提交的通过结论。

| 严重度 | 首轮 Verify finding | Build 修复 | 聚焦复验 |
| --- | --- | --- | --- |
| HIGH | Comet 研究文档保存上游源码、测试、Changelog 与 package metadata 逐字块，违反 clean-room 边界 | 删除全部逐字实现材料，仅保留固定 URL/SHA、发布与许可事实、独立摘要和差异矩阵；Trellis 研究同步采用相同证据边界 | research 文件不再含上游代码块；`check:docs` 9/9 |
| MEDIUM | server decoder 接受与 CLI 真相不一致的 native command chain | 对空或完整 catalog、12-host 顺序/metadata/capabilities，以及 24 组 host×operation 的 top command、步骤、null command 与 notices 做精确校验 | server focused 68/68；server 宽回归 343/343 |
| MEDIUM | Dashboard decoder 接受部分 catalog、顺序/能力/命令/步骤/notices 漂移 | client decoder 只接受空目录或完整有序唯一目录，并逐项校验 v1 plan 不变量 | Dashboard focused 71/71；子流全量 `test:web` 52 files / 993 tests |
| MEDIUM | 英文网络、HTTP、decoder 和请求不匹配路径显示中文 | client 返回稳定 `HostTargetPlanClientError(kind/code/status)`；组件按当前 locale 映射文案，不透传 server error | 中英文 network/HTTP/decoder/mismatch 组件测试通过 |
| MEDIUM | 全局 snapshot 首次失败会遮蔽机器级 Host Plan | `hostPlan` 独立绕过 snapshot error shell，同时保留其他视图原错误页 | 新增 App 回归测试通过 |
| MEDIUM | ready 状态没有辅助技术完成公告 | 增加 `role=status`、`aria-live=polite` 的本地化就绪公告 | 中英文组件断言通过 |
| LOW | 中英文 CLI reference 缺少 `host-target-plan` | 补 catalog 与单计划命令、`--json`、只读与 custom-host 拒绝边界 | `check:docs` 通过 |
| LOW | Nav 注释仍描述五个一级视图 | 注释更新为六视图与完整顺序 | source-bound docs checker 通过 |
| 门禁 | repository hygiene 全局身份禁令与本 Change 固定来源证据冲突 | 增加仅覆盖两项研究身份、本 Change 精确 docs/current archive/日期 archive/唯一 main spec 的 allowlist；实现与无关文档仍失败关闭 | checker 6/6；`check:repository-hygiene` PASS |

全量收敛审查随后发现并修复两项 MEDIUM 门禁回退：

1. `check-docs` 曾把原来的固定视图数量改成仅非空/无重复，删除既有视图仍可能通过。现在锁定
   `projects → progress → afk → workbench → machine → hostPlan` 精确六视图，并增加删除/替换回归测试。
2. hygiene 曾对本 Change 整个 current/archive 目录放行两个研究身份。现在只放行
   `REVIEW.md`、`applied-spec.md`、`design.md`、`proposal.md`、`tasks.md` 与单一 delta spec；
   同目录任意 source/notes 仍拒绝。

## Verify 回环后的 frontend-design / design-taste-frontend 复评

- 错误文案从 transport 层移到 i18n，状态卡的层级、颜色与 retry 位置保持原有设计系统。
- ready 公告使用 `sr-only`，不改变桌面或移动视觉布局。
- Host Plan 在 snapshot 失败时仍保留独立页面身份和局部 catalog 状态，不显示无关全局错误卡。
- decoder 与错误契约变更没有新增执行按钮或写路径；计划仍只有复制动作。
- 复用首轮桌面/移动截图对布局影响做静态复评，本轮实现无可见布局变化；重新冻结后的真实页面身份、
  桌面/移动、键盘、loading/empty/error/ready 验收留给第二轮 Verify。

结论：Build 回环设计复评无 CRITICAL / HIGH / MEDIUM；全部首轮 finding 已有实现与聚焦测试，
但只有重新完成全量 Build 门禁、提交和冻结后，才能写入 `pre_verify_review_result=pass`。

## Build 回环全量门禁

- `npm run build`：通过；重新生成 Dashboard、server 与 CLI tracked bundles。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 files / 997 tests；focused client 16/16。
- `npm test`：317 files / 5475 passed / 5 honest skips（5480 total）。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6，repository PASS。
- `npm run check:architecture`、`npm run check:comments`、`git diff --check`：通过。
- 已知非阻断输出：既有 React `act(...)` / GSAP 警告、Vite 大 chunk 警告；5 个测试因
  `TENON_REQUIRE_REAL_CODEX` 或 `CLAUDE_CODE_OAUTH_TOKEN` 缺失诚实跳过。

独立全量 reviewer 在两项门禁修复后重新审阅完整交付面，Standards 与 Spec 两轴均
PASS，最终 CRITICAL / HIGH / MEDIUM / LOW 均为 0。新的 Dashboard hash asset 必须与
`dist/index.html` 和旧 asset 删除成对提交。

## 第二轮 Verify 回环发现与修复

冻结提交 `8928d9d484395c84e87fc8b044a9af5423663f3a` 的第二轮 Verify 在其余三轨均
PASS 后，Codex 审查仍发现两项 MEDIUM；已通过确切 `verify-fail` review receipt 返回
Build。本轮只收紧输入歧义和只读请求的资源边界，不改变 DTO、URL、UI 或计划内容。

| 严重度 | 第二轮 Verify finding | Build 修复 | RED → GREEN |
| --- | --- | --- | --- |
| MEDIUM | Commander 对重复 `--host` / `--operation` 采用 last-wins，前一个非法值可被后一个合法值遮蔽 | 使用 Commander `InvalidArgumentError` 和 option accumulator，在第二次出现同名 option 时立即拒绝 | 4 个重复/非法后合法用例先全部失败，修复后 CLI focused 38/38 |
| MEDIUM | 每个合法只读 GET 都可新建 `tenon host-target-plan` 子进程，缺少去重、并发与缓存边界 | 为每个 Dashboard server 建立隔离 runtime：同键 in-flight Promise 共享、成功结果最多缓存 25 个 canonical key、跨键子进程并发上限 1、失败不缓存且可重试 | 同键、25-key 双轮、失败重试、跨键并发 4 个用例先全部失败，修复后 route focused 72/72 |

## 第三轮 Build 门禁

- 集成 focused：CLI + command + server route 3 files / 110 tests 全部通过。
- CLI 与 server TypeScript 编译、`git diff --check`：通过。
- `npm run build`：通过；Dashboard hash 保持 `index-BwhWJn1i.js`，server/CLI bundle 已更新。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 files / 997 tests；只有既有 React `act(...)` / GSAP 警告。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6，repository PASS。
- `npm run check:architecture`、`npm run check:comments`、`git diff --check`：通过。
- 首次 `npm test`：317 files 中 316 passed；5482 passed / 5 skipped / 1 failed。唯一失败为
  与本功能无关的 Docker AFK `默认 L1 report-only` 时序用例；随后独立重跑该用例通过
  （1 passed / 4 filtered skips）。该波动保留为事实，不把首次全量运行描述为全绿。

第三轮完整冻结审查和浏览器验收必须在重新提交后进行；在那之前不复用第二轮的 PASS。

## 第三轮冻结前审查修复

独立 reviewer 对全部 Standards / Spec 两轴给出 PASS（CRITICAL / HIGH / MEDIUM / LOW 均为
0）；Codex 对完整 `origin/main` 差异另发现 1 项 MEDIUM：

- adapter DTO 原为 `package-assets → adapter-deploy → managed-runtime → bundled-skills →
  runtime-readiness`，但真实 `cmdSetupHost` 在验证资产后先完成 managed runtime 发布，再执行
  `adapters/install.sh`，update adapter 也委托同一路径。
- CLI 真相、server 严格 decoder、Dashboard 严格 decoder 与三端 fixtures 已统一为
  `package-assets → managed-runtime → bundled-skills → runtime-readiness → adapter-deploy`。
- RED：CLI 1 个、server 22 个场景失败；GREEN：CLI/server 78/78，Dashboard decoder 16/16。

修复后的重新收敛：

- `npm run build`：通过；Dashboard 新 hash `index-D_k5gMMg.js`，server/CLI tracked bundle 已更新。
- `npm run test:web`：52 files / 997 tests 通过。
- 第二次 `npm test`：317 files 中 316 passed；5482 passed / 5 skipped / 1 failed。唯一失败为
  与本功能无关的 release-store 20ms lock 调度断言，独立精确重跑 1 passed / 17 filtered skips。
  同一轮中此前波动的 AFK report-only 用例已通过。两次全量测试的单一时序波动均如实保留，
  不将任一次描述为全绿。

最终独立只读复审再次确认完整差异 PASS，CRITICAL / HIGH / MEDIUM / LOW 均为 0；adapter
顺序、前两项 P2 修复、tracked bundles 与新 Dashboard hash asset 均保持一致。

## 第三轮 Verify 回环发现与第四轮 Build 修复

冻结提交 `75df836602fe1bb3e79bf95c0ffad44837822d7a` 的第三轮 Verify 中，E2E、浏览器、
OpenSpec 隔离验证和既有门禁均通过，但对抗性审查发现两项 MEDIUM，并通过确切
`verify-fail` review receipt 返回 Build：

| 严重度 | 第三轮 Verify finding | 第四轮 Build 修复 | RED → GREEN |
| --- | --- | --- | --- |
| MEDIUM | adapter 的真实 `cmdSetup` 在 managed runtime 发布后立即运行 `adapters/install.sh`，随后才进入 bundled skills 与 runtime readiness；三端契约把 deploy 错放在末尾 | CLI 真相、server 严格 decoder、Dashboard 严格 decoder 与 fixtures 统一为 `package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness` | CLI 1 个、server 20 个、Dashboard 1 个场景先失败；CLI/server 78/78、Dashboard client 16/16 修绿 |
| MEDIUM | server 将空 CLI catalog 当作成功并永久缓存，违背 v1 必须暴露完整 12 个注册宿主的契约 | server decoder 只接受精确 12-host catalog 并返回 502；Dashboard decoder 保留空 catalog 作为前端独立空态契约 | server 空 catalog 用例先失败，route focused 修绿 |
| LOW | route 测试用固定数组索引制造 deploy mismatch，可能偏离目标步骤 | 测试按 `step.id === 'adapter-deploy'` 定位并篡改 | route focused 修绿 |
| LOW | ADR 仍声称每个请求都会启动 CLI，未反映同键合并、串行化、25-key 成功缓存与失败重试 | ADR 更新为 server-instance runtime 的真实生命周期和安全边界 | 文档 diff 复核 |

此外新增一条真实编排契约测试：直接以 `cursor` 运行注入式 `cmdSetup`，同时断言 DTO 步骤
ID 和实际输出标记顺序，防止 CLI、server 与 Dashboard 三端 fixtures 同时漂移仍“互相通过”。
该测试在不访问真实宿主、Docker 或用户目录的情况下通过（`setup.test.ts` 55/55）。

第四轮 Build 的全量门禁、独立审查与冻结 SHA 将在本节后续收敛；第三轮冻结提交的 PASS
证据不复用于下一轮 Verify。

## 第四轮 Build 全量收敛

- `npm run build`：通过；Dashboard 新 hash `index-BStVpnm7.js`、server 与 CLI bundle 均已更新。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 files / 997 tests 通过；只有既有 React `act(...)` / GSAP 警告。
- `npm test`：317 files 通过；5484 passed / 5 honest skips（5489 total）。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6，repository PASS。
- `npm run check:architecture`、`npm run check:comments`、`git diff --check`：通过。

独立 reviewer 对完整 119-file 差异再次给出 Standards / Spec 双轴 PASS，最终
CRITICAL / HIGH / MEDIUM / LOW 均为 0，并确认真实 setup 编排契约、adapter 步骤顺序、
server 空目录拒绝、Dashboard 空态和 ADR 均一致。

Codex 的完整 `origin/main` 差异审查没有发现新的源码或契约缺陷；它报告的唯一 P1 是审查时
新 Dashboard hash asset 仍为未跟踪文件。该交付完整性 finding 通过把
`index-BStVpnm7.js`、`dist/index.html` 和旧 `index-D_k5gMMg.js` 删除原子纳入本次提交处理，
并将在冻结后的干净检出 E2E 中复验。Codex 隔离环境中的 server bind 测试因 `listen EPERM`
无法运行；同一源码已在真实 worktree 的上述全量 `npm test` 中通过。

## 第四轮 Verify 回环发现与第五轮 Build 修复

冻结提交 `1176d52a4f00110c2367697d33cb00e3f01de1f4` 的第四轮 Verify 中，浏览器视觉轨和
完整 reviewer 均通过，但 Codex/E2E 对抗轨发现一项 MEDIUM：所有 10 个 adapter 的 update
计划错误包含 setup-only 的 `bundled-skills` 与 `runtime-readiness`。现有 CLI、server 和
Dashboard fixture 同时锁定错误的五步数组，因而三端测试互相通过却未证明真实 `cmdUpdate` 语义。

本轮先通过 `requirements-changed` 返回 Spec，把契约明确为：

- adapter setup：`package-assets → managed-runtime → adapter-deploy → bundled-skills → runtime-readiness`
- adapter update：`package-assets → managed-runtime → adapter-deploy`

TDD 证据：

1. 在纯计划测试和注入式真实 `cmdUpdate(cursor)` 集成测试中先写三步断言；RED 为 2 files /
   2 failed / 60 passed，失败差异精确显示多余的两个 setup-only 步骤。
2. `adapterSteps` 接收 operation 并只为 setup 追加产品后续步骤；同一命令 GREEN 为 2 files /
   62 passed。
3. server 严格 decoder/12×2 fixture 与 Dashboard decoder/fixture 同步按 operation 分支；
   CLI/server focused 为 4 files / 151 passed，Dashboard focused 为 2 files / 32 passed。
4. 独立只读审计回读真实 `cmdSetup`/`cmdUpdate` 控制流，确认 setup 在部署后继续 skills/readiness，
   update 直接返回 `cmdSetupHost`，与修订后的契约一致。

第五轮 Build 全量收敛：

- `npm run build`：通过；Dashboard 新 hash `index-BY2_aTHg.js`，server/CLI tracked bundle 已更新。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 files / 999 tests 通过；只有既有 React `act(...)` / GSAP 警告。
- `npm test`：317 files 通过；5485 passed / 5 honest skips（5490 total）。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6，repository PASS。
- `npm run check:architecture`、`npm run check:comments`、`git diff --check`：通过。
- built CLI 对 10 个 adapter × setup/update 的真实 JSON 烟测全部通过：
  setup 均为五步、update 均为三步，`mismatches=0`。

本轮没有改变 UI 布局、交互状态、i18n token 或执行边界；视觉影响仅为 adapter update 预览少显示
两个不应存在的步骤。最终浏览器轨仍需在新冻结提交上复验真实 update 预览、桌面/移动/键盘和
状态矩阵；在此之前不复用第四轮冻结的 PASS。

第五轮冻结前独立审查覆盖 `origin/main` 起的完整 tracked/untracked 差异，并在暂存前识别出
Dashboard 新 hash asset 尚未纳入 Git index 的 HIGH 交付风险。随后将旧 asset 删除、新
`index-BY2_aTHg.js` 与 `dist/index.html` 原子暂存，复审确认 `R097` rename、HTML 引用、
Git index 中的 JS/CSS 和第五轮 bundle 语义均一致，`git diff --cached --check` 通过。

最终预 Verify 结论为 PASS：CRITICAL / HIGH / MEDIUM 均为 0；保留 2 个非阻断 LOW（ADR
列表编号重复、早期实施计划仍使用合并式 client 文件名）。两项均属于已在 Spec phase 登记并
锁定 hash 的历史文案，不影响运行时、契约或交付完整性；本轮不通过伪造 producer 或滥用
`requirements-changed` 在 Build phase 越权改写。

## 第五轮 Verify 回环发现与第六轮 Build 修复

冻结提交 `db167a9f112d7a14773e819d40bb8c33b2b12e3e` 的第五轮 Verify 中，Reviewer、
真实浏览器/视觉和全部自动化门禁通过，但 Codex CLI 与隔离 E2E 独立复现两项 MEDIUM：

| finding | RED | 最小修复 | GREEN |
| --- | --- | --- | --- |
| native update 无条件附加 setup-only `bundled-skills`/`runtime-readiness` | CLI/真实 `cmdUpdate(codex)` focused 2 failed / 61 passed | native setup 保留三个产品步骤；native update 只追加 managed runtime | CLI focused 63/63 |
| Host Plan route 接受前置/后置杂讯或多个 JSON 文档 | 三个歧义 stdout 用例 3/3 失败并错误返回 200 | route-local `trim + 单次 JSON.parse`；不改变其他 route 的通用末行 JSON parser | 三个 focused 3/3，完整 route 75/75 |

规格回环同时修正两个既有 LOW：ADR 决策编号现已连续；实施计划改为实际拆分的
`hostTargetPlanClient.ts` / `hostTargetPlanDecoders.ts` / `hostTargetPlanTypes.ts`。

跨层 decoder 同步先产生 Dashboard native update 2 failed / 16 passed，随后 server/frontend
strict decoder 与 fixtures 统一为 native setup 的完整产品尾步和 native update 的单一
`managed-runtime` 尾步；Dashboard GREEN 18/18，server typecheck 通过。主线整合后 focused
为 CLI/server 4 files / 170 tests、Dashboard 2 files / 32 tests，`typecheck:web` 和
`git diff --check` 通过。

## 第六轮 Build 全量收敛

- `npm run build`：通过；Dashboard 新 hash `index-9UXUelXP.js`，server 与 CLI tracked
  bundle 均已更新。
- `npm run typecheck:web`：通过。
- `npm run test:web`：通过；仅输出仓库既有 React `act(...)` / GSAP 警告。
- 首次 `npm test`：317 files 中 316 passed；5488 passed / 5 honest skips / 1 failed。
  唯一失败为与本功能无关的 `internal-skill-gate-hook.integration.test.ts` 5 秒时序超时；
  随后对该文件独立精确重跑 9/9 通过。该首次全量波动保留为事实，不描述为全绿。
- `bash tools/test-bundle.sh`：31/31。
- `npm run check:npx-package`：35/35。
- `npm run check:docs`：10/10，39 canonical Markdown files。
- `npm run check:repository-hygiene`：6/6，repository PASS。
- `npm run check:architecture`：623 production files，5 个 size-only exception。
- `npm run check:comments`、OpenSpec strict validation、`git diff --check`：通过。
- built CLI 对 12 个 host × setup/update 的 24 份 DTO 实际烟测全部通过：
  `side_effects=none`；native setup 保留完整尾步、native update 只有
  `managed-runtime`；adapter setup 五步/update 三步。custom `.foo`、重复 `--host` 和重复
  `--operation` 三类非法输入均被拒绝。

最终冻结前只读 reviewer 对完整 `origin/main...working tree` 做 Standards / Spec 双轴审查，
唯一 HIGH 是暂存前新 hash asset 尚未进入 Git index。把旧 asset 删除、新
`index-9UXUelXP.js` 与 `dist/index.html` 原子暂存后，复审确认 `R097` rename、HTML 引用、
Git index 中的 JS/CSS 与 Build6 语义一致，`git diff --cached --check` 通过。最终结论
PASS：CRITICAL / HIGH / MEDIUM / LOW 均为 0；可以写入 Build 出口的
`pre_verify_review_result=pass`。

## 第六轮 Verify 主线冲突与第七轮 Build 集成

冻结提交 `b1a21eecfd66283139e9388c5da33b2004e25808` 的第六轮 Verify 中，产品、运行时、
浏览器与完整 reviewer 均通过；唯一 MEDIUM 是任务期间 `origin/main` 从
`2d103e330f847e003ff5909097d892f5722cca04` 前进到
`15fe619b2885b928dd27be9668cca6b0ee903c57`，新增 Codex 认证安装引导，并与本 Change 在
`packages/cli/src/commands/setup.test.ts` 和生成的 `packages/cli/dist/tenon.mjs` 产生真实冲突。

本轮在当前独立 worktree 内执行正常 merge，不使用 `requirements-changed` 绕过会话或实现问题：

- `setup.test.ts` 保留主线四组 Codex CLI 缺失、可信绝对 executable、Windows batch binding、
  登录状态顺序测试，同时保留本 Change 三组 adapter setup/update 与 native update 真实编排测试。
- 生成 bundle 不手工拼接；先重建 kernel workspace 输出，再由 `npm run build` 原子重建
  Dashboard、server 和 CLI tracked 产物。
- 聚焦 CLI 4 files / 117 tests 通过。
- `npm run typecheck:web` 与 `npm run test:web` 通过，Dashboard 为 52 files / 999 tests。
- `npm test` 通过，318 files / 5539 passed / 5 honest skips（5544 total）。
- `bash tools/test-bundle.sh` 31/31；`npm run check:npx-package` 39/39；
  docs 10/10、repository hygiene 6/6、architecture 627 files、comments 和 OpenSpec strict
  validation 全部通过。
- 重新 fetch 后 `origin/main` 仍为 `15fe619b2885b928dd27be9668cca6b0ee903c57`。

合并提交完成后必须再次确认 `origin/main` 是新 HEAD 的祖先，且 `git merge-tree --write-tree
origin/main HEAD` 零冲突；在此之前不冻结 Build barrier，也不复用第六轮 Verify 结论。

### 第七轮 pre-Verify 审查发现

独立 reviewer 覆盖合并后的 210/210 paths，结论为 C0/H0/M1/L0。唯一 MEDIUM 是主线新增的
Codex 认证语义尚未进入 Host Plan：真实 Codex setup 和手工 update 均在 managed runtime
成功后探测 `codex login status` 并输出认证引导，但 v1 计划仍结束在旧步骤，server/frontend
strict decoder 也会拒绝新增步骤。现有两组测试只分别验证 Host Plan 与真实 auth 流程，没有交叉
断言，因而全绿未捕获这项漂移。

该 finding 改变了“计划与当前真实 setup/update 编排一致”的已批准语义，必须用
`requirements-changed` 返回 Spec，明确 Codex-only 的稳定认证状态/引导步骤与 notice，再更新
三端契约、i18n、真实顺序测试和生成 bundle。不得把它当成会话绑定问题绕过，也不得在 Build
直接覆盖已登记的 proposal/design SHA。

## 第八轮 Build：Codex 认证计划纵向同步

本轮严格经过 `requirements-changed` 的 Spec 修订与 exact `spec-complete` delegated review
回到 Build。交叉 TDD 先让 CLI、server 与 Dashboard fixture 因缺少新契约而按预期失败，再以
最小实现同步：

- Codex setup 在 `managed-runtime` 后加入只读 `codex-auth-status`，随后保留
  `bundled-skills`、`runtime-readiness`，共 7 步；Codex update 在 `managed-runtime` 后加入同一
  步骤，共 5 步。
- `codex-auth-status` 只预览 `codex login status`，计划生成不会执行该命令；Codex 计划增加
  `host-plan.notice.codex-auth-guidance`。
- Claude setup/update 仍分别为 6/4 步，十个 adapter 仍分别为 5/3 步，均不接受 Codex-only
  step 或 notice。
- CLI、server、Dashboard 三端严格 decoder、zh/en i18n、组件/API fixture 与真实
  `cmdSetup`/`cmdUpdate` 顺序测试已同步；CLI/server/Dashboard 生成物由 `npm run build` 重建。

Build8 收敛证据：

- CLI/server 聚焦测试 168/168；Dashboard 聚焦测试 32/32。
- `npm run typecheck:web` 通过；`npm run test:web` 为 52 files / 999 tests。
- `npm test` 为 318 files / 5539 passed / 5 honest skips（5544 total）。
- `npm run build` 通过，Dashboard 新 asset 为 `index-BVcnLJH_.js`。
- `bash tools/test-bundle.sh` 31/31；`npm run check:npx-package` 39/39；docs 10/10；
  repository hygiene 6/6；architecture 627 files；comments 与 OpenSpec strict validation
  全部通过。
- built CLI catalog 为 12 个注册目标；12×setup/update 共 24 个计划均为
  `host-target-plan/v1`、`side_effects=none`，并拒绝 `.foo`、重复 `--host`、重复
  `--operation`。

生成物原子暂存后的完整 Standards / Spec 复审覆盖
`origin/main...merge working tree` 有效路径 220/220（untracked 0、unmerged 0），结论为
PASS：CRITICAL / HIGH / MEDIUM / LOW 均为 0。复审确认 Codex-only auth step/notice 与真实
setup/update 顺序一致，Claude/adapter 无泄漏，计划生成仍为零副作用，server/frontend 严格
decoder fail-closed，UI 不提供执行入口，三份 dist 属于同代构建且 `index.html` 指向已暂存
`index-BVcnLJH_.js`。合并提交后仍须确认 `origin/main` 为祖先且 merge-tree 零冲突，再冻结
Build barrier。
