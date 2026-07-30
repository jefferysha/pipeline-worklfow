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

## `276d2b3e` independent review rollback

The exact `276d2b3e` review found two further Medium state-integrity defects. The dirty
Workbench history guard assumed every `popstate` was Back, so a Forward target could be left in
the URL while the old Workbench remained rendered and confirmation replayed the wrong direction.
Dashboard-created history entries now carry a monotonic position; blocked Back and Forward
traversals are undone by the exact inverse delta and confirmation replays the same original
delta. A real three-entry Forward regression proves cancel and confirm behavior.

The same review found that Workflow action objects accepted illegal extra keys and silently
normalized them, diverging from the kernel compiler. Every action variant now requires the exact
`{type}` key set. The adjacent `tasks-at-least` numeric contract was tightened from any finite
number to the kernel's non-negative integer rule. Focused tests pass 90/90 and the full Dashboard
suite passes 73 files / 1422 tests. The rebuilt production asset is
`index-UJjh5PoS.js` with `index-YeY6VsN7.css`. The `276d2b3e` result is invalidated; a new
exact-candidate review remains mandatory.

## Post-`571997db` independent review rollback

Two independent reviewers examined the complete `origin/main@445aa141..571997db` range and
reported a combined **C0/H2/M3/L0**. The findings were not waived:

- privileged release packaging still checked out and executed candidate-owned npm lifecycle
  code before using write credentials;
- transcript receipts treated successful path access as a full Skill read, so zero-line partial
  readers and destructive redirection could satisfy evidence;
- an annotated tag created just before a crash could not be resumed safely;
- nested Loop, Automation, Secrets and Track surfaces could unmount dirty drafts without passing
  through the top-level Workbench navigation guard;
- Create Change could close during an in-flight POST, hiding a server-side creation and making a
  retry conflict likely.

The Build repair moves every source build, test and payload-packaging step into the read-only
candidate job. The no-checkout writer/release jobs use fixed shell plus `gh`, `jq`, `unzip` and
SHA-256 tools only, inherit no secrets, and validate artifact id/name/digest/run/head provenance
plus a per-asset manifest. Release automation no longer runs `npm publish`; an optional npx
package is a GitHub Release asset only. Existing tags are recursively peeled and accepted only
at the approved commit; partial Releases resume by verifying existing assets and uploading only
missing assets.

Skill evidence now accepts only the deliberately tiny grammar
`cat [--] <one literal trusted SKILL.md>` with safe `&&` or newline batching. Partial readers,
options, redirection, pipes, shell wrappers, command substitution, globbing and ambiguous
sequences fail closed. The focused receipt and Hook suites pass 113/113 after the full-runtime
fixtures were updated from partial `sed` reads to genuine complete reads.

Dashboard internal draft close paths now share one accessible confirmation primitive. Loop and
machine panels, the entire Governance workspace, Track editor cancel/Escape/toggle, and all
child unmounts preserve the draft until explicit discard; creating a Change blocks Cancel,
Escape and backdrop while the POST is in flight. The full Dashboard suite passes 73 files /
1426 tests, including the new child-panel, whole-workspace, machine-card and in-flight request
regressions. Typecheck and the 694-file architecture gate pass; touched page/component files
remain within their enforced size limits.

The first subsequent root run exposed only three stale integration fixtures that still modeled
partial Skill reads; after correction, the affected 113 tests pass. The fresh full root rerun now
passes 327 files / 5806 tests with 14 honest environment skips. Hooks pass 512/512, adapters
272/272, bundle 31/31, migration CAS 13/13, npx install contracts 39/39, docs check/build/smoke,
clean Codex install and the five golden-oracle fixtures (zero differences) also pass. The
production browser matrix, exact committed SHA review and canonical CI remain mandatory.
The current generated Dashboard asset is `index-DVjAM_GF.js`
(`sha256:254e4323…ad8`) with `index-YeY6VsN7.css`; the CLI bundle has been regenerated from the
receipt parser source.

## `8224c75d` final independent review rollback

Three independent reviewers examined the exact candidate across backend/security,
the complete Dashboard, and release/E2E. Their combined result was
**C0/H2/M7/L4**, so the candidate was rejected and no finding was waived.

