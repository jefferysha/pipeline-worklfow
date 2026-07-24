# Bundled Skill Authority Design

## Outcome and constraints

An AFK execution profile belongs to one selected pipeline-lite release. Skills
that release bundles are part of the same immutable runtime contract; a
machine-global skill with the same bare id must not redefine or veto it.
External skills remain discoverable only when the requested id is absent from
the selected bundle.

## Options

1. Keep one flat ambiguity set. This detects every duplicate but makes the
   selected release non-deterministic across user machines. Rejected.
2. Prefer the first root without validation. This hides ambiguity and access
   failures. Rejected.
3. Use explicit trust tiers and only descend on not-found. Selected.

## Ownership and state machine

```text
requested id
  -> selected release bundle
       found       -> materialize that exact content
       not found   -> runner-native external tier
       other error -> fail closed
  -> external tier
       one/equal candidates -> materialize
       divergent candidates -> fail ambiguous
       not found             -> allowed compatibility tier
```

The low-level filesystem locator stays source-neutral: it still hashes all
candidates in the roots it receives and rejects divergent content. Production
adapters own trust-tier composition.

## Red-team assumptions

- A corrupt bundled candidate is not absence and must not fall through.
- Codex must not enumerate or read Claude-private roots.
- Namespaced plugin skills keep namespace-local ambiguity checking.
- No caller may depend on implicit array order for two candidates in one tier.

## Acceptance

- Unit tests prove bundle authority with divergent global content.
- Existing external ambiguity and access-error tests still pass.
- Real PM AFK wiring advances past the previously observed `brainstorming`
  collision.

```coverage
touches:
L1_api:      waived -> no public API shape change
L2_data:     waived -> no persistence schema change
L3_rules:    filled -> #outcome-and-constraints
L4_state:    filled -> #ownership-and-state-machine
L5_errors:   filled -> #red-team-assumptions
L6_security: filled -> #red-team-assumptions
L7_perf:     waived -> one additional bounded lookup
L8_deps:     filled -> #ownership-and-state-machine
L10_terms:   filled -> #ownership-and-state-machine
```
