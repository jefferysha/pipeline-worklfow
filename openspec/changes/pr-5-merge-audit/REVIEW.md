# PR #5 Build 视觉评修记录

## 第一轮审查

审查范围：PR #5 全部待合并 UI diff，以及本轮修复前的真实 Dashboard、1440×900 桌面、
精确 720×900 临界视口和 390×844 移动视口。

| Severity | 问题 | 用户影响 | 处理 |
| --- | --- | --- | --- |
| Medium | `max-[720px]` 在 Tailwind v4 中排除精确 720px | 720px 时 shell 与规范不一致 | 引入 inclusive `mobile` variant，全量替换同一断点 |
| Medium | Progress drawer 关闭使用 ease-in | 关闭动作与统一 motion 词汇不一致 | 改为 `power1.out` / `power3.out` 并补 hook 测试 |
| Medium | Traffic 记录加载态硬编码中文 | 英文模式出现混合语言 | 增加 zh/en 翻译 key 与英文加载态测试 |
| Low | 官方 Progress 截图仍展示旧状态条 | README/文档与当前产品视觉不一致 | 从身份校验后的真实 Dashboard 刷新 WebP |

## 修复后复评

### frontend-design

- 信息层级：桌面 rail、移动顶栏/底栏、Progress 标题、筛选、阶段画布和 Change 卡片顺序清晰。
- 状态：当前 Build Change、等待中计数、实时同步和阶段状态均有文字与非颜色线索。
- 响应式：720px 的 nav 为 `fixed` 底栏，宽 720、高 72；main 底部预留 88px。390px 文档宽度
  390/390，无横向溢出，一级入口均不小于 44×44px。
- 主题：亮色和暗色均从同一真实页面验证，状态和主要动作仍可区分。
- 可访问性：一级导航、设置、筛选、Change 卡片均为语义控件；自动测试覆盖 skip link、
  focus ring、对比度和 reduced-motion。

结论：0 Critical / 0 High / 0 Medium。

### design-taste-frontend

- 新修复没有引入新卡片、装饰、颜色或排版体系，继续复用 PR #5 已建立的 token 和组件语言。
- 1440px 页面保持清晰的标题—筛选—画布层级；390px 将操作和筛选自然纵排，没有通过缩小
  正文或隐藏关键状态维持桌面结构。
- 新截图与当前 cobalt primary、green success 和阶段时间线一致，不再出现旧红绿左侧条。

结论：0 Critical / 0 High / 0 Medium。

## Build 规则与规格审查修订

| 审查轨 | Severity | 发现 | 修订与证据 |
| --- | --- | --- | --- |
| Standards | Medium | 实施计划把翻译表和新增 hook 测试写成了不存在的路径 | 计划改为真实路径 `src/i18n/translations.ts` 与 `useProgressDrawer.test.tsx`；由于计划摘要发生变化，按 `requirements-changed` 回到 Spec，重新登记、读取并取得 exact-event review 后再进入 Build |
| Spec | Medium | 初版 delta 把单个加载态修复扩大成了所有用户可见状态文案的全局义务 | delta 收窄为“本 Change 新增的捕获记录加载态文案”，再次按 `requirements-changed` 回到 Spec，重新登记 delta、计划和任务并取得 exact-event review |
| Spec | Medium | 收窄后的 Scenario 仍写成“页面不出现硬编码中文”，与同屏既有中文文案冲突 | Scenario 进一步精确为“该加载态文案”；第三次按 `requirements-changed` 回到 Spec，重登记设计、delta、计划、任务并取得 exact-event review |
| Spec | Medium | `SolutionView` 两个 `min-[720px]` 在精确 720px 启用桌面网格 | 新增共享 `desktop` variant，替换两个 class 并增加 SolutionView/CSS 契约测试；真实浏览器证明 720px 时 `max-width:720px=true`、`min-width:720.02px=false` 且两个网格均为单列，721px 时条件反转 |

上述修订均只澄清本 Change 的真实实现范围或兑现既有断点契约，没有覆盖旧 SHA、改变公共契约或绕过 review gate。
最终合并前审查以修订后的完整 diff 为准。

浏览器复验还发现 Chromium 会把 `720.01px` 量化到与 720px 相同的 media query 槽；实现因此使用
`720.02px` 的桌面下界，并由源码测试、生产 CSS 和真实 720px / 721px 浏览器结果共同约束。

## 首次 Verify 失败与修复复评

首次冻结 SHA `9bccbda03c11e57d81ae8626b06d318fa9aef501` 没有被误报为通过：

- Reviewer：0 Critical / 0 High / 1 Medium / 3 Low；Medium 为 ADR 的“单一 mobile variant”
  与互补断点实现不一致。
- Visual：0 Critical / 0 High / 1 Medium；1024×768 下七阶段条 `clientWidth=886`、
  `scrollWidth=1024`，Archive 初始位于滚动容器右侧外，且没有滚动发现提示。
- E2E：隔离构建、980 项 web 测试、106 项定向测试、API smoke 与 720/721 临界点均通过；
  三次全浏览器脚本因脚本自己的旧状态假设失败，因此整轨按失败/阻塞处理。
- Codex CLI：压缩后的手写源码审查提出证据绑定、主题路径与 i18n 范围问题；证据绑定已在报告
  中修正，主题路径转为新增测试，未把超出本 Change 的全局 i18n 重写纳入范围。

精确 `verify-fail` 复核后回到 Build，并通过 `requirements-changed` 重新登记 Spec。实现期间由真实
DOM 发现阶段条由 `TimelineStageStrip` 承载，而非原计划误写的 `StepperRail`；错误目标上的未提交
改动已撤销，并再次按 `requirements-changed` 回到 Spec 修正设计与计划，未覆盖旧 SHA。

