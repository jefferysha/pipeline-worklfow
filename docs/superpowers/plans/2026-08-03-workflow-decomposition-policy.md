---
change: workflow-decomposition-policy
design-doc: docs/superpowers/specs/2026-08-03-workflow-decomposition-policy-design.md
---

# Workflow 拆分与互动策略实施计划

## 默认决策

- 不做 prototype：closed codec、effective plan snapshot 和 workflow POST 均有强现成模式，先用 tracer bullet 暴露集成风险。
- require-review 允许生成候选，执行前 exact review；legacy V1/V2 不原地迁移。

## 子阶段 1：Tracer bullet — definition 到 frozen API

1. 扩展 kernel WorkflowDef/parser/serializer/compiler/IR，先支持安全默认和一个合法 policy fixture。
2. 增加 V3 EffectiveWorkflowPlan snapshot/fingerprint，保留 V1/V2 历史校验。
3. 扩展现有 server Workflow GET/POST 与 frozen run DTO，返回真实配置/frozen policy。
4. 添加 codec/snapshot/server round-trip 集成测试并运行类型检查。

回滚：移除新字段写入，新 reader 仍可读取 legacy off+interactive。

**此处建议 /clear**

## 子阶段 2：完整策略与权限求交

1. 完成 mode/target/strategy/limits/conditions 的闭集与 budgets。
2. 实现逐 action 五层权限 evaluator、structured denial/remediation 与 hard-boundary vocabulary。
3. 固定 configured/frozen/effective/drift DTO，不让 track/run grant 污染 Workflow fingerprint。

验证：全组合 table tests、future/unknown/malformed inputs、fingerprint drift。

**此处建议 /clear**

## 子阶段 3：continuous 与 AFK admission 接线

1. 将 queue/CLI 早拒绝接到共享 evaluator。
2. 在 automation authoritative pre-claim admission 通过只读 frozen authority port 复核。
3. 验证 continuous exact-session 只能降低提问，不得升级 ceiling/AFK/外部动作权限。

验证：`enabled × track × workflow × run grant × evidence × hard gate` 组合与漂移补偿测试。

**此处建议 /clear**

## 子阶段 4：Dashboard 配置闭环

1. 在现有 Workflow definition client 上增加 decomposition/interaction 类型与真实 GET/POST 往返，不新增绕过端点。
2. 实现正交策略控件、状态摘要、zh/en、loading/empty/error/saving/success 与可恢复校验错误。
3. 增加组件/API 测试，并由唯一浏览器 owner 在 1024–1920px 桌面宽度验证编辑、保存、刷新、失败重试和键盘路径。

回滚：隐藏编辑入口；server/shared compiler 仍保持安全读写契约。

**此处建议 /clear**

## 子阶段 5：stable receipt、堆叠兼容与交付

1. 修复安装后 stable bootstrap/runtime 的可信 plugin cache 身份透传，以当前 session/turn/phase 生成真实 receipt；未知或漂移身份失败关闭。
2. 为安装后 stable launcher 加回归，证明分支 CLI workaround 不会被计作正式完成证据。
3. 安全衔接 PR2 head，引用 InteractionPolicy/DecisionEvent 而不复制证据合同。
4. 运行 kernel/server/cli/automation/web 测试、build、comments/skills/hooks/adapters/bundle freshness与正式 stable receipt 验证。
5. 提交并推送 base=PR2 branch 的 PR3。

回滚：停止创建 V3；既有 V3 继续只读并禁止被 legacy writer 覆盖。