The backend/release repair pins `@fission-ai/openspec@1.6.0`, runs the complete
strict OpenSpec set in canonical CI and the release candidate, pins checkout and
setup-node actions to immutable commits, and limits transcript process-status
parsing to the host envelope rather than Skill-authored stdout.

The Dashboard repair waits for all Machine facts before declaring no blockers;
adds compact Operations retry and tool-specific empty states; provides keyboard
stage/Skill reorder and cross-stage movement; completes Arrow/Home/End radio
semantics; and makes help/count affordances focusable and named. Loop refresh and
save now rebase per-field revisions, preserving both pre-save unrelated edits and
new edits made while a save is in flight. The Workbench dirty ref is updated in
the input callback and its `beforeunload` listener remains registered, closing the
effect-timing window.

Regression evidence includes root 327 files / 5810 passed / 14 honest skips,
Dashboard 73 files / 1445 tests, Dashboard typecheck, the 698-file architecture
gate, release contracts 23/23, OpenSpec 35/35, and receipt tests 105/105. The
root suite's only failure under concurrent load was the existing 5-second Hook
integration timeout; the Hook file passed 9/9 and the complete root suite then
passed under a 15-second integration limit. This section does not record a Build
PASS yet. Two clean builds are byte-identical at CLI `74bf6154…c366`,
Server `e2327b62…a07`, Dashboard `index-CRNCuoIq.js`
(`64fbca9d…299`) and `index-CLLRnTB_.css` (`1200acad…226`).
The 21-scene browser matrix and a fresh exact-SHA
**C0/H0/M0/L0** review remain mandatory.

## `081f871a` final independent review rollback

The backend/security, complete Dashboard, and release/E2E reviewers independently
examined the exact `origin/main@ef728bf6..081f871a` range. Their results were
respectively **C0/H0/M0/L2**, **C0/H0/M3/L2**, and **C0/H0/M2/L0**. The candidate
was rejected; duplicate findings across tracks were consolidated, but none were
waived.

The CLI completion detector now derives legacy custom-exec status only from a
recognized host header ending at the `Output:` boundary. Skill-authored stdout
containing `Script failed` cannot manufacture a host failure. The OpenSpec command
is now a checked wrapper around the lockfile-pinned executable and forces
`DO_NOT_TRACK=1` plus `OPENSPEC_TELEMETRY=0`; its contract test and all 35 strict
spec/change validations pass.

Loop revisions now represent a real difference from the accepted baseline rather
than historical interaction. Editing back to baseline and convergence with a new
server snapshot both clear the revision, so a later refresh cannot revive a stale
local value. `retired` renders as an explicit terminal state whose ordinary switch
is disabled. The full legal exceed policies (`skip`, `pause`, `halt`, `skip-run`,
`pause-loop`) and future non-empty values all keep an exact selected radio and
single tab stop.

Track and execution-stage help affordances now open a real accessible popover
instead of relying on `title`; stage reorder controls are 32×32 CSS-pixel targets
with focus rings and eight CSS pixels between targets. Focused Dashboard regression
coverage passes 172/172, the full Dashboard suite passes 74 files / 1455 tests,
and the full root suite passes 327 files / 5811 tests with 14 honest environment
skips. Typecheck and the 699-file architecture gate pass, release contracts pass
23/23, receipt tests pass 106/106, and dependency, comment, documentation and
diff gates pass.

Two consecutive production builds are byte-identical at CLI
`fdd1a775…11404`, Server `e2327b62…a07`, Dashboard HTML
`87c92575…e765`, `index-H0tOOdIs.js` (`068c88c6…956d`) and
`index-BpQFUzd2.css` (`035dbdd0…bd93`). This remains pre-freeze evidence: the
new exact commit must still pass three independent zero-finding reviews, the
21-scene production browser matrix and canonical CI before Build can be marked
complete.

## `67af09a7` final independent review rollback

The exact backend/security, Dashboard/design and release/E2E reviews returned
**C0/H0/M0/L1**, **C0/H0/M1/L1** and **C0/H1/M1/L1**. The candidate was rejected
without waivers.

