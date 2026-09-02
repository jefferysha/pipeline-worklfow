# Design — Release v1.0.8 and cross-terminal workflow UX

## Boundaries

The release slice changes version identity, dependency resolution, release notes, and
generated payload freshness. The product slice adds no new execution semantics until
the install/selection contracts are accepted; it composes existing adapter registry,
V2 planner, canonical event log, SSE stream, and Dashboard editors.

## Data flow

```text
registry.yaml / project definitions
  → capability + schema validation
  → installer or Change planner preview
  → explicit user confirmation
  → frozen revision/fingerprint
  → command/event reducer
  → current snapshot + SSE
  → Dashboard reconciliation
```

The adapter picker is a client of a server-provided `adapter-catalog/v1` projection;
it must not parse `registry.yaml` in the browser. The installer state machine emits
typed events and uses the existing transactional bridge/lease rules. Workflow/Track/
Pipeline definitions use the existing versioned blueprint contract and are resolved
before freeze. A running Change references its frozen pipeline; catalog updates affect
only future planning unless a replan command is accepted.

## Installer state model

```text
detected → selected → preflight → downloading → configuring → verifying → installed
                                      └──────────────→ rollback → failed
```

Each adapter reports capability tier, prerequisites, expected files, and a reversible
transaction. GUI animation is a presentation of these states (progress, not a fake
completion signal); CLI/JSON reports the same events for headless use. Native and
degraded adapters remain separate records, and any unavailable host is selectable only
as an explanation, not as a command that will fail halfway through.

## Realtime definition updates

The server adds a typed catalog projection to the existing snapshot/SSE contract. A
client stores `last_revision` and `fingerprint`, applies only monotonic events, and
requests a fresh snapshot after a gap or reconnect. Save is a CAS command. On success,
new Changes see the definition in the next planner run; existing Changes keep their
frozen identity. On rejection, the event includes a stable reason code and the client
keeps the last accepted definition.

## Compatibility and rollout

- `v1.0.8` is a patch release and keeps the old installer/adapter CLI behavior intact.
- The GUI is additive and falls back to the scriptable JSON path when no browser or
  supported host is available.
- Existing V2 snapshots replay unchanged; new catalog events are optional projections.
- Rollback is a program/static-payload rollback; never rewrite or delete event history.

## Non-goals and trade-offs

The design does not promise identical enforcement on every terminal. It makes fidelity
and degradation explicit, which is safer than emulating unavailable hooks. It also does
not force a user to understand Workflow/Track/Pipeline vocabulary in the default path;
those identities remain inspectable and controllable for advanced users.
