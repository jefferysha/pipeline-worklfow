# Automatic planning and capability routing

## Goal

将自然语言目标、仓库上下文和用户自定义 Skill/MCP 归一化为可执行工作图与路由决策

## Requirements

- Accept a natural-language request plus an anchored repository context; no user-selected scene enum is required.
- Route provider output through the existing bounded proposal boundary and normalize it once into capabilities, constraints, risks and clarification questions.
- Discover built-in and user-defined Skill/MCP descriptors with version, availability, permissions, resource claims, modes, dependencies and validator hints.
- Generate a frozen WorkGraph/TaskPlan that covers acceptance criteria, preserves explicit user order/dependencies and records automatic candidate rationale.
- Resolve deterministically: user choices first, then policy/permission/resource/validator filters, then automatic candidates; unresolved requirements remain actionable blockers.

## Acceptance Criteria

- [ ] The same request/context/catalog yields a stable graph and resolution digest.
- [ ] A malicious/oversized/accessor provider response is rejected before graph or state mutation.
- [ ] Two custom Skills with different output declarations can be selected, pinned and represented without assuming a shared domain schema.
- [ ] Serial, parallel and explicit dependency choices are preserved; unsafe resource/permission combinations are blocked before execution.
- [ ] Clarification questions are shown as blocking/non-blocking and the system never invents a scene or silently picks an unavailable tool.
- [ ] Planner fixtures cover frontend, backend, full-stack and non-code research intents through capability requirements rather than a fixed scene list.
