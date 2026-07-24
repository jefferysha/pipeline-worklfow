# ADR: Carry effective workflow bindings through normal-chat routing

## Status

Accepted

## Context

The dashboard persists Track-to-workflow bindings, while normal-chat routing discarded that
binding and hard-coded `default`.  The result was two inconsistent orchestration views of the same
project configuration.

## Decision

Add the effective default workflow to the existing Track router projection and move the cache to a
new, fail-closed format version.  Let the root skill own the user interaction; the hook only
emits a typed selection contract.  The CLI/API remain the authoritative validators and writers.

## Consequences

- Existing V2 caches regenerate once.
- Projects without custom choices retain automatic default behavior.
- Projects with custom choices gain a deliberate user decision and no longer silently start the
  wrong pipeline.
- No second configuration file or ad-hoc YAML parsing path is introduced.
