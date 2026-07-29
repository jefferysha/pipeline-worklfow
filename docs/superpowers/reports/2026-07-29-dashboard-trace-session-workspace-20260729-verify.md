# Dashboard Trace Session Workspace — Verify Report

## Verify cycle 1 baseline

- Change: `dashboard-trace-session-workspace-20260729`
- Frozen build SHA: `517bf6b130ef07268fc75da300b55d6781c3196a`
- Base SHA: `907dac067c17ed77fb440b91b20d64fd0f24773b`
- Scope: desktop Dashboard only, 1024–1920px
- Result: **FAIL — return to Build**

The repository fingerprint was unchanged while the four independent tracks ran:

- HEAD: `517bf6b130ef07268fc75da300b55d6781c3196a`
- tracked diff hash: `c4519b6310ac4cecf2bc462ec360294fc832523fdc8157502149dbbf36b81a17`
- status hash: `823f602985580a95e6321d0dd0dd1be7f623a26bdd42dcb7135f7efe9b870625`

## Track results

### Reviewer track — FAIL

The reviewer covered all 68 changed files. A clean `/tmp` rebuild produced the same committed Dashboard distribution.

- Medium: the new workspace requirement is incorrectly declared under `MODIFIED Requirements`. Isolated archive simulation fails because the requirement does not exist in the target spec.
- Medium: legal maximum-length `model`, `transport`, and `proxy_mode` values can expand the timeline grid or flex rows. The row metadata and proxy labels need explicit `min-width: 0`, bounded tracks, truncation, and accessible full-value titles.
- Low: five trailing-whitespace lines in the Chorus IA research document and extra end-of-file blank lines in the evidence README and review log.
- Low: the twelve screenshot files use `.png` names but contain JPEG/JFIF data.

### Codex review track — FAIL (degraded)

Codex independently reproduced the OpenSpec archive failure. After the first section-classification issue, it also proved that the modified requirement omits existing scenarios:

- `timeline 失败后重试`
- `Escape 返回 session 列表`

The long-running review was interrupted after these actionable failures were established. Log: `/tmp/dashboard-trace-session-workspace-codex-review.txt`.

### E2E track — PASS

The E2E reviewer exercised the built Dashboard with real fixture responses and verified:

- no implicit timeline request before an explicit session selection;
- session and timeline success, empty, known-empty, error, and partial states;
- source/status filtering;
- rapid session switching without stale response replacement;
- Escape returns focus to the selected session;
- 1024, 1200, 1440, and 1920px desktop widths without horizontal overflow;
- zero browser-console errors.

Evidence: `/tmp/trace-e2e-evidence-517bf6b/`.

### Visual track — PASS with Low observations

The visual review found no Critical, High, or Medium issues. At 1024 and 1200px, stacked rows make the detail panel tall and leave some rail whitespace, but the content remains clear and overflow-free. The dark-theme partial-state amber treatment is subtle, while its text and retry action remain clear.

Evidence: `/tmp/machine-traffic-*`.

## OpenSpec archive simulation

These checks passed:

```text
openspec show dashboard-trace-session-workspace-20260729 --type change --json --deltas-only
openspec validate dashboard-trace-session-workspace-20260729 --type change --strict
```

The isolated archive simulation failed without modifying the canonical target spec:

```text
trace-timeline MODIFIED failed for header
"### Requirement: Dashboard 提供桌面主从 Trace 工作区" - not found
```

After splitting the new requirement into `ADDED Requirements`, the simulation still rejects the modified interaction requirement because the two existing scenarios named above are absent. The main `trace-timeline` spec digest remained unchanged:

```text
e98d29da83f104399375dbd8cffb6b4843041f7c1816de68db4fae9f9ac143d1
```

## File-to-spec coverage

All changed files map to the change delta and target `openspec/specs/trace-timeline/spec.md`:

| Changed area | Files | Covered behavior |
| --- | --- | --- |
| Product UI | `TrafficPanel.tsx`, `TrafficPanelParts.tsx`, `translations.ts` | desktop rail/detail workspace, identity, metadata, states, focus, keyboard behavior |
| Product tests | `TrafficPanel.test.tsx` | selection, async race protection, filters, empty/error/partial states, Escape focus return |
| Built artifact | `packages/dashboard-app/dist/**` | exact production bundle used by browser verification |
| OpenSpec change | `proposal.md`, `design.md`, `tasks.md`, `specs/trace-timeline/spec.md`, `REVIEW.md` | governed intent, requirements, acceptance tasks, review record |
| Design evidence | `docs/adr/**`, `docs/superpowers/plans/**`, `docs/superpowers/specs/**` | Chorus IA boundary, Tenon visual language, implementation decisions |
| Browser evidence | `docs/ux/shots/dashboard-trace-session-workspace-20260729/**` | desktop widths, themes, success/empty/error/partial states |
| Pipeline evidence | `openspec/changes/dashboard-trace-session-workspace-20260729/.pipeline*` | phase, document, review, and transition receipts |

