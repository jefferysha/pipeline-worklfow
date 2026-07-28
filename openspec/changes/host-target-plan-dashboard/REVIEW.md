# Host Target Plan Center Build 审查

## 审查边界

- 比较基线：`origin/main` / `2d103e330f847e003ff5909097d892f5722cca04`
- 能力：`host-target-plan`
- 轴线：Standards（项目规则、架构、安全、可访问性）与 Spec（delta spec 全部 scenario）
- UI 实机：Tenon Dashboard `1.0.1`，`http://127.0.0.1:18766/?view=hostPlan`
- 视口：桌面 `1440×900`、移动 `390×844`

## 第一轮问题与修复

| 严重度 | 问题 | 修复 | 复验 |
| --- | --- | --- | --- |
| MEDIUM | Dashboard decoder 接受 DTO 额外键及与 argv 不一致的 `display`，不满足严格客户端契约 | 对 catalog/target/plan/command/step 增加 exact-key、host 白名单、kind/scope/flag、一致 display、token 前缀与去重校验 | 新增失败测试后修绿；focused 13/13 |
| MEDIUM | empty 状态没有 Spec 要求的 retry 操作 | empty card 增加语义 button，复用 catalog refresh 状态机 | 组件红测后修绿；浏览器模拟空 catalog 显示 retry |
| MEDIUM | 12 张目标卡全部结束后才显示操作/计划，移动端选 Codex 后需越过其余 11 张卡 | 把选中卡扩展为 full-span，并把操作/计划面板直接插入其后；拆分 `HostOperationPlanPanel` 保持组件大小边界 | 桌面/移动截图复评；选中卡之后立即出现操作和计划 |
| LOW | Clipboard adapter 同步抛错时会逃逸 React event | 使用 Promise microtask 统一同步异常与 rejected promise | 新增同步抛错测试并显示复制失败公告 |

## 第二轮 frontend-design / design-taste-frontend 复评

- 层次：标题 → 目标卡 → 高亮选中目标 → 操作 → 命令/步骤/notices，任务路径连续。
- 状态：catalog loading/empty/error/retry 与 plan loading/error/retry/ready 均有独立可见反馈；切换目标清除陈旧计划。
- 视觉系统：完全复用既有 card、border、fill、accent 和语义色 token；未引入独立主题或装饰噪音。
- 响应式：`390px` 下单列，`documentElement.scrollWidth === clientWidth === 390`；长命令只在 code block 内滚动。
- 可访问性：原生 button、`aria-pressed`、operation `role=group`、status/alert、可见 `focus-visible` ring；浏览器实测焦点 ring 为 `rgb(109, 155, 251) 0 0 0 2px`。
- 安全：页面没有执行入口；唯一动作是复制顶层人工命令；server/客户端均失败关闭。
- 浏览器控制台：最终路径 error logs 为 0。

结论：第二轮无 CRITICAL / HIGH / MEDIUM；LOW 已处理，无遗留 UI finding。
