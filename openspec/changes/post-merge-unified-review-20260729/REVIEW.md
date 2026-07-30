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
- Release packaging is reachable only after a read-only pre-tag candidate proves an exact
  current `main` SHA before and after the full gate and publishes bounded approval evidence.
  A default-branch-owned `workflow_run` writer re-proves the trusted workflow/run/artifact
  identities before creating the tag. Static anti-bypass tests keep CI, candidate, writer,
  and packaging on that contract.
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

Verify attempt 2 correctly found three release High findings and three Dashboard/release
Medium findings. The third Build now proves canonical push CI for the exact candidate SHA,
keeps the full pre-tag job read-only without persisted checkout credentials, creates the
annotated tag in a separate no-checkout writer job, and binds reusable packaging to the
approved peeled commit SHA. Automation tool and retry dialogs now reuse the shared focus
system; the 390px action navigation wraps without clipping; and built-in Track tooltip labels
use the active locale. RED→GREEN coverage was added for every finding.

Real Chrome Build acceptance on the new production assets confirms the 390px English action
navigation is entirely within the viewport with a visible keyboard focus ring. Both Automation
dialogs pass initial focus, Shift+Tab containment, Escape close, and exact trigger focus
restoration; console/page errors are zero. The complete production browser matrix remains a
Verify-phase gate and is not claimed by this pre-Verify review.

The independent pre-Verify reviewer then caught one High freshness defect: an incremental
Dashboard build had retained an unused Tailwind utility, so the committed dist would have
failed the clean release build. A clean `npm ci` regeneration removed the stale rule. Two
consecutive full builds now produce byte-identical HTML/JS/CSS, and an isolated clean build
matches the candidate asset hashes exactly.

## Code review result

- Critical: 0
- High: 0
- Medium: 0
- Low: 0 in the remediated code review; production-browser recheck remains required.
- Result: PASS for Build handoff only after clean-asset regeneration, subject to the new frozen
  SHA passing every Verify track.

Detailed evidence:
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-pre-verify.md` and
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-verify-attempt-1.md` and
`docs/superpowers/reports/2026-07-29-post-merge-unified-review-verify-attempt-2.md`.

## Final merged-main scope

The final Build scope is `main@445aa141` after PR #8, #9, #11–#19 and every other open
non-Draft main PR were merged. The prior frozen SHA is invalidated by design and is not
used as release evidence.

The final pass also closes cross-root and stale-async defects across Workbench, Loops,
Machine, Progress/Create Change, AFK and Operations; centralizes locale-aware transport
classification; and adds complete runtime decoding for Workflow and Skill registry success
payloads. The architecture gate required five UI modules to be split by stable business
sections and rejected a double assertion in the decoder. Those findings were fixed, targeted
regressions pass, and the independent pre-Verify reviewer reports C0/H0/M0.

Clean installation, two byte-identical full builds, root 327/5729 tests with 26 honest
environment skips, Dashboard 69/1263 tests, OpenSpec 32/32 strict, hooks 512/512,
adapters 272/272, bundle 31/31, migration CAS 13/13, documentation build/smoke and the
five-fixture oracle are green. Exact-SHA isolated review, E2E/API, visual browser acceptance
and canonical GitHub CI remain Verify gates.

## Attempt 4 remediation

Verify attempt 4 correctly failed at C0/H0/M7/L2. The Build remediation now closes the empty
custom-Workflow state, canonical guard/action variants, Workbench operation identity, mandatory
and delete runtime decoding, pending-locale callbacks, product ARIA/i18n, and the 390px English
navigation label. Every finding received a deterministic RED before implementation.

Independent review then found four additional Medium issues: collision with a legal
`__workflow_empty__` step id, hard-coded Step Policy ARIA, permissive Workflow-delete error
decoding, and cross-cell mandatory operation identity. A second review found that HTTP 200
delete responses were not validated. The implementation now uses `null` as the only empty
Workflow discriminator, localizes every Step Policy accessible name, isolates mandatory state by
exact root+cell+token, and decodes Workflow delete responses as a closed success/error union.
Only the exact `{ok:true}` success envelope mutates local Workflow state; malformed JSON,
`{}`, and `{ok:false}` remain in place and surface the active-locale invalid-response message.

The Workbench page remains under the 600-line architecture limit by keeping definition-editing
pure functions in `workbenchDefinition.ts`. Targeted Workbench 96/96, Dashboard typecheck,
architecture, and whitespace checks pass. The final independent reviewer examined the complete
dirty diff and tracked distribution bundle and reports **C0/H0/M0/L0, PASS**. The final
`test:all` run reports root 327 files / 5729 passed / 26 honest environment skips and Dashboard
69 files / 1287 passed. Two consecutive full builds produced the same `index-CCGhygZp.js` and
`index-Bi3InOKq.css`; the old asset is absent and unreferenced. This Build review authorizes
freezing a new exact SHA; Verify must still rerun every track on that SHA.

