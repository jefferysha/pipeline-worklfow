# Dashboard Trace Session Workspace — Verify Report

## Verification baseline

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