Coverage is complete, but acceptance is blocked by the two Medium findings and the failed archive simulation.

## Conclusion

The first Verify cycle fails. Return to Build, repair the delta-spec archive contract, bound legal maximum-length metadata, add a regression fixture and browser overflow check, normalize evidence file formats, and rerun the complete frozen-baseline verification.

## Verify cycle 2

- Frozen build SHA: `1077437b3eec7ecdda9493dba09772938a230272`
- Base SHA: `907dac067c17ed77fb440b91b20d64fd0f24773b`
- Scope: desktop Dashboard only, 1024–1920px
- Result: **FAIL — return to Build**

The reviewer, E2E, and visual tracks independently confirmed that the first
cycle's OpenSpec, long-metadata, whitespace, and evidence-format findings were
fixed. The target worktree fingerprint remained unchanged while all tracks ran:

- HEAD: `1077437b3eec7ecdda9493dba09772938a230272`
- tracked diff hash: `0bb23d34f9aa63507c6aaa3d15214fbcaa007ae7f01225401ea4826e5873da77`
- untracked-list hash: `bd0244893b140a07fa4468d8ec8bd71fc51da7e24b122eee29c97a90cda30d96`
- untracked-content hash: `1c05f8524ce983aff1ea9e3133527c840353886216c61e6e25a702f3d00d8a32`

### Reviewer track — FAIL

The reviewer covered all 97 frozen files, rebuilt twice from independent
`git archive` copies, ran the 67-file/1199-test web suite, and repeated strict
OpenSpec validation and archive application.

- Medium: the committed Dashboard dist is not reproducible from the frozen
  source. Clean builds produce `index-CzkgmIgP.css` and
  `index-DOeOBaL8.js`; the committed `index-Cgeu0Ldh.css` retains the removed
  `grid-cols-[6.5rem_minmax(0,1fr)_auto]` rule and would fail the CI dist
  freshness check.
- Low: `REVIEW.md` describes proxy as having a server-enforced 64-character
  limit, while only model/transport have the 256/64 decoder limits. The chosen
  64-character proxy remains a useful stress fixture but is not a contract.

### Codex review track — FAIL

The first Codex process was stopped when its proposed isolation command omitted
the temporary-directory `cd`; the target fingerprint proved that it made no
change. A replacement read-only `/tmp` review inspected only the supplied
frozen diff and found:

- Medium: the new workspace presentation is not fully desktop-scoped. New rail
  framing, persistent detail placeholder, summary shape, and divided rows are
  active below 1024px even though the accepted proposal says the phone layout
  remains unchanged.
- Low: while sessions are loading, empty, or failed, the detail placeholder
  still asks the user to select a session. The states remain semantically
  distinct, but the placeholder should not contradict an unavailable rail.

### E2E track — PASS

The real production Dashboard passed unselected/no-implicit-request, ready,
loading, empty, error, partial, filter-empty, rapid-switch, and Escape/focus
paths. At 1024, 1200, 1440, and 1920px, document/body/workspace/detail/entry
remained overflow-free. The 64/256/64 stress fixture preserved full proxy,
model, and transport titles, and the console contained zero warnings/errors.
Evidence: `/tmp/trace-e2e-v2-1077437/`.

### Visual track — PASS with Low observations

The visual reviewer found no Critical, High, or Medium issues across four light
desktop widths and 1440/1920 dark mode. Low observations were increased row
height for extreme metadata, quiet loading/empty rail presentation, and subtle
dark partial-state amber. All remained understandable without color alone.
Evidence: `/tmp/traffic-v2-*`.

### OpenSpec archive simulation — PASS

OpenSpec `1.6.0` showed one added and one modified requirement. Strict change
validation passed, the isolated archive produced `+1 added / ~1 modified`, and
the archived `trace-timeline` main spec passed strict validation. The canonical
main-spec digest was unchanged before and after:

```text
e98d29da83f104399375dbd8cffb6b4843041f7c1816de68db4fae9f9ac143d1
```

### Cycle 2 conclusion

The second Verify cycle fails with two Medium findings. Return to Build, rebuild
dist from the corrected source, preserve the pre-1024 presentation while
applying the new workspace only at desktop breakpoints, correct the proxy-limit
wording and state-aware unselected presentation, then rerun the complete
frozen-baseline verification.
