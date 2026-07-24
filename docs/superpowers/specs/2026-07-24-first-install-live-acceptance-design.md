# First-install Live Acceptance Design

## Outcome and constraints

A dashboard started before the first `pipeline init` must accept the newly registered project immediately, while preserving the existing fail-closed inode boundary. No arbitrary request path may become trusted, and an anchored root may never be rebound after replacement.

## Decision

The machine project registry remains the only nomination boundary. `workflowRootForRequest` normalizes the requested root, proves current registration, and either validates the retained descriptor/inode anchor or captures it once when no anchor exists. Capture reuses the existing non-symlink, real-directory, fd/realpath identity checks. Any later rename, replacement, or symlink swap is rejected.

The alternatives were restarting the dashboard after every registration, trusting path strings, or continuously re-anchoring. Restarting breaks first-run continuity; path trust weakens the security model; re-anchoring turns a safe first observation into a path-swap vulnerability. One-time lazy capture is the smallest design that preserves both UX and security.

## State and failure model

```text
unregistered -> reject 404
registered + unanchored -> validate filesystem -> capture once -> anchored
anchored + same inode -> allow
anchored + changed identity -> reject 403 (never re-anchor)
registered + unsafe/inaccessible -> reject 403 (remain unanchored)
```

## Verification

The integration test starts the server with an empty registry, registers a project through the same kernel primitive used by CLI initialization, then calls workflow/track endpoints without a restart. Existing path-replacement tests prove that the successful first capture cannot become a later rebind. The isolated first-install journey also verifies UI creation and the 18765 global dashboard.

```coverage
touches: filesystem-trust
L1_api:      filled -> #state-and-failure-model
L2_data:     filled -> machine registry plus retained inode anchor
L3_rules:    filled -> #decision
L4_state:    filled -> #state-and-failure-model
L5_errors:   filled -> 404 unregistered; 403 unsafe or changed identity
L6_security: filled -> #decision
L7_perf:     waived -> one stat/open sequence only on first use
L8_deps:     waived -> no new dependency
L10_terms:   filled -> #outcome-and-constraints
```
