# PR #8 Build review

## Scope

This review covers the merged PR #8 source against current `main`, including the
CLI contract, local Dashboard server, Host Plan UI, generated distributions,
English and Chinese copy, and the real production Dashboard.

The Dashboard review used `frontend-design`, `web-design-guidelines`, and
`design-taste-frontend`; it was not treated as a backend-only change.

## Findings and fixes

### Round 1 — selected-card layout reflow

- Severity: Medium.
- Evidence: selecting a host expanded that card across the two-column catalog,
  moving every later card and making comparison difficult.
- Fix: use a stable master-detail workspace. The target catalog remains in its
  own bounded column and the selected plan appears in a separate sticky detail
  column.
- Regression: component tests assert the stable workspace and selected target
  detail.

### Round 2 — mobile detail was below the complete catalog

- Severity: Medium.
- Evidence: at 390 px, selecting a host left the detail after all twelve target
  cards, so the result was not visible at the interaction point.
- Fix: order the detail before the catalog below 769 px and scroll the selected
  detail into view while preserving desktop position.
- Regression: component tests assert responsive ordering and the mobile
  selection scroll path.

### Round 3 — production asset transfer was unnecessarily large

- Severity: Medium.
- Evidence: the production server transferred the 851,010-byte JavaScript asset
  without content encoding.
- Fix: negotiate gzip for compressible immutable assets, emit
  `Vary: Accept-Encoding`, honor `gzip;q=0`, and cache the bounded set of
  generated asset encodings.
- Regression: real `node:http` tests cover gzip and identity responses. The
  final production transfer is 259,260 bytes for the same JavaScript asset.

### Round 4 — Dashboard tests emitted asynchronous-render warnings

- Severity: Medium.
- Evidence: App/Workbench, SkillChain, AFK log polling, and empty TaskDetail
  animation paths left React `act` or GSAP empty-target warnings even though the
  assertions passed.
- Fix: drive asynchronous interactions and microtask settlement inside `act`,
  keep unrelated registry requests pending in projection-only tests, and skip
  animation dispatch when the scoped stage list is empty.
- Regression: all 1,094 Dashboard tests pass with no React or GSAP warnings.

### Round 5 — adapter command was not safe to paste

- Severity: High.
- Evidence: adapter previews used the literal shell metacharacters
  `<project>`. Pasting the displayed command could be interpreted as input
  redirection instead of a placeholder.
- Fix: adapter plans now use `--target .` and explicitly state that the command
  targets the current project directory. CLI, server decoder, Dashboard copy,
  tests, and user documentation use the same contract.
- Regression: the complete 12-host by 2-operation truth table is covered, and
  every adapter plan returned by the production API uses `--target .`.

## Final visual and interaction matrix

- 1440 px and 1024 px desktop: light and dark theme; stable master-detail
  layout; no horizontal overflow.
- 769 px boundary: two columns remain usable without overflow.
- 768 px and 390 px: single-column layout; detail is reachable at selection;
  no horizontal overflow.
- Chinese and English copy: host, operation, steps, notices, loading, empty,
  error, retry, and copy feedback remain readable.
- Keyboard: visible focus ring, Enter activation, native button semantics, and
  copy action verified.
- Reduced motion: the Host Plan introduces no required animation; existing
  shell motion-reduction behavior remains intact.
- Production console: zero errors and zero warnings.

## Final disposition

Critical: 0. High: 0. Medium: 0. All findings discovered in this review were
fixed and rechecked. The Vite informational warning refers to the uncompressed
aggregate chunk; the production server now transfers the immutable JavaScript
asset as a 259,260-byte gzip response and the real browser path was accepted.
