# Dashboard UI/UX Build 设计复核

## 范围与方法

- 对象：最终生产 bundle `index-DLfimi5h.js` / `index-DsdZ7MR-.css`。
- 页面：Projects、Overview、设置浮层、Onboarding，以及全局 loading/error/offline/disabled 状态。
- 视口：1024×768、1200×870、1440×900、1920×1080；不包含手机端。
- 主题与动效：light、dark、system、`prefers-reduced-motion: reduce`。
- 方法：`frontend-design`、`web-design-guidelines`、`design-taste-frontend` 两轮代码与真实浏览器复核。

## 第一轮问题清单

| Severity | 用户任务 | 问题 | 修复 |
| --- | --- | --- | --- |
| MEDIUM | 在 Projects 选择正确 worktree | 同 basename 行只显示项目名，视觉、accessible name 与测试标识均会冲突。 | 行内增加 root 次级文本；accessible name 包含完整 root；重复 basename 使用 root 派生唯一标识，动画指纹改用 root。 |
| MEDIUM | 用键盘修改 Dashboard 设置 | 设置浮层缺少首控件聚焦、Escape 关闭和焦点归还，且可能与 modal Dialog 的 Escape 冲突。 | 保持非模态语义，打开聚焦首控件，Escape 关闭并归还入口；检测上层 modal，避免抢键。 |
| MEDIUM | 在长 Overview 中定位内容 | 七个章节无页内导航和稳定 section id，1024px 下需要长距离滚动且位置不可分享。 | 从同一 section 配置生成七个原生锚点，加入 sticky 章节导航、稳定 id、`aria-labelledby` 与 `aria-current`。 |
| MEDIUM | 区分动作、成功和状态 | primary token 与 accent 重复硬编码，语义关系不可追踪；旧对比度测试无法解析 token alias。 | `btn-bg/hover` 显式引用 accent family，primary 引用动作 token；对比度测试递归解析 CSS 变量并继续执行 AA 门槛。 |
| MEDIUM | 在减少动态效果偏好下操作 | 历史 transition、共享原语和 toast/GSAP 生命周期缺少统一终态或 cleanup。 | 加入全局 reduced-motion 兜底、原语级声明、GSAP media 分支与 toast tween/timer cleanup。 |
| MEDIUM | 理解空态与状态反馈 | Onboarding 一级空态使用 H2；复制按钮只朗读通用“复制”；普通与错误 toast 使用相同 live-region 严重度。 | 空态改为唯一 H1；复制按钮名称包含命令；error 使用 alert/assertive，其余使用 status/polite。 |

## 修复后真实浏览器证据

- 1024/1200/1440/1920 四档均为 `overflowX=0`，每页保持唯一 H1。
- Overview 为 7 个章节链接与 7 个具名 section；激活“06 · 信任”后 URL 为
  `#solution-safety`、当前链接为 `aria-current="location"`、目标 section 顶部为 80px。
- reduced-motion 模拟为真时，章节跳转保留 hash/当前态且计算后的 transition duration 为 `0s`。
- 设置浮层打开后焦点位于主题控件；Escape 后浮层卸载且焦点返回 `nav-settings`。
- system 偏好可随媒体查询解析，且可显式切换 light/dark；两套主题均保持清晰的表面、边框与焦点层级。
- Projects 同名 worktree 的按钮名称包含完整 root，可见次级路径使用最短唯一后缀，能直接区分
  `…/pr8-audit/pipeline-worklfow`、`…/ba9e/pipeline-worklfow` 等工作区；按钮 DOM `id`
  与稳定 test id 一一对应。
- synthetic 503 显示 `role="alert"`、唯一错误 H1 和可用重试；延迟快照显示 `role="status"`
  与 `aria-live="polite"`；零项目显示教学式 H1 与两条可复制命令；SSE 失败显示离线 status；
  不可达项目为非按钮元素并带 `aria-disabled="true"`。

截图：

- `docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/final-overview-1024-light.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/final-projects-1440-light.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/final-projects-1920-dark.png`
- `docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/final-error-1200-dark.png`

## 第二轮复评

- CRITICAL：0
- HIGH：0
- MEDIUM：0
- LOW：生产 JS bundle 仍超过 Vite 500kB 提示；本 Change 未增加依赖或新页面级数据请求，拆包属于独立性能工作，不影响本次桌面交互正确性。
- 结论：视觉层级、状态语义、键盘路径、token、一致性、桌面适配和 reduced-motion 已达到进入 pre-Verify 全量代码审查的条件。

