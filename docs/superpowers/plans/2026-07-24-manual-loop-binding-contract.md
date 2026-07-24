---
change: manual-loop-binding-contract
design-doc: docs/superpowers/specs/2026-07-24-manual-loop-binding-contract-design.md
track: backend
preset: tweak
---

# Manual Loop Binding Contract Plan

## Implementation

1. Extend resolved loop-init inputs with optional workflow and skill bundle
   binding fields.
2. Populate those fields from parsed flags in the non-interactive path.
3. Assemble bindings independently of optional starter template metadata.
4. Add a focused test proving the registry object and YAML preserve both.
5. Add `archive-run` to every built-in simple edge entering a terminal node and
   teach transition execution to set `phase_status=done` from that action.
6. Extend the simple lifecycle integration test to prove both terminal branches
   leave the active queue and satisfy dependency semantics.

## Verification

1. Run the focused loops-init, transition, built-in Workflow, and init
   integration suites.
2. Build the CLI bundle.
3. Execute the built CLI in a temporary repository and inspect the parsed
   registry plus serialized YAML.

## Rollback

Revert the CLI and built-in Workflow changes. No registry migration is needed
because the binding fields already belong to the schema and older readers
already understand them.
