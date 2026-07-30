# Orchestration Graph UI 评修记录

## 第一轮：frontend-design / web-design-guidelines / design-taste-frontend

验收对象：当前 worktree production Dashboard，Change 详情右侧面板，真实 47-node graph。

| Severity | 问题 | 修复 |
| --- | --- | --- |
| high | strict client 接受 scope 合法但与当前 root/change 不一致的 200 body，存在串线展示风险 | `fetchOrchestrationGraph` 增加请求 scope 精确相等校验并补回归测试 |
| medium | 默认展示全部 47 节点，单资源列把图拉到 2766px，主要流程不可读 | 默认只展开 workflow/change/phase；增加“全部”入口，资源节点最多三列，canvas 内部最大高度 520px |
| medium | phase 按 node id 字母序排列，不符合 frozen workflow 顺序 | Server phase metadata 增加一基 `order`；视觉和键盘顺序复用同一 comparator |
| medium | raw `current/pending/unread` 与 edge 英文 label 混入中文 UI | 节点状态与 edge kind 增加中英文闭集映射，未知业务状态才保留原值 |
| medium | 过滤或搜索隐藏 selected node 后，详情仍留在图下方 | selection 仅在 node 仍处于 visible set 时展示 |
| medium | 真浏览器里 End 能移动焦点，但 Enter 未可靠更新 selection | 显式处理 Enter/Space，复用同一 typed selection 状态并补组件测试 |
| low | 详情只能靠 Escape 清除，指针用户不明显 | selection header 增加有可见焦点和 aria-label 的清除按钮 |
| low | 可访问替代列表始终显示全图，与当前 filters/search 不同步 | 列表改用 `visibleNodes/visibleEdges`，与视觉图共享同一可见集 |

## 第二轮复评

结果：通过；critical/high/medium 遗留为零。

- 最终 production build 由本 worktree 的 Server 与 Dashboard dist 提供，页面标题为
  `Tenon Dashboard`，URL 同时固定本 worktree root 与当前 Change。
- 默认核心图真实读取 `9 nodes · 16 edges`，phase 顺序为
  Open/Explore/Spec/Build/Verify/Ship/Archive；“All”展开为 `47 nodes · 54 edges`。
- 任务类型筛选得到 `27 nodes · 0 edges`；无匹配搜索得到过滤空态，清除后恢复全图；可访问替代
  列表和视觉图共用过滤结果。
- End 把焦点移至 Archive，Enter 展示 Archive 详情，Escape 清除选择且未冒泡关闭 Change 详情；
  URL 的 `change=frozen-workflow-definition-status-20260730` 保持不变。
- 受控回环代理分别验证加载后真实空态，以及 500 错误后 Retry 恢复真实图；404 unavailable
  由组件契约测试覆盖。
- 中英文状态、edge kind、控制文案与详情均已在真实浏览器切换验证。
- 1024、1440、1920px 下 `document.body.scrollWidth === window.innerWidth`；全图由 520px
  内部滚动画布承载，没有页面级横向溢出。最终控制台 error/warn 均为空。
