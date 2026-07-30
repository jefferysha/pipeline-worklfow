# Build 收敛审查：Dashboard Onboarding 命令反馈

## 审查边界

- 比较基线：当前分支相对 `codex/dashboard-projects-focus-20260730`。
- 实现与生成资产：`packages/dashboard-app/src/shell/Onboarding.tsx`、相邻测试、i18n、
  `packages/dashboard-app/dist/`。
- 契约与证据：proposal、design、delta spec、ADR、Superpowers design/plan、tasks。
- 轴一 Standards：React 生命周期、并发/计时器、可访问性、主题 token、桌面布局、i18n、
  reduced-motion、生成资产。
- 轴二 Spec：四态复制结果、同步/异步失败、独立行、迟到完成、1024–1920px 布局与真实浏览器。

## 第一轮：发现与修复

| 严重度 | 发现 | 用户影响 | 修复与复核 |
| --- | --- | --- | --- |
| HIGH | pending 最初使用原生 `disabled`；Chromium 会把焦点移回页面根，与键盘操作保持焦点的契约冲突 | 键盘用户复制后失去当前位置，无法自然确认结果或重试 | 改为 `aria-disabled=true` 加状态机防重入；真实浏览器确认 pending、success、拒绝和 API 缺失后焦点均留在原按钮 |

第一轮没有其他 Critical/High/Medium。低风险观察：成功和错误状态保留 2s/4s 后回落，属于
规格定义的短暂反馈，不持久化、不调用服务端。

## 第二轮：frontend-design + design-taste-frontend 复评

- 信息层级：1024px 单列，1200/1440/1920px 双列；步骤号、说明、命令与反馈顺序一致。
- 视觉系统：只使用现有 `card/fill/border/code/accent/green/red` token 和 Lucide，不新增品牌色、
  装饰性渐变、卡片套卡片阴影或无因果动画。
- 交互状态：idle/pending/success/error 均有文字与图标；pending 防重入，error 保留可选择命令。
- 可访问性：按钮名称稳定，`role=status` polite/atomic，焦点不移动，Light/Dark/System 语义一致。
- 动效：只有既有颜色过渡；reduced-motion 下 `transition-duration: 0s`、无 animation。

复评结论：Critical 0、High 0、Medium 0；无需第三轮修复。

## 机器验证

- TDD 红灯：新增测试在旧实现上 6 项失败，原因覆盖 pending、API 缺失、同步/异步错误和 timer。
- 相邻 Vitest：13/13。
- Dashboard 全量 Vitest：69 files / 1224 tests。
- `npm run typecheck:web`：通过。
- `npm run build`：通过；最终 asset `index-3wsebZmY.js` / `index-DzC8jn5F.css`。
- `git diff --check`：通过。

## 真实浏览器复评

- 目标：`http://127.0.0.1:18855/`，标题 `Tenon Dashboard`，隔离 worktree server。
- 1024×768：单列，两个步骤宽 822px；1200×870、1440×900、1920×1080：双列，
  两个步骤各宽 420px；四个视口根级 overflow 均为 0。
- Light、Dark、System 均读取现有 success/error token。
- 键盘 Enter：pending `aria-disabled=true`、重复 Enter 不发起第二动作、焦点保留；
  resolve 后成功、reject/API 缺失后错误与手动恢复均可见。
- reduced-motion：匹配为 true，按钮 `transition-duration: 0s`、`animation-name: none`。
- 按授权不运行、不截图、不声称手机端验收。
