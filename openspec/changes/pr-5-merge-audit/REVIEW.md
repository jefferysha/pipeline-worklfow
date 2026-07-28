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

两项修订均只澄清本 Change 的真实实现范围，没有覆盖旧 SHA、改变公共契约或绕过 review gate。
最终合并前审查以修订后的完整 diff 为准。

## 剩余非阻塞观察

- Vite 仍提示主 JS chunk 超过 500k；PR #5 没有新增依赖，该提示在当前 `main` 基线已存在。
- `App.test.tsx` 的 Workbench 异步更新仍产生既有 `act(...)` warning；测试全部通过，本轮修改未新增该状态路径。