## Verify 失败修复与第三轮复评

首个冻结 SHA `8a2d4007ae2d82a976398489ef0fcb8d94c0e496` 的 Reviewer/E2E 结论为
FAIL，本轮已处理全部 HIGH/MEDIUM：

| Severity | Finding | 修复与证据 |
| --- | --- | --- |
| HIGH | 固定 240px 区域左向截断完整 root，多个共享长前缀 worktree 视觉上仍不可区分。 | 对同 basename 组计算最短唯一目录后缀并从左侧显示；真实 1440px Dashboard 已显示 `…/pr8-audit/…`、`…/ba9e/…`，`overflowX=0`。 |
| MEDIUM | 项目行缺少稳定唯一 DOM `id`。 | 把 root 派生的稳定 row id 同时绑定到 `id` 与 `data-testid`，相邻测试断言两行均唯一。 |
| MEDIUM | modal Dialog 覆盖设置浮层时缺少 Escape 回归证据。 | 新增测试：上层 `aria-modal="true"` 存在时 Escape 不关闭设置、不抢焦点；移除 modal 后 Escape 正常关闭并返焦。 |
| MEDIUM | 三个设计文档存在 EOF 空行，旧 `git diff --check` 结论失真。 | 清理三处 EOF 空行，并重新运行冻结比较区间和工作区 `git diff --check`。 |
| MEDIUM | 隔离构建后 tracked Dashboard dist 漂移。 | 从最终源码重建为 `index-DvRUgA0L.js` / `index-DsdZ7MR-.css`；连续构建需保持三个输出文件 SHA-256 一致。 |
| MEDIUM | OpenSpec archive 演练因 `MODIFIED` 丢失当前 scenario 而失败。 | 桌面外壳和桌面验收改为独立 ADDED requirement；两个 MODIFIED 块保留完整当前 scenario。隔离 archive 成功：added 6、modified 2。 |

第三轮真实浏览器复评仍为 CRITICAL 0、HIGH 0、MEDIUM 0。1440×900、light、真实生产
Dashboard 的 11 个可达项目行均具有可见唯一后缀、完整 accessible name/title 与唯一 DOM id；
页面标题为 `Tenon Dashboard`、唯一 H1、根级 `overflowX=0`、console error 为 0。
1920×1080 深色证据也已在最终 DOM id 修复后重拍，项目身份为
`…/pr8-audit/pipeline-worklfow`，id 不含 ASCII whitespace。

## pre-Verify 全量代码审查

比较边界为 `origin/main@4c242b928b61285561f9cdbc63617db899a18a12` 至当前完整工作区，
覆盖 OpenSpec/ADR/plan、所有 Dashboard 源码与测试、截图、最终 `dist/` 资产和 Tenon 状态证据。

Standards 轴：

- React effect 的媒体查询、键盘 listener、timeout 与 GSAP handle 均有确定 cleanup。
- 新状态使用 typed union 和显式 props；没有新增依赖、unchecked production cast、共享可变模块状态或 API 变更。
- i18n 中英文成对；Lucide 图标保持 `aria-hidden` 或由控件 accessible name 承载语义。
- token、focus-visible、disabled、live region 与 reduced-motion 在共享原语和调用方保持一致。

Spec 轴：

- 同名 worktree、非模态设置生命周期、七章节导航、1024–1920px 无根级横向溢出、
  最终生成资产和生产浏览器身份均有自动化或浏览器证据。
- 手机端不属于设计、实现或验收结论；既有小屏代码未被破坏性删除。
- 旧 PR 的源码和 `dist/` 未整文件覆盖 main；最终资产由当前源码重建。

门禁结果：

- `npm run check:comments`：通过。
- `npm run check:architecture`：通过，640 个生产文件，5 个既有 size-only exception。
- `npm run typecheck:web`：通过。
- 定向 Vitest：7 files / 124 tests 通过。
- 全量 `npm run test:web`：60 files / 1079 tests 通过；stderr 中保留既有 React `act(...)`
  与空 GSAP target 警告，无失败。
- `npm run build`：通过；当前最终资产为 `index-DLfimi5h.js` / `index-DsdZ7MR-.css`。
- 连续两次 `npm run build:web`：输出文件 SHA-256 一致，tracked Dashboard dist 可复现。
- OpenSpec 隔离归档演练：通过，真实主规格未改动。
- `git diff --check` 与 conflict marker 扫描：通过。

