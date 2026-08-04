# ADR: Derive WorkItem execution from frozen TaskPlan facts

## Status

Accepted for Spec.

## Context

The existing scheduler safely owns Change-level admission, bounded concurrency, cancellation, verification, and terminal CAS. A WorkItem DAG must add intra-plan execution without creating a second Change truth source or allowing AFK to expand authority.

## Decision

Implement a pure kernel DAG compiler and a subordinate automation TaskPlan executor. Derive waves from explicit dependencies and normalized write claims, bind every run to one frozen validated plan revision and policy fingerprint, reuse existing admission/preparation/verification/CAS ports, and expose only stable derived DTOs to the server and Dashboard.

## Consequences

- Scheduling is deterministic and testable without runtime I/O.
- Existing Change lifecycle and hard review boundaries remain authoritative.
- Retry and resume require durable per-attempt facts and invalidation ancestry.
- The implementation depends on the preceding TaskPlan, evidence, and workflow-policy stacked Changes.

## Rejected

Hand-authored waves, group-derived dependencies, mutable retry history, UI recomputation, and a parallel Change state machine.
