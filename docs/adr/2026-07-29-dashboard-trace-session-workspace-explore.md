# ADR：Trace 桌面诊断采用 Tenon 主从工作区

## 背景

现有 TrafficPanel 把 sessions 与 timeline 纵向堆叠。真实 1024–1920px Machine 页没有横向溢出，但桌面宽度未被用于保持选择与详情的并列上下文。用户指定参考 Chorus，同时要求形成 Tenon 自有 UI。

## 决策

- 在 1024–1920px 电脑端把 TrafficPanel 改为 session rail + timeline detail。
- 使用 Tenon 现有蓝色 ops-console token、monospace 层级、原生按钮和状态语义。
- 只借鉴 Chorus 固定提交 `be647877b4b56a61e480e939d6a6d31b3f84f7f9` 的稳定 master-detail 与活动行扫描顺序。
- 保留显式 session 选择，不自动读取首个 timeline；未选择时 detail 显示稳定占位。
- 不改变 API、安全、数据字段、依赖、Machine 容器或手机端。

## 备选方案

1. 保持纵向堆叠：改动小，但无法解决上下文断裂。
2. 默认选择首项：首屏更充实，但新增隐式请求并让 Escape 关闭语义复杂化。
3. 复制 Chorus 视觉组件：能获得表面相似度，但会破坏 Tenon 身份并引入无关字段/依赖。

## 后果

- 1024px 下 detail 的可用宽度约 590px，需要 2×2 summary、`min-w-0` 与长值截断。
- rail 与 detail 必须分别持有 loading/error/empty 状态，不能合并成一个泛化空态。
- 需要新增会话 identity header、未选择占位、桌面四视口与键盘验收。
- 现有数据与请求逻辑可以复用，回滚仅涉及前端结构、文案、测试与构建产物。
