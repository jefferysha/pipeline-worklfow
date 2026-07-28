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
