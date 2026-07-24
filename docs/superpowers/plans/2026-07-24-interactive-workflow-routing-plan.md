# Implementation plan: interactive workflow routing

1. Extend `RouterTrackProjection` with `workflowDefault`; source it from the effective
   `TrackDefinition.workflow.default` and include it in a new V3 data-only cache record.
2. Update the Bash parser and its cache filename/header together.  Validate all new data before
   it enters arrays, keep the 32-Track bound, and calculate whether the project exposes a custom
   candidate.
3. For `intent:new` plus a custom candidate, emit `workflow: select`, a suggested pair, bounded
   candidate pairs, and `selection_required: true`.  Otherwise retain the existing default
   dispatch contract.
4. Update the root `pipeline` skill: selection-required dispatches invoke the host interaction
   tool before `pipeline init`; a selected pair is passed through canonical state validation.
5. Add kernel/CLI/hook regression coverage, run the release bundle checks, then update the
   isolated Codex installation and perform browser + normal-chat live acceptance.
