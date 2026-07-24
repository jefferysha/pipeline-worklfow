# 正常对话触发 default pipeline

## Why

当前 Codex 的 `UserPromptSubmit` 只注入路由提示：它不会确保主 `pipeline` skill 可发现、不会明确分派该 skill，也不会在尚未存在 `openspec/changes` 的项目中完成首次启动。结果是开发型普通对话容易退化为 Codex 的通用计划，而不是 default 的 OpenSpec 流程。

此外，default 的阶段图、阶段 skill、OpenSpec 产物和 Todo 展示分别存在于不同的实现面，缺少可验证的端到端契约。首次安装也必须从已验证的不可变 runtime 启动单一 Dashboard，并以真实服务的 18765 默认端口打开页面，而不是留下需要用户手工拼接的第二条启动路径。

## What Changes

- 为 Codex adapter 部署并验证 pipeline/OpenSpec phase skills，使 normal chat 可以实际发现 `pipeline-lite:pipeline` 及其子 skill。
- 让 router 在开发型普通对话中生成明确、不可绕过的主编排分派；无 OpenSpec 项目的首次对话也能进入 default bootstrap。
- 将 `.pipeline-active` 从“隐式当前会话”降级为“仓库级恢复候选”：新目标必须以 `intent: new` 独立进入 open，只有用户明确继续或点名 change 才能以 `intent: resume` 读取旧 phase、Todo 与任务文本；多个候选的泛化“继续”必须要求选择。
- 统一 default 阶段的有效 skill 解析、OpenSpec 初始化/骨架、阶段 Todo 投影和 Dashboard 展示来源，避免仅注入文本。
- 将 18765 固化为默认全局 Dashboard 端口；保留 `PIPELINE_DASHBOARD_PORT` 覆盖和旧 8765 的显式兼容启动。成功 setup 在健康检查通过后打开 Dashboard；自动更新仅刷新同一受管服务。
- 将 `spec-complete` 的 AFK 自动交接建模为 Track 的独立 policy，而非复用“允许手动 AFK”能力；默认 PM 轨仅在状态已提交后原子挂队，普通开发轨保持正常 Build。
- 新增内建 `simple` Track 与插件内置轻量 workflow。只有“目标明确且局部”的低风险修改才进入
  `change → verify → done`，不生成 OpenSpec/Superpower/ADR，也不经过 default 七阶段；涉及公共契约、
  多模块、schema/migration、认证安全、依赖、生产发布或范围不清时必须走完整轨。
- 让 simple 分类支持正向局部信号与否决信号；否决优先。轻量执行中发现实际范围扩大时必须留下
  `scope-expanded` 升级事实并创建完整 default Change，不能继续用 simple 身份绕过治理。
- 补正常对话→change→OpenSpec→phase skill→Todo 的跨端回归测试和安装验收。

## Non-goals

- 不把普通问答、解释带入任何 Change；简单任务进入轻量 Track，而不是完全绕过可验证执行。
- 不改变现有 `/api` 路径、状态文件格式、HITL gate 或显式端口覆盖的外部兼容性。
