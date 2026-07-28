# PR #5 合并审计设计

## 目标

在不扩大产品范围、不改变公共契约的前提下，让 PR #5 的实现、测试、文档和真实页面共同满足已经归档的 `dashboard-ui-ux-system` 规范，并为合并决定留下可复核证据。

## 输入边界

- 审计对象：`origin/main...8050656ca8a5846c63a547bc464129345087218f` 的三点 diff。
- 合并前基线：每次关键门禁前重新获取最新 `origin/main` 和 PR head。
- 原 Change、PR body、远端 CI 仅是输入；本 Change 重新记录规则读取、代码审查、测试、浏览器和 exact-event review。

## 发现

### 规则与架构

- 173 个改动文件没有引入后端、持久化、公共 API 或依赖变化。
- 生产文件符合当前分层和文件长度门禁；共享组件 `PageHeader` 有 5 个调用方，抽取合理。
- 四项静态门禁均通过：architecture、comments、docs、repository hygiene。

### 功能偏差

- 捕获记录加载态绕过 i18n。
- `max-[720px]` 在 Tailwind v4 中不包含精确 720px，`SolutionView` 的两个 `min-[720px]` 又会在该边界启用桌面网格，与规范冲突。
- 进度抽屉关闭动画是 ease-in，而规范要求 ease-out。
- 官方进度页截图仍展示旧视觉语言。
- 三个 Markdown 文件有 `diff --check` 可见的空白问题。
- 首次冻结视觉轨在 1024px 发现 Workbench 第七阶段入口位于横向滚动区外，页面没有提示用户
  还有视口外阶段。
- 首次冻结 Reviewer 发现 ADR 仍写“单一 mobile variant”，与互补断点实现和已批准 Spec 不一致。

### 排除项

Lucide 图标的 1.75 线宽由全局 `svg.lucide` 规则统一提供，源码与构建产物均有证据，不需要逐图标设置。

## 实施方案

1. 为 Tailwind 增加边界互补的 `mobile` / `desktop` custom variant，并统一替换 Dashboard 源码与测试中 `max-[720px]` / `min-[720px]` 的旧变体。
2. 为 `TrafficPanel` 加成对的中英文 key，并保持空闲、加载、成功、失败四态可辨。
3. 将进度抽屉关闭缓动改成 `power1.out` / `power3.out`，在单元测试中锁定。
4. 修复 Markdown 空白；在真实 Dashboard 的验收状态下刷新进度页 WebP。
5. 为 Workbench 阶段带增加中等宽度可见的横向滚动提示，并把提示作为滚动容器的
   `aria-describedby`。
6. 加固 system dark / explicit light / explicit dark 与 `--btn-bg` 的对比度测试。
7. 先构建内部 workspace，再执行 web typecheck、测试和构建；随后运行全仓验证与真实浏览器矩阵。

## 验收矩阵

| 风险 | 自动验证 | 浏览器验证 |
| --- | --- | --- |
| 720px 临界点 | 构建 CSS 的移动/桌面 media 互补；class 测试使用共享 `mobile:` / `desktop:` | 精确 720px 的 shell 和 Overview 内容均为移动布局 |
| i18n | zh/en key 对称测试与 TrafficPanel 测试 | 切换语言时加载态无硬编码中文 |
| motion | hook 测试断言 ease-out | 打开/关闭抽屉且 reduced-motion 可用 |
| 视觉与可访问性 | 主题对比度、组件测试、类型检查 | 桌面/移动、亮/暗、键盘焦点 |
| 1024px 阶段发现性 | StepperRail 提示与 `aria-describedby` 测试 | Workbench 可见滚动提示，滚动后 Ship/Archive 可操作 |
| 文档 | docs、repository hygiene、diff check | 官方截图与真实页面一致 |

## 回滚与停止条件

- 本轮修复为单独提交，不产生数据迁移或外部发布。
- 任一必需 CI、review thread、mergeability、本地验证或浏览器门禁失败且不能在 PR 范围内安全修复时，停止合并并保留 PR。
- 合并后以 GitHub merge SHA 为回滚锚点。

```coverage
touches: frontend-ui, localization, responsive, motion, documentation
L1_api: waived -> 本 Change 不修改 API 或共享契约
L2_data: waived -> 本 Change 不修改数据模型、schema 或持久化
L3_rules: filled -> #发现, #实施方案, #验收矩阵
L4_state: filled -> #功能偏差, #验收矩阵
L5_errors: waived -> 只修复既有加载态文案，不改变错误协议或恢复流程
L6_security: waived -> 不触及 auth、权限、secret 或信任边界
L7_perf: waived -> 不新增资源请求或长任务，性能由现有构建门禁覆盖
L8_deps: waived -> package 与 lockfile 不变，不新增或升级依赖
L10_terms: filled -> #输入边界, #回滚与停止条件
```
