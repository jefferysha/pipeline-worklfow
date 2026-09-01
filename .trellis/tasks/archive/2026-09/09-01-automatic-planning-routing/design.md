# Automatic planning and capability routing — design

## Boundary

Extend the Automation application layer with request intake, repository context capture, provider proposal normalization, dynamic Skill/MCP catalog loading and deterministic WorkGraph planning. Kernel owns codecs and resolution invariants; filesystem/vendor discovery is injected through ports.

## Data flow

`DevelopmentRequest` → `ContextSnapshot` → bounded `CapabilityAssessment` → planner creates frozen `TaskPlanRevision/WorkGraph` → Kernel `resolveCapabilities` → pinned resolution with candidates, reasons and blockers.

User-selected Skill/MCP IDs, mode and dependencies are authoritative. Automatic selection only fills missing capabilities after availability, permissions, resource claims, validators and MCP requirements pass. Catalog descriptors are immutable snapshots with content digest and source/version. Unknown provider output or unresolved requirements become clarification/blocker records.

## Determinism

Normalize and sort IDs/candidates before hashing. Never use scene labels as transition keys. The planner is pure after context/catalog input and can be replayed from those snapshots.
