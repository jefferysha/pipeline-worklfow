# Dashboard UI/UX 系统化优化设计

日期：2026-07-28
状态：Explore 设计定稿
Change：`dashboard-ui-ux-overhaul`

## 1. 问题陈述

Tenon Dashboard 的业务能力已经覆盖项目、进度、AFK、工作台和机器状态，但视觉语言与响应式
行为仍由不同迭代叠加形成。用户需要的不是新皮肤，而是一套能支持高频扫视、低频深度配置和
失败恢复的统一控制台体验。

## 2. 设计原则

1. **状态先于装饰**：颜色、图标、层级和动效都必须帮助用户判断状态或下一步。
2. **动作色与状态色分离**：primary 使用 cobalt；success 使用 green；warning 使用 amber；
   destructive 使用 red。
3. **一个图标系统**：Lucide 是唯一形状源，尺寸和线宽按共享规则呈现。
4. **窄屏重新编排**：移动端不是缩小桌面画布，而是改变导航位置与信息顺序。
5. **渐进式共享**：只将跨两个以上功能域且语义一致的模式提升到 `shared`。
6. **动效可关闭**：所有运动都支持 reduced-motion，且无弹跳和纯装饰循环。

## 3. 视觉系统

### 3.1 色彩角色

| 角色 | 浅色方向 | 深色方向 | 使用约束 |
| --- | --- | --- | --- |
| Canvas | 冷灰近白 | 深蓝灰 | 页面背景 |
| Surface | 白 | 抬升一档深灰 | 卡片、弹层 |
| Primary | cobalt 600 | cobalt 400 | 主按钮、选中、focus |
| Success | green 600 | green 400 | 通过、在线、健康 |
| Warning | amber 700 | amber 300 | 等待、注意、暂停 |
| Danger | red 600 | red 400 | 失败、删除、必须处理 |
| Orchestration | violet 600 | violet 400 | 仅编排/治理专属信息 |

组件不得出现无 token 的新颜色。`--btn-bg` 和 shadcn `primary` 改为 primary/cobalt，green 不再
承担通用按钮角色。

### 3.2 排版与间距

- 正文：14px / 1.5；辅助信息不小于 12px。
- 页面标题：30px / 1.1 / 700；功能区标题：18–20px / 700。
- 标识符、命令、路径和数字使用 mono；说明性正文使用系统 sans。
- 页面水平 padding：桌面 24–32px，移动 16px。
- 触控目标最小 44px；焦点环 3px soft ring。

### 3.3 卡片与层级

- 默认卡片使用 1px border 和轻微 surface 层次；仅浮层使用中等阴影。
- 圆角以 12px 为主，紧凑控件 8px，弹层 16px。
- 状态卡不使用单侧粗彩边；使用徽标、图标、边框和标题组合表达。

## 4. 应用外壳

### 4.1 桌面

保留 88px 左侧 rail。品牌、五个一级入口和设置形成固定空间，选中项使用 primary soft surface、
primary icon/text 和细边界，未选项保持足够对比。

### 4.2 移动

`max-width: 720px` 时：

- rail 变为底部固定导航；
- 五个一级入口显示图标和短标签；
- 品牌入口放在顶部移动 header，设置放在底栏末端或顶部操作区；
- 内容底部 padding = 导航高度 + safe area；
- 设置弹层从底部向上展开并限制在视口内。

## 5. 一级页面框架

新增轻量共享页面头部模式，包含：

- eyebrow/上下文（可选）；
- H1；
- 一句说明；
- 状态/主要动作区域；
- 窄屏下按“标题 → 说明 → 状态 → 动作”顺序自然折行。

Projects、Progress、AFK、Workbench 和 Machine 统一该层级，不要求内部功能域完全同构。

## 6. Progress

