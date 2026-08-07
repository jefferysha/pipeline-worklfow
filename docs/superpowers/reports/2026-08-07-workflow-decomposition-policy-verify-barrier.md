# Workflow decomposition policy — Verify barrier

## Verdict

**PASS.** The main thread reviewed and verified the exact frozen implementation on both required
axes:

- Standards: no open Critical, High, or Medium correctness, security, compatibility,
  maintainability, accessibility, or governance findings.
- Spec: all three PR3 deltas are implemented and every changed path is mapped to a governing
  capability.

Style-only wording, speculative refactors, and non-material complexity were treated as
non-blocking. The accepted findings from earlier Verify rounds were fixed and re-reviewed; no
worker or custom subagent made a review, severity, complexity, or acceptance decision.

## Frozen identity

- Change: `workflow-decomposition-policy`
- Track: `backend`
- Branch: `codex/workflow-decomposition-policy-20260803`
- Exact base: `a710a99f078b78942b501794b019f8c25be7e764`
- Exact frozen HEAD / `build_sha`: `4b664a1df37d3cf98a6b728f7cfd36144c42d666`
- Frozen implementation fingerprint:
  `c8bb40cde0279bf4c96c54247662ca1072467cd496bb56185f5b9248a70d2a7a`
- Main OpenSpec aggregate digest:
  `08a6648a747ba939f4e47d42b8684bc9ef0224689e42d49272af171e78baf748`
- Exact diff: 260 files, 13,675 insertions, 2,383 deletions.

The implementation and main-spec digests were recomputed after static, test, browser, and isolated
archive checks and remained unchanged.

## Main-thread review

The main thread re-read the exact `base..HEAD` diff, its callers, tests, public contracts, generated
artifacts, and the registered proposal/design/spec/tasks evidence. The Build review records all
accepted findings and their fixes. Open tracked Critical/High/Medium findings: **0**.

The main thread also rejected one proposed executable-payload digest finding because this Change
does not include a production materializer or executable payload schema. The current evaluator
binds the complete normalized candidate semantics and declared executable digest. Inventing a
future materializer contract would expand the frozen Change rather than fix a current defect.

The manifest in this report maps **260/260 paths** to `workflow-decomposition-policy`,
`workflow-definition`, `codex-skill-receipt-current-turn`, or their governance evidence.

## Fresh automated verification

All commands below were run against the exact frozen HEAD, with generated build output created only
inside the isolated Verify worktree where applicable.

| Rail | Command / scope | Result |
| --- | --- | --- |
| Production build | `npm run build` | PASS; root TypeScript, Dashboard production build (2,078 modules), server bundle, CLI bundle |
| Full repository | `npm test -- --minWorkers=4 --maxWorkers=4` | PASS; 367 files, 6,408 passed, 14 honest environment skips, 0 failed |
| Dashboard | `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src --minWorkers=4 --maxWorkers=4` | PASS; 90 files, 1,654 passed, 0 failed |
| Architecture | repository architecture check | PASS; 788 production files, 5 declared size-only exceptions |
| OpenSpec | strict repository/OpenSpec checks | PASS; 39/39 before archive rehearsal |
| Skill bundle | verify-skills | PASS; 66 references / 62 directories |
| Repository rails | comments, hygiene, docs, default-workflow freshness, `git diff --check` | PASS |
| Identity/dependencies | `npm run check:identity`, `npm run check:dependencies` in the frozen real worktree | PASS; dependency tree valid, 0 vulnerabilities |

The first isolated full-test attempt reported 99 import failures because a detached Git worktree
does not contain untracked `dist` bundles. Building the exact frozen source first resolved the
environment setup and the complete suite passed. A workspace-scoped Dashboard command also used
the wrong cwd and doubled `packages/dashboard-app`; the canonical repo-root command above passed.
Neither incident is recorded as a product failure.

Identity/dependency checks in the isolated worktree saw the intentionally symlinked
`node_modules` and generated TypeScript metadata pointing at the source worktree. The same
read-only checks passed in the exact frozen real worktree, and both frozen digests were unchanged.

## Real browser acceptance

The main thread owned the single Playwright browser and served the exact frozen production bundle
from an isolated runtime on `127.0.0.1:18873`. The server was terminated after acceptance and the
port was verified closed.

- The built-in `default` Workflow displayed a disabled, explicitly read-only policy mirror.
- `verify-policy-20260807` was created as an editable copy.
- Decomposition mode, target, strategy, maximum items/depth, automatic/ask conditions, and
  interaction mode were edited.
- Escape cancelled policy changes only, restored the persisted values, and returned focus to the
  first policy control.
- Enter on the active select saved the complete policy; UI status showed `已保存` /
  `策略已保存。`.
- Switching to `default` and back reloaded the normalized persisted values:
  `auto-safe`, `child-pipelines`, `depth-first`, `24`, `4`,
  `recommended-defaults`.
- An out-of-range maximum-items edit was rejected without creating a dirty save state.
- One browser-local GET was deliberately fulfilled with HTTP 500. The editor showed a
  `Failed to load workflow` alert and `Retry`; after removing the route, Retry restored the
  persisted policy. The only console error was this intentional 500.
