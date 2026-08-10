# 提案

## Why

`free/default` 当前存在契约漂移风险：关闭领域 Track 的 Skill matrix overlay 时，可能连带关闭 default 七阶段中由 phase 自身声明的 mandatory Skill 要求，使 Hook、transition 或 AFK admission 接受缺少当前 phase Skill receipt 的 Change。Issue #43 是 roadmap #41 的 Wave 0 / P0 基础阻塞项，必须先把该语义统一并机器化执行。

## What Changes

- 统一 effective Skill resolver，使 phase-declared requirements 与 Track matrix overlays 成为两个可区分的来源。
- 让 Hook gate、transition、AFK admission、doctor、manifest/runtime comments、打包 Skills 与用户文档消费同一契约。
- 用负向测试证明 `free/default` 缺少当前 phase mandatory Skill 时无法从任一入口绕过，并保护 custom Workflow 与 matrix-enabled Track 的既有语义。
- 非目标：不改变 custom Workflow 已声明 Skill 的语义，不新增 Track/Workflow，不发布版本或修改本机已安装插件。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workflow-skill-enforcement`：default phase requirements 必须独立于 Track matrix overlays 生效。

## Impact

预计影响 kernel 的有效 Skill 解析与 transition gate、Hook/CLI 装配、automation AFK admission、doctor 可观测输出、默认 workflow 生成物、manifest 注释、打包 Skill 和用户文档。改动属于 Level 2 跨包公共契约；必须同步受控 dist/生成物并验证 custom Workflow、PM/frontend/backend 兼容路径与并发安全。具体文件与接口以 Explore 证据为准。

## Explore 结论

- default Workflow 每个 step 声明对应 `tenon-<phase>`，形成随 workflow snapshot 冻结的 phase requirement。
- manifest mandatory/recommended 只在 `matrix=true` 时作为自动领域 overlay；free/default 的 Hook/transition 仅保留 phase requirement，命名 free profile 只供显式 artifact/bundle 授权。
- Hook、CLI/Server transition、AFK bundle、artifact 与 doctor 统一消费 effective resolver，不再各自回退 profile。
- custom Workflow 的 step-declared DAG、receipt、review 与 document governance 语义不变。
