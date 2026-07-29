# Dashboard Trace Session Workspace Review

## Scope

Review target: the desktop-only Machine → Advanced → Traffic session workspace at
1024–1920px. The review used the `frontend-design`, `design-taste-frontend`, and
`web-design-guidelines` criteria together with the accepted delta spec.

## Round 1

- **Medium — component boundary:** the first implementation left
  `TrafficPanel.tsx` above the repository's 400-line production-file limit.
  Session rail, status badge, and compact timeline-row presentation were
  extracted to `TrafficPanelParts.tsx`; the architecture check then passed.
- **Medium — session identity ambiguity:** client name alone did not distinguish
  concurrent sessions from the same client. The rail now shows a short stable ID
  and exposes the full ID as the button title; the detail header keeps the full
  ID, proxy mode, status, start, and update time visible.
- **Medium — accidental data loading:** a persistent detail surface could have
  encouraged auto-selecting the first session. The final implementation keeps an
  explicit unselected placeholder and issues no timeline request until the user
  selects a session.

## Round 2

Real-browser review covered 1024, 1200, 1440, and 1920px in dark mode and 1440px
in light mode. The session rail remains bounded, the detail column retains its
reading order, the 1024px summary uses a 2×2 grid, and the 1280px breakpoint
expands it to one row. Focus rings, selected state, failure color, and metadata
hierarchy remain legible in both themes.

No Critical, High, or Medium findings remain.

## Round 3

The first frozen-baseline Verify found two Medium issues. The delta spec declared
the new desktop workspace as a modified requirement and renamed two pre-existing
interaction scenarios, so an isolated OpenSpec archive could not apply it. The
revised delta now uses `ADDED Requirements` for the workspace, preserves the
canonical scenario names under `MODIFIED Requirements`, and archives cleanly in
an isolated copy (`+1 added`, `~1 modified`).

The reviewer also demonstrated that a long proxy plus legal maximum-length
model and transport metadata could expand flex and grid tracks. A red regression
test now covers a 64-character proxy stress sample and the decoder's 256/64
model/transport limits. Rail/detail proxy labels and timeline metadata use
bounded tracks, `min-width: 0`, truncation, and accessible full-value titles.

A production-build browser fixture then exercised that 64/256/64 stress set at
1024×768, 1200×870, 1440×900, and 1920×1080. At every width the document,
body, and workspace `scrollWidth` matched `clientWidth`; the long labels stayed
inside their rail/detail/timeline bounds while their titles retained all
64/256/64 characters. Escape cleared the detail and restored focus to the
selected session button. The browser loaded `index-zYwgShkc.js` and
`index-Cgeu0Ldh.css` with no console warnings or errors.

No Critical, High, or Medium findings remain after the correction.

## Round 4

The second frozen-baseline Verify found that the committed dist still contained
the pre-correction desktop grid rule even though the source no longer did.
Build now regenerates dist only after all source and review fixes, then compares
its file hashes with a second clean build before freezing.

Codex also identified shared presentation changes below the accepted 1024px
boundary. The rail header, session identity rows, persistent detail placeholder,
2×2 desktop summary, and divided timeline container are now activated only at
`min-width: 1024px`. Below that breakpoint the existing compact session rows,
conditional timeline surface, four-column `sm` summary, and card timeline remain
the baseline presentation; no phone design or browser acceptance was added.
Desktop loading, unavailable, and empty detail placeholders now explain why
selection is not currently possible.

The regenerated production build was accepted again in the real desktop browser
at 1024, 1200, 1440, and 1920px. The document and body had no horizontal
overflow at any width; the detail summary rendered two columns at 1024/1200 and
four at 1440/1920. The 64-character proxy, 256-character model, and 64-character
transport retained their complete accessible titles while rendering with
bounded ellipsis tracks. Escape cleared the selection and returned focus to the
same session button, with no console warnings or errors.

The root cause of non-reproducible CSS was Tailwind v4's default current-working-
directory source discovery: untracked pipeline review files changed the utility
set. `index.css` now explicitly limits discovery to Dashboard `src`, backed by a
design-system regression assertion. A source-only archive build and the working
tree build now produce byte-identical `index-u6qL8tRF.js`,
`index-GZnjfiST.css`, and `index.html` with aggregate SHA-256
`c7e41f6e14bab57c61c7cd2fbf863f786d0d4028fd51973b3a58abe8b9a6ed04`.

No Critical, High, or Medium findings remain after the second correction.

## Round 5

The third frozen-baseline reviewer reproduced the repository-hygiene CI gate and
found that all twelve committed JPEG acceptance screenshots were outside the
only image allowlist accepted by `tools/check-repository-hygiene.mjs`. One image
also reflected the pre-correction unavailable-state copy. The screenshots were
therefore removed from the repository instead of being treated as release
assets. Current desktop browser evidence remains reproducible and external to
the repository under `/tmp/trace-e2e-v3-d788/` and `/tmp/traffic-v3-*`, as
required by the Build→Verify frozen-worktree contract.

`npm run check:repository-hygiene` now passes all seven policy tests and the
repository scan. This correction changes only evidence storage; the accepted
desktop UI, interaction, data, and OpenSpec contracts remain unchanged.

No Critical, High, or Medium design findings remain.