- Network evidence contains successful policy POSTs and subsequent successful GETs.
- Chinese and English labels, descriptions, safety copy, controls, and statuses were verified.
- At 1200x816, 768x900, and 520x900 the policy editor remained readable without policy-panel
  horizontal overflow; the narrow layout stacked fields and condition groups correctly.
- Screenshots: `pr3-workflow-policy-editable-zh.png` and
  `pr3-workflow-policy-en-768.png`.

Loading, empty, malformed-response, validation, and API failure branches additionally remain
covered by the passing Dashboard and server suites.

## Isolated OpenSpec archive rehearsal

The rehearsal ran only in `/tmp/tenon-pr3-verify.6gA3en/repo`:

1. `npx openspec show workflow-decomposition-policy --json --deltas-only`: 13 deltas.
2. `npx openspec validate workflow-decomposition-policy --strict`: PASS.
3. Main-spec digest before archive:
   `08a6648a747ba939f4e47d42b8684bc9ef0224689e42d49272af171e78baf748`.
4. `npx openspec archive workflow-decomposition-policy --yes --json`: PASS,
   13 added / 0 modified / 0 removed / 0 renamed.
5. `npx openspec validate --specs --strict`: PASS, 36/36 main specs.

The broad post-archive `--all` command reported only the temporary
`browser-qa-fixture` Change created to register the isolated browser project; every archived/main
spec passed. This fixture is outside the real worktree and is not product evidence. The real
main-spec digest remained unchanged.

## Historical failures closed

Earlier official Verify rounds correctly failed and returned to Build for:

- missing-authorization bypass through ordinary review;
- missing public authority/binding ports on the default automation factory;
- incorrect OpenSpec delta operation types;
- temporary Codex probe output written into the frozen worktree;
- candidate fingerprint binding, policy-only cancel semantics, immutable authority snapshot and
  server-side authority projection gaps.

All accepted items are fixed, covered by regressions, and included in the exact frozen HEAD. The
historical failure receipts remain in canonical pipeline history; this report records only the
current passing freeze plus the closure summary.

## Residual risk

- A future production decomposition materializer must compute the executable payload digest from
  its real payload and compare it with the frozen candidate digest. That materializer is not part of
  this Change.
- Docker-dependent skips are explicit environment skips; the suite includes a passing real Docker
  lifecycle case and no skip was converted into a pass.
- The delegated Codex-review rail is intentionally not used: project policy assigns all review,
  complexity, severity, and acceptance decisions to the main thread. The main-thread two-axis
  review is the authoritative result.

## Verify decision

`agent_review_result=pass`, `codex_review_result=pass`, and
`branch_status=handled` may be set from this evidence. The exact frozen HEAD is eligible for the
official `verify-pass` review request and transition.
+
## Frozen file-to-spec manifest

The main thread mapped all 260/260 paths from the exact frozen diff:

