# ADR: Freeze orthogonal decomposition and interaction policies

## Status

Accepted for Spec.

## Context

Current Workflow definitions freeze steps but cannot express decomposition or interaction/AFK ceilings. Continuous authority and automation opt-in are narrower grants and must not be mistaken for Workflow authorization.

## Decision

Add two independent versioned top-level policies to the closed Workflow codec, compile them into a new frozen effective-plan snapshot/fingerprint, evaluate each action through a five-layer permission intersection, and enforce AFK again at authoritative pre-claim admission. Legacy snapshots retain historical hash verification and receive safe read-time defaults.

## Consequences

- Existing Workflows remain interactive with automatic decomposition disabled.
- Policy drift is visible but cannot mutate an active run.
- Runtime and Dashboard can explain configured ceilings separately from effective grants.
- New snapshot/codec versions and migration tests are required.

## Rejected

A combined autonomy enum, numeric privilege levels, live-YAML runtime evaluation, and continuous authority as implicit AFK permission.
