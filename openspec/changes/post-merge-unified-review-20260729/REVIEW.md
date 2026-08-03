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

## `e80502b7` Unicode-boundary rollback

Backend/security and Dashboard design returned zero findings, and exact GitHub
CI passed, but release/E2E correctly found one remaining Low: the bounded path
window and segment truncation still used UTF-16 code-unit slices. A non-BMP
character exactly at a cut boundary could therefore leave a lone surrogate in
the visible hint and accessible name. The candidate was rejected.

The replacement keeps the fixed 256-code-unit work bound, removes a leading low
surrogate if the tail window starts inside a pair, and converts only that
already-bounded segment to Unicode code points before display truncation. An
emoji-boundary regression proves the complete character is preserved and that
no isolated surrogate reaches the rendered text. Machine remains 13/13;
typecheck, architecture and the full production build pass.

The final generated entry asset is `index-Ci4cbgx1.js`. The fresh 21-scene
matrix at `/tmp/tenon-unified-final-dashboard-Ci4cbgx1-v6` again has exact
desktop widths and presentation settings, zero document overflow, busy/loading
residue, mobile navigation, console errors or CDP exceptions, and 21/21 unique
Machine action names at every matrix size. Its `audit.json` records the expected
source-backed Progress precheck alert rather than suppressing it.

This section is still pre-freeze evidence until a new exact committed SHA
receives three zero-finding reviews and its own GitHub CI.

## `f6e16437` final Build freeze

The exact candidate
`f6e164379e42fe6fca77a1245bf244e453329738` is accepted by all three independent
tracks:

- backend/security/architecture: **C0/H0/M0/L0**;
- complete Dashboard design/accessibility: **C0/H0/M0/L0**;
- release/E2E/API: **C0/H0/M0/L0**.

The final track independently reproduced the bounded Unicode behavior, verified
Machine 13/13, Dashboard 1533/1533, root 5879 passed with 26 honest skips,
snapshot security 45/45, OpenSpec 38/38, release 24/24, typecheck and the
717-file architecture gate. Isolated full and Dashboard builds match the tracked
distribution byte for byte. The production entry is `index-Ci4cbgx1.js`; v6
browser evidence covers all 21 fixed desktop scenes with zero overflow,
busy/loading residue, mobile navigation, console or CDP exception, and 21/21
unique Machine action names at every size.

GitHub PR #20 is non-draft and mergeable at the exact SHA. CI run
`30552730210` and Documentation Pages build `30552730398` both succeeded.
No prior failed candidate is reused. This section freezes Build evidence;
Verify review receipt, Verify fields, merge/main CI, Ship and Archive remain
mandatory.

## 2026-08-03 Verify rollback

The prior freeze was reopened because the final independent review found two
Dashboard defects and one stale scope baseline. The Change returned through the
official `verify-fail` and `requirements-changed` transitions; proposal, design,
capability delta, implementation plan, and tasks now use
`origin/main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9` and cover PR #27/#28.

The Track Settings dirty bridge formerly passed a new callback on every
Workbench render. Once a draft became dirty, the child effect and cleanup could
alternate the parent source state indefinitely. The bridge now has stable
`useCallback` identity. A Workbench integration regression reproduces the old
hang and proves exactly one dirty=true notification after the repair.

Track save also formerly disabled only action buttons, leaving fields and the
route-preview prompt editable while the request was in flight. A successful
response could then close the editor and silently discard edits made after the
request snapshot. The entire editor form is now one native disabled fieldset
during the mutation, and every track-list edit entry is disabled as well. The
regression covers identity/workflow fields, route prompt/preview, cancel,
delete, save, and list switching; the existing error, discard, focus, and
late-response suites remain green.

Focused RED→GREEN evidence is followed by 202/202 Workbench and Track Settings
tests plus Dashboard typecheck. This rollback remains open until full
Standards/Spec tests, production browser acceptance, independent C0/H0/M0
review, and a new exact SHA all pass; no evidence from the rejected freeze is
reused as completion proof.

## 2026-08-03 final remediation convergence

The snapshot race identified by the independent review now has two genuine RED
regressions: aggregate and single-Change readers both accepted stale bytes after
a same-inode, same-length in-place overwrite. Both failed before the repair.
The readers now share the bounded byte primitive and a single stable-file
metadata fence covering `dev`, `ino`, `size`, `mtimeNs`, and `ctimeNs`. The
opened fd and current pathname are checked before and after the read, so leaf
replacement, growth, truncation, and same-size overwrite all fail closed. The
complete snapshot suite passes 47/47.