代码审查结论：CRITICAL 0、HIGH 0、MEDIUM 0；可冻结 Build 基线。

## Verify 失败修复与第四轮复评

第二个冻结 SHA `77a32fd7ace6670d09db80edb601e03e116d3e56` 的独立 Codex 审查补充发现
1 个 HIGH、2 个 MEDIUM 和 1 个 LOW；本轮全部修复：

| Severity | Finding | 修复与证据 |
| --- | --- | --- |
| HIGH | 两个 `MODIFIED` requirement 改写了既有小屏语义，超出本 Change 的电脑端范围。 | 通过 `requirements-changed` 回到 Spec，逐字恢复既有 requirement 和 scenario，再用独立命名的新增电脑端场景表达约束；隔离 archive 演练证明既有语义不漂移。 |
| MEDIUM | 主题按钮 accessible name 固定为“主题”，没有朗读当前 System/Light/Dark 值。 | 增加中英文 `theme_toggle_current`，按钮现在朗读当前值；三种状态都有角色查询测试。 |
| MEDIUM | 不可达的同 basename worktree 缺少唯一 DOM id、动画目标、可见后缀和完整 accessible identity。 | 不可达行保持非按钮，只读 group 朗读完整 root，显示最短唯一后缀，并绑定 root 派生 id 与 `data-anim`；相邻测试覆盖两个同名 worktree。 |
| LOW | Onboarding 复制反馈 timer 在重复点击和卸载时没有取消。 | 用 ref 替换旧 timer，重复复制先清理、卸载时清理；fake-timer 测试证明第二次反馈拥有完整 2 秒窗口且 unmount 调用 cleanup。 |

第四轮 `frontend-design`、`web-design-guidelines` 与 `design-taste-frontend` 复评：

- 设计 token、层级、排版和桌面间距没有因语义修复变化。
- 主题控件的视觉文本保持不变，accessible name 补足当前值，不增加冗余可见文案。
- 不可达 workspace 延续可达行的身份模式，但保持不可点击与 `aria-disabled` 语义。
- timer cleanup 不改变反馈节奏，只消除过早回落与卸载后的状态更新。
- CRITICAL：0；HIGH：0；MEDIUM：0。

## 子阶段 6 Build 紧反馈

- 红：主题三态、两个不可达同 basename workspace 和重复复制 timer 测试先运行并按预期失败。
- 绿：定向 Vitest 3 files / 55 tests 通过。
- 全量：`npm run typecheck:web`、`npm run test:web`（60 files / 1082 tests）、
  `npm run check:comments`、`npm run check:architecture`、`npm run build` 全部退出 0。
- 资产：连续两次生产构建均得到当时的 `index-BPNHlGAF.js` / `index-DsdZ7MR-.css`，
  三个 Dashboard 输出文件 SHA-256 完全一致。
- OpenSpec：Change strict validate 通过；隔离 archive 通过，added 6、modified 2、removed 0；
  真实主规格 SHA-256 保持 `cdc31db…`。
- 真实生产浏览器：端口 18846，目标标题 `Tenon Dashboard`，目标 root/Change 与最终 asset
  身份均确认；1024×768、1200×870、1440×900、1920×1080 电脑端均无根级横向溢出。
- 状态与交互：light/dark/system、主题当前值 accessible name、设置 Escape 焦点归还、两个不可达
  同名 worktree、loading/error/retry/empty 与 reduced-motion 共 25 项断言通过，console error 为 0。
- 临时证据：`/tmp/dashboard-ui-final-build-qa/report.json` 与同目录截图；未写入仓库或手机端证据。

## 第五轮 cleanup 复评

- Reviewer 的 LOW 复现证明：Clipboard Promise 若在 `CmdRow` 卸载后才 resolve，会在 cleanup
  之后新建 timer。
- 新增延迟 Promise 红测，先复现 `vi.getTimerCount() === 1`；实现 mounted guard 后，
  卸载后 resolve 不再更新状态或创建 timer。
- 定向 Vitest 3 files / 56 tests、全量 60 files / 1083 tests、`npm run typecheck:web`、
  comments/architecture、全仓生产构建、连续 Dashboard 重建和最终 asset 浏览器复验全部通过。
- CRITICAL：0；HIGH：0；MEDIUM：0；该 timer LOW 已关闭。
