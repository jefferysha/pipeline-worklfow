---
change: prompt-routing-bypass
design-doc: docs/superpowers/specs/2026-07-28-prompt-routing-bypass-design.md
---

# Prompt Routing Bypass 实施计划

## 目标与验收

用一个最小纵向切片让维护者在 Workbench 配置 `prompt_skip_keyword`，由 server 原子持久化，并让
`router.sh` 与 `breadcrumb.sh` 对当前轮次静默旁路。旧配置继续工作，review/confirm/安全 Hook
不受影响；Dashboard 覆盖加载、空、错误、成功与键盘路径。

## 原型决策

持续自主模式采用“不插入一次性原型”的保守决定：本功能复用已存在的 Hook config、HTTP route、
Workbench 时间线与纯 Bash prompt helper，未知点均可由先失败的单元/集成测试直接验证。若 tracer
bullet 暴露无法在现有边界解决的状态或 Bash 兼容问题，再以 `requirements-changed` 回退 Spec。

## Build 子阶段 A：端到端 tracer bullet

1. 在 `packages/server/src/hooksConfig.test.ts` 与 `packages/server/src/server.test.ts` 写失败测试：
   默认 `no-tenon`、POST 保存、GET 回读、旧配置兼容。
2. 在 `packages/server/src/hooksConfig.ts`、`serverGetRoutes.ts` 与
   `serverPostGovernanceRoutes.ts` 实现最窄 config/API 链路，保留 matrix 并原子写。
3. 在 `packages/dashboard-app/src/api/governanceTypes.ts`、`governanceDecoders.ts`、
   `governanceClient.ts` 和 Workbench 时间线加入最小真实表单；用
   `HookTimeline.test.tsx` 证明加载并保存 server 值。
4. 在 `tools/test-hooks.sh` 写一个默认 token 的失败用例，再扩展
   `hooks/prompt-intent.sh` 并接入 `hooks/router.sh`、`hooks/breadcrumb.sh`。
5. 运行 `npm test --workspace packages/server -- hooksConfig.test.ts server.test.ts`、
   `npm test --workspace packages/dashboard-app -- HookTimeline.test.tsx` 与
   `bash tools/test-hooks.sh`。

**此处建议 /clear**：最小链路已贯通，重新读取 delta spec、设计与当前 diff 后进入边界完善。

## Build 子阶段 B：边界、错误与兼容

1. 补齐 server 测试：空字符串、非法类型/字符/长度、未注册 root、写入错误，以及
   “切 Hook 保留 keyword / 改 keyword 保留 matrix”。
2. 补齐 shell 测试：大小写、标点、行首/尾、词内前后缀、连字符前缀、custom keyword、
   空字符串、损坏配置，并证明 review/confirm Hook 不读取旁路配置。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 和时间线组件补齐中英文文案、label、
   Enter 提交、busy、disabled、validation alert、读取/保存错误、成功 status 与重试。
4. 更新 `docs/CONTRACT.md` 中 UserPromptSubmit/Hook config 的兼容和安全边界。
5. 运行定向测试、`npm run typecheck:web`、`npm run test:web`、`npm run build:web`。

**此处建议 /clear**：所有规格边界已有自动化证据，重新加载 Change 再进入全量 Verify。

## Verify 子阶段

1. 运行 `bash tools/test-hooks.sh`、server 定向测试、`npm run typecheck:web`、
   `npm run test:web`、`npm run build:web`、`npm run build` 与 `npm test`。
2. 运行受影响的 hooks/adapters/skills/bundle/oracle 门禁；把缺少 secret 与代码失败分开记录。
3. 启动当前 worktree 的 Dashboard，先验证标题/项目根属于 Tenon，再真实操作：
   加载默认值、保存 custom、禁用、非法输入、模拟保存失败、Enter 提交与焦点/键盘路径。
4. 保存截图/日志和 `docs/verification/prompt-routing-bypass.md`，冻结 verify 证据。

## Ship 与回滚

1. 只提交本 Change 范围，推送 `codex/prompt-routing-bypass-20260728` 并创建非草稿 PR。
2. PR 固定 Trellis/Comet SHA，列明 API、持久化、测试、浏览器、兼容与风险；检查 CI 并修复代码失败。
3. 回滚只需撤销本 PR；旧配置缺字段会继续回退默认值。若需操作级禁用，可把
   `prompt_skip_keyword` 保存为 `""`，不关闭任何安全 Hook。
4. 应用 delta spec、完成 Ship/Archive 证据并归档 Change。
