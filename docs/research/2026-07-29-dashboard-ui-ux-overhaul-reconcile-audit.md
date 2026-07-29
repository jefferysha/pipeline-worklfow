# Dashboard UI/UX 主线整合审计

## 审计目标

判断 PR #10 中哪些桌面 Dashboard UI/UX 改动仍有用户价值、哪些与最新 main 重叠，以及如何在不回退主线新能力的前提下创建可合并的替代 PR。

## 身份与版本

- 最新基线：`origin/main@4c242b928b61285561f9cdbc63617db899a18a12`
- 旧 PR：[#10](https://github.com/jefferysha/tenon/pull/10)
- 旧 PR head：`f3f99e94e80646cca9978bcf47d238835cc02e3f`
- 旧实现冻结 SHA：`bdd818220e363a83fc92d360b6e3e90dca6efb61`
- 新 Change：`dashboard-ui-ux-overhaul-reconcile-20260729`
- 新分支：`codex/dashboard-ui-ux-overhaul-reconcile-20260729`
- 浏览器目标：`http://127.0.0.1:18840/`
- 页面身份：title=`Tenon Dashboard`，asset=`index-D5AYWyzO.js`

## Git 冲突事实

`git merge-tree --write-tree origin/main f3f99e94...` 证明旧 PR 与 main 有以下真实冲突：

| 路径 | 冲突类型 | 整合原则 |
| --- | --- | --- |
| `openspec/specs/dashboard-ui-ux-system/spec.md` | add/add | 以当前主规格为底，删除手机端支持承诺，吸收旧 PR 的 1024–1920px 桌面契约 |
| `packages/dashboard-app/src/App.tsx` | content | 保留 main 的新路由、项目选择和错误边界；增量加入 system theme、live region、timer/tween/listener 清理 |
| `packages/dashboard-app/src/i18n/translations.ts` | content | 保留 main 全部新 key，只加入旧修复需要的成对中英文 key |
| `packages/dashboard-app/src/index.css` | content | 保留 main 的视觉系统；只整合语义主色、焦点、disabled 与 reduced-motion 基线 |
| `packages/dashboard-app/src/shell/Nav.tsx` | content | 保留 main 的导航结构；整合 accessible name、非模态设置浮层、Escape 与焦点归还 |
| `packages/dashboard-app/src/shell/Onboarding.tsx` | content | 保留 main 的新建 Change 能力；整合唯一 H1、命令特定复制名称与桌面点击高度 |
| `packages/dashboard-app/src/solution/SolutionView.tsx` | content | 保留 main 文案和章节内容；加入稳定 section id、页内导航与 hash 状态 |
| `packages/dashboard-app/dist/index.html` | generated | 不选边，最终由整合后的源码重新构建 |

## 无冲突或低冲突增量

以下旧 PR 改动可按提交增量移植并由测试验证：

- `solution/SolutionSectionNav.tsx`、`solutionModel.ts` 与相邻测试；
- `components/ui/*` 的 reduced-motion、focus-visible 与 disabled 状态；
- `shared/motion.ts` 的 GSAP matchMedia、cleanup 和终态语义；
- `ProjectsView.tsx` 的重复 basename 根路径辨识、稳定 key/id 与加载状态；
- `App`、`Nav`、`Onboarding`、`ProjectsView`、`SolutionView` 的相邻测试。

不能整体采用旧文件，因为 main 已新增 Context Bundle、Verification Evidence、AFK/Workbench 等代码；整体 checkout 会删除或回退这些主线能力。

## 真实浏览器基线

### 1440×900 · 浅色 · Projects

- 页面 title 为 `Tenon Dashboard`，根宽度与 viewport 均为 1440px，无根级横向溢出。
- 左侧 rail 与项目列表层级清楚，基础视觉语言可保留。
- 多个 `pipeline-worklfow` worktree 只显示相同 basename；用户必须逐项借助不可见 title 才能区分，属于真实桌面可用性缺口。
- 截图：`docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/dashboard-main-baseline-1440-light.png`

### 1024×768 · 深色 · Settings

- 深色 token 可读，根宽度与 viewport 均为 1024px。
- 设置按钮可打开浮层，但按 Escape 后浮层仍显示，焦点仍停留在 `theme-toggle`，没有返回设置入口。
- 截图：`docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/dashboard-main-baseline-1024-dark.png`

### 1024×768 · Overview

- 页面包含 7 个 H2，文档高度 4748px。
- 页面没有 section id，也没有除 primary rail 外的页内 nav；用户只能线性滚动。
- 旧 PR 的原生锚点章节导航仍有明确桌面用户价值。

## 取舍结论

采用“最新 main 为底、旧产品提交逐个移植、冲突文件人工增量合并、生成资产最终重建”的策略。治理历史、旧 Verify 报告和旧归档目录不复制进新 Change；新 Change 重新产生自己的 proposal、design、ADR、plan、验证报告和 archive。

## 非目标

- 不新增或升级依赖；
- 不修改 Dashboard API、服务端数据模型或真实业务规则；
- 不删除 main 已存在的手机布局代码，但不把手机端当产品目标，不为其设计、修复、截图或验收；
- 不复用旧 Verify SHA，不自动合并 PR；
- 替代 PR 就绪前不关闭 PR #10。
