# Unified pre-Verify review

## Scope

This review covers the final merged-main baseline and every change in
`post-merge-unified-review-20260729`: Dashboard behavior and visual quality,
frontend boundaries, backend/shared-contract compatibility, repository architecture,
dependency security, CI/release policy, documentation, and generated assets.

## Spec and architecture

- The implementation matches both capability deltas. Default-workflow labels are localized;
  custom workflow/user/technical values are not rewritten.
- Governance confirmation lifetime is keyed by decision facts rather than transport object
  identity. Equivalent refreshes preserve the pending decision; material facts close it.
- Track Settings uses the repository Dialog primitive instead of a new modal/focus system.
- The dependency update is atomic across manifests, lockfile, resolved tree, CI, release, and
  documentation. No public API, DTO, state file, or compatibility boundary changed.
- Release packaging is now callable only from a pre-tag candidate workflow that proves an exact
  current `main` SHA before and after the full gate, then creates the tag. Three static
  anti-bypass tests keep CI, candidate, and packaging on that contract.
- Architecture, comment-honesty, repository-hygiene, documentation, identity, and freshness
  checks are part of the frozen-baseline gate.

## Security

- No dynamic shell construction, path-trust expansion, secret handling, authorization bypass,
  root-scope widening, or raw server-error disclosure was introduced.
- AJV/Vite/Vitest and the VitePress Vite override resolve to the reviewed patched versions.
  The canonical dependency gate combines `npm audit --audit-level=high` with `npm ls --all`
  and blocks CI, candidate, and release packaging.
- The UI-only `/api/config` failure injection proved localized failure handling without exposing
  the injected server message or disabling the rest of Workbench.

## Dashboard design and accessibility

The original pre-Verify pass fixed mixed-language product copy, Track Settings focus behavior,
mobile Hook-title truncation, built-in track/Dialog labels, and the Governance row-identity
lifecycle defect.

Verify attempt 1 then correctly failed with additional findings: review-gate/Hook/Policy,
Projects, and Automation localization gaps; workflow-menu keyboard semantics; dark-theme
button contrast; missing config retry; and incomplete dependency/release/OpenSpec gates.
Build remediation now has RED→GREEN regression coverage for every finding, including the
populated Automation view and release anti-bypass contract. The complete second production
browser matrix remains a Verify-phase gate and is not claimed by this pre-Verify review.

## Code review result

- Critical: 0
- High: 0
- Medium: 0
- Low: 0 in the remediated code review; production-browser recheck remains required.
- Result: PASS for Build handoff only, subject to the new frozen SHA passing every Verify track.

Detailed evidence:
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-pre-verify.md` and
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-verify-attempt-1.md`.
