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

## Re-review

Targeted Server and Dashboard tests, full Dashboard tests/typecheck/build, the repository
architecture/comment/hygiene/identity/default-workflow checks, hook suite, full workspace tests, and
the dual-run oracle all passed after the fixes. The current non-review Build phase correctly hides
the card in the production Dashboard; exact review-state visual and SSE acceptance proceeds in
Verify against the frozen baseline.
