# ADR: Make the live Skill registry the single provenance source

## Status

Accepted for Spec.

## Context

Tenon ships 62 first-party Skill trees and already uses `templates/skill-sources.yaml` for install selection, doctor expectations and bundle aliases. That registry lacks immutable per-Skill hashes. A separate tracked `skills-lock.json` describes only 30 historical third-party sources, has no repository consumer and conflicts with the bytes actually distributed. The existing release payload digest protects a whole release but cannot prove or diagnose individual Skill provenance.

## Decision

Advance `templates/skill-sources.yaml` to a strict schema with explicit source kind/reference, canonical tree hash and immutable coordinate for every distributed Skill. Reuse `buildCanonicalManifest()` for production hashing. Make verification, candidate install/update, doctor and bundle assembly consume the strict model and fail closed on drift. Remove `skills-lock.json` and reject its reintroduction. Supply an explicit atomic authoring command to refresh hashes, while keeping validation independent from generation.

## Consequences

- There is one tracked provenance declaration and zero unconsumed tracked locks.
- Every shipped Skill is independently verifiable and receives an actionable mismatch category.
- Old schema candidates fail clearly instead of receiving synthesized trust data.
- Stored prior releases remain rollback-compatible because each immutable payload retains its own verifier and whole-payload digest.
- Registry and Skill edits must refresh provenance hashes before CI passes.

## Rejected alternatives

- A second generated JSON lock: preserves two apparent truth sources.
- Promoting `skills-lock.json`: models stale third-party inputs rather than the shipped first-party set.
- Whole-release digest only: lacks per-Skill identity, source semantics and diagnosis.
- Permissive fallback for missing hashes or unknown sources: converts unverifiable content into trusted content.
