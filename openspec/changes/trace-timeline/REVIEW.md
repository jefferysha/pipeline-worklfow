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
