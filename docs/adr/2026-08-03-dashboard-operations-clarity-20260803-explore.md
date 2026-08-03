# ADR：Dashboard 用稳定事实驱动分组、主线与推荐

- 状态：Accepted
- 日期：2026-08-03
- Change：`dashboard-operations-clarity-20260803`

## 背景

Dashboard 当前把 root 当项目、把所有图边当主线、把所有缺失能力当阻断，并把全部宿主候选交给用户。
这些实现都保留了原始数据，却没有建立面向操作的事实层级，最终产生重复项目、图线交叉、错误阻断和
无依据选择。

## 决策

1. 项目组由服务端安全探测的 Git common directory 身份拥有；basename 只做 label，不参与同一性判断。
2. 失效 root 只通过显式、可恢复的 registry 注销清理，不做静默自动删除。
3. 编排图只把 canonical phase order 作为主线；其他真实关系在次级关系区和语义列表等价呈现。
4. Machine 只有当前任务依赖的核心能力可以叫 blocker；Docker 与 sandbox image 缺失默认是 AFK 可选
   能力不可用。
5. Host Plan 通过独立只读检测 DTO推荐 native host 与 setup/update；推荐只自动加载零副作用计划，不执行。
6. Workbench Workflow 与 Track 共用一个控制表面和尺寸系统，避免嵌套卡片竞争。

## 后果

- Snapshot 增加可选仓库身份，旧 server 可安全降级；每个可达 root 多一次有界 Git probe。
- Host Plan 多一个本机只读 GET 与前端并行请求，但不会扩大 setup/update 写权限。
- 编排 DTO 不变，主要变化集中在 presentation；所有边仍可被键盘与屏幕阅读器读取。
- Projects 的“项目数”语义从注册 root 数提升为仓库组数，同时显式保留 workspace 数，避免信息损失。

## 被拒绝方案

- 用路径后缀或 basename 分组：同名仓库会误合并，worktree 命名也不稳定。
- 服务启动时自动删除不可达 root：外接盘和临时挂载会造成不可预期的登记丢失。
- 引入通用 graph layout 库：不能解决主线/次级关系混淆，还增加依赖和可访问性成本。
- 永远默认 Codex：Dashboard 可由 Claude 或多宿主环境使用，固定默认不是检测。