Track mutation coverage now drives actual user-event keyboard and pointer
attempts while the request is pending. Every editor control, route preview,
track-list switch, and workspace close surface is disabled; Escape, close-icon,
list, and field attempts preserve both the draft and frozen request body. A
failed mutation restores enabled controls and focus to the initiating Save
button; the success branch closes only after a valid authority response. The
focus lifecycle lives in a bounded hook, restoring the 719-file architecture
gate.

The final source passes Dashboard 80 files / 1537 tests, root 330 files / 5881
tests with 26 honest skips, production build/typecheck, OpenSpec 38/38, release
24/24, comments, architecture, repository hygiene, documentation, identity,
and diff checks. Production Browser QA on the rebuilt server at port 18766 used
request interception, so it performed zero real config writes. It proved the
409 failure and valid-success branches, stable dirty reporting, empty-label
validation, focus recovery, and locked Escape/mouse/keyboard paths. Desktop
widths 1024/1440/1920 had no document overflow and a fully visible workspace;
zh/light and en/dark with reduced motion both passed. A clean final reload had
zero console errors; `pr20-track-settings-1024-zh-light.png` records the final
1024px production state outside the repository.

A fresh independent review first returned C0/H0/M0/L1 solely because the new
Hook and component lacked same-name test files required by `FRONTEND.md`. The
candidate now includes direct `useMutationFocus.test.tsx` and
`TrackSettings.test.tsx` coverage; the same reviewer rechecked the increment
and returned **C0/H0/M0/L0**, with no remaining confirmed defect, question, or
advice. This evidence is ready for one exact commit and Build SHA freeze.

## 2026-08-03 bounded Codex Verify follow-up

The full PR input exceeded the Codex CLI 1 MiB request limit, so the Codex
track reviewed the bounded 134 KiB remediation delta while the independent
reviewer and E2E tracks retained full frozen-range coverage. It reported that
the exact-head CI task was checked before the new SHA had been pushed and that
the new `Dialog.closeDisabled` and `TrackSettingsList.disabled` behavior lacked
implementation-adjacent same-name tests.

Verify followed the official `verify-fail` path. The exact-head CI task is open
again and cannot complete before the pushed SHA succeeds in GitHub Actions.
Direct `Dialog.test.tsx` and `TrackSettingsList.test.tsx` regressions now prove
the disabled controls are semantically unavailable and cannot dispatch their
callbacks. The focused direct suites pass 6/6; a new committed Build
SHA and fresh Verify tracks are still required before the task can close.

The visual track then found one additional Medium integration defect on the
same rejected SHA: a successful Track save called `reloadConfig()`, which
published a transient `cfg=null`; `TrackSelector` consequently unmounted the
entire Track Settings workspace before the caller could close only the
submitted editor. A genuine RED now rerenders the selector through the pending
authority state and proves the workspace must remain mounted. The config hook
keeps its last authoritative value visible while fetching the replacement, and
the selector no longer ties workspace lifetime to `table !== null`. The real
CRUD success regression now asserts the editor closes, the settings workspace
remains open, and a second Track uses the refreshed revision. Focused selector,
same-name, CRUD, and typecheck gates are green. The complete Dashboard suite
passes 83 files / 1540 tests, the root suite passes 330 files / 5881 tests with
26 honest environment skips, and the full build plus repository static gates
pass. A fresh exact-SHA Verify is still required.

## 2026-08-03 final Build convergence

The fresh full-range reviewer found one Medium refresh-concurrency regression
before freeze: clearing the shared config cache also detached the active
in-flight request, so two rapid retries could let an older response overwrite a
newer revision. A genuine RED now supersedes one request, completes it before
the current request, and proves it can neither populate the cache nor detach
the current Promise. The config cache now carries a per-root generation; only
the current generation may publish a response and only the identical request
may remove its in-flight entry. The same-name `mandatoryConfig.test.tsx`
regression passes with the Track lifecycle and direct component suites.

