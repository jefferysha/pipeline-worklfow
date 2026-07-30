# Dashboard Context Bundle 容量层级设计复查

## 复查范围

- `packages/dashboard-app/src/progress/ContextBundlePreview.tsx`
- `packages/dashboard-app/src/progress/ContextBundlePreviewParts.tsx`
- `packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx`
- `packages/dashboard-app/src/i18n/translations.ts`
- `context-bundle-budget-preview` 与 `dashboard-ui-ux-system` 两项 delta spec
- 生产构建在 1024×768、1200×870、1440×900、1920×1080 的真实 Dashboard 抽屉

复查采用 `frontend-design`、`web-design-guidelines` 与 `design-taste-frontend` 的设计 token、
层级、排版、状态、可访问性和反模板维度；React 与 Tailwind 边界另按当前打包 pattern Skill
复核。此次没有引入 GSAP；唯一新增运动是进度条宽度的 300ms CSS 过渡，并在
`prefers-reduced-motion` 下归零。

## 第一轮：评估与修复

| 严重度 | 发现 | 处置 |
| --- | --- | --- |
| MEDIUM | 超限进度条最初使用 `bg-(--amb)`，而项目 token 只有 `amb-d/t/b`，生产 CSS 无法证明该实色存在。 | 改用既有 `bg-amb-d`，保持超限语义与 Light/Dark 对比体系。 |
| LOW | 64 项协议上界会形成长抽屉滚动。 | 保留：64 项是服务端允许的真实上界；列表无横向溢出、顺序完整，当前批次不改变 API 或引入虚拟化复杂度。 |

测试夹具最初使用了协议不存在的 `excerpt` mode；红灯阶段已改为现有 `reference`，没有扩大
共享契约或掩盖 decoder 行为。

## 第二轮：复评结论

- 容量结论先于文档明细；success 与 budget-error 使用现有 green/amber 语义 token，未新增孤立配色。
- 百分比保留真实值，视觉进度钳制在 0–100%；`progressbar` 的 min/max/now/value text
  同时提供机器可读边界与精确字节说明。
- loading 保持固定骨架边界、`role=status`、`aria-busy` 与禁用提交；empty 不渲染虚假容量条。
- 文档 path、kind、mode、source/materialized bytes 保持响应顺序；Lucide 图标为装饰性，
  长 path 在 469px 内容宽度内换行。
- target → budget → submit 的 DOM/Tab 顺序和 Enter 提交不变；focus ring 沿用全局 accent token。
- 中文与英文均显示比例、精确字节、剩余/超出量与输入标题；协议 token 和 path 不翻译。
- 四个目标桌面视口的根级横向溢出均为 0；未执行或声称手机端验收。
- reduced-motion 实测进度条 `transition-duration: 0s`、`transition-property: none`。

最终结论：CRITICAL 0、HIGH 0、MEDIUM 0；一个 LOW 为已知且有边界的协议上限滚动成本。
