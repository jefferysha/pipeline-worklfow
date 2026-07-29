# Trace Timeline review

## Standards, spec, and security review

Independent review covered the complete Build diff against `AGENTS.md`, the selected frontend and
backend rules, the delta spec, the design, and the implementation plan.

Round 1 found no critical/high issues and six medium issues:

1. A partial window with no decodable entry was described as an empty session.
2. A legacy records-only adapter could advertise the new timeline capability.
3. The UI inferred a combined token count when one usage direction was unknown.
4. The client decoder did not enforce the complete bounded timeline invariants.
5. A timeline reader failure could expose a local filesystem path.
6. A records-file symlink could escape the configured trace root.

All six were fixed. The same pass also replaced parse-all-then-slice with a newest-first bounded
record scan, rejected response/session identity drift, and added regression coverage for 1xx HTTP
outcomes. Independent round 2 reported PASS with no remaining critical/high/medium issue.

The repository architecture gate then caught one remaining non-null assertion and a controller
crossing the 400-line hard limit. The assertion was removed and the local Trace GET boundary was
extracted to `serverGetTraceRoutes.ts`; the architecture gate passed on the revised tree.

## Frontend design review

The first real-page review found that `AdvancedPanel` was implemented but no longer mounted by the
current Dashboard shell. The panel is now a collapsed local-diagnostics section on the Machine page.
A 390 px review then found the adjacent runtime placeholder causing horizontal overflow; it now
stacks at the mobile breakpoint. Re-review measured `scrollWidth === innerWidth === 390`.

The timeline retains the existing Dashboard type, spacing, color, and control vocabulary. Outcome
is encoded with text plus color, native buttons preserve keyboard behavior, and no animation was
introduced.

## Browser acceptance

Environment:

- Production Dashboard build served by the real Tenon server at `http://127.0.0.1:19876`.
- Isolated `TENON_RUNTIME_HOME` and `TENON_TAP_DIR` under a disposable `/tmp/tenon-trace-qa.*`
  directory; no user capture store was read or changed.
- Page title and target identity: `Tenon Dashboard`, Machine page, Advanced / debug tools.

Observed:

- Success: selected a real three-record local session and saw ordered 200 success, 429 HTTP error,
  and unknown-status entries with actual usage and stream-event metadata.
- Filtering/keyboard: focused the Error filter and activated it with Enter; only the 429 entry
  remained. Escape closed the timeline and restored focus to the selected session button.
- Loading: delayed one real timeline request in the browser by 800 ms; the loading status was
  visible before the same request completed with three entries.
- Empty: a known zero-record session rendered the explicit session-empty state.
- Partial: a malformed append-only line rendered partial integrity, the stable
  `malformed-record` diagnostic, and “session is not empty” instead of the empty copy.
- Error: a records symlink was rejected by the real store; the API returned the generic 500 and the
  Dashboard showed the retryable timeline error. The expected failed fetch was the only console
  error observed during this scenario.
- Privacy: query, authorization, and prompt sentinels were absent from both the API projection and
  rendered page.
- Responsive/i18n: English at 390 × 844 rendered without horizontal overflow.

Screenshots:

- `docs/ux/shots/trace-timeline/success.png`
- `docs/ux/shots/trace-timeline/partial.png`
- `docs/ux/shots/trace-timeline/error.png`
- `docs/ux/shots/trace-timeline/mobile-en.png`

## Verify-fail repair round

The first frozen Verify round correctly failed two hard boundaries:

1. OpenSpec strict validation rejected six Requirements whose uppercase SHALL appeared only in the
   heading. The Change returned through `verify-fail → build → requirements-changed → spec`; the
   body statements now contain SHALL and strict validation passes without changing requirement
   semantics.
2. The Codex source track reproduced an absolute-form request target containing authority and
   userinfo. Query stripping alone retained that upstream URL. A red test now proves the leak;
   the projector normalizes absolute-form and scheme-relative targets to pathname only and the
   test passes.

The same repair round added the timeline route to the common DNS-rebinding Host-guard regression
matrix and localized visible session status, English singular record count, cached input, and
stream-event labels. Focused backend and Dashboard tests plus `typecheck:web` pass on the repaired
tree. A full build and independent re-review are required before the next freeze.

### Repair re-review

- Independent full-diff review: PASS, with no Critical, High, Medium, or Low findings. The reviewer
  reproduced strict OpenSpec validation, verified absolute-form and scheme-relative request targets
  project to pathname only, and reran backend, Web, typecheck, architecture, and comment gates.
- Isolated real-browser review: PASS on the Tenon Dashboard. It reconfirmed success, loading, known
  empty, partial, real 500 then retry, Enter/Space/Escape, and 390 px Chinese/English paths.
- The browser re-review confirmed English `1 record`, localized session states, Chinese cached-input
  and stream-event labels, no sensitive query rendering, no horizontal overflow, and no unexpected
  page errors.
- Isolated browser evidence: `/tmp/tenon-trace-final-browser-e8PPXh/qa-output/`.

## Focus-visible repair round

- A red component test first proved that the session and outcome-filter buttons did not expose the
  shared `focus-visible` ring contract. The implementation now gives every session, filter, retry,
  and clear button the same accent border plus 3 px ring; the focused test passes 9/9 and the full
  Web suite passes 1068/1068.
- Independent full-diff re-review: PASS, with Critical/High/Medium/Low all 0. The reviewer also
  checked the rebuilt Web bundle, architecture, comments, OpenSpec strict validation, and diff
  hygiene.
- Isolated Chromium re-verification: PASS. Tabbing to the unselected Errors filter produced
  `:focus-visible=true`, `border-color=rgb(37, 99, 235)`, and a 3 px
  `rgba(37, 99, 235, 0.12)` ring. Enter, Space, Escape, partial, empty, and 390 px responsive paths
  remained correct, with no page errors or console errors.
- Browser evidence was produced in the disposable copy
  `/tmp/tenon-trace-focus-reverify-KdUgRI/qa-output/`; the real repository was not modified by the
  reviewer.
