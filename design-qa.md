# Progress page redesign QA

## Scope

- Real dashboard route: `view=progress`
- Status and workflow filters
- Seven-stage horizontally scrollable pipeline
- Real change cards, detail drawer, and create-and-lock dialog
- Desktop and 904 px responsive behavior

## Visual source and evidence

- Reference truth: `/tmp/pipeline-progress-style.dilMgS/.v0-verify3.png`
- Final desktop implementation, 1440 x 900: `/tmp/pipeline-progress-final-1440x900.png`
- Combined same-state comparison: `/tmp/pipeline-progress-comparison-final.png`
- Final responsive implementation, 904 x 994: `/tmp/pipeline-progress-responsive-visible.png`

The reference and implementation comparison uses the same project fixture, light theme, workflow, task data, and 1440 x 900 viewport. The final iteration moved overflow inside the fixed-width workflow card so its header, right border, and `PIPELINE` label stay visible while only the seven-stage rail scrolls.

## Visual review

### P0

- None.

### P1

- None.

### P2

- The product shell keeps its existing dynamic project header and does not add the reference's static `default` badge. Workflow context remains explicit in the real page filter and pipeline header, avoiding a duplicated value that could drift from the selected workflow.

## Interaction checks

- Status filter: selecting `等你动手` keeps `ui-real-browser` active, dims the two nonmatching cards, and restores correctly with `全部`.
- Workflow filter: selecting `default` and restoring `全部 workflow` updates the real selected state.
- Task card: `ui-real-browser` opens the real detail drawer with the correct label; close removes the drawer.
- Create entry: `创建并锁定` opens the real dialog with name and intent fields; cancel closes it without mutation.
- Responsive: at 904 x 994 the document remains 904 px wide, the workflow card remains readable, and only the stage rail scrolls horizontally.

## Runtime checks

- Browser console warnings/errors: none.
- Dashboard document, `/api/snapshot`, and `/api/workflows?root=...`: HTTP 200.
- Focused progress tests: 63 passed.
- Full dashboard suite: 45 files / 885 tests passed.
- Dashboard TypeScript check: passed.
- Production dashboard build: passed (Vite emitted only the existing large-chunk advisory).

final result: passed
