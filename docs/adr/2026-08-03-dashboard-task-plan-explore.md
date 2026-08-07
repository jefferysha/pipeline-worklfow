# ADR: Integrate TaskPlan into existing Progress, Workbench, and AFK contexts

## Status

Accepted for Spec.

## Context

TaskPlan spans run inspection, workflow configuration, and AFK operations. A new top-level page would duplicate project/run context, while an unbounded graph would not scale or provide keyboard parity.

## Decision

Add TaskPlan inspection to Progress/TaskDetail, orthogonal policy editing to Workbench, and runtime admission/operations to AFK. Use list/detail, coverage matrices, and bounded execution-wave views. Consume versioned backend-derived DTOs through strict decoders; do not reproduce scheduler logic in the browser.

## Consequences

- Users encounter each capability in its existing operational context.
- Large plans remain readable from 1024 to 1920px and have semantic list parity.
- The stacked UI branch depends explicitly on PR1-PR4 contracts.
- Browser acceptance must cover multiple views and state variants with one long-lived browser owner.

## Rejected

A separate TaskPlan application, unbounded node graphs, client-side readiness calculation, and color-only status encoding.
