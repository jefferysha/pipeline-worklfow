# Automatic planning and capability routing — implementation

1. Add context capture and request validation ports with repository identity/policy snapshot.
2. Wire `requestCapabilityAssessment` into an application planner; persist proposal evidence and normalized assessment.
3. Add Skill/MCP descriptor catalog adapters for bundled and user-defined manifests, including version/digest/permissions/resources/validators.
4. Add deterministic WorkGraph builder, candidate rationale and clarification projection; reuse Kernel resolver.
5. Add fixtures for frontend/backend/full-stack/research goals, custom heterogeneous outputs, dependency/mode conflicts and malicious provider payloads.
6. Run Automation/Kernel tests, build and architecture checks.

Rollback: keep explicit user bindings and disable automatic routing if catalog/provider readiness is unavailable.
