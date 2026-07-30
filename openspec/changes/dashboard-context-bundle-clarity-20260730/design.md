# 设计

## 已验证方向

- 四个桌面视口中的详情抽屉均为 560px，组件内容宽 503px且无页面横向溢出；问题是成功态输入清单
  高 637px、容量结论缺少独立层级，而不是全局布局破损。
- 采用“目标与预算控制 → 有界线性容量摘要 → 紧凑输入清单/恢复状态”的稳定顺序，不改变请求时机、
  server 顺序或 `useContextBundlePreview` 状态机。
- `ContextBundlePreview` 保留副作用与状态分发；纯展示部件留在 Progress 功能域，不上移 shared。
- 复用现有 semantic token、Lucide 与原生语义；只使用支持 reduced-motion 的短 CSS transition，
  不引入 GSAP 或新依赖。

## 风险

- 视觉增强可能掩盖 budget error、trusted-reader failure 或 policy-empty 的真实语义。
- 抽屉在 1024px 桌面视口可用宽度有限，过度卡片化会增加滚动与信息噪声。
- 预算比例可能超过 100%，必须在视觉上有界且保留精确数字与屏幕阅读器语义。

## 待验证问题

- Spec 阶段需冻结百分比、remaining/overage、progressbar ARIA 和紧凑行的精确验收。
- Verify 需在真实 macOS 501 与浏览器只读协议模拟的 success/budget-error/policy-empty 上复核。
- Build 不得修改 hook、API DTO 或 decoder；若实现迫使这些边界变化，必须以 requirements-changed 回退。
