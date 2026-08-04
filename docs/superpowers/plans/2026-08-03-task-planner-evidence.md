---
change: task-planner-evidence
design-doc: docs/superpowers/specs/2026-08-03-task-planner-evidence-design.md
---

# 通用 SkillInvocation 证据实施计划

## 默认决策

- 不做 prototype：append-only ledger、document evidence、Codex receipt 和 automation attempt 均有可复用模式，采用 TDD tracer bullet。
- pre-init bootstrap 不在本 PR 放宽；支持流程继续先 init/activate 后 Skill read。
- Verify 第一轮发现 fixture-only 与 caller-asserted evidence 不满足目标；本轮改为 trusted application command + 真实生产 lifecycle wiring，不接受偏差。

## 子阶段 0：Verify fail 规格收敛

1. 将 canonical-only binding、trusted command、全 ledger/budget、question/answer receipt、artifact/output/validator 与 Dashboard 消费要求写入 delta spec 和 design。
2. 把第一轮 Reviewer、Codex、E2E、OpenSpec 与 browser 证据登记为 FAIL report，按正式状态机回到 Spec。
3. 验证 `openspec validate task-planner-evidence --strict`，登记更新后的 delta、plan、design、proposal 与 tasks。

**此处建议 /clear**

## 子阶段 1：Tracer bullet — Invocation 到真实 API

1. 新增 kernel invocation types/codec/repository，打通 started -> completed 与精确 StepVisit/TaskPlan/WorkItem subject。
2. 新增 server GET projection 路由，返回一个真实持久 Invocation 的 privacy-safe DTO。
3. 增加 repository/server 集成测试和 PR1 contract 编译依赖。
4. 验证 `npx tsc -b packages/kernel packages/server` 与定向 Vitest。

回滚：新 ledger 与 endpoint 均为新增；停止写入不影响 compatibility history。

**此处建议 /clear**

## 子阶段 2：状态机、Question/Decision 与隐私

1. 完成 terminal uniqueness、replay、interrupted recovery、malformed ledger degradation。
2. 实现 QuestionEvent 与 user-answer/recommended-default DecisionEvent；hard-gate 与 frozen policy mismatch 失败关闭。
3. 实现 field classification/digest/validator proof 和公共 DTO redaction 测试。

验证：codec/repository/privacy/property-based 定向测试。

**此处建议 /clear**

## 子阶段 3：ArtifactBinding 与 adapters

1. 实现 document-reference 与 non-document intent/commit binding、digest fence 和 orphan recovery。
2. 复用 Codex trusted transcript verifier，增加 native/Codex/AFK attempt adapters，并通过同一 trusted application command 接入生产入口。
3. 保留 history 单向兼容投影并证明不能 reverse-mint v1。

验证：adapter、并发、崩溃窗口和错绑测试。

**此处建议 /clear**

## 子阶段 3.5：生产证据与 fail-closed 修复

1. 移除公开 caller binding seam；repository 每次 append 前验证全 ledger 与 append 后预算。
2. 让 command 同时核对 started/current aggregate、question/answer/default receipt、output 与 validator；空 user-answer、问题错配、output 错配与非 pass validator 失败关闭。
3. 在 Codex document producer 与 AFK prepared execution 路径持久化真实 invocation；Task Planner/native 复用同一 production port，不创建私有 ledger。
4. 用真实 canonical Change fixture 运行生产 writer → server reader 集成测试，证明非 fixture invocation 可读。
5. Dashboard 展示 field/artifact validators 和 privacy-safe free-text 状态；修复 client run identity 与 server 403/404。

验证：先跑每项 RED，随后定向 GREEN，再跑 kernel/cli/automation/server/Dashboard wider suite。

**此处建议 /clear**

## 子阶段 4：堆叠验证与交付

1. 将分支安全衔接到 PR1 head，解决共享 contract 冲突而不复制类型。
2. 运行 kernel/server/cli/automation 定向与集成测试、build、comments/skills/hooks/adapters/bundle freshness。
3. 更新证据、提交并推送 base=PR1 branch 的 PR2。

回滚：API 可撤下；ledger 保留为审计事实，不做破坏性删除。
