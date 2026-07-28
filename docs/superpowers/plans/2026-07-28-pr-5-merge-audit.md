---
change: pr-5-merge-audit
design-doc: docs/superpowers/specs/2026-07-28-pr-5-merge-audit-design.md
---

# PR #5 合并审计实施计划

## 假设与决策

- 原型决策：不插入一次性 prototype。断点编译语义、i18n 入口和 GSAP 参数均已由源码与定向测试定位，没有未知数据模型或状态机；真实风险直接由生产构建和浏览器临界宽度验收覆盖。
- 只更新原 PR 分支，不强推；任何不能在现有产品需求内安全修复的问题都停止合并。
- 先在审计分支完成独立提交和本地验证，再以 fast-forward push 更新原 PR head。

## Build 子阶段 1：Tracer bullet — 720px 纵向切片

目标是先从样式声明、组件 class、测试到生产 CSS 和真实路由打通最小端到端链路。

1. 在 `packages/dashboard-app/src/index.css` 定义包含 720px 的 `mobile` custom variant，以及只在大于 720px 生效的互补 `desktop` custom variant。
2. 将 `packages/dashboard-app/src/**/*.tsx` 及对应测试中的 `max-[720px]:` 统一改为 `mobile:`，将 `min-[720px]:` 统一改为 `desktop:`，避免精确 720px 同时命中桌面与移动布局。
3. 更新 `App.test.tsx`、`shell/Nav.test.tsx`、`progress/WorkflowCanvas.test.tsx`、`solution/SolutionView.test.tsx` 的 class 断言，并增加生产 CSS 临界查询验证。
4. 运行 Dashboard 定向测试和 `npm run build:web`；确认产物包含 `max-width:720px` 的查询。

验证：

```bash
./node_modules/.bin/vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/App.test.tsx packages/dashboard-app/src/shell/Nav.test.tsx packages/dashboard-app/src/progress/WorkflowCanvas.test.tsx
npm run build:web
rg -n "max-width:\\s*720px" packages/dashboard-app/dist/assets
```

回滚：恢复成对 custom variant、class 和断言的同一提交块。

**此处建议 /clear**

## Build 子阶段 2：状态、动效与文档修复

1. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加捕获记录加载态中英文 key，在 `advanced/TrafficPanel.tsx` 通过 `useT` 渲染。
2. 更新或新增 `TrafficPanel` 测试，证明中文、英文和加载语义状态均正确。
3. 在 `progress/useProgressDrawer.ts` 把关闭动画改为 ease-out，并让测试锁定 scrim 与 drawer 参数。
4. 清理审计发现的 Markdown 尾随空格和末尾空行。
5. 运行定向测试、i18n key 对称检查和 `git diff --check`。

验证：

```bash
./node_modules/.bin/vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/advanced/TrafficPanel.test.tsx packages/dashboard-app/src/progress/useProgressDrawer.test.tsx
npm run check:docs
git diff --check origin/main...
```

回滚：各修复没有数据或 API 副作用，可按文件恢复。

**此处建议 /clear**

## Build 子阶段 3：真实截图与生成产物

1. 先构建内部 workspace 和 Dashboard，启动唯一可识别的生产 Dashboard。
2. 核对页面标题、目标 URL、注册项目 root 与 `pr-5-merge-audit`。
3. 在 1440×900、720×900 和 390×844 验收导航、Progress、抽屉、语言、亮暗主题和无横向溢出。
4. 从验收通过的 Progress 页面刷新 `docs-site/public/images/dashboard-progress.webp`。
5. 重新运行 docs、repository hygiene 和生产构建，确认截图引用与生成产物同步。

验证：浏览器证据记录到 Verify 报告；静态命令由该报告列出退出码。

回滚：恢复单个 WebP；不触及运行数据。

**此处建议 /clear**

## Verify 子阶段

按顺序运行：

1. `npm run build`
2. `npm run typecheck:web`
3. `npm run test:web`
4. `npm run build:web`
5. `npm test`
6. `npm run check:architecture`
7. `npm run check:comments`
8. `npm run check:docs`
9. `npm run check:repository-hygiene`
10. `bash tools/test-bundle.sh`
11. `git diff --check origin/main...HEAD`

随后复核最新 GitHub CI、review threads、mergeability 和与 `origin/main` 的合并树。任一必需项失败即默认修复并重跑；无法安全修复则保留 PR。

## Ship 与回滚

- 使用非强制 push 更新 `codex/dashboard-ui-ux-overhaul`。
- 必需 CI 全绿且 review thread 清零后，按仓库允许的 merge 方法合并。
- 记录 GitHub merge SHA，并确认该 SHA 可从 `origin/main` 到达。
- 回滚使用 GitHub merge SHA；不发布 npm 包、不部署生产环境。