After that repair, the full independent review returned **C0/H0/M0/L0** across
the complete 565-file PR range and the final Build delta. Dashboard passes 84
files / 1541 tests; root passes 330 files / 5881 tests with 26 honest
environment skips. Typecheck, full build, the 719-file architecture gate,
OpenSpec 38/38, release workflows 24/24, documentation, repository hygiene,
identity, dependency audit/tree, workflow freshness, and diff checks pass.

The rebuilt production asset `index-BAqHlU2A.js` passed a fresh desktop browser
matrix at 1024, 1440, and 1920 pixels: successful save closes only the editor,
keeps Track Settings open, and uses the refreshed revision for the next Track;
busy, 409 error, Escape, backdrop, focus trap/return, reduced motion, and
horizontal-overflow boundaries also pass. All writes were intercepted, the
real project revision and six Tracks remained unchanged, and the visual review
returned **C0/H0/M0/L0**. The candidate is ready for one exact commit and a
fresh exact-SHA Verify with GitHub CI.

## 2026-08-03 same-root reload fencing

The exact-SHA Verify correctly rejected `71429fd6` because the module cache's
per-root generation did not protect the Hook-local state. Two rapid reloads for
the same root could complete B before A, publish B's newer revision, and then
let A's older return value execute `setCfg`. The new same-name
`mandatoryState.test.tsx` regression deterministically failed before the repair
with `revision-a-old` replacing `revision-b-new`.

The Hook now binds every reload to both the current root incarnation and a
monotonic request token. A superseding same-root reload, root switch, or later
root incarnation invalidates the earlier token before it may publish local
state. The module cache generation remains the authority for cache publication;
the Hook fence independently protects the rendered snapshot.

The final convergence also covers two neighboring authority/focus boundaries.
Returning A→B→A now supersedes the first A incarnation's in-flight config, and
a successful mandatory-skill mutation advances cache authority so a previously
started GET cannot roll it back. Track editor success, manual close, accepted
dirty switch, and cancelled dirty switch each return focus to the trigger that
still owns the visible editor; choosing Stay no longer commits the attempted
switch's trigger. Every defect first failed a deterministic permanent test.

The final synthetic tree is `141711884df345395602862c60b9319b8fc7499e`.
Focused E2E passes 212/212 plus API 27/27. Dashboard passes 85 files / 1547
tests; root passes 330 files / 5881 tests with the same 26 honest environment
skips. Full production build and typecheck pass, and the rebuilt entry asset is
`index-DPwGklEj.js` with SHA-256
`d3eba5d6083db61c3dc2653fb544268e6c0c63dca147a68278f4de8f97a30f28`.
Architecture (719 production files), comments, OpenSpec 38/38, release workflows
24/24, repository hygiene, documentation, identity, dependency audit/tree,
default-workflow freshness, and diff whitespace gates all pass.

The final independent full-range reviewer, isolated E2E track, and production
browser/visual track each return **C0/H0/M0/L0**. The browser matrix covers
1024/1440/1920, zh/en, light/dark, reduced motion, same-root response inversion,
continuous authoritative revisions, busy/error states, and all four focus
branches. Four synthetic writes were intercepted, unexpected writes were zero,
and the real config remained revision `09bfcc6a14b83e21` with its original six
Tracks. Build is ready for one exact commit and fresh exact-SHA Verify; no prior
rejected SHA or asset is reused.

## 2026-08-03 actual-trigger focus and CI test convergence

The exact-SHA Codex and independent reviews both rejected `2448ea13` with the
same Medium finding: Track editor return focus was inferred from
`document.activeElement`. Safari/macOS settings and programmatic activation do
not guarantee that a clicked button becomes active, so close/save could return
focus to the panel close button instead of the actual Edit/Create trigger. The
new `fireEvent.click` regression failed on the parent with 1 failed / 3 passed
and passed on the repair with 4/4. Edit/Create now pass `event.currentTarget`
through `TrackSettingsList` and commit that trigger only when a deferred dirty
switch is accepted; choosing Stay preserves the current editor's opener.

The exact parent CI then exposed an unrelated test-order race in the existing
StrictMode Create Change test. `route-winner` can render one effect cycle before
the default Workflow's first-step state enables Create. Under CI load the test
clicked the still-disabled control and later timed out with zero callback calls;
the final failure DOM showed the button enabled after the lost click. The test
now waits for the same observable enabled precondition as the neighboring
creation test before asserting that StrictMode does not suppress `onCreated`.
The focused file is green for 25 consecutive runs.

