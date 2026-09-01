# Minimal autonomous development loop

## Goal

面向个人与企业开发者，建立一个“输入开发目标后自动推进、用户可实时观察和干预”的最小闭环：系统自动识别场景，使用用户自定义的 Skill/MCP 组合完成任务，并将每一步的状态、产出、阻塞和控制动作持久化。

## Confirmed product intent

- 用户可以自行选择 Skill；Skill 可以串行、并行或声明依赖。
- 不同 Skill 的产出结构可能完全不同，不能假设所有 Skill 都返回同一种结构化结果。
- 系统需要从自然语言目标、仓库上下文和运行证据中自动识别场景，用户不需要先选择“前端/后端/全栈”等类型。
- 系统需要自动推进流程，但用户可通过看板观察进度并执行暂停、恢复、批准、重试、取消和重新规划等控制动作。
- 首个版本必须从一个可运行的端到端闭环开始，再通过真实运行数据识别冗余能力与必要能力。

## Repository evidence to reuse

- Kernel 已经提供 canonical state、Workflow transition、Task Plan、Skill Invocation evidence 和 review gate：`packages/kernel/src/state/`, `packages/kernel/src/workflow/`, `packages/kernel/src/task-plan/`, `packages/kernel/src/skill-invocation/`。
- Automation 已经提供 queue、admission、runner、verifier 和 lifecycle：`packages/automation/src/`。
- Server 已经提供 snapshot/SSE 和状态控制 API，Dashboard 已有 Skill 编排与实时快照基础：`packages/server/src/`, `packages/dashboard-app/src/`。
- Skill source registry 目前主要解决来源、版本和安装可用性，尚未成为“异构产出契约 + 动态路由”的完整模型：`packages/kernel/src/skills/source-registry.ts`。

## MVP scope

### In scope

1. 一个项目、一个仓库、一个 Change/开发目标。
2. 从自然语言目标生成最小 Work Graph；至少支持串行节点、可并行节点和显式依赖。
3. 用户可从 Skill 库选择 Skill，并把 Skill 放入执行图；系统不要求用户预先声明场景。
4. Skill 输出采用“通用 envelope + 原始产出引用”模型：系统只依赖少量通用元数据和可验证的 artifact 引用，不强行解释每个 Skill 的领域内容。
5. 系统根据目标、仓库事实、可用 Skill/MCP 能力和安全策略，选择可执行的能力组合；每次选择记录版本、理由和输入快照。
6. 一个最小执行闭环：执行 → 产出记录 → 基础验证 → 状态推进或阻塞。
7. Dashboard 看板实时展示 Change、Work Item、Run、Gate 四类状态，并支持暂停、恢复、批准、重试、取消和重新规划。
8. 所有看板控制动作均通过 canonical state/transition 校验，不能直接改列或绕过 gate。
9. 每次运行记录 Skill/MCP、输入摘要、原始输出引用、验证结果、错误和恢复建议，支持中断后恢复。

### Out of scope for MVP

- 多租户、复杂 RBAC、组织计费和跨团队协作。
- 自动部署到生产环境及不可逆生产操作。
- 自动推断任意 Skill 的深层业务语义或把所有产出转换成统一领域 schema。
- 多仓库跨项目编排。
- 以模型置信度直接替代测试、Review 或人工审批。
- 为了“场景识别”新增大量固定场景枚举；MVP 只需要识别执行所需的能力和约束。

## Acceptance criteria

- [ ] 用户只输入自然语言目标，不选择场景；系统能够生成一个可解释的最小 Work Graph，并指出识别出的约束和待确认项。
- [ ] 用户选择两个以上自定义 Skill 后，系统能够执行串行和并行组合；Skill 输出不同不会导致编排器崩溃或被错误解释。
- [ ] 每个 Skill 产出都能以通用 envelope、原始引用和校验结果呈现在看板上。
- [ ] 运行过程中可实时看到节点状态、当前执行者、使用的 Skill/MCP、阻塞原因和下一步动作。
- [ ] 暂停、恢复、重试、取消、批准和重新规划均会产生可追踪的 canonical 事件，并经过服务端 guard 校验。
- [ ] 任一 Skill 失败或输出无法验证时，系统进入可恢复的 blocked/failed 状态，不得伪造完成。
- [ ] 同一 Change 在 CLI、Server 和 Dashboard 中的状态一致；重启后仍可恢复到最后一个可信状态。
- [ ] 一个真实仓库 Change 能从创建推进到 verify/review 完成，或以明确阻塞原因结束。
- [ ] MVP 运行数据能够统计：能力选择命中率、Skill 失败率、人工介入点、重复步骤和未被使用的模块，用于后续判断冗余。

## Proposed contract decisions

- Skill 只要求遵守生命周期和结果 envelope；领域产出允许保持 opaque，通过 artifact 引用和 validator 连接下游。无法验证的产出进入 `untyped`/`blocked`，不得伪造完成。
- “自动识别场景”不建立固定场景枚举，统一产出能力需求、约束、风险和待澄清项；场景标签只能作为投影字段，不能直接驱动状态迁移。
- 首条黄金路径限定为单仓库、单 Change，从自然语言目标运行到 verify/review；不包含生产部署。
- Work Graph 复用并扩展现有 `TaskPlanRevisionV1`，不再创建第二套独立 Task Plan 真相源。
- 看板是 canonical state 的投影和控制面；所有控制操作都转化为 typed command，经 Kernel guard 校验后写入事件/状态。

完整 schema、状态机、阶段契约、远程版本差异和实施顺序见同目录 `design.md` 与 `implement.md`。

## Notes

- Trellis 规范应记录已验证的行为契约，而不是预先规定每个 Skill 的领域输出。
- 复杂任务在最终计划确认后，需要补充 `design.md` 和 `implement.md`，再进入 `task.py start`；当前阶段不修改产品代码。
