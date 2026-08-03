# 提案

## Why

当前 Dashboard 把同一仓库的不同 worktree 当成独立项目，保留大量已失效登记项，并在编排、运行就绪和宿主操作页面混淆“事实”“风险”和“用户动作”。这让本地用户无法快速判断真实项目、真实任务与下一步操作，必须现在统一收口。

## What Changes

- 将已注册项目按真实仓库身份分组，并在组内区分主工作区与 worktree。
- 清理当前不可达的登记项，并为后续失效项提供明确、可恢复的清理路径。
- 重构编排图、工作流与运行轨道、运行就绪、宿主计划五处桌面端信息架构。
- 修正可选 AFK 能力被误报为全局阻断的状态语义，自动识别并优先展示当前宿主。
- 保留 Tenon 的本机安全边界、双语、异步状态、键盘操作与桌面端 1024–1920px 验收。

## Capabilities

### New Capabilities

无；待 Explore 验证是否需要独立 capability。

### Modified Capabilities

- `dashboard-project-selection`：项目总览按稳定仓库身份分组，workspace 保留显式 root 身份。
- `dashboard-ui-ux-system`：统一 Workbench 控制表面、Machine 能力层级和桌面验收。
- `orchestration-graph`：阶段主线与次级关系分层呈现，不改变只读图 DTO。
- `host-target-plan`：增加独立只读宿主检测与自动推荐，计划仍不执行。

## Impact

影响 Dashboard React 视图、Snapshot 的 additive 仓库身份、独立只读宿主检测 DTO 与本机项目注册表既有注销端点。不得直接修改 canonical Change 状态或删除项目文件；登记项清理必须复用受鉴权的官方注销路径。`tenon-orchestration-graph/v1` 与 `host-target-plan/v1` 保持兼容。