The legacy typed custom-exec ABI now recognizes only the first ordered item as
the host header. A later Skill stdout chunk may itself begin with either
`Script failed` or `Script completed` and contain an `Output:` boundary without
affecting host completion state or stdout extraction. The regression uses the
stronger header-shaped body rather than a plain status-like line.

Loop save now records every edit made while a POST is in flight as a new field
revision, including editing `A → B`, saving `B`, then returning to the former
baseline `A` before the response. The accepted baseline advances to `B` while
the new local `A` survives reload and is emitted by the second exact patch.

The help disclosure no longer claims tooltip semantics. It retains
`aria-expanded`/`aria-controls`, closes on Escape with focus restoration, closes
on outside pointer interaction, and has keyboard regressions. The exceed-policy
selector now includes the kernel's complete canonical closed set
`skip-run | pause-loop | halt-round`; the three historical registry aliases
remain explicitly labeled as compatibility values instead of being confused
with canonical actions.

Focused Dashboard coverage passes 174/174 and receipt coverage passes 106/106;
the full Dashboard suite before the final `halt-round` addition passed 74 files /
1456 tests. Typecheck, the 699-file architecture gate, OpenSpec 35/35, release
contracts 23/23, dependency, documentation, comment and diff gates pass.
Two final builds are byte-identical at CLI `db73f080…caf8`, Server
`e2327b62…a07`, Dashboard HTML `5f6c63ef…12ae`,
`index-CWPY3rze.js` (`9ac1c983…c52f`) and
`index-BpQFUzd2.css` (`035dbdd0…bd93`). Exact committed full-suite, independent
review, browser and CI evidence remain mandatory.

## `cf2c6a5d` final independent review rollback

The backend/security exact-SHA review returned **C0/H0/M0/L1**. Completion-state
validation correctly trusted only the first typed custom-exec chunk, but the
stdout extractor still searched every chunk for a completed-header shape. A
Skill body exactly equal to `Script completed\n…\nOutput:\n` was consequently
counted as a second header and discarded.

The extractor now verifies only `values[0]` as the legacy host header and joins
all later `input_text` chunks as untrusted stdout. Both failed-header-shaped and
completed-header-shaped Skill bodies are preserved byte-for-byte; receipt
coverage passes 107/107. The Dashboard exact suite passes 74 files / 1457 tests.
Two final builds are byte-identical at CLI `00103e57…e795`, Server
`e2327b62…a07`, Dashboard HTML `5f6c63ef…12ae`,
`index-CWPY3rze.js` (`9ac1c983…c52f`) and
`index-BpQFUzd2.css` (`035dbdd0…bd93`). The next commit remains subject to the
complete exact-SHA evidence set.

## `2d842008` final independent review rollback

The exact backend/security, Dashboard/design and release/E2E reviews returned
**C0/H0/M0/L1**, **C0/H0/M1/L2** and **C0/H0/M2/L0**. The candidate was rejected
without waivers.

Custom-exec parsing now chooses the ABI before inspecting stdout: the presence of
exactly one valid `execution_result` selects the typed path, whose later
`input_text` chunks are always returned byte-for-byte. Only the current
non-typed ABI parses one complete result-envelope JSON. Exit-zero and exit-nine
envelope-shaped Skill bodies are covered as raw typed stdout.

Loop pending-save state is now the exact set of fields in the submitted patch.
Unrelated fields edited and returned to baseline do not become protected from a
concurrent server refresh. On either success or failure, revisions whose latest
draft equals the accepted baseline are pruned; deferred failure followed by a
new server snapshot cannot revive a stale local value.

The Machine readiness regression waits for the actual asynchronous terminal
states rather than an always-present container. Stage reorder controls now have
the recorded eight-CSS-pixel gap, and tests assert their 32×32 size, spacing and
focus-ring classes. The shared Loop equality primitive keeps the component under
the enforced 400-line architecture limit. Focused Dashboard tests pass 75/75,
receipt tests pass 109/109, and typecheck plus the 699-file architecture gate
pass. Two builds are byte-identical at CLI `fc904aad…fa1f`, Server
`e2327b62…a07`, Dashboard HTML `79e82ee1…ba57`,
`index-B-F0BGU4.js` (`b2a73c1a…d090`) and
`index-BpQFUzd2.css` (`035dbdd0…bd93`). The next commit remains subject to the
complete exact-SHA evidence set.