Current source passes Dashboard 85 files / 1548 tests and root 330 files /
5881 tests with 26 honest environment skips. Full build, typecheck, comments,
architecture (719 production files), OpenSpec 38/38, release workflows 24/24,
repository hygiene, docs, identity, dependency audit/tree, default workflow
freshness, and diff whitespace gates pass. The production entry is
`index-FQ5CIyhA.js`, SHA-256
`10770c647c3b2e588d9ce5e3abe832b2a3ae3148ba5ed12ac1501d71d5fe1226`;
a separate fresh Vite build is byte-identical.

Independent source/dist review and fresh production browser acceptance each
return **C0/H0/M0/L0**. The browser used non-focusing programmatic activation
for Edit/Create, save, accepted dirty switch, and Stay cancellation; every
return target was exact. Its only synthetic PATCH was intercepted locally,
unexpected writes were zero, and the real config remained builtin-only at
revision `09bfcc6a14b83e21` with the original six Tracks. This repaired tree is
ready to commit and freeze; all exact-SHA Verify and GitHub CI evidence must be
rerun on the new commit.

## 2026-08-03 Save/Delete actual-trigger convergence

The exact `dce8ddb` Verify correctly found one remaining Medium focus defect:
Save still inferred its retry target from `document.activeElement`, while Delete
did not capture its confirmation trigger at all. Non-focusing activation could
therefore restore focus to the Dialog close control or Save instead of the
control that actually initiated the failed mutation.

Two deterministic regressions reproduced both failures before implementation.
Save now captures the synchronous native form `submitter`, with the stable Save
ref as the implicit-submit fallback; Delete captures `event.currentTarget`.
The focus hook accepts only an actual `HTMLElement` or explicit `null` as an
override, preserving its existing direct React-handler behavior for other
arguments. Keyboard Enter and submit events without a submitter also have
permanent regressions. No event object crosses an async boundary.

The focused suites pass 11/11 and the complete Dashboard passes 85 files /
1552 tests. Root passes 330 files / 5881 tests with 26 honest environment skips.
Typecheck, full production build, architecture (719 production files), comments,
identity, interaction-contract, repository-hygiene and diff checks pass.
`TrackSettings.tsx` remains inside the enforced limit at 399 lines.

The independent reviewer first reported C0/H0/M0/L1 for the two missing implicit
submission tests; after both were added, its strict read-only re-review returned
**C0/H0/M0/L0**. The reviewer changed no real-workspace bytes and recorded an
identical before/after workspace fingerprint. This Build tree is ready for one
exact commit and a wholly fresh Verify; the rejected `dce8ddb` evidence is not
reused.

## 2026-08-03 config authority and budget debounce convergence

The exact `796faf62` Verify correctly rejected two remaining Medium concurrency
defects. A mandatory-skill partial write could publish its old render snapshot,
advance the shared generation, and detach a newer full-config GET started by a
Track mutation. Separately, a pending Governance budget slider timer survived a
same-id authoritative snapshot whose token limit had changed, and could POST
the old draft after the new value was already rendered.

Both defects first failed deterministic regressions on the previous
implementation: the config case retained `revision-initial` instead of the
Track authority, and the budget case emitted one forbidden update POST. The
shared config cache now merges a successful cell into the current full snapshot:
it joins the same-generation GET, retries if another generation starts while it
waits, and performs the final generation check and cache publication without an
intervening await. `useMandatorySkills` and `DefaultSkillChain` use the same
helper while retaining their exact root/cell/operation guards. Governance now
cancels the debounce when root, Loop id, or authoritative
`max_tokens_per_day` changes and clears the timer ref on cancellation or fire.

Focused config, mandatory-state, Default Skill Chain and Governance suites pass
152/152. Dashboard passes 85 files / 1555 tests; root passes 330 files / 5881
tests with the same 26 honest environment skips. Full production build and
typecheck pass. Consecutive Vite builds are byte-identical; the entry asset is
`index-Dizc9CgB.js` (`276ed2ac468d20e3a70e8d46eb48701819e749f21caabc65c850b7541e3a4443`)
and the Workbench chunk is `WorkbenchView-DLOTivoD.js`
(`12fb441827cc400e1760bb80d789584b1d165e2f7cfe652dd5f6f76b5ae5375d`).
Architecture (719 production files), comments, OpenSpec 38/38, dependency audit
0, dependency tree, release workflows 24/24, identity, interaction contract,
repository hygiene, docs, document templates, npx package, legacy bridge,
default-workflow freshness and diff whitespace gates all pass.