修复后证据：

- `TimelineStageStrip.test.tsx` 新断言先因缺少 `wb-stage-scroll-hint` 失败；最小实现后，与
  `themeContrast`、`WorkbenchView`、i18n 合计 86 项定向测试及 `typecheck:web` 通过。
- 真实 1024×768 Tenon Dashboard 中，页面标题为 `Tenon Dashboard`，root 指向本审计 worktree；
  提示显示为 `inline-flex`，文本为“横向滚动查看全部阶段”，其 id 与滚动区
  `aria-describedby` 完全一致。
- 同一页面滚动区 `clientWidth=886`、`scrollWidth=1024`、最大横向距离 138px；点击
  “选择阶段 归档”后 `scrollLeft=126`，Archive 完整进入容器并获得
  `aria-current="step"`、`aria-pressed="true"` 与键盘焦点。
- 视觉复评确认提示复用既有 border/fill/text token，无新装饰体系；12px 辅助文案清晰但不争夺
  阶段主层级。结论：0 Critical / 0 High / 0 Medium。

## 第二轮 pre-Verify 审查

- Standards：PASS，0 Critical / 0 High / 0 Medium / 3 Low。Low 包括计划残留的
  `StepperRail` 名称、宽屏下永久 `aria-describedby` 的非阻塞观察及新增测试格式；名称和格式在
  本轮修正，描述文字本身在宽窄视口均准确，不改变辅助技术可用性。
- Spec：FAIL，0 Critical / 0 High / 1 Medium。delta 的全局 motion MUST 尚未完整兑现：
  `AppHeader` 项目切换 popover 关闭仍使用 `power1.in`，Tailwind transition utility 的默认 timing
  仍为 `cubic-bezier(.4,0,.2,1)`，且测试只覆盖 Progress drawer。
- 处理：未设置 `pre_verify_review_result=pass`，按 `requirements-changed` 返回 Spec。计划增加共享
  Tailwind ease-out token、AppHeader popover 开关断言及生产 CSS 守卫；Build 必须重新走红绿重构、
  全量验证和独立 pre-Verify 复审。

修复证据：

- 红：AppHeader 与共享 token 两条定向守卫首次运行分别因 `power1.in` 和缺少
  `--default-transition-timing-function` 失败；21 项既有断言同时通过，证明失败原因精确。
- 绿：`index.css` 将 Tailwind 默认 transition timing 映射到 `var(--ease-out)`，`AppHeader`
  关闭补间改为 `duration: 0.12, ease: 'power1.out'`；AppHeader、主题、drawer、阶段条共 26 项
  定向测试和 `typecheck:web` 通过。
- 生产构建：新 CSS `index-pBTBvMM6.css` 含
  `--default-transition-timing-function:var(--ease-out)`。
- 真实浏览器：1024×768 的目标 Dashboard 标题与 root 身份正确；阶段提示仍为 `inline-flex` 且
  `aria-describedby` 与提示 id 一致。实际导航控件的 transition duration 为 `0.15s`，computed
  timing function 为 `cubic-bezier(0, 0, 0.2, 1)`。
- 第二轮视觉复评：共享 motion token 不改变层级、颜色、间距或内容，交互反馈更一致；
  frontend-design 与 design-taste-frontend 均为 0 Critical / 0 High / 0 Medium。

最终 Build 门禁：

- `npm run build`、`npm run typecheck:web`、architecture/comments/docs/repository-hygiene、
  bundle 31/31 与 `git diff --check` 全部通过。
- 首次并发全量 web 测试仅在 `CreateChangeDialog` 出现一项异步超时；同文件隔离复跑 5/5 通过，
  随后串行独立全量复跑 54/54 文件、988/988 测试通过。
- 根级串行测试 `npm test -- --no-file-parallelism --maxWorkers=1 --minWorkers=1`
  通过：315/315 文件，5399 passed、5 个凭据门控的诚实 skipped，退出码 0。
- 所有上述命令均在当前 PR #5 审计 worktree 的最新未提交实现上运行；最终 pre-Verify 双轨审查
  仍须以该完整 diff 为准，审查通过前不设置 `pre_verify_review_result=pass`。

最终独立 pre-Verify 审查：

- Spec/Correctness：PASS，0 Critical / 0 High / 0 Medium / 0 Low。审查绑定 merge-base
  `2d103e330f847e003ff5909097d892f5722cca04`、HEAD `115e0fb91cce67aa97bd5da1adab0b9b67343c61`
  及全部 tracked/untracked 修复；确认 motion、1024 阶段发现性、720/721、i18n、主题、
  production dist 与登记规格一致。
- Standards/Rules/Architecture：初审 PASS，0 Critical / 0 High / 0 Medium / 2 Low；
  两项 Low 为 Nav 注释的 `<720px` 与新增测试残留分号。修正后相关 26/26 测试及
  `git diff --check` 通过，增量只读复核重新绑定最新指纹并以
  0 Critical / 0 High / 0 Medium / 0 Low PASS。
- 两条审查轨均由独立 reviewer agent 严格只读完成，没有写入工作树；允许 Build 设置
  `pre_verify_review_result=pass` 并冻结新的 Verify SHA。

## 剩余非阻塞观察

- Vite 仍提示主 JS chunk 超过 500k；PR #5 没有新增依赖，该提示在当前 `main` 基线已存在。
- `App.test.tsx` 的 Workbench 异步更新仍产生既有 `act(...)` warning；测试全部通过，本轮修改未新增该状态路径。
