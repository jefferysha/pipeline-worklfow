# Dashboard UI/UX Build 设计复核

## 范围与方法

- 对象：最终生产 bundle `index-oDUz_gKv.js` / `index-CuN80qlk.css`。
- 页面：Projects、Overview、设置浮层、Onboarding，以及全局 loading/error/offline/disabled 状态。
- 视口：1024×768、1200×870、1440×900、1920×1080；不包含手机端。
- 主题与动效：light、dark、system、`prefers-reduced-motion: reduce`。
- 方法：`frontend-design`、`web-design-guidelines`、`design-taste-frontend` 两轮代码与真实浏览器复核。

## 第一轮问题清单

| Severity | 用户任务 | 问题 | 修复 |
| --- | --- | --- | --- |
| MEDIUM | 在 Projects 选择正确 worktree | 同 basename 行只显示项目名，视觉、accessible name 与测试标识均会冲突。 | 行内增加完整 root 次级文本；accessible name 包含 root；重复 basename 使用 root 派生唯一标识，动画指纹改用 root。 |
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
- Projects 同名 worktree 的按钮名称包含完整 root，可见次级路径能区分 `pr8-audit`、`ba9e` 等工作区。
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
- 全量 `npm run test:web`：60 files / 1078 tests 通过；stderr 中保留既有 React `act(...)`
  与空 GSAP target 警告，无失败。
- `npm run build`：通过；最终资产为 `index-oDUz_gKv.js` / `index-CuN80qlk.css`。
- `git diff --check` 与 conflict marker 扫描：通过。

代码审查结论：CRITICAL 0、HIGH 0、MEDIUM 0；可冻结 Build 基线。