The independent full 646-file Standards + Spec re-review returned
**C0/H0/M0/L0**. It separately ran 57 focused tests, rebuilt Dashboard assets in
`/tmp` with file-for-file identical hashes, and left the real workspace
unchanged. The stable pre-Verify workspace fingerprint is
`workspace:sha256:4d06919d672a39f4cc1e5202260d9aa858a6682b5bc0c426ee5eabe443344f54`.
This Build tree is ready to commit and freeze; no result from the rejected
`796faf62` Verify is reused as new Verify evidence.

## 2026-08-03 unavailable-root and unmarked-Forward convergence

The exact `8293b53a` Verify was rejected at **C0/H1/M1/L0**. A dirty Workbench
could be unmounted, losing its draft, when an SSE snapshot removed its project
or changed it to non-writable before the navigation guard obtained authority.
The browser-history guard also treated every unmarked entry as Back, so an
unmarked Forward traversal could be compensated and replayed in the wrong
direction.

Both failures received deterministic RED regressions. A dirty Workbench now
retains the same keyed editor and root while its project authority is missing,
keeps the root in the URL, exposes the existing localized unavailable-root
alert, and applies native `inert` to the retained host before paint so no user
write can escape. Recovery removes `inert` without losing the draft; only an
explicit discard permits the editor to unmount. For pre-mount history entries,
Dashboard-owned monotonic markers remain primary and Chromium's Navigation API
physical entry index supplies the missing Back/Forward delta. The cancellation
inverse and confirmation replay both preserve that exact delta; hosts without
the API retain the prior conservative Back fallback.

The focused App suite passes 65/65 for five consecutive runs. The complete
Dashboard suite passes 85 files / 1557 tests; root passes 330 files / 5881
tests with 26 honest environment skips. One earlier high-load Dashboard run had
three timing failures in existing history tests, but the affected file passed
five consecutive runs and a subsequent complete run passed; this is recorded
rather than treated as hidden evidence. Full production build and typecheck
pass. Consecutive Vite builds are byte-identical; the entry asset is
`index-OtstPJn7.js` with SHA-256
`52b5b9eaa87f22d43611bae3014bf057ec5f8768a4faf9d08247b799dcaf9954`.

Architecture (719 production files), comments, OpenSpec 38/38, release
workflows 24/24, repository hygiene, hooks 512/512, migration CAS 13/13,
identity, interaction contract, dependency audit 0 and dependency tree,
documentation checks/build/smoke, document templates, npx package contracts
and an explicit synthetic package build, legacy bridge, default-workflow
freshness, and diff whitespace gates all pass. A fresh full-range independent
Standards + Spec review is in progress; this section does not claim PASS or
authorize the Build freeze until that review returns C0/H0/M0.

The fresh review then found two adjacent boundaries before freeze. The retained
Workbench host was inert, but Track Settings uses a React portal under
`document.body`; without a context-level authority boundary, its Save/Delete
controls could remain live after the root became unavailable. Separately,
fallback transcript discovery applied its transcript-count and byte caps only
after recursively collecting directory metadata, leaving an availability risk
in a large sessions tree. Neither finding was waived.

Portal-preserved React context now carries the Workbench authority boundary to
every shared Dialog. A disabled portal receives native `inert` and
`aria-hidden` before paint, blurs any owned focus, ignores Esc/backdrop, and
blocks click, key and submit capture; the app-level unsaved-navigation Dialog is
outside that boundary and remains usable. The integration regression proves
that a dirty Track editor cannot emit `POST /api/tracks` after SSE root loss,
while a focused shared-component regression proves the same submit is allowed
before authority loss and blocked afterward.

Transcript discovery now uses `opendir` streaming traversal with explicit
4,096-entry and 128-JSONL-candidate ceilings in addition to the existing depth,
file-size and selected-transcript caps. Exceeding either ceiling fails closed
before unbounded metadata accumulation. Injected small-limit regressions cover
both directory-entry and transcript-candidate overflow.

