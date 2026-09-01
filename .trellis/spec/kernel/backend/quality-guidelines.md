# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

Kernel orchestration is a pure TypeScript domain boundary. It must not import Node
filesystem/process APIs, HTTP, CLI, Docker, Git, or vendor SDKs. External model,
Skill, MCP, persistence, and board adapters enter through versioned contracts.

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

- Do not add a second task-plan source of truth; `WorkGraphV1.task_plan` is a
  frozen `TaskPlanRevisionV1` snapshot.
- Do not infer completion from an opaque Skill result. A result with
  `contract_status=unknown|invalid`, or with a non-completed status, must remain
  blocked/incomplete until a validator proves it.
- Do not mutate a board snapshot directly. Every control action goes through the
  typed `BoardCommandV1` reducer and its expected-revision CAS.

---

## Required Patterns

<!-- Patterns that must always be used -->

- New orchestration records use additive `*-v1` schema identifiers and explicit
  snake_case wire fields.
- Scene detection produces capability requirements, constraints, risks, and
  clarification questions; it must not drive transitions through a fixed scene
  enum or model confidence alone.
- Custom Skill order, serial/parallel mode, dependencies, pinned versions, and
  routing rationale are preserved in the resolution record.

---

## Testing Requirements

<!-- What level of testing is expected -->

- Contract and reducer behavior requires Vitest coverage for successful paths,
  invalid transitions, unknown/heterogeneous outputs, missing capabilities,
  dependency cycles, resource conflicts, and stale revisions.
- Run `npx tsc -b packages/kernel`, the targeted orchestration test, and the
  architecture import-graph check before wiring another layer.

---

## Code Review Checklist

<!-- What reviewers should check -->

- Verify the new package export does not introduce runtime cycles or imports from
  infrastructure into Kernel.
- Verify every state-changing command increments revision exactly once and that
  rejected commands do not mutate state.
- Verify every selected Skill/MCP has an auditable source (`user` or `auto`) and
  pinned version; unresolved capability must be represented explicitly.