| # | Changed file | Governing delta |
| ---: | --- | --- |
| 1 | `docs/adr/2026-08-03-workflow-decomposition-policy-explore.md` | Governance/evidence; all PR3 deltas |
| 2 | `docs/superpowers/plans/2026-08-03-workflow-decomposition-policy.md` | Governance/evidence; all PR3 deltas |
| 3 | `docs/superpowers/reports/2026-08-07-workflow-decomposition-policy-verify-barrier.md` | Governance/evidence; all PR3 deltas |
| 4 | `docs/superpowers/specs/2026-08-03-workflow-decomposition-policy-codebase-research.md` | Governance/evidence; all PR3 deltas |
| 5 | `docs/superpowers/specs/2026-08-03-workflow-decomposition-policy-design.md` | Governance/evidence; all PR3 deltas |
| 6 | `openspec/changes/workflow-decomposition-policy/.pipeline-codex-skill-confirmations.jsonl` | Governance/evidence; all PR3 deltas |
| 7 | `openspec/changes/workflow-decomposition-policy/.pipeline-document-locale.json` | Governance/evidence; all PR3 deltas |
| 8 | `openspec/changes/workflow-decomposition-policy/.pipeline-documents.json` | Governance/evidence; all PR3 deltas |
| 9 | `openspec/changes/workflow-decomposition-policy/.pipeline-history.jsonl` | Governance/evidence; all PR3 deltas |
| 10 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/current.json` | Governance/evidence; all PR3 deltas |
| 11 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000000-9dc17fce-1721-4acd-a5e1-a02c05389521.json` | Governance/evidence; all PR3 deltas |
| 12 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000001-f4758511-6bf1-45e4-8763-4fab62eb13a9.json` | Governance/evidence; all PR3 deltas |
| 13 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000002-e45cffa6-43d5-4242-9b4c-561d1a3c02bc.json` | Governance/evidence; all PR3 deltas |
| 14 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000003-8bccb6b1-2f96-4922-aeb3-7407b10325d5.json` | Governance/evidence; all PR3 deltas |
| 15 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000004-cf7b8e72-9e86-42bd-a7e5-99367950898d.json` | Governance/evidence; all PR3 deltas |
| 16 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000005-9269e492-8a0e-42e2-bd2e-97c871b9652a.json` | Governance/evidence; all PR3 deltas |
| 17 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000006-2a059221-e89d-49a7-b789-5957fb7f2a36.json` | Governance/evidence; all PR3 deltas |
| 18 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000007-d07a0138-91ad-44ab-84a5-6c0a625b7a66.json` | Governance/evidence; all PR3 deltas |
| 19 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000008-c139b1b9-f62b-4146-9ab6-fdd21ece02cc.json` | Governance/evidence; all PR3 deltas |
| 20 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000009-53c67176-1977-4def-95f2-d2be71920d0f.json` | Governance/evidence; all PR3 deltas |
| 21 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000010-b5905bd0-f25c-448d-999c-3d4fd59684d5.json` | Governance/evidence; all PR3 deltas |
| 22 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000011-01990a89-bd18-4897-ab85-7a16601aecd4.json` | Governance/evidence; all PR3 deltas |
| 23 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000012-a482ec72-defa-450c-92b0-bb99269a5918.json` | Governance/evidence; all PR3 deltas |
| 24 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000013-e40035f8-4742-451e-a996-4463dee30fa3.json` | Governance/evidence; all PR3 deltas |
| 25 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000014-541667d4-6bdf-401d-92eb-c809bd0d153a.json` | Governance/evidence; all PR3 deltas |
| 26 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000015-b205ba80-4825-4e01-a0cf-12732cf79c2d.json` | Governance/evidence; all PR3 deltas |
| 27 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000016-3b2fec19-c458-4d3d-b614-c3f301917b74.json` | Governance/evidence; all PR3 deltas |
| 28 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000017-2b26a6c7-ab5f-46a2-aea3-72e8e213001e.json` | Governance/evidence; all PR3 deltas |
| 29 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000018-0dbc33f8-eb53-4020-a4ce-7c93933708d5.json` | Governance/evidence; all PR3 deltas |
| 30 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000019-50545a87-82cf-4771-8dfc-1089f3711216.json` | Governance/evidence; all PR3 deltas |
| 31 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000020-3c1d5eb0-8916-41a9-9358-c7b22ae6f35f.json` | Governance/evidence; all PR3 deltas |
| 32 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000021-d2e1b12e-d46d-481b-bd17-03f4c4fd9cf0.json` | Governance/evidence; all PR3 deltas |
| 33 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000022-70e7e9fb-38a9-4219-8fb0-36244d31bf16.json` | Governance/evidence; all PR3 deltas |
| 34 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000023-9e890e55-8967-4c03-a4fa-eefe2b2f1689.json` | Governance/evidence; all PR3 deltas |
| 35 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000024-3cd8960f-5a20-4d3e-b52a-e5a35e5779d1.json` | Governance/evidence; all PR3 deltas |
| 36 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000025-ead5ebcd-11b0-4cc8-888c-404e7ae976ff.json` | Governance/evidence; all PR3 deltas |
| 37 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000026-35d2e4e9-1706-4c5f-93df-52036c2f8875.json` | Governance/evidence; all PR3 deltas |
| 38 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000027-8cf0f23a-be46-446e-ace4-4f3a3b4320c9.json` | Governance/evidence; all PR3 deltas |
| 39 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000028-18cfeffd-48dd-48c6-8b99-6a13b0a27374.json` | Governance/evidence; all PR3 deltas |
| 40 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000029-9d936224-3a5e-46b9-b76a-f8485b856550.json` | Governance/evidence; all PR3 deltas |
| 41 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000030-afa6a3b2-d4c3-4197-a63e-4bab9de6bf3a.json` | Governance/evidence; all PR3 deltas |
| 42 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000031-7607118c-b48c-4f98-bcb1-8ba132bf1702.json` | Governance/evidence; all PR3 deltas |
| 43 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000032-1c18320c-23c4-4185-891a-3929ef7e9595.json` | Governance/evidence; all PR3 deltas |
| 44 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000033-713f38aa-ec46-4700-a8e9-5b167f177301.json` | Governance/evidence; all PR3 deltas |
| 45 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000034-f10e5dff-9a84-4461-8e61-54c16dda0d3d.json` | Governance/evidence; all PR3 deltas |
| 46 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000035-750fa529-8c23-46ae-a472-e602e7f72eb1.json` | Governance/evidence; all PR3 deltas |
| 47 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000036-438c4133-a5f9-421f-a634-42283da6a0b8.json` | Governance/evidence; all PR3 deltas |
| 48 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000037-53cd39df-f516-4707-95ed-ca9bed8bbe9c.json` | Governance/evidence; all PR3 deltas |
| 49 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000038-a5b02811-2658-4d1a-a30f-9afd7153303a.json` | Governance/evidence; all PR3 deltas |
| 50 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000039-371b090b-1784-4fc6-b73a-d21049d0c7d3.json` | Governance/evidence; all PR3 deltas |
| 51 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000040-a3d8acd6-32dd-468b-b736-ac2b699ae2b1.json` | Governance/evidence; all PR3 deltas |
| 52 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000041-776bc912-fb49-4dd5-970e-8c8ddf721642.json` | Governance/evidence; all PR3 deltas |
| 53 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000042-404111c6-fe92-4f8f-a294-222e0b7378ff.json` | Governance/evidence; all PR3 deltas |
| 54 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000043-a7f65e81-d845-4fd1-93c6-bcecb7e4aa01.json` | Governance/evidence; all PR3 deltas |
| 55 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000044-e35339c8-971d-4264-a823-ecefd3624228.json` | Governance/evidence; all PR3 deltas |
| 56 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000045-83243869-339c-4786-87f8-d38f9c869f8e.json` | Governance/evidence; all PR3 deltas |
| 57 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000046-35b15c4d-ccdd-49ea-91ce-b0439a2a6484.json` | Governance/evidence; all PR3 deltas |
| 58 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000047-67a9a963-e3b9-40c8-b7c1-e0fffa2259ff.json` | Governance/evidence; all PR3 deltas |
| 59 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000048-c372dcf8-ae8e-4fdd-9f43-e25459cfee1c.json` | Governance/evidence; all PR3 deltas |
| 60 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000049-4b8db7f1-c502-4937-bc30-a2e3df8467b9.json` | Governance/evidence; all PR3 deltas |
| 61 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000050-6b266ffb-e058-4d00-b0ae-367919edb714.json` | Governance/evidence; all PR3 deltas |
| 62 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000051-acdc49a4-ef3e-4c4b-93c0-69e385947999.json` | Governance/evidence; all PR3 deltas |
| 63 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000052-83bc879c-aa95-4216-8f49-cc776445aa73.json` | Governance/evidence; all PR3 deltas |
| 64 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000053-83771b62-3c4b-4d74-8575-8265ef06492a.json` | Governance/evidence; all PR3 deltas |
| 65 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000054-13d0f9db-10de-4f1c-8c3e-69051b6de1f7.json` | Governance/evidence; all PR3 deltas |
| 66 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/pre-verify-review/000055-e4fe5bb1-0e06-4bf1-b703-0df94a4a5210.json` | Governance/evidence; all PR3 deltas |
| 67 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000000-9dc17fce-1721-4acd-a5e1-a02c05389521.json` | Governance/evidence; all PR3 deltas |
| 68 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000001-f4758511-6bf1-45e4-8763-4fab62eb13a9.json` | Governance/evidence; all PR3 deltas |
| 69 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000002-e45cffa6-43d5-4242-9b4c-561d1a3c02bc.json` | Governance/evidence; all PR3 deltas |
| 70 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000003-8bccb6b1-2f96-4922-aeb3-7407b10325d5.json` | Governance/evidence; all PR3 deltas |
| 71 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000004-cf7b8e72-9e86-42bd-a7e5-99367950898d.json` | Governance/evidence; all PR3 deltas |
| 72 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000005-9269e492-8a0e-42e2-bd2e-97c871b9652a.json` | Governance/evidence; all PR3 deltas |
| 73 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000006-2a059221-e89d-49a7-b789-5957fb7f2a36.json` | Governance/evidence; all PR3 deltas |
| 74 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000007-d07a0138-91ad-44ab-84a5-6c0a625b7a66.json` | Governance/evidence; all PR3 deltas |
| 75 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000008-c139b1b9-f62b-4146-9ab6-fdd21ece02cc.json` | Governance/evidence; all PR3 deltas |
| 76 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000009-53c67176-1977-4def-95f2-d2be71920d0f.json` | Governance/evidence; all PR3 deltas |
| 77 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000010-b5905bd0-f25c-448d-999c-3d4fd59684d5.json` | Governance/evidence; all PR3 deltas |
| 78 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000011-01990a89-bd18-4897-ab85-7a16601aecd4.json` | Governance/evidence; all PR3 deltas |
| 79 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000012-a482ec72-defa-450c-92b0-bb99269a5918.json` | Governance/evidence; all PR3 deltas |
| 80 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000013-e40035f8-4742-451e-a996-4463dee30fa3.json` | Governance/evidence; all PR3 deltas |
| 81 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000014-541667d4-6bdf-401d-92eb-c809bd0d153a.json` | Governance/evidence; all PR3 deltas |
| 82 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000015-b205ba80-4825-4e01-a0cf-12732cf79c2d.json` | Governance/evidence; all PR3 deltas |
| 83 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000016-3b2fec19-c458-4d3d-b614-c3f301917b74.json` | Governance/evidence; all PR3 deltas |
| 84 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000017-2b26a6c7-ab5f-46a2-aea3-72e8e213001e.json` | Governance/evidence; all PR3 deltas |
| 85 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000018-0dbc33f8-eb53-4020-a4ce-7c93933708d5.json` | Governance/evidence; all PR3 deltas |
| 86 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000019-50545a87-82cf-4771-8dfc-1089f3711216.json` | Governance/evidence; all PR3 deltas |
| 87 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000020-3c1d5eb0-8916-41a9-9358-c7b22ae6f35f.json` | Governance/evidence; all PR3 deltas |
| 88 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000021-d2e1b12e-d46d-481b-bd17-03f4c4fd9cf0.json` | Governance/evidence; all PR3 deltas |
| 89 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000022-70e7e9fb-38a9-4219-8fb0-36244d31bf16.json` | Governance/evidence; all PR3 deltas |
| 90 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000023-9e890e55-8967-4c03-a4fa-eefe2b2f1689.json` | Governance/evidence; all PR3 deltas |
| 91 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000024-3cd8960f-5a20-4d3e-b52a-e5a35e5779d1.json` | Governance/evidence; all PR3 deltas |
| 92 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000025-ead5ebcd-11b0-4cc8-888c-404e7ae976ff.json` | Governance/evidence; all PR3 deltas |
| 93 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000026-35d2e4e9-1706-4c5f-93df-52036c2f8875.json` | Governance/evidence; all PR3 deltas |
| 94 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000027-8cf0f23a-be46-446e-ace4-4f3a3b4320c9.json` | Governance/evidence; all PR3 deltas |
| 95 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000028-18cfeffd-48dd-48c6-8b99-6a13b0a27374.json` | Governance/evidence; all PR3 deltas |
| 96 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000029-9d936224-3a5e-46b9-b76a-f8485b856550.json` | Governance/evidence; all PR3 deltas |
| 97 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000030-afa6a3b2-d4c3-4197-a63e-4bab9de6bf3a.json` | Governance/evidence; all PR3 deltas |
| 98 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000031-7607118c-b48c-4f98-bcb1-8ba132bf1702.json` | Governance/evidence; all PR3 deltas |
| 99 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000032-1c18320c-23c4-4185-891a-3929ef7e9595.json` | Governance/evidence; all PR3 deltas |
| 100 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000033-713f38aa-ec46-4700-a8e9-5b167f177301.json` | Governance/evidence; all PR3 deltas |
| 101 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000034-f10e5dff-9a84-4461-8e61-54c16dda0d3d.json` | Governance/evidence; all PR3 deltas |
| 102 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000035-750fa529-8c23-46ae-a472-e602e7f72eb1.json` | Governance/evidence; all PR3 deltas |
| 103 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000036-438c4133-a5f9-421f-a634-42283da6a0b8.json` | Governance/evidence; all PR3 deltas |
| 104 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000037-53cd39df-f516-4707-95ed-ca9bed8bbe9c.json` | Governance/evidence; all PR3 deltas |
| 105 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000038-a5b02811-2658-4d1a-a30f-9afd7153303a.json` | Governance/evidence; all PR3 deltas |
| 106 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000039-371b090b-1784-4fc6-b73a-d21049d0c7d3.json` | Governance/evidence; all PR3 deltas |
| 107 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000040-a3d8acd6-32dd-468b-b736-ac2b699ae2b1.json` | Governance/evidence; all PR3 deltas |
| 108 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000041-776bc912-fb49-4dd5-970e-8c8ddf721642.json` | Governance/evidence; all PR3 deltas |
| 109 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000042-404111c6-fe92-4f8f-a294-222e0b7378ff.json` | Governance/evidence; all PR3 deltas |
| 110 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000043-a7f65e81-d845-4fd1-93c6-bcecb7e4aa01.json` | Governance/evidence; all PR3 deltas |
| 111 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000044-e35339c8-971d-4264-a823-ecefd3624228.json` | Governance/evidence; all PR3 deltas |
| 112 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000045-83243869-339c-4786-87f8-d38f9c869f8e.json` | Governance/evidence; all PR3 deltas |
| 113 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000046-35b15c4d-ccdd-49ea-91ce-b0439a2a6484.json` | Governance/evidence; all PR3 deltas |
| 114 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000047-67a9a963-e3b9-40c8-b7c1-e0fffa2259ff.json` | Governance/evidence; all PR3 deltas |
| 115 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000048-c372dcf8-ae8e-4fdd-9f43-e25459cfee1c.json` | Governance/evidence; all PR3 deltas |
| 116 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000049-4b8db7f1-c502-4937-bc30-a2e3df8467b9.json` | Governance/evidence; all PR3 deltas |
| 117 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000050-6b266ffb-e058-4d00-b0ae-367919edb714.json` | Governance/evidence; all PR3 deltas |
| 118 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000051-acdc49a4-ef3e-4c4b-93c0-69e385947999.json` | Governance/evidence; all PR3 deltas |
| 119 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000052-83bc879c-aa95-4216-8f49-cc776445aa73.json` | Governance/evidence; all PR3 deltas |
| 120 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000053-83771b62-3c4b-4d74-8575-8265ef06492a.json` | Governance/evidence; all PR3 deltas |
| 121 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000054-13d0f9db-10de-4f1c-8c3e-69051b6de1f7.json` | Governance/evidence; all PR3 deltas |
| 122 | `openspec/changes/workflow-decomposition-policy/.pipeline-run/revisions/000055-e4fe5bb1-0e06-4bf1-b703-0df94a4a5210.json` | Governance/evidence; all PR3 deltas |
| 123 | `openspec/changes/workflow-decomposition-policy/.pipeline-skill-confirmations.jsonl` | Governance/evidence; all PR3 deltas |
| 124 | `openspec/changes/workflow-decomposition-policy/.pipeline-skill-invocations.jsonl` | Governance/evidence; all PR3 deltas |
| 125 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000001-f5b09125-0fdd-457f-bc30-44f9f2c1b911.json` | Governance/evidence; all PR3 deltas |
| 126 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000002-8f851ec3-651a-4b77-a254-5eeaf78e575a.json` | Governance/evidence; all PR3 deltas |
| 127 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000003-a0ed9b52-6c4f-4628-9bee-5cf8f4f20158.json` | Governance/evidence; all PR3 deltas |
| 128 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000004-2f44fb49-3827-4cf0-abdd-59eb970c647a.json` | Governance/evidence; all PR3 deltas |
| 129 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000005-39bc2ce1-27b2-4ca1-9d40-b6366563dfd4.json` | Governance/evidence; all PR3 deltas |
| 130 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000006-fada6168-3978-40d6-a90a-ab0bc6c3a46c.json` | Governance/evidence; all PR3 deltas |
| 131 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000007-dc219086-6878-4304-8721-980d04563887.json` | Governance/evidence; all PR3 deltas |
| 132 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000008-c43b8fe2-e5a4-45f4-914e-a868c1f7a54d.json` | Governance/evidence; all PR3 deltas |
| 133 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000009-0f769a1e-780e-4e8f-a0a6-a9e9bb1b019b.json` | Governance/evidence; all PR3 deltas |
| 134 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000010-81691354-ad53-40b4-ab17-c7f5fee843f1.json` | Governance/evidence; all PR3 deltas |
| 135 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000011-8a61ac4b-dd73-458d-8f44-e34db828ef90.json` | Governance/evidence; all PR3 deltas |
| 136 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000012-3b60cb29-7489-4c30-9cae-320d635c79a7.json` | Governance/evidence; all PR3 deltas |
| 137 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000013-46f43ec8-d968-419d-bd85-0837dc885305.json` | Governance/evidence; all PR3 deltas |
| 138 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000014-0b035b66-179a-4333-b004-656af850bca8.json` | Governance/evidence; all PR3 deltas |
| 139 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000015-6b920513-98fd-4a4e-86f4-62ed197e32bc.json` | Governance/evidence; all PR3 deltas |
| 140 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000016-a1da2dd1-1646-4fe7-addb-41badbd9beb2.json` | Governance/evidence; all PR3 deltas |
| 141 | `openspec/changes/workflow-decomposition-policy/.pipeline-transitions/000017-e36e7b39-fb67-44c7-b22e-150ac5c0681e.json` | Governance/evidence; all PR3 deltas |
| 142 | `openspec/changes/workflow-decomposition-policy/.pipeline-workflow-governance.json` | Governance/evidence; all PR3 deltas |
| 143 | `openspec/changes/workflow-decomposition-policy/.pipeline-workflow-plan.json` | Governance/evidence; all PR3 deltas |
| 144 | `openspec/changes/workflow-decomposition-policy/.pipeline.yaml` | Governance/evidence; all PR3 deltas |
| 145 | `openspec/changes/workflow-decomposition-policy/REVIEW.md` | Governance/evidence; all PR3 deltas |
| 146 | `openspec/changes/workflow-decomposition-policy/design.md` | Governance/evidence; all PR3 deltas |
| 147 | `openspec/changes/workflow-decomposition-policy/proposal.md` | Governance/evidence; all PR3 deltas |
| 148 | `openspec/changes/workflow-decomposition-policy/specs/codex-skill-receipt-current-turn/spec.md` | Governance/evidence; all PR3 deltas |
| 149 | `openspec/changes/workflow-decomposition-policy/specs/workflow-decomposition-policy/spec.md` | Governance/evidence; all PR3 deltas |
| 150 | `openspec/changes/workflow-decomposition-policy/specs/workflow-definition/spec.md` | Governance/evidence; all PR3 deltas |
| 151 | `openspec/changes/workflow-decomposition-policy/tasks.md` | Governance/evidence; all PR3 deltas |
| 152 | `packages/automation/src/admission/execution-context.ts` | workflow-decomposition-policy |
| 153 | `packages/automation/src/admission/loop-admission-service.ts` | workflow-decomposition-policy |
| 154 | `packages/automation/src/admission/loop-admission-types.ts` | workflow-decomposition-policy |
| 155 | `packages/automation/src/admission/loop-admission.test.ts` | workflow-decomposition-policy |
| 156 | `packages/automation/src/admission/loop-admission.ts` | workflow-decomposition-policy |
| 157 | `packages/automation/src/admission/skill-action-authority.test.ts` | workflow-decomposition-policy |
| 158 | `packages/automation/src/admission/skill-action-authority.ts` | workflow-decomposition-policy |
| 159 | `packages/automation/src/admission/workflow-action-admission.test.ts` | workflow-decomposition-policy |
| 160 | `packages/automation/src/admission/workflow-action-admission.ts` | workflow-decomposition-policy |
| 161 | `packages/automation/src/admission/workflow-action-authority-binding.ts` | workflow-decomposition-policy |
| 162 | `packages/automation/src/queue/claim.integration.test.ts` | workflow-decomposition-policy |
| 163 | `packages/automation/src/queue/claim.ts` | workflow-decomposition-policy |
| 164 | `packages/automation/src/queue/scan.integration.test.ts` | workflow-decomposition-policy |
| 165 | `packages/automation/src/queue/scan.test.ts` | workflow-decomposition-policy |
| 166 | `packages/automation/src/queue/scan.ts` | workflow-decomposition-policy |
| 167 | `packages/automation/src/scheduler/admission-port-compatibility.ts` | workflow-decomposition-policy |
| 168 | `packages/automation/src/scheduler/scheduler-execution.ts` | workflow-decomposition-policy |
| 169 | `packages/automation/src/scheduler/scheduler-service.ts` | workflow-decomposition-policy |
| 170 | `packages/automation/src/scheduler/scheduler-support.ts` | workflow-decomposition-policy |
| 171 | `packages/automation/src/scheduler/scheduler.test.ts` | workflow-decomposition-policy |
| 172 | `packages/automation/src/sdk/dockerRunChange.integration.test.ts` | workflow-decomposition-policy |
| 173 | `packages/automation/src/sdk/sdk.integration.test.ts` | workflow-decomposition-policy |
| 174 | `packages/automation/src/sdk/sdk.ts` | workflow-decomposition-policy |
| 175 | `packages/automation/src/triage/workflow-run-create-repository.test.ts` | workflow-decomposition-policy |
| 176 | `packages/cli/dist/tenon.mjs` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 177 | `packages/cli/src/afk-run.integration.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 178 | `packages/cli/src/commands/afk-executor.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 179 | `packages/cli/src/commands/afk-executor.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 180 | `packages/cli/src/commands/afk-workflow-authority.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 181 | `packages/cli/src/commands/afk.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 182 | `packages/cli/src/commands/init.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 183 | `packages/cli/src/deps.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 184 | `packages/cli/src/integration-harness.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 185 | `packages/cli/src/internal-skill-gate-hook.integration.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 186 | `packages/cli/src/main.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 187 | `packages/cli/src/skill-action-authority-provider.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 188 | `packages/cli/src/skill-action-authority-provider.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 189 | `packages/cli/src/skill-bundle-lifecycle.integration.test.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 190 | `packages/cli/src/test-support.ts` | workflow-decomposition-policy + codex-skill-receipt-current-turn |
| 191 | `packages/dashboard-app/dist/assets/AfkView-PW3ozuz3.js` | workflow-definition + workflow-decomposition-policy |
| 192 | `packages/dashboard-app/dist/assets/HostTargetPlanView-BOKscJR5.js` | workflow-definition + workflow-decomposition-policy |
| 193 | `packages/dashboard-app/dist/assets/MachineView-C9bBXm5X.js` | workflow-definition + workflow-decomposition-policy |
| 194 | `packages/dashboard-app/dist/assets/ProgressView-DvYUI_xK.js` | workflow-definition + workflow-decomposition-policy |
| 195 | `packages/dashboard-app/dist/assets/SolutionView-DwMsbzSo.js` | workflow-definition + workflow-decomposition-policy |
| 196 | `packages/dashboard-app/dist/assets/WorkbenchView-Cpc_sLlI.js` | workflow-definition + workflow-decomposition-policy |
| 197 | `packages/dashboard-app/dist/assets/WorkbenchView-CsR8xvsR.js` | workflow-definition + workflow-decomposition-policy |
| 198 | `packages/dashboard-app/dist/assets/auditClient-DTu-0XWP.js` | workflow-definition + workflow-decomposition-policy |
| 199 | `packages/dashboard-app/dist/assets/automationClient-BHUpwPBG.js` | workflow-definition + workflow-decomposition-policy |
| 200 | `packages/dashboard-app/dist/assets/index-CO5mZPQS.js` | workflow-definition + workflow-decomposition-policy |
| 201 | `packages/dashboard-app/dist/assets/index-DDFFwFsS.css` | workflow-definition + workflow-decomposition-policy |
| 202 | `packages/dashboard-app/dist/assets/index-DPqN9u16.css` | workflow-definition + workflow-decomposition-policy |
| 203 | `packages/dashboard-app/dist/assets/index-DvSvJ2bY.js` | workflow-definition + workflow-decomposition-policy |
| 204 | `packages/dashboard-app/dist/assets/loopsClient-B7ww5z-A.js` | workflow-definition + workflow-decomposition-policy |
| 205 | `packages/dashboard-app/dist/index.html` | workflow-definition + workflow-decomposition-policy |
| 206 | `packages/dashboard-app/src/api/boundaryDecoders.test.tsx` | workflow-definition + workflow-decomposition-policy |
| 207 | `packages/dashboard-app/src/api/governanceSchema.test.tsx` | workflow-definition + workflow-decomposition-policy |
| 208 | `packages/dashboard-app/src/api/governanceSchema.ts` | workflow-definition + workflow-decomposition-policy |
| 209 | `packages/dashboard-app/src/api/governanceTypes.ts` | workflow-definition + workflow-decomposition-policy |
| 210 | `packages/dashboard-app/src/api/snapshotDecoder.ts` | workflow-definition + workflow-decomposition-policy |
| 211 | `packages/dashboard-app/src/api/workflowPolicySnapshotDecoder.ts` | workflow-definition + workflow-decomposition-policy |
| 212 | `packages/dashboard-app/src/i18n/translations.ts` | workflow-definition + workflow-decomposition-policy |
| 213 | `packages/dashboard-app/src/types.ts` | workflow-definition + workflow-decomposition-policy |
| 214 | `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx` | workflow-definition + workflow-decomposition-policy |
| 215 | `packages/dashboard-app/src/workbench/WorkbenchView.tsx` | workflow-definition + workflow-decomposition-policy |
| 216 | `packages/dashboard-app/src/workbench/WorkflowPolicyEditor.test.tsx` | workflow-definition + workflow-decomposition-policy |
| 217 | `packages/dashboard-app/src/workbench/WorkflowPolicyEditor.tsx` | workflow-definition + workflow-decomposition-policy |
| 218 | `packages/dashboard-app/src/workbench/workbenchDefinition.ts` | workflow-definition + workflow-decomposition-policy |
| 219 | `packages/kernel/src/flow/index.ts` | workflow-definition |
| 220 | `packages/kernel/src/flow/manifest-derive.test.ts` | workflow-definition |
| 221 | `packages/kernel/src/flow/manifest.ts` | workflow-definition |
| 222 | `packages/kernel/src/index.ts` | workflow-definition + workflow-decomposition-policy |
| 223 | `packages/kernel/src/state/index.ts` | workflow-decomposition-policy |
| 224 | `packages/kernel/src/state/workflow-action-authority-record.ts` | workflow-decomposition-policy |
| 225 | `packages/kernel/src/state/workflow-action-authority-snapshot.test.ts` | workflow-decomposition-policy |
| 226 | `packages/kernel/src/state/workflow-action-authority-snapshot.ts` | workflow-decomposition-policy |
| 227 | `packages/kernel/src/state/workflow-plan-policy-snapshot.test.ts` | workflow-decomposition-policy |
| 228 | `packages/kernel/src/state/workflow-plan-snapshot.ts` | workflow-decomposition-policy |
| 229 | `packages/kernel/src/state/workflow-run-repository.test.ts` | workflow-decomposition-policy |
| 230 | `packages/kernel/src/state/workflow-run-repository.ts` | workflow-decomposition-policy |
| 231 | `packages/kernel/src/workflow/action-authority-types.ts` | workflow-definition + workflow-decomposition-policy |
| 232 | `packages/kernel/src/workflow/compile.ts` | workflow-definition + workflow-decomposition-policy |
| 233 | `packages/kernel/src/workflow/decomposition-policy-evaluator.test.ts` | workflow-definition + workflow-decomposition-policy |
| 234 | `packages/kernel/src/workflow/decomposition-policy-evaluator.ts` | workflow-definition + workflow-decomposition-policy |
| 235 | `packages/kernel/src/workflow/effective-plan-snapshot-compat.ts` | workflow-definition + workflow-decomposition-policy |
| 236 | `packages/kernel/src/workflow/effective-plan.test.ts` | workflow-definition + workflow-decomposition-policy |
| 237 | `packages/kernel/src/workflow/effective-plan.ts` | workflow-definition + workflow-decomposition-policy |
| 238 | `packages/kernel/src/workflow/ir.ts` | workflow-definition + workflow-decomposition-policy |
| 239 | `packages/kernel/src/workflow/parse-policy.ts` | workflow-definition + workflow-decomposition-policy |
| 240 | `packages/kernel/src/workflow/parse.ts` | workflow-definition + workflow-decomposition-policy |
| 241 | `packages/kernel/src/workflow/policy-codec.test.ts` | workflow-definition + workflow-decomposition-policy |
| 242 | `packages/kernel/src/workflow/policy-snapshot.test.ts` | workflow-definition + workflow-decomposition-policy |
| 243 | `packages/kernel/src/workflow/policy.test.ts` | workflow-definition + workflow-decomposition-policy |
| 244 | `packages/kernel/src/workflow/policy.ts` | workflow-definition + workflow-decomposition-policy |
| 245 | `packages/kernel/src/workflow/run-types.ts` | workflow-definition + workflow-decomposition-policy |
| 246 | `packages/kernel/src/workflow/serialize.ts` | workflow-definition + workflow-decomposition-policy |
| 247 | `packages/kernel/src/workflow/types.ts` | workflow-definition + workflow-decomposition-policy |
| 248 | `packages/kernel/src/workflow/workflow-plan-snapshot-types.ts` | workflow-definition + workflow-decomposition-policy |
| 249 | `packages/server/dist/dashboard.mjs` | workflow-definition + workflow-decomposition-policy |
| 250 | `packages/server/src/changeSnapshot.ts` | workflow-definition + workflow-decomposition-policy |
| 251 | `packages/server/src/server.test.ts` | workflow-definition + workflow-decomposition-policy |
| 252 | `packages/server/src/snapshot.test.ts` | workflow-definition + workflow-decomposition-policy |
| 253 | `packages/server/src/snapshot.ts` | workflow-definition + workflow-decomposition-policy |
| 254 | `packages/server/src/snapshotAuthority.integration.test.ts` | workflow-definition + workflow-decomposition-policy |
| 255 | `packages/server/src/types.ts` | workflow-definition + workflow-decomposition-policy |
| 256 | `packages/server/src/workflowSnapshot.ts` | workflow-definition + workflow-decomposition-policy |
| 257 | `packages/server/src/workflowSnapshotAuthority.test.ts` | workflow-definition + workflow-decomposition-policy |
| 258 | `packages/server/src/workflowSnapshotAuthority.ts` | workflow-definition + workflow-decomposition-policy |
| 259 | `packages/server/src/workflows.test.ts` | workflow-definition + workflow-decomposition-policy |
| 260 | `templates/manifest.yaml` | workflow-definition |