The final Dashboard suite passes 85 files / 1,559 tests; root passes 330 files /
5,881 tests with the same 26 honest environment skips; the complete receipt
suite passes 120/120. Full TypeScript/production build, Dashboard typecheck,
architecture (719 production files) and diff whitespace checks pass. The
rebuilt entry asset is `index-Cdn_IBMD.js` with SHA-256
`e480416f8249cf84cff6ef1296f7bcd17a4956cbe16fe8b865486fe836a6e586`;
the Workbench chunk is `WorkbenchView-Bi75Zcyo.js` with SHA-256
`2167e6625de93a52cba8e55ec3298c76019564ee4cca35a1e989d90646e1da23`,
and the rebuilt CLI bundle is
`6740faba1f48c2a18ae69bb6f7ed90d1e417ea2508f1cde50fe00c509440c539`.

The final independent full-range review covers all committed and uncommitted
source, generated artifacts, project rules and OpenSpec documents and returns
**PASS — C0/H0/M0/L0**, with no confirmed, unresolved or advisory finding.
Build is authorized to freeze one new exact commit; all Verify tracks and
GitHub CI must still restart from that exact SHA.

## 2026-08-03 blocked-pop and portal-focus convergence

The exact `c4f0cb58` Verify was rejected at **C0/H0/M2/L0**. An SSE root-loss
effect could replace an already blocked browser-history request with a generic
Projects navigation, so Discard no longer reached the user's original Back or
Forward target. A portal Dialog that blurred its focus while authority was lost
also removed `inert` without restoring focus when authority returned, leaving an
active `aria-modal` surface while focus remained on `document.body`.

Both defects first failed deterministic regressions. Dirty navigation now uses
a functional pending-request update and preserves an existing `pop` request when
the root-loss effect asks to leave Workbench. Marked Back and unmarked Forward
tests prove that Stay retains the draft and URL, while Discard replays the exact
original target even when authority changes between the blocked traversal and
the decision. Shared Dialog instances register an authority-aware focus restorer
with the existing LIFO stack. Re-enabling a top Dialog restores its first valid
focus target; re-enabling beneath an outer guard does not steal focus, and the
outer guard hands focus to the newly exposed authorized Dialog when it closes.

The focused App/Dialog suites pass 71/71. The complete Dashboard passes 85 files
/ 1,562 tests; root passes 330 files / 5,883 tests with 26 honest environment
skips. Production build, Dashboard typecheck and every static/release/governance
gate pass: dependency audit 0, architecture 719 production files, OpenSpec 38/38,
release workflows 24/24, hooks 512/512, adapters 272/272, migration CAS 13/13,
clean install `ok:true`, documentation, identity, interaction contract,
repository hygiene, default-workflow freshness and diff whitespace. Two
consecutive Dashboard builds are byte-identical. The entry asset is
`index-CmHp9ZB5.js` with SHA-256
`576b586369f02680fa1032f82d02c0163d1c6426601388554829c8e4ef055e01`;
the Workbench chunk is `WorkbenchView-CFZzpS49.js` with SHA-256
`574561419b2c63f549e22a921b1d09e49628926d00eb2bf9795452494b3a7999`.

Fresh production-browser pre-Verify passes 5/5 scenario groups at 1024, 1440
and 1920 across zh/en, light/dark and reduced motion. It proves both Back and
Forward root-loss races, portal write blocking, exact Discard targets, both
focus-recovery orders, keyboard paths and zero overflow; console, page and
network errors are all zero. Evidence is under
`/tmp/tenon-current-preverify-ZpNcsC/evidence/`, and the browser track wrote no
real-workspace bytes.

The fresh aggregate Standards + Spec review covers the complete current
base-to-workspace surface of 712 unique paths, including all original 698 path
identities, regenerated assets, governance records and the final four
App/Dialog source/test files. It returns **PASS — C0/H0/M0/L0**, with zero
confirmed, unconfirmed or advisory findings. The final pre-commit workspace
fingerprint is
`workspace:sha256:86732ae923140e88a5d379379656a9adc0c612c6e9833f3456f05d728896345c`.
This tree is authorized for one new commit and freeze; every exact-SHA Verify
track and GitHub CI must restart without reusing `c4f0cb58` evidence.

## Post-`425b3195` ordinary-navigation rollback

The exact `425b3195` four-track Verify was rejected at **C0/H0/M1/L0**. The
Codex track found that `App.setView` preserved an existing pending request only
when it was a browser `pop`. If a dirty Workbench first blocked a normal
Overview click and then lost its project root, the root-loss Projects fallback
replaced the original `{kind: 'view', target: overview}` request. Discard then
landed on Projects instead of the page the user had chosen.

