# Dashboard UI/UX Build 评修复记录

## 范围

- `packages/dashboard-app/src/solution/SolutionView.tsx`
- `packages/dashboard-app/src/solution/SolutionSectionNav.tsx`
- `packages/dashboard-app/src/solution/solutionModel.ts`
- `packages/dashboard-app/src/solution/SolutionView.test.tsx`
- `packages/dashboard-app/src/components/ui/button.tsx`
- `packages/dashboard-app/src/components/ui/button.test.tsx`

## 第 1 轮：基线问题

| Severity | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| HIGH | 390×844 概览页高 8,981px，七个主要章节没有页内导航 | 移动和键盘用户只能长距离线性滚动，难以建立页面结构和快速定位 | 增加七章节语义导航与原生锚点 |
| MEDIUM | 根容器使用双轴 `overflow-hidden` | 新增 sticky 导航会被祖先滚动容器限制，无法在长页面持续可用 | 改为 `overflow-x-clip`，只裁剪横向溢出 |
| MEDIUM | 窄屏七章节标签无法同时容纳 | 若换行会形成高噪声按钮墙；若压缩会损害标签和触控目标 | 使用横向滚动、`min-w-max` 与每项至少 44px 高 |
| MEDIUM | 章节标题没有稳定 id/可访问关联 | 锚点可能失效，辅助技术无法从目标 section 得知对应标题 | 由 solution 域静态配置生成 section/heading id，并使用 `aria-labelledby` |

## 修复

- 新增域内 `SolutionSectionNav`，使用语义 `nav`、`ul` 与原生链接。
- 复用既有七个双语 eyebrow，不修改共享 i18n。
- 桌面保持一行紧凑索引；移动端横向滚动并保持 44px 高目标。
- 使用既有 border/card/fill/accent/ring token，未增加装饰色、依赖或全局状态。
- 不引入平滑滚动、observer 或 GSAP；reduced-motion 下直接保持原生即时定位。
- TDD 红灯确认导航缺失；实现后相邻测试 7/7 通过。

## 第 2 轮：运行态复评

环境：当前 automation worktree 的生产构建，`http://127.0.0.1:18831/?view=overview`，
页面标题 `Tenon Dashboard`。

- 1200×870 浅色：7 个链接、7 个真实目标、每项 44px；根级 `scrollWidth=1200`。
- 390×844 深色 + reduced-motion：导航 `clientWidth=304`、`scrollWidth=566`，
  根级 `scrollWidth=390`；每项 44px；7 个目标全部存在。
- 键盘聚焦第 7 项时导航自动从 `scrollLeft=0` 滚至 `262.5`，焦点保持可见；Enter 后
  `location.hash=#solution-community`，sticky 导航保持 `top=8`。
- reduced-motion：链接 `transition-property=none`，文档 `scroll-behavior=auto`。

复评结论：Critical / High / Medium = 0 / 0 / 0。

## 第 3 轮：共享原语与状态反馈

最新 overlap 复核确认 PR #5–#8 仍覆盖 App、Nav、i18n、progress、workbench、shared 与 API；
`components/ui/button.tsx` 和 `solution/` 未发生文件重叠。

| Severity | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| MEDIUM | SolutionView 激活锚点后没有当前章节反馈 | 用户到达章节后仍需重新从内容推断位置，辅助技术也没有当前位置语义 | 使用 URL hash 驱动 `aria-current="location"` 与 token 化选中样式 |
| MEDIUM | 共享 Button 的 default/sm/lg/icon 移动尺寸为 32–40px | 高频移动操作低于本 Change 采用的 44px 增强目标 | 仅在 ≤720px 将常规和图标尺寸提升到 44px；保留明确紧凑的 xs 变体 |
| MEDIUM | Button 的通用 transition 未显式降级 | reduced-motion 用户仍会看到按钮状态过渡 | 原语统一添加 `motion-reduce:transition-none` |
| LOW | disabled Button 只有 50% opacity，且 pointer-events 使禁用光标反馈不可见 | 状态可辨认但反馈较弱 | 使用原生 disabled 阻断语义、60% opacity 与 `cursor-not-allowed` |

TDD 红灯：Button 两项与当前章节一项共 3 个断言按预期失败。最小实现后，定向测试
`10/10` 通过，`npm run typecheck:web` 与生产构建通过。

## 第 4 轮：运行态复评

环境：当前 automation worktree 的生产构建，`http://127.0.0.1:18832/?view=overview`，
页面标题 `Tenon Dashboard`。

- 1200×870 浅色：键盘激活“03 · 证明”后 hash 为 `#solution-evidence`，
  链接获得 `aria-current="location"`，焦点和选中层级清晰。
- 390×844 深色 + reduced-motion：根级无水平溢出；七个导航链接和两个概览 Button 均为
  44px 高；按钮与链接的 `transition-property=none`。
