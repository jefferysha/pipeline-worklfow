# ADR：Context Bundle 预览采用线性容量摘要

## 背景

现有预览协议、请求状态和安全边界已经稳定，当前缺口是 560px 桌面详情抽屉中的信息层级。成功态将
预算数字与长文档卡片平铺，预算不足与平台错误虽真实可恢复，但用户不能先获得容量结论。

## 决策

- 保留 `ContextBundlePreview` 对 hook、表单和状态分发的所有权。
- 在 Progress 功能域新增纯展示部件，以线性容量条、精确 bytes、remaining/overage 和紧凑文档行
  表达容量与输入组成。
- 容量条视觉比例钳制在 100%，真实超限百分比和缺口继续以文字呈现。
- 保持 server 输入顺序、稳定 code、reasonCode、mode 与 API DTO 不变。
- 只使用现有 semantic token、Lucide 和短 CSS transition；reduced motion 直接呈现终态，不引入 GSAP。

## 备选方案

- 多列数据表：在 469px 内容宽度内无法同时容纳长 path、双语 reason 与两组 byte 数字。
- 径向仪表盘：占用纵向空间且弱化精确比较，属于装饰性过强的表达。
- 仅调整颜色和间距：不能解决容量结论与输入清单同层的问题。

## 后果

- 用户能先判断预算状态，再按稳定 policy 顺序阅读输入。
- 组件新增少量纯展示投影，但不产生新的持久化或领域真相。
- 测试必须覆盖 under/over budget 的 ARIA 与文本、空/loading/error、双语、键盘和四个桌面视口。
- 未来若抽屉宽度改变，展示部件仍以容器宽度工作，不依赖页面全宽。