A deterministic App regression first failed because `solution-view` never
appeared after that exact sequence. Pending navigation now follows
first-request-wins for both `view` and `pop`; fallback navigation is synthesized
only when no decision is already pending.

The first repair was still insufficient. An independent full-range review found
that a normal `view` followed immediately by browser Back could commit the view
before the inverse history traversal settled, and that a later Forward/Back in
the same dialog could replace the original blocked traversal. The corresponding
RED landed on Projects rather than Overview. The history controller then kept an
immutable first blocked traversal and used a two-frame settlement window.

The frozen two-frame candidate was explicitly rejected at **C0/H0/M1/L1**.
History traversal and `popstate` have no animation-frame ordering guarantee; an
isolated regression delayed the requested Back beyond both frames and reproduced
the final Projects override. Consecutive settlements could also leave an older
frame uncancelled on unmount. Its production-browser matrix happened to pass,
but that evidence does not override the deterministic scheduling failure.

The replacement has no frame or timer settlement heuristic. On current desktop
browsers, a pending ordinary-view transaction cancels later same-document
traversals synchronously at the Navigation API `navigate` start event, before
`popstate`. If a started traversal is not cancelable, Discard/Stay remains
deferred until the observed `popstate` and exact inverse restore complete. If
the Navigation API is absent, ordinary dirty navigation uses a synchronous
native confirmation instead of exposing an asynchronous competing-traversal
window. Pending state is mirrored in a synchronous ref, so root-loss, `view`,
and `pop` all preserve the first request identity.

The first event-start candidate was also explicitly rejected at
**C0/H0/M1/L0**: a started non-cancelable traversal could abort before
`popstate`, leaving its restore barrier active forever. Each such traversal now
owns a monotonic sequence identity and the exact Navigation API abort signal.
An abort clears only the matching barrier and runs its deferred winner; a later
traversal cannot be cleared by an older abort. Observed `popstate` and unmount
remove the same identity-bound listener and state.

The event-start cancellation, non-cancelable restore and abort barriers, native
fallback, and stale-abort regressions pass; App plus both Dialog suites pass
94/94, Dashboard passes 1,572/1,572, and the repository passes 5,883 tests with
26 declared skips. Dashboard typecheck passes. Two clean builds produced the
same combined CLI/server/Dashboard digest
`f5937a03b92a70b6f8628128269aa1c1e5ee7b141958b2ef0879ff5970710967`,
with the current Dashboard entry `index-BYlOsNDd.js`. A new production-browser
run, complete static gates and an independent full-range review were then run
from this exact candidate; no earlier candidate PASS was reused.

The final independent pre-Verify review froze the complete workspace as
`workspace:sha256:846b7c4bbd3186331b71b48bdb4cfde7d6a5f7d9c33205423696494dc3b4a444`
and returned **PASS — C0/H0/M0/L0**. It independently reproduced focused
94/94, Dashboard 1,572/1,572, repository 5,883 with 26 declared skips, two
byte-identical builds, the canonical `f5937a03...0967` artifact digest, all
static/governance/install/documentation gates, and zero differences across two
runs of all five Oracle fixtures. Its isolated execution snapshot remained
byte-equivalent to the read-only real worktree throughout review.

The final production-browser run independently froze the same source candidate
and returned **PASS — C0/H0/M0/L0**. All 12 navigation/root-loss/Dialog and
keyboard scenarios passed, including cancelable traverse prevention and the
non-cancelable AbortSignal barrier before and after Discard. The desktop matrix
passed 36/36 across 1024/1440/1920, zh/en, light/dark/system and normal/reduced
motion with zero horizontal overflow. Diagnostics recorded zero console/page
errors, zero HTTP responses at or above 400 and zero unexpected request
failures across a 707-entry HAR. The isolated server, port and Chromium profile
were cleaned, and the source worktree remained unchanged. Chrome cannot emit a
genuinely non-cancelable same-document traversal through its public API; that
branch is covered by the production bundle with real AbortSignals plus the
exact automated suite, so this is an evidence limitation rather than a finding.
The browser evidence is at
`/tmp/pr20-browser-byl-final.mUllGH/evidence/README.md`.

