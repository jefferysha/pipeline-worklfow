# Build Review

## Scope

Reviewed the complete Build diff against the delta spec, frozen workflow contract, server snapshot
boundary, Dashboard decoder, Progress Drawer interaction, and generated production bundles.

## Findings and resolutions

1. **P1 correctness — fixed:** the first production-browser load exposed that a new Server emits
   `{ status: "not-requested" }` on non-review steps, while the Dashboard decoder incorrectly
   required every present handshake object to belong to a review step. The decoder now accepts the
   exact-key `not-requested` branch independently and retains review-step/event validation for
   `pending` and `approved`. A regression test covers the Build-step response.
2. **P2 maintainability — fixed:** adding the receipt projector pushed
   `packages/server/src/snapshot.ts` beyond the backend 400-line controller limit. The pure,
   dependency-free projection was extracted to `reviewHandshake.ts`; the architecture gate now
   passes.
3. **Security review — no open finding:** the DTO exposes only status, exact event, and canonical
   timestamps. It does not expose host session identity, delegated authority, markers, tokens,
   prompts, or local paths. Partial, phase-drifted, unknown-status, and unreachable-event receipts
   fail loudly through the existing project error boundary.
4. **Compatibility review — no open finding:** the protocol remains `tenon-snapshot/v2`; the Server
   always emits the additive field, while the Dashboard accepts an absent field only for an older
   runtime and strictly validates it whenever present.
5. **Interaction review — no open finding:** the card is read-only, adds no fetch or Tab stop, and
   leaves all existing transition actions, focus trapping, Escape handling, error rollback, and
   readiness rendering unchanged.
6. **Verify-cycle MEDIUM copy finding — fixed:** `not-requested` and `approved` now state only
   receipt facts. Both locales explicitly say that transition readiness remains subject to server
   guards, so a receipt cannot be mistaken for satisfied evidence.
7. **Verify-cycle MEDIUM optimistic-state finding — fixed:** a phase-changing optimistic patch
   projects `reviewHandshake: { status: "not-requested" }` only when the source runtime exposed the
   capability; an old runtime keeps the field absent and therefore remains unavailable. Two
   review→review regressions prove that an `explore-complete` receipt is never shown under Spec and
   that capability absence is never synthesized into a receipt fact while the request is in flight.
8. **Verify-cycle MEDIUM contrast finding — fixed:** 12px detail and definition labels no longer
   reduce the semantic status color with opacity. The light-theme amber/green foregrounds retain
   their measured full-strength 5.84:1 and 4.60:1 contrast.
9. **OpenSpec strict-validation finding — fixed through Spec:** all Requirement bodies now contain
   literal `MUST`, and the three-state scenario forbids readiness claims. The revised digest passed
   `openspec validate review-handshake-status-20260730 --strict` before returning to Build.

## Re-review

Targeted Server and Dashboard tests, full Dashboard tests/typecheck/build, the repository
architecture/comment/hygiene/identity/default-workflow checks, hook suite, full workspace tests, and
the dual-run oracle all passed before the first frozen baseline. The Verify findings then followed
a red→green regression cycle: the focused Dashboard suite first failed 3 assertions for the
missing copy, contrast, and review→review behavior, then passed 67/67 after the smallest fixes.
The full Build matrix and production-browser re-review are rerun below before freezing the next
baseline; no first-cycle result is reused as a second-cycle pass.

Final Build re-review passed with no Critical/High/Medium findings. The reviewer verified the
complete candidate, including the old-runtime capability-absence regression and generated
`index-B5a0THKJ.js`. The browser reviewer measured 5.84:1 amber and 4.60:1 green contrast at full
opacity on the production bundle, confirmed receipt-only Chinese/English copy, and passed
1024×768, 1440×900, 1920×1080 plus Enter/Escape/focus-return acceptance. Final machine evidence:
Dashboard 69 files / 1,215 tests, workspace 327 files / 5,743 passed / 14 honest skips, hooks 512,
strict OpenSpec validation, build/typecheck, architecture/comment/hygiene/identity/default-workflow
checks, and oracle with zero mismatches.
