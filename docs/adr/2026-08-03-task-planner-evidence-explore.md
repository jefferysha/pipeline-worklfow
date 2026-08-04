# ADR: Make structured Skill invocation evidence canonical

## Status

Accepted for Spec.

## Context

Current receipt verification strongly proves trusted Skill reads, but history reduces completion to strings and cannot bind generic inputs, questions/defaults, artifacts, TaskPlan items, or AFK attempts.

## Decision

Add a strict append-only invocation evidence aggregate keyed by exact WorkflowRun/StepVisit and optional TaskPlan/WorkItem/attempt identities. Reuse trusted host proof adapters, store only privacy-minimized structured events, bind artifacts after completion, and keep raw history as a one-way compatibility projection.

## Consequences

- All Skills share one evidence protocol and Task Planner is ordinary.
- Missing/interrupted/misbound evidence fails closed and is explainable.
- Raw prompt/answer/output content is absent from public storage and DTOs.
- A new repository, recovery path, and migration period are required.

## Rejected

Raw-history canonical state, full-content logging, bundle-as-invocation, Task-Planner-only evidence, and broad pre-init transcript acceptance.