- 聚焦末项时横向导航滚动至 `262.5`，末项仍完整可见；激活后“07 · 社区”获得当前章节语义。
- 桌面证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-active-desktop-light.png`
- 移动证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-active-mobile-dark-reduced.png`

复评结论：Critical / High / Medium = 0 / 0 / 0。当前章节只跟随 URL hash，不引入
IntersectionObserver、滚动监听或 GSAP，避免高频观察器和额外清理负担。

## pre-Verify 全量 Standards + Spec 审查

冻结候选实现边界：`origin/main...40f5cab`。审查覆盖全部应用源码、测试、生成的 Dashboard
dist、OpenSpec/Tenon 证据与浏览器截图，而不是只看最近一次 finding。

| 文件组 | Capability / requirement | 审查结论 |
| --- | --- | --- |
| `solutionModel.ts`、`SolutionView.tsx` | 稳定章节身份、可识别标题、无根级横向溢出 | 配置集中；七个 target 与 heading 一一对应 |
| `SolutionSectionNav.tsx` | 响应式定位、键盘、屏幕阅读器、当前状态、reduced motion | 原生链接、`aria-current`、hashchange 清理与 token 化状态符合规格 |
| `components/ui/button.tsx` | 共享触控目标、disabled、focus 与 reduced motion | 仅常规/图标尺寸在移动端提升；xs 保留给明确紧凑语境 |
| 相邻测试 | 回归防护 | 先红后绿；导航配置漂移、hash 状态与 Button 类契约均被覆盖 |
| Dashboard dist | 可发布资产 | 由当前源码运行 `npm run build` 生成，未手改 |
| 治理文档与截图 | 可审查增量交付 | Change、设计、任务、review、基线和运行态证据完整 |

### Standards 轴

- Correctness：hash 只接受七个已声明 section；未知/空 hash 不产生伪当前状态。
- Lifecycle：只注册一个 `hashchange` listener，并在卸载时移除；未引入 observer、timer 或 GSAP。
- Compatibility：不改变 API、i18n、数据模型或依赖；PR #5–#8 无同文件实现冲突。
- Accessibility：语义 navigation/list/link、稳定 target、`aria-labelledby`、`aria-current`、
  可见 focus、44px 移动目标与 reduced-motion 均有测试和浏览器证据。
- Maintainability：section 类型、顺序和 id 在 domain model 单点定义；导航与内容共用同一配置。

### Spec 轴

- SolutionView 的 375–1440px 无根级横向溢出、七章节定位、键盘与 reduced-motion 场景全部通过。
- Button 原语补齐跨消费者的移动目标与状态降级，不修改明确的 xs 紧凑变体。
- 未新增可见文案，因此中英文资源无漂移；未修改异步业务状态或服务端契约。
- “并行 UI 改动存在”场景已执行：避开 PR #5–#8 的 App/Nav/i18n/progress/workbench/shared/API 文件。

### 门禁结果

- 定向 Vitest：2 files / 10 tests passed。
- `npm run typecheck:web`：passed。
- `npm run test:web`：51 files / 967 tests passed。
- `npm run build`：passed；Dashboard、server 和 CLI 产物均生成成功。
- `git diff --check`：passed。
- 已有非失败噪声：Vite >500kB chunk warning，以及既有 AFK/Workbench `act(...)` 与 TaskDetail
  GSAP target warnings；本 diff 未修改对应文件或引入新失败。

全量审查结论：Critical / High / Medium = 0 / 0 / 0；没有需要带入 Verify 的已知偏差。

## Verify 第 1 轮失败与 Build 整改

第一次 Verify 对冻结 SHA `a101dddcb79c2263fe691c1661b0be5316571d14` 给出 High 1 / Medium 3：
Dashboard-wide 规格覆盖不足、设计文档与 hash listener 漂移、Button 尺寸矩阵证据不足、移动 rail
为 34px 且设置入口无 accessible name。失败报告见
`docs/superpowers/reports/2026-07-28-dashboard-ui-ux-overhaul-automation-verify-fail-1.md`。

整改后逐项闭环：

- Nav 品牌、五个主入口、设置入口在 390px 均为 44×44 且均有可访问名称。
- 设置弹层具备初始焦点、Tab/Shift+Tab 圈定、Escape 关闭和触发器焦点返回。
- Button 常规/图标尺寸矩阵均有测试；Input、Select、Tabs、Dialog、DropdownMenu 等共享原语补齐
  移动触控与 reduced-motion 契约。
- 主动作 token 使用 accent blue，不复用 success green；system 主题具备实时 media listener 和清理。
- 设计、ADR 与计划准确描述 hash、media-query 和 dialog keydown listener 的生命周期。
- 真实零项目 Dashboard 空态的全部可见操作均为 44px 且有名称；受控阻断 snapshot/stream 后，
  `role=alert`、`aria-live=assertive` 和 44px 重试路径均可达。