## Post-`d7f4a2e9` exact-receipt fail-closed convergence

The exact-head Verify for `d7f4a2e9` was rejected at **C0/H1/M0/L0** because
the exact receipt parser skipped malformed JSON and could return immediately
after a matching completion. Build added deterministic custom/function REDs for
malformed JSON between invocation and output and after output, then changed the
parser to consume the complete bounded snapshot and fail closed on any malformed
line.

The first Build candidate was also rejected by independent pre-Verify review at
**C0/H0/M1/L0**: a second completion with the opposite ABI remained acceptable
on the exact path, while the fallback path did not consume a completed call.
Eight permanent regressions now cover exact/fallback, custom/function, and
same-ABI/mixed-ABI duplicate completions. Exact verification recognizes any
completion for the bound `{turnId, callId}` before checking its ABI. Fallback
consumes each pending read once and keeps a turn-scoped completed-call set, so a
duplicate or mixed-ABI completion invalidates the candidate.

The fresh replacement workspace is frozen by the independent review fingerprint
`workspace:sha256:845402a3a72ead1ccea0606c03cc6d09bc4ee7f0be34f483b40f804668bbde49`.
The review returned **PASS — C0/H0/M0/L0** across the complete 748-path
base-to-workspace surface. Permanent receipt tests pass 134/134; four isolated
reviewer cases covering a repeated invocation and completion with the same call
id also pass, and the combined malformed/duplicate/ABI/TOCTOU/fallback matrix
passes 17/17. Root passes 330 files / 5,897 product tests with 26 declared skips;
the reviewer snapshot passes 5,901 including its four isolated cases. Dashboard
passes 1,579/1,579. Build, OpenSpec 38/38, release 24/24, bundle 31/31, hooks
512/512, adapters 272/272, migration CAS 13/13, npm audit, static gates and two
Oracle runs all pass. The review report is
`/tmp/pr20-preverify-r2-lFoqTu/STANDARDS-SPEC-REVIEW.md` with SHA-256
`47bd2b9e192b597417f0d06d73affed205fbba685e268efd149e425d8ab53195`;
its final repo-zero fingerprint exactly matches its starting fingerprint.

## Final merged-main unified review (2026-08-03)

PR #20, #22, #24 and #25 are all merged into
`main@7c1ed69516e042205155e134b25f59f9ed927644`; GitHub reports no remaining
open PR. The unified range from `a86dabb4` through the final main tree, plus the
receipt hardening on this branch, received one combined Standards, Spec and
Security review. The review returned **PASS — C0/H0/M0/L0**.

The combined review found one pre-freeze High defect before its final PASS: the
Codex transcript readers accepted a repeated invocation identity with the same
`call_id` before a single completion. Four permanent RED regressions cover
exact/fallback and custom/function ABIs. The exact path now rejects a second
target invocation both before and during completion scanning; fallback keeps a
turn-scoped invocation-identity set and fails closed on any reuse. The complete
receipt suite passes 138/138 and the tracked CLI bundle was rebuilt from the
reviewed TypeScript.

Clean installation reports zero vulnerabilities. Dashboard passes 86 files /
1,603 tests; the repository passes 330 files / 5,901 tests with 26 declared
environment skips. Build, typecheck, architecture, comments, dependencies,
OpenSpec 38/38, release 24/24, repository hygiene, workflow freshness, hooks
512/512, adapters 272/272, skill verification, bundle 31/31, npx packaging,
interaction-contract, bilingual documentation build/smoke and the five-fixture
Oracle double-run all pass. Two consecutive production builds have the same
combined CLI/server/Dashboard digest
`95d9042ef92bc01266a4b0c778dc4d4d79dd97d7497996f1581f44787a65abfe`.

Production-browser acceptance on the final main tree covers Projects,
Onboarding and Context Bundle at 1024/1200/1440/1920, zh/en and light/dark,
including loading, empty, error, success, keyboard, focus and overflow paths.
All 24 scenarios and 101/101 assertions pass with 17 screenshots. Unexpected
console errors, page errors, request failures and HTTP errors are all zero. The
expected budget-overrun 422 fixture and five navigation-aborted stream requests
are separately classified rather than hidden. The isolated server and browser
profile were removed and the reviewed source tree remained unchanged. Evidence
is stored at `/tmp/pr20-main-browser-qa-Z0y9nS/REPORT.md`.
