# ADR: Preserve Explicit Manual Loop Bindings

## Status

Accepted.

## Context

Manual loop initialization exposed binding flags but silently ignored them.
This creates a delayed AFK admission failure and makes successful CLI output
misleading.

## Decision

Binding flags are first-class loop inputs, independent of starter templates.
Template identity stays optional metadata and must not gate persistence of
workflow or skill profile selections.

## Consequences

Manual loops can be prepared for activation without adopting an unrelated
starter template. Existing invocations without binding flags retain their
current unwired behavior.