## `baa38f3d` final Build freeze

The final candidate is
`baa38f3d1a1707f8571d6ac9c067cb57619c38e2` on top of
`origin/main@ef728bf63f6902251e87fb9495a3dfafe10e42b7`. No finding from any
earlier rollback was waived.

The final remediation closes the remaining typed/current custom-exec ambiguity:
the host header must begin with exactly one recognized completion state and end
exactly at `Output:\n`; typed output requires one terminal `execution_result`
after only raw `input_text` chunks; modern output requires exactly one complete
result envelope; and duplicate required top-level JSON keys fail closed. The
Dashboard Loop save path also protects pending fields from a stale mid-flight
snapshot while allowing unrelated fields to converge. Canonical CI now limits
`OPENAI_API_KEY` detection and injection to a `push` of `refs/heads/main`;
pull-request code always takes an explicit no-secret honest-skip path.

Three independent exact-SHA reviews report **C0/H0/M0/L0** across
backend/security/CLI/OpenSpec, the complete Dashboard/design surface, and
release/E2E/CI. Root verification reached 327 files / 5823 passed / 14 honest
environment skips in the fullest run; a concurrent local rerun reached 5811
passed / 26 honest environment skips when Docker was unavailable. Dashboard
passes 74 files / 1460 tests. Focused CLI/Hook/real-loop coverage passes
139 tests with one honest skip; OpenSpec passes 35/35; release workflow
contracts pass 24/24; architecture covers 699 files; typecheck, dependency
audit/tree, documentation, repository hygiene, comments, bundle, npx package
and legacy bridge gates pass.

Two consecutive builds are byte-identical at CLI
`2a1f8844ed9b95b92bcb9ca771153cc26662ea8171810cd30fb5d479ad858323`,
Server
`e2327b620bb60f087004c12fb55d811609ccaf9bac716676d64949c24cd97a07`,
Dashboard HTML
`4dc720cadd2f1c8240181bd536483285cddd91dceeb71adb31d5c6344d4397f5`,
`index-B51kaJ-7.js`
(`84a634d64fe5a2434aded18b47ea02b6c03b1537480b7b9156b488c2b7e6b953`)
and `index-BpQFUzd2.css`
(`035dbdd066f119a620945eeaea1db37df04f6ca31762dfab18763ca5fb27bd93`).

Production browser acceptance used the persistent project browser and the exact
`index-B51kaJ-7.js` asset. Overview, Progress, Automation, Workbench, Machine,
Host Plan and Projects were captured at 1024, 1440 and 1920 CSS pixels across
Chinese/English, light/dark and reduced-motion settings. All 21 scenes report
zero document overflow, page alerts, console errors or CDP exceptions. Manual
visual inspection of all three Workbench sizes plus Overview, Machine and Host
Plan found no remaining design or accessibility defect. Evidence is stored
under `/tmp/tenon-unified-final-a6ff29bf/`.

This section authorizes the exact Build handoff only. GitHub CI for this SHA,
Verify review acknowledgement, merge reachability, main-branch CI, Ship and
Archive remain mandatory and are not claimed here.

## Latest main integration: PR #27 and PR #28

The prior `baa38f3d` freeze is intentionally invalidated. The unified branch now
contains the final merged `main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`,
including canonical-state compatibility, frozen Workflow-definition status and
the orchestration graph across kernel, server, API decoder and Dashboard.

Conflict resolution preserved both sides of every shared boundary: snapshot
errors retain locale-safe initial and stale-data presentations; future canonical
versions stay readable but non-mutating; compatibility-only projects are not
misclassified as corrupted; Progress remains read-only when required; the
orchestration graph keeps accessible list and visual representations; and dirty
Workbench Back/Forward behavior remains exact.

The integration first exposed four deterministic Dashboard regressions and one
architecture failure. Invalid 2xx snapshot bodies are now classified as invalid
responses without pretending HTTP 200 is an error; initial and stale snapshot
states retain their distinct localized copy; the new technical Workflow label is
explicitly allowlisted; and `ProgressView.tsx` is back within the 600-line route
limit.

