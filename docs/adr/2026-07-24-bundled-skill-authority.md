# ADR: Selected release bundle is the first trust tier

## Context

Production lookup currently places the selected plugin bundle and all
runner-native/global roots in one ambiguity set. A legitimate global update can
therefore stop a previously valid immutable release.

## Decision

Production locators resolve bare ids in ordered trust tiers. The selected
release bundle is queried alone first. Only a true not-found result permits
runner-native external lookup; only its not-found result permits an allowed
compatibility tier. Every non-not-found error fails closed.

## Alternatives

- Flat ambiguity across all roots: rejected because global state can veto the
  selected release contract.
- First-path wins: rejected because it silently masks divergent external
  sources and damaged candidates.
- Namespace every bundled id: rejected as a broad manifest/API migration when
  physical release identity already establishes ownership.

## Consequences

AFK execution is reproducible for bundled profiles. External duplicates remain
strictly checked within their trust tier, and existing runner isolation remains
unchanged. The runner-aware and compatibility production adapters must share
the same tier semantics and tests.
