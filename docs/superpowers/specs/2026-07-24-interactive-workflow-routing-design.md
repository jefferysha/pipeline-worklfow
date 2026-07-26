# Interactive workflow routing design

## Approved outcome

For a new normal-chat objective, the router remains responsible for deterministic recommendation,
but a project with a custom Track or a Track mapped to a custom workflow receives an explicit
choice.  The choice happens before a Change exists.  A repository-level active Change is never a
proxy for that choice.

## Alternatives considered

1. Keep hard-coded `workflow: default` and rely on a user to type a workflow name.
   This is the current defect: dashboard-created configuration is invisible to normal chat.
2. Have Bash parse `.pipeline/tracks.yaml` directly for workflow values.
   Rejected because it would create a second partial YAML parser, expand the hot-path attack
   surface, and drift from kernel validation.
3. Extend the existing inert Track Router projection with its effective default binding.
   Chosen.  It uses the existing single source of truth and only widens a validated, versioned
   data contract.

## Interaction

The injected dispatch includes a recommended pair and candidate pairs.  When selection is
required, the root skill asks the user to choose one.  The answer becomes the `--track` and
`--workflow` values of the newly initialized Change; the normal OpenSpec phase then proceeds as
usual.  No selection is shown for a project that exposes only built-in/default pairs.

## Verification criteria

- A V2 cache is not accepted as V3.
- A hostile workflow value cannot escape the emitted dispatch contract.
- A custom catalog Track bound to a catalog-flow flow produces an interaction requirement.
- Built-in frontend/default routing preserves the prior no-picker behavior in a clean project.

## Coverage

```coverage
touches:
L1_api:      filled -> normal-chat dispatch fields and canonical pipeline init arguments
L2_data:     filled -> versioned Track router projection and bounded candidate-pair cache
L3_rules:    filled -> exclusion-first routing and explicit selection-before-creation invariants
L4_state:    filled -> intent new/select/resume state transitions and immutable Change identity
L5_errors:   filled -> incompatible cache rejection and fail-closed hostile value handling
L6_security: filled -> validated data-only projection, bounded input, and shell-safe dispatch encoding
L7_ui:       filled -> host selection prompt appears only when a custom candidate is available
L8_deps:     waived -> no new runtime dependency
```