Current post-integration evidence is Dashboard 78 files / 1525 passed, root 330
files / 5875 passed with 26 honest environment skips, architecture 717 production
files, strict OpenSpec 38/38, release contracts 24/24, dependency audit/tree,
repository hygiene, comment honesty, typecheck, full build and whitespace checks.
Two consecutive builds are byte-identical at CLI `75faafe2…c0c7`, Server
`a809869f…d1e4`, Dashboard HTML `0020c20e…e6c4`,
`index-BIUkQHZD.js` (`25fc4998…5f56`) and
`index-CTzkdGem.css` (`3651c3a4…f515`).
This is pre-freeze evidence only. The production browser matrix and three
independent exact-SHA C0/H0/M0/L0 reviews must be rerun on the next committed
candidate; no earlier review or browser result is carried forward.

The first exact `5a17a2af` backend/security review then found one Medium
aggregate-snapshot race: `tasks.md` was checked with `lstat` but later reopened
by pathname without a byte limit. The candidate and its browser evidence were
invalidated. The reader now opens with `O_NOFOLLOW | O_NONBLOCK`, verifies the
Change-directory and leaf inode/size/realpath both before and after a bounded
256 KiB fd read, and omits missing, raced, special or oversized inputs. New
regressions replace the leaf with an external symlink exactly before open and
prove oversized input is rejected before the read callback. The focused
snapshot suite passes 43/43; architecture and full build pass. A fresh exact
commit must rerun every review and browser gate.

The release/E2E review also recorded two Low findings, both remediated rather
than deferred. App integration now proves that a future-version sibling does
not block opening a readable Change, requesting its orchestration graph or
rendering the accessible graph card. Heavy Dashboard routes now use
`React.lazy` with a localized Suspense state; vendor boundaries remain
deterministic. The former 1.06 MB single JS artifact is replaced by an initial
290.17 kB chunk plus on-demand route chunks (largest 212.29 kB), with no Vite
500 KiB warning. Dashboard passes 78 files / 1526 tests and snapshot security
passes 45/45. The old candidate remains invalid; exact evidence must follow a
new commit.

## Post-`11902da4` Dashboard design rollback

The complete Dashboard reviewer rejected the next candidate with
**C0/H0/M4/L1**. No finding was deferred:

- Machine readiness now uses three desktop columns, wraps headings safely, and
  replaces five card live regions with one aggregate polite status;
- WorkflowCanvas measures each real scroll container rather than guessing from
  a viewport breakpoint, exposes the hint whenever `scrollWidth > clientWidth`,
  and makes the labelled scroll region keyboard-focusable;
- an unfiltered large orchestration graph keeps the complete matching set in
  its accessible list but progressively renders at most 21 canvas nodes,
  preventing the 142-node graph from becoming a 3,000-pixel edge hairball;
- canonical-version compatibility renders one compact assertive summary,
  keeps refresh visible, shows five issues initially, and places the remaining
  bounded issues in an accessible disclosure.

RED regressions cover the aggregate Machine announcement, true overflow at a
wide viewport, the 100-issue compatibility bound, and a 120-resource
orchestration graph. Focused tests pass 47/47; the complete Dashboard run
passes 78 files / 1530 tests. The fresh root run before the final helper
extraction passes 330 files / 5879 tests with 26 honest environment skips.
Architecture initially rejected the 413-line WorkflowCanvas; overflow
measurement was then extracted into the existing positioning hook module, and
the 717-file architecture gate plus the 85 affected Progress tests pass.

Production acceptance uses `index-CRRTQLIW.js`. The corrected 21-scene matrix
waits 2.6 seconds per route and captures the fixed desktop viewport rather than
misleading tall full-page images. It covers all seven Dashboard views at
1024/1440/1920 CSS pixels, Chinese/English, light/dark, and reduced-motion.
Every scene has the exact requested `innerWidth`, desktop navigation, and zero
page-level horizontal overflow, visible alert, route loading, busy residue,
console error, or CDP exception.
The live seven-stage track is 1624px wide inside a 1046px viewport and exposes
its labelled hint and `tabIndex=0`. Machine English cards are 354px wide with
zero heading/badge overlap and exactly one live region. The real All graph has
142 nodes / 149 edges but renders 21 buttons in a 532px canvas while retaining
the full accessible list. Evidence is under
`/tmp/tenon-unified-final-dashboard-736da232-v2`.