## Attempt 6 final merged-main candidate

The review scope now includes the merged `main@ef728bf6`, including PR #21 and PR #23, plus
all unified remediation on this branch. The earlier `main@445aa141` evidence remains useful
history but is not treated as evidence for this candidate.

The sixth Build pass closes the remaining cross-entity operation identity, authoritative Track
DTO reconciliation, Operations decision-token, AFK normalized-settings, and Workbench dirty
navigation defects. It also removes every recorded design Low across the full desktop Dashboard.
The final independent review then identified two additional Medium findings: a malformed
review-handshake SSE frame could leave stale live state, and cancelling browser Back from a dirty
Workbench route could corrupt the history stack. Both now have deterministic regressions and
fail closed. A final browser interaction check also found and fixed an empty new-Track identity
whose Save action had remained enabled.

The final source-built Dashboard uses `index-viHDz-8x.js` and `index-YeY6VsN7.css`. Root tests
pass 327 files / 5783 tests with 14 environment skips; Dashboard tests pass 73 files / 1388
tests. Production browser acceptance covers Overview, Projects, Progress, AFK, Workbench,
Machine, and Host Plan at 1024, 1440, and 1920 px, across English/Chinese, light/dark, and
reduced-motion settings. All 21 screenshots have zero console/page-error, overflow, visibility,
or layout failures. AFK, Track Settings, and Governance interaction checks also pass, including
focus restoration and empty-Track Save remaining disabled.

The complete exact-candidate independent review is the remaining Build freeze gate. Its result
must be appended here before `pre_verify_review_result=pass` and the Build→Verify transition.

The exact `07c712fd` review then correctly returned two additional Medium findings. A browser
history target could remain on the Workbench view while changing project root and bypass the
dirty-draft guard; the Workflow guard decoder could also accept illegal variant fields and
silently normalize them away. The navigation guard now treats any root change as leaving the
dirty Workbench, with a real two-root history regression. All nine Workflow guard variants now
enforce their exact top-level data-key set, and nested `when` and `file-exists.path` objects are
also exact. The concrete `{type:"nonempty-output",n:2}` corruption is rejected.

After this rollback, focused tests pass 214/214 and the full Dashboard suite passes 73 files /
1417 tests. The rebuilt assets are `index-BDpnC0x_.js` and `index-YeY6VsN7.css`; the repeated
21-scene production browser matrix and AFK/Track/Governance interaction acceptance both report
zero failures. A new exact-candidate independent review is still required; no earlier PASS is
carried forward.

The exact `daae7045` review then found one further Medium availability defect in the Codex
Skill receipt fallback: any unrelated stale zero-byte transcript caused the complete discovery
tree to fail closed forever. Discovery now records empty-file mtimes and skips an empty
transcript only when a strictly newer readable transcript makes recency unambiguous. A newer or
equal-time empty transcript, and a tree containing only empty transcripts, still fail closed;
the exact-transcript path continues to reject empty files. The focused regression set passes
4/4, the complete receipt suite passes 82/82, and the CLI TypeScript build passes. The
`daae7045` review result is invalidated; the next committed candidate must receive a fresh
C0/H0/M0/L0 review.

## `0591006f` independent review rollback

The exact `0591006f` review reported two High and one Medium findings. The manual release
candidate could otherwise execute a branch-owned workflow with writer reachability; the
tracked CLI bundle did not contain the transcript fallback fix; and Prompt Routing Bypass
edits were absent from the Workbench dirty-navigation aggregate.

The candidate workflow is now strictly read-only and can only emit a one-day approval
artifact after proving that both the dispatch and workflow definition are the exact current
`main` commit. Tag creation moved to a default-branch-owned `workflow_run` writer that
fail-closes on repository, head repository, canonical workflow id/path, event, conclusion,
head branch/SHA, REST run metadata, artifact run/ref/SHA, and current-main drift. All release
stages also require a complete stable v-prefixed SemVer.

The CLI bundle was regenerated from the reviewed TypeScript. Prompt Routing Bypass now reports
effective draft state against its server baseline into the unified Workbench dirty guard,
clears only on a matching revert or successful save, and protects both in-app navigation and
`beforeunload`. Release workflow contracts pass 8/8; related Dashboard tests pass 183/183;
receipt tests pass 82/82; CLI and Dashboard typechecks pass. These fixes invalidate the
`0591006f` review result. A fresh full review of the new committed candidate remains required.
