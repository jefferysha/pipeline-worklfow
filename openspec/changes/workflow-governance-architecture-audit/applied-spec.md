# Applied OpenSpec — Workflow Governance Architecture Audit

Date: 2026-07-25

## Applied capabilities

| Delta source | Durable main target | Effect |
| --- | --- | --- |
| `openspec/changes/workflow-governance-architecture-audit/specs/declarative-document-governance/spec.md` | `openspec/specs/declarative-document-governance/spec.md` | Added the versioned document profile, graph-dominance, immutable binding, current-visit receipt, and profile projection requirements. |
| `openspec/changes/workflow-governance-architecture-audit/specs/effective-workflow-plan/spec.md` | `openspec/specs/effective-workflow-plan/spec.md` | Added one authoritative compiled plan for Track, phase, review, Skill, document, automation, and projection behavior. |
| `openspec/changes/workflow-governance-architecture-audit/specs/interaction-and-skill-provenance/spec.md` | `openspec/specs/interaction-and-skill-provenance/spec.md` | Added exact intent, approval, Skill-root, current-visit, and completed-host-call provenance requirements. |
| `openspec/changes/workflow-governance-architecture-audit/specs/repository-architecture-compliance/spec.md` | `openspec/specs/repository-architecture-compliance/spec.md` | Added enforceable package, DDD, frontend-boundary, default-authority, file-size, and CI architecture rules. |

## Application result

The four targets were already updated during Verify's mandatory immediate
delta-to-main merge. Ship re-read every delta and target and confirmed an
idempotent no-op: after normalizing only `ADDED/MODIFIED Requirements` to the
durable `Requirements` heading, each source matches its target exactly.

No conflicts or unrelated main-spec edits were encountered.