This section is pre-freeze evidence. A new exact committed SHA must still pass
all three independent review tracks; no prior PASS is carried forward.

## `d02587e0` Machine review rollback and remediation

The backend/security track passed the exact candidate, but both the complete
Dashboard review and release/E2E review independently found the same two
Machine defects. The candidate was rejected with no waiver:

- Docker readiness could be `BLOCKED` while its supporting sentence still said
  that Docker was available because the sentence only checked whether the
  images response object existed;
- cross-project risk rows displayed only a root basename, so separate
  `pipeline-worklfow` worktrees had indistinguishable action targets.

New RED regressions reproduce both defects. Docker detail now derives from the
same daemon and image availability facts as the badge. Every project, Change
and Loop risk also carries a bounded final-two-segment root hint such as
`…/f270/pipeline-worklfow`; the full root remains the exact button target but is
not exposed as hover text. The focused Machine suite passes 12/12 and the
complete Dashboard suite passes 78 files / 1532 tests. Root tests pass 330 files
/ 5879 tests with 26 honest environment skips. Architecture scans 717 production
files; strict OpenSpec is 38/38; release contracts are 24/24; identity, comments,
repository hygiene, documentation, typecheck and the full production build pass.

The regenerated Dashboard loads `index-CrqBAgSc.js`; the largest initial chunk
is 291.05 kB and the largest lazy route is 212.29 kB, with no 500 KiB warning.
The persistent project browser captured a fresh viewport-only 21-scene matrix
after a 2.7-second settle per route. All seven views use the exact 1024, 1440 or
1920 CSS-pixel desktop viewport, the requested language/theme/motion setting,
the new asset, desktop navigation, and zero document overflow, route-loading or
busy residue, console error or CDP exception. Progress preserves its expected
source-backed fail-closed precheck alert when the local non-Linux runtime cannot
provide the trusted directory-fd reader; the other views have no visible alert.
Manual inspection confirms that the Docker badge/detail agree and repeated
basenames are distinguished without leaking full paths. Screenshots plus the
bounded machine-readable audit are stored under
`/tmp/tenon-unified-final-dashboard-CrqBAgSc-v3`.

This remains pre-freeze evidence. The remediation must be committed and all
three independent reviewers must return C0/H0/M0/L0 on that exact SHA before
Build can transition.

## `bfa229a7` bounded-identity and accessibility rollback

The next exact review correctly rejected the two-segment hint with
**C0/H0/M1/L1**. A Windows root could bypass `/` splitting and expose the full
path, an unbounded segment could produce unbounded output, two roots with the
same final two segments could still collide, and every risk action retained the
same accessible name.

The replacement processes only a bounded prefix/tail sample, accepts both path
separators, truncates every visible segment, and groups distinct roots by their
bounded suffix. Only a colliding group receives a stable 12-hex identifier; an
identifier collision gets a deterministic local occurrence suffix, so distinct
targets in the same rendered queue remain distinct without revealing the full
root. Visible project titles are independently capped at 48 characters. Each
button now has a localized accessible name containing that bounded title and
root hint.

RED→GREEN coverage includes POSIX roots with the same final two segments, a
long Windows root, output length, non-disclosure of full roots, stable distinct
identifiers, exact navigation targets and distinct accessible button names.
Machine passes 13/13; the complete Dashboard passes 78 files / 1533 tests and
root passes 330 files / 5879 tests with 26 honest skips. Typecheck, the
717-file architecture gate and production build pass.

The regenerated Dashboard loads `index-JA5PIwBX.js`. A new 21-scene matrix
under `/tmp/tenon-unified-final-dashboard-JA5PIwBX-v5` records the exact
viewport, locale, theme and motion preference, new asset, alert text, bounded
root hints and accessible button labels in `audit.json`. All scenes have zero
document overflow, busy/loading residue, mobile navigation, console errors and
CDP exceptions. All 21 live Machine actions have 21 distinct accessible names
in each matrix configuration. The three Progress scenes truthfully retain the
expected non-Linux trusted-reader precheck alert.

This new source, generated distribution, documentation and ledger must be
committed together and reviewed at one exact SHA; `bfa229a7` remains rejected
even though its CI passed.
