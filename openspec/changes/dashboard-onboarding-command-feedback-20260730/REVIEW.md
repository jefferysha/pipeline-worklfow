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
| MEDIUM | 第一轮冻结实现把 920px 宽卡和步骤卡视觉样式应用到所有视口，改变 `<1024px` 既有契约 | 620–1023px 的既有单列宽度和视觉结构发生非目标回归 | Verify 正式回退 Build；用 `min-[1024px]` 门控宽卡、grid、边框、背景和 padding，并新增 class 契约测试 |
| MEDIUM | 第二轮 Codex 发现 `no-change` root 切换时会复用旧 `CmdRow`，旧 clipboard Promise/反馈 timer 可污染新命令 | 新项目命令可能暂时不可复制，并显示属于旧命令的 success/error | Verify 再次正式回退 Build；以完整命令为 React key，命令改变时复用既有 unmount generation/timer cleanup，并新增 pending 中 rerender 回归测试 |

返工后的 Build 自审已重新核对完整交付面，未发现其他 Critical/High/Medium。低风险观察：
成功和错误状态保留 2s/4s 后回落，属于规格定义的短暂反馈，不持久化、不调用服务端；
design 文档三处仍使用宽泛的 `disabled` 术语，但 delta spec、实现、测试与本 REVIEW 已明确
真实契约是 `aria-disabled=true` 加状态机防重入，未在 Build 越权重登记已批准 design 文档。

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
- Verify 回退后的 TDD 红灯：新增 `<1024px` class 契约测试在第一轮冻结实现上 1 项失败；
  门控修复后相邻 Vitest 14/14。
- 第二次 Verify 回退后的 TDD 红灯：root 在旧命令 pending 时切换的测试在第二轮冻结实现上
  观察到新命令仍为 `aria-disabled=true`；命令 key 修复后相邻 Vitest 15/15。
- Dashboard 全量 Vitest：69 files / 1226 tests。
- `npm run typecheck:web`：通过。
- `npm run build`：通过；最终返工 asset `index-ClhPblSB.js` / `index-bvENxFTR.css`。
- `npm run check:architecture`：670 个 production files 通过。
- `npm run check:comments`：通过。
- `openspec validate dashboard-onboarding-command-feedback-20260730 --type change --strict --no-interactive`：通过。
- `git diff --check`：通过。

## 真实浏览器复评

- 第一轮目标：`http://127.0.0.1:18855/`，标题 `Tenon Dashboard`，隔离 worktree server；
  新冻结 SHA 仍须在 Verify 重新完成全矩阵，不沿用第一轮 PASS。
- 1024×768：单列，两个步骤宽 822px；1200×870、1440×900、1920×1080：双列，
  两个步骤各宽 420px；四个视口根级 overflow 均为 0。
- Light、Dark、System 均读取现有 success/error token。
- 键盘 Enter：pending `aria-disabled=true`、重复 Enter 不发起第二动作、焦点保留；
  resolve 后成功、reject/API 缺失后错误与手动恢复均可见。
- reduced-motion：匹配为 true，按钮 `transition-duration: 0s`、`animation-name: none`。
- 按授权不运行、不截图、不声称手机端验收。
