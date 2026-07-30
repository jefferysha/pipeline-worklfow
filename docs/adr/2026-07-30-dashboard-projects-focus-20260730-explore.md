# ADR：Projects 使用域内搜索与状态聚焦

## 背景

真实 Dashboard 同时列出 38 个项目，现有 Projects 已能按注意力排序并区分同名 worktree，但没有快速定位
或状态聚焦入口。全局命令面板会跨越 App/shell、URL 和快捷键契约；新增后端搜索则会复制已经完整下发的
Snapshot 数据。

## 决策

在 Projects 功能域内基于 `ProjectRow[]` 增加临时 `query` 与四态 `focus` 投影，采用搜索框、roving
状态 tabs、live 结果摘要和可恢复零结果。默认无条件时保持现有分区与不可达折叠行为。

搜索只匹配 basename 和完整 root；状态事实继续来自 `need`、`running` 与 `ok`。不新增 API、依赖、
URL 参数、localStorage 或全局快捷键。筛选切换不新增 GSAP，保留现有集合级入场动画。

## 备选方案

- 仅搜索：无法快速聚焦需处理、运行中和不可达项目。
- 全局命令面板：长期价值存在，但会实质扩大范围与快捷键/导航风险。
- 后端搜索：当前 Snapshot 已拥有全部项目，网络往返和协议扩展没有收益。

## 后果

- Projects 在大量 worktree 环境中更快定位，同时保持当前安全和数据边界。
- 组件需要新增局部模型/工具栏拆分，避免 `ProjectsView.tsx` 超过 400 行硬门槛。
- badge 为全局计数、summary 为当前结果，必须在测试和中英文文案中明确。
- 手机端行为不新增产品承诺；只保留既有结构不回归。
