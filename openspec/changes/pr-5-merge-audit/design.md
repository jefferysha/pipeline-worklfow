# 设计

## 初始假设

- PR #5 是纯前端/文档变更，依赖方向应保持 `App/shell → 功能域 → model/state → api`，共享层不反向依赖功能域。
- 原归档 Change、PR body 和远端 CI 只能作为待复核输入，不能替代本轮读取、测试、浏览器和 review 证据。
- 审计分支从 PR head 建立；若无需修复，只新增本轮治理产物。若需修复，使用最小提交并以非强制 push 更新原 PR 分支。

## 风险

- 173 个文件的大范围 UI diff 可能隐藏跨域耦合、失效状态、可访问性或生成产物漂移。
- `main` 已比 PR 原 base 前进两个提交；即使 GitHub 显示可合并，也必须在合并前基于最新 `origin/main` 复核。
- 原始 PR worktree 属于其他任务资产，不能在占用不明时写入或删除。

## 审查结论

- 三点 diff 共 173 个文件，范围为 Dashboard 前端、测试、文档、OpenSpec 与同步构建产物；`package.json`、公共 API 和后端持久化契约均未变化。
- `check:architecture`、`check:comments`、`check:docs`、`check:repository-hygiene` 通过；新增页面均低于 600 行硬限制，新增组件均低于 400 行硬限制，没有共享层反向依赖。
- GitHub `verify` 成功，PR 可合并且没有 review thread；本地 7 个定向测试文件、151 个测试通过。
- `npm ci` 发现的 Vite/esbuild 审计项已存在于 `main`，PR 没有依赖变更；升级需要跨主版本，作为基线风险记录，不在本 PR 扩大范围。
- `npm run typecheck:web` 在根构建前因内部 workspace 包尚无 `dist` 失败，属于验证顺序问题；Verify 必须先执行根构建再复跑，不把该次结果记作代码通过。

## 必须修复

1. `TrafficPanel` 新增加载文本是硬编码中文，须增加成对翻译 key 并通过 `useT` 使用。
2. Tailwind v4 的 `max-[720px]` 编译为排除 `min-width: 720px`，与“≤720px 为移动布局”的既有规范不符。统一引入包含边界的 `mobile` custom variant，并更新源码和相应测试。
3. `useProgressDrawer` 关闭动画使用 `power1.in` / `power3.in`，须改为 ease-out，并增加测试断言。
4. 官方进度页 WebP 仍展示旧的红绿左侧状态条，须在真实应用验收后刷新。
5. 三个 Markdown 文件存在尾随空格或文件末空行，须修正以让 `git diff --check` 通过。

## 已排除意见

- 审查曾怀疑若干 Lucide 图标缺少显式 `strokeWidth={1.75}`。`packages/dashboard-app/src/index.css` 已通过全局 `svg.lucide { stroke-width: 1.75; }` 统一兑现规范，构建产物也包含该规则，因此不重复给每个图标添加属性。

## 修复决策

- 在 Tailwind 入口声明单一 `mobile` 变体，并机械替换 Dashboard 源码和相关测试中的 `max-[720px]`。这让所有 720px 断点语义一致，避免只修新 shell 后同一页面内部仍存在一像素分裂。
- 只修正审计确认的问题，不新增依赖、不改公共契约、不借机重构。
- 浏览器验收覆盖 1440px 与精确 720px、亮暗主题、键盘焦点、reduced-motion；截图只从确认属于 Tenon Dashboard 的真实页面生成。

## 回滚

- 修复提交与 PR #5 原实现提交分离；若门禁失败，可回滚该修复提交，PR 保持开放。
- 合并后可按 merge SHA 整体回滚；不涉及 schema、数据迁移、包发布或生产部署。
