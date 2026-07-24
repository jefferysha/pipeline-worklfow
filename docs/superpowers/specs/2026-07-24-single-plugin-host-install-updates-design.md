# Single-plugin host installation and release updates

## Outcome

Pipeline Lite is one versioned plugin payload with host-specific entry points. A user chooses
exactly one host during setup, while the selected package still contains the complete pipeline:
CLI, seven-phase workflow, OpenSpec document contract, bundled mandatory skills, hooks, dashboard,
AFK/tap/channel subsystems, and every adapter. Host selection controls installation ownership; it
does not delete product capabilities.

## Evidence and constraints

- Codex and Claude each require native manifest/marketplace metadata.
- Non-native hosts use the shared adapter registry and do not claim a native marketplace updater.
- A marketplace checkout is mutable and therefore a release candidate, not an executable trust
  root.
- Mandatory workflow skills must resolve inside the same packaged release. Optional third-party
  skills may extend the product but cannot determine whether the default pipeline starts.
- Updating an already-running session cannot safely hot-swap its loaded skills and hooks; the
  update applies to a new session.
- Port `18765` is the product dashboard default and belongs to the active managed runtime.

## Considered architectures

| Option | Benefit | Failure mode | Decision |
| --- | --- | --- | --- |
| Project-local symlinks into a checkout | Minimal implementation | Breaks when cache moves; mixes global plugin state with project state | Rejected |
| Install each subsystem and skill independently | Flexible component versions | Split-brain versions, external skill drift, incomplete first install | Rejected |
| One plugin with a selected host and immutable managed releases | Coherent version, atomic update, auditable rollback | Requires a stable bootstrap and local release store | Selected |

## Package and ownership topology

```text
pipeline-lite release
├── .codex-plugin + .agents marketplace metadata
├── .claude-plugin marketplace metadata
├── skills/                         bundled mandatory and optional workflow skills
├── hooks/                          native hook manifest + stable hook dispatch
├── packages/cli/dist/pipeline.mjs  distributable CLI
├── runtime/                        stable bootstrap source
├── dashboard + server + templates complete product payload
└── adapters/registry.yaml          all supported non-native hosts

pipeline setup --codex|--claude
  → ask selected host for its installed plugin root
  → stage and verify the complete payload
  → publish releases/sha256-<tree-digest>/payload
  → atomically select active/previous release
  → write ~/.local/bin/pipeline and pipeline-hook stable launchers
  → start/hand off dashboard from the active release on 18765
```

## Host-selection contract

`pipeline setup` requires exactly one host selector. `--codex` and `--claude` use their native
marketplace inventory and updater. A registered adapter selector applies only that adapter to the
target project. Zero selectors, multiple selectors, and `--auto-update` on a non-native adapter are
rejected with actionable examples. Setup never modifies another host merely because its metadata
is present in the package.

This separates two concepts that were previously coupled:

1. **Distribution completeness** — every release contains the whole product.
2. **Installation ownership** — one explicitly selected host owns setup/update for that invocation.

## Managed release and launcher contract

Native setup/update treats the host-reported plugin root as untrusted candidate input. Publication
copies ordinary files, rejects symlinks and incomplete payloads, validates manifests, bundles,
hooks, skills, and CLI smoke behavior, computes a deterministic SHA-256 tree digest, then atomically
publishes the immutable release and selection record under a cross-process lock.

The stable launchers are installed only after a release is valid. Every normal CLI or hook dispatch
revalidates the selected release digest before execution. Corruption enters a recovery-only mode:
ordinary mutation is denied and only the exact stable command
`pipeline runtime repair --rollback` may select a persisted previous verified release.

Audit is failure-safe: an audit append failure cannot be reported after selection has changed.
Host refresh/verification failures preserve the current release and emit `update-rejected` for
runtime status and doctor diagnostics.

## Update lifecycle

Manual update is explicit: `pipeline update --codex` or `pipeline update --claude`. The command asks
only that host to refresh/reinstall, resolves the matching inventory entry, validates the candidate,
publishes it, and hands dashboard ownership to the new release. It never scans cache layouts as an
installation API.

Automatic update is opt-in through setup, bounded to once per selected host per day, and invokes the
stable launcher in the background. Failure is diagnostic only and retains the active release.
Success announces that a new host session is required before new skills/hooks are expected.

## Bundled skill and OpenSpec continuity

The skill registry is an installable contract: every mandatory token maps to a concrete bundled
`SKILL.md`, and verification rejects external mandatory references. The default workflow retains
the complete evidence chain:

```text
Open proposal/design/tasks
  → Explore Superpowers design + ADR
  → Spec delta spec + Superpowers plan
  → Build implementation and updated tasks
  → Verify report + independent review + E2E
  → Ship applied-spec receipt + durable main spec
  → Archive exact document/read receipts
```

Later phases use digest-bound `pipeline document read ... all` receipts. Generating a document is
not sufficient; stale or unread evidence blocks the relevant transition.

## Failure modes and observability

| Failure | Required behavior |
| --- | --- |
| Selected host inventory is absent or ambiguous | Fail without publishing or touching another host |
| Candidate lacks a bundle, hook, skill, or manifest | Reject candidate; preserve selection and launcher |
| Update command fails after host refresh | Persist `update-rejected`; keep the active runtime |
| Active payload is changed after publication | Reject execution; report `activeValid=false` |
| Previous payload digest is invalid | Refuse rollback; keep selection unchanged |
| Dashboard from an older release is listening | New valid release performs governed singleton handoff |
| Non-native adapter requests auto-update | Reject unsupported ownership claim |

## Assumptions and decision log

- The user explicitly requires a single complete plugin, so subsystem pruning is out of scope.
- Host choice is explicit at setup/update time; no “detect and install everything” compatibility
  fallback is permitted.
- POSIX launchers live in `~/.local/bin`, while runtime data, state, and configuration use platform
  standard application directories resolved by the runtime path service.
- Existing adapter tiers and honest degradation contracts are preserved.
- The release is delivered directly to `main`, per the user's explicit branch instruction.

## Coverage

```coverage
touches:
L1_api:      filled -> Host-selection contract and Update lifecycle
L2_data:     filled -> Managed release and launcher contract
L3_rules:    filled -> Distribution completeness and single-host ownership invariants
L4_state:    filled -> Managed release selection, update lifecycle, and OpenSpec continuity
L5_errors:   filled -> Failure modes and observability
L6_security: filled -> Candidate validation, digest revalidation, and recovery-only authority
L7_perf:     filled -> Daily bounded auto-update and content-addressed release reuse
L8_deps:     filled -> Host native marketplaces plus first-party bundled skills
L10_terms:   filled -> Package and ownership topology
```

## Verification strategy

Verification combines typed build/tests with adversarial runtime probes and real isolated setup:

- manifest and host-selector contract tests;
- setup/update/doctor/runtime unit and integration tests;
- active/previous payload integrity and audit-failure injection tests;
- hook, adapter, bundled-skill, bundle, workflow, and oracle suites;
- full repository regression;
- temporary-home `setup --codex`, stable launcher/status, and dashboard `/api/health` release match.