- 桌面维持工作流阶段画布，但减少无意义空白，强化项目、workflow、当前阶段和待处理事项的层级。
- 移动将 toolbar、tabs、workflow filter 和画布分成独立纵向区块。
- tabs 可横向滚动并保留选中项；不允许裁掉末项而没有滚动暗示。
- 项目名与 workflow 摘要在移动卡头独占行；阶段轨在卡片内部横向滚动。
- Change 卡优先显示“状态 → 名称 → 原因 → 下一步”，技术元数据降级到第二层。

## 7. 图标与反馈

- `shared/Icon` 的 `IconName` 与调用 API 保留，内部映射到 Lucide。
- 导航和共享图标统一使用 `strokeWidth=1.75`、圆角端点和 `currentColor`。
- 成功、警告、失败、离线、空态和加载态采用一致的图标 + 标题 + 说明 + 可恢复动作结构。
- 图标按钮必须有 `aria-label`/title；装饰图标统一 `aria-hidden=true`。

## 8. 动效

| 场景 | 时长 | 缓动 | reduced-motion |
| --- | --- | --- | --- |
| hover/press | 120–160ms | ease-out | 保留颜色，去除 transform |
| 列表/页面进入 | 180–220ms | power2.out | 直接终态 |
| dialog/popover | 180–220ms | power2.out | 直接终态 |
| drawer/大面板 | 220–280ms | power3.out | 直接终态 |
| toast | 180–200ms | power2.out | 直接终态 |

禁止 `back.out`、bounce 和无状态含义的无限动画。运行中指示可以保留低频 opacity pulse，但
reduced-motion 下必须静止。

## 9. 决策记录

| ID | 决策 | 理由 |
| --- | --- | --- |
| D1 | 采用“统一系统 + 关键流重排” | 同时解决全局不一致和移动关键问题，范围仍可审查 |
| D2 | 新设计以 2026-07-14 v10 产品约束为准 | 它比 07-09 工票方案更新，且明确否决工票隐喻 |
| D3 | primary 与 success 分色 | 降低动作和状态的语义冲突 |
| D4 | 移动端使用底部导航 | 释放横向空间并提高入口可发现性 |
| D5 | 保留现有 API 与功能域边界 | 降低业务回归，所有已发现问题均可由前端解决 |
| D6 | 不引入新依赖 | 现有栈足够，生产 bundle 已有体积警告 |

## 10. 非目标

- 不修改 Tenon 工作流、review gate、状态机或服务端鉴权。
- 不重做数据获取与 snapshot 模型。
- 不增加第三方品牌图标、外部字体、渐变、霓虹或工票/车间装饰。
- 不以像素级复刻旧 demo 为目标。

## 11. 验收矩阵

| 维度 | 组合 |
| --- | --- |
| 视图 | Projects / Progress / AFK / Workbench / Machine |
| 主题 | light / dark |
| 视口 | 1440×900 / 1024×768 / 390×844 |
| 输入 | pointer / keyboard |
| 动效 | normal / prefers-reduced-motion |
| 状态 | 正常 / 空 / 加载 / 离线 / 错误 / 待处理 |

必须使用生产构建与实际注册的独立 worktree 数据验收，并核对页面 title、URL、项目 root 与目标
Change，不能只依赖端口可访问。

## 12. Coverage

```coverage
touches: frontend-ui, navigation, localization, accessibility, motion
L1_api:      waived -> 不修改 HTTP API、query route、View 枚举或组件外部业务契约
L2_data:     waived -> 不修改 snapshot、持久化 schema、迁移或用户数据
L3_rules:    filled -> #2-设计原则
L4_state:    filled -> #4-应用外壳 和 #6-progress
L5_errors:   filled -> #7-图标与反馈 和 #11-验收矩阵
L6_security: waived -> 不触及 auth、secret、token、权限或生产安全边界
L7_perf:     filled -> #8-动效 和 #9-决策记录
L8_deps:     waived -> 不新增 UI 库、图标库、字体、CDN 或大型运行时依赖
L10_terms:   filled -> #2-设计原则 和 #3-视觉系统
```
