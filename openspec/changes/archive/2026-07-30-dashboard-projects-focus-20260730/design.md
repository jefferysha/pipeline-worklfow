# 设计

## 已验证设计

- 真实生产 Dashboard 基线有 38 个项目（18 可达、20 不可达、3 个需处理），顺序滚动是明确定位瓶颈。
- 采用域内搜索 + 四态聚焦方案；查询匹配 basename/root，状态继续消费既有 `ok/need/running` 事实。
- 默认无条件时保留现有分区和不可达折叠；查询或显式不可达聚焦时直接显示匹配的不可达只读行。
- 搜索和状态切换不新增网络请求或逐键 GSAP；现有集合级入场动画保持不变。
- 详细决策见 `docs/superpowers/specs/2026-07-30-dashboard-projects-focus-design.md` 与对应 ADR。

## 风险

- 过滤后可能隐藏用户以为仍可见的项目，需要诚实的结果摘要、清除入口和空结果恢复。
- 检索控件可能挤压 1024px 桌面宽度，需要真实浏览器验证四个目标尺寸。
- 动画可能在高频输入时重复触发，必须限制触发条件并遵守 reduced-motion。

## 已关闭问题

- 定位瓶颈由真实 38 项目基线确认，不依赖假数据推断。
- badge 使用全局计数、live summary 使用当前结果；既有优先排序只在匹配集合内生效。
- 状态筛选使用 one-of-many `radiogroup/radio` 语义，并保留 roving
  ArrowLeft/ArrowRight/Home/End；清除条件后焦点回搜索框。Verify 已证明筛选器既不应伪装成
  缺少关联 panel 的 tabs，也不应把互斥状态暴露成四个独立 toggle。
- basename/root 使用确定性 `toLowerCase()`；完整 rows 仅在集合变化时排序，查询与状态切换只做
  O(n) filter；live summary 同时朗读当前状态与结果计数。