本轮 Build 复评：已知 Critical / High / Medium = 0 / 0 / 0；进入第二次 pre-Verify 前仍需完成
全量测试、生产构建、截图与 Standards + Spec 审查。

## 产品定位校正：仅电脑端

用户明确说明 Dashboard 不存在手机端使用场景，原自动任务中的移动布局/移动验收要求不再适用。
因此上文关于 390px、44px 触控目标和手机截图的内容仅保留为历史 Verify 记录，不构成最终
验收标准。最终范围为 1024–1920px 电脑端，并继续要求键盘、屏幕阅读器、浅/深/system 主题、
空/错/恢复状态和 reduced-motion。Build 必须撤销专门的移动尺寸规则和手机截图后重新全量审查。

## 电脑端范围收敛后的 Build 复评

最终候选实现撤销本 Change 新增的 `touch-manipulation`、`max-[720px]:min-h-11` /
`size-11` 移动触控强化，以及 6 张手机截图；项目原有窄窗口布局降级不属于本轮投资，未做无关
重写。SolutionView 章节索引改为 40px 的电脑端紧凑密度，同时保留原生链接、可见焦点、
`aria-current` 和 reduced-motion。

### TDD 与自动验证

- 红：电脑端 Button/设计系统/SolutionView 新契约先产生 7 个预期失败。
- 绿：定向 4 文件 / 54 测试通过。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 文件 / 988 测试通过；仅保留既有 `act(...)`、GSAP target 警告。
- `npm run build`：通过；Dashboard、server、CLI 产物均由当前源码重建。
- `git diff --check`：通过；Vite 仍有既有的大 chunk 提示。

### 真实电脑端浏览器验收

目标为当前 worktree 的生产构建 `http://127.0.0.1:18836`，页面标题为 `Tenon Dashboard`，
H1 为“让 coding agents 按可验证流程交付”，避免把其他端口应用误认为验收对象。

- 1024×768 浅色：根宽 `1024/1024`，7 个链接映射 7 个 section；键盘激活后 URL 为
  `#solution-evidence` 且 `aria-current=location`；设置弹层首焦点、Shift+Tab 圈定、Escape
  关闭与触发器焦点返回全部通过。
- 1200×870 system 深色 + reduced-motion：根宽 `1200/1200`；抽样可交互元素的非零 CSS
  transition/animation 数为 0；系统配色从 dark 切至 light 后界面实时同步。
- 1440×900 浅色：根宽 `1440/1440`，七章节索引完整，无 console error。
- 真实 `/api/snapshot` 返回 `project_count=0`；项目页展示双步骤零项目引导。
- 受控 fault injection 将首次 snapshot 置为 500、stream 置为 abort：`role=alert`、
  `aria-live=assertive` 与“重试加载”可达；第二次 snapshot 成功后 alert 消失并恢复零项目空态。
  控制台仅出现两条与注入失败一致的网络错误。

桌面证据：

- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-desktop-1024-light.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-desktop-1200-dark-reduced.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-desktop-1440-light.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-empty-desktop-1440-light.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-error-desktop-1200-light-reduced.png`

复评结果：视觉层级保持“安静的操作台”，电脑端密度、键盘语义、状态反馈与动效降级一致；
Critical / High / Medium = 0 / 0 / 0。

## Verify 第 2 轮失败与桌面语义闭环

第二次 Verify 对冻结 SHA `eabfb33f7e07de7f09b562c144941e115d1789b7` 的隔离 E2E 全部通过，
但 Reviewer 与 Visual 仍发现两组 High、四组 Medium/Low 风险：

- 原 delta spec 对未触及功能域宣称 Dashboard-wide 完成，并把 PR #5 的真实文件重叠写成
  “选择无冲突文件或等待”；已通过 `verify-fail → build → requirements-changed → spec` 修订为
  本 Change 的生产可达桌面范围，并明确独立提交、review、rebase 与不强推策略。
- App 普通加载缺少 polite live region，工作台不可达状态不是 alert，error flash 与普通 toast
  都使用 status；现已分别使用 `status/polite`、`alert` 与按 kind 区分的 live-region 语义。
  初始 snapshot 错误仍提供重试；不可达工作台由 shell 自动恢复到项目总览。
- `aria-modal=false` 的设置浮层错误模拟 Tab 困笼；现保留初始焦点、自然 Tab/Shift+Tab、
  Escape 与焦点返回，并忽略已由嵌套交互 `preventDefault` 的 Escape。
- App 直接调用 `toastIn` 未清理；现 `toastIn` 返回 tween，effect 更新或卸载时调用 `kill()`，
  flash timeout 也在覆盖和卸载时清理。
- 零项目 Onboarding 从 H2 修正为页面唯一 H1；两个复制按钮以完整命令形成不同的双语
  accessible name，并以 `min-h-6` 保证至少 24px 的电脑端点击高度。
- system 主题 listener 新增从 system 切出和卸载时的清理断言。

### TDD 证据

- 红：5 个定向测试文件产生 8 个预期失败，分别命中上述语义、生命周期与尺寸缺口。
- 绿：5 个文件 / 99 tests 通过；既有 Workbench `act(...)` 警告未转为失败。
- stale release asset：另一个只读验收执行 `build:web` 后生成
  `index-D1Cbva3k.js` / `index-g5mQ93zY.css`。相同输出已由冻结 `eabfb33f` 的隔离副本复现，
  因此作为构建产物修复保留，不回退到旧哈希。

本轮 UI/UX 复评结论：修改均使用现有 token、Lucide、Tailwind 与 GSAP，没有增加移动端专项、
视觉装饰或新依赖；Critical / High / Medium = 0 / 0 / 0。进入第三次 pre-Verify 前仍需完成
全量测试、生产构建和真实电脑端浏览器复验。

## 第三次 pre-Verify：电脑端最终候选

审查边界为第二次冻结 SHA `eabfb33f7e07de7f09b562c144941e115d1789b7` 之后的规格修订、
语义/生命周期修复、对应测试与重新生成的 Dashboard 发布资产，并结合前两轮 review 对
`origin/main...HEAD` 的全部历史改动复核。最终定位仍为 1024–1920px 电脑端，不新增手机端
验收或专项样式。

### 自动验证

- TDD 红：5 个定向文件产生 8 个预期失败；实现后 5 文件 / 99 tests 通过。
- `npm run typecheck:web`：通过。
- `npm run test:web`：52 文件 / 992 tests 通过。
- `npm run build`：通过；当前源码重新生成
  `index-BQAhnybq.js` / `index-DnZ1mCZ2.css`，不回退到已证明陈旧的发布资产。
- 非失败噪声仍为既有 `act(...)`、GSAP target 与 Vite >500kB chunk 提示。

### 真实电脑端浏览器复验

环境为当前 worktree 生产服务 `http://127.0.0.1:18836`；每个场景均确认页面标题
`Tenon Dashboard` 与目标 H1，未复用端口上的其他应用。

- 1024×768 浅色概览：7 个章节链接可达对应锚点，根级无横向溢出；设置浮层首焦点为主题，
  Shift+Tab 自然返回设置触发器而非形成伪模态困笼，Escape 关闭后焦点返回触发器。
- 1200×800 system 深色 + reduced-motion：系统深色与减弱动效 media query 生效，
  `document.getAnimations()` 无 running animation，根级无横向溢出且无 console error。
- 1440×900 浅色真实零项目：页面唯一 H1 为“还没有注册任何项目”；两个复制按钮的
  accessible name 分别包含完整命令，高度均为 24px，根级无横向溢出且无 console error。
- 1200×800 浅色 + reduced-motion 受控故障：同时阻断 `/api/snapshot` 与 `/api/stream`，
  快照错误以 `role=alert` / `aria-live=assertive` 呈现并提供“重试加载”；解除故障并重试后
  alert 消失，恢复真实零项目 H1。控制台错误仅对应注入的 500 与 stream abort。

最终截图：

- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-desktop-1024-light-final.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-desktop-1200-dark-reduced-final.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-automation/system-empty-desktop-1440-light-final.png`
- `docs/superpowers/reports/evidence/dashboard-ui-ux-overhaul-automation/system-error-desktop-1200-light-reduced-final.png`

### Standards + Spec 结论

- Correctness：加载、普通通知、错误通知、不可达工作台和初始快照错误使用与严重度一致的
  live-region 语义；错误重试可恢复，不伪造成功状态。
- Lifecycle：flash tween 在 effect 更新/卸载时 `kill()`，覆盖 timeout 与卸载 timeout 均清理；
  主题 media listener 的切换和卸载清理由测试约束。
- Accessibility：非模态设置使用自然 Tab 顺序；嵌套交互已消费的 Escape 不会二次关闭；
  空项目页拥有唯一 H1、不同复制名称与电脑端最小 24px 点击高度。
- Compatibility：无 API、数据模型、依赖或移动端专项扩张；PR #5 的同文件重叠通过独立提交、
  review、普通 rebase 与禁止 force push 的交付策略如实保留。
- Maintainability：动效仍集中在共享 motion helper，状态规则留在 App/state 边界，可见文案
  同步维护中英文。

最终冻结前审查结论：Critical / High / Medium = 0 / 0 / 0；没有需要带入第三次 Verify 的
已知可修复偏差。
