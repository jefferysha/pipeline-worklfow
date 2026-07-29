# Desktop browser acceptance

Acceptance ran against the real Dashboard server at
`http://127.0.0.1:18947/?view=machine` with an isolated local-only tap fixture.
No mobile viewport, mobile layout, or mobile screenshot was used.

## Width matrix

| Viewport | Workspace | Session rail | Detail | Horizontal overflow |
| --- | ---: | ---: | ---: | --- |
| 1024×768 | 854px | 248px | 594px | none (`1024 = 1024`) |
| 1200×870 | 1030px | 288px | 730px | none (`1200 = 1200`) |
| 1440×900 | 1054px | 288px | 754px | none (`1440 = 1440`) |
| 1920×1080 | 1054px | 288px | 754px | none (`1920 = 1920`) |

## State and interaction evidence

- Ready: session identity, summary, filters, and seven compact timeline rows.
- Unselected: stable detail placeholder with no implicit timeline request.
- Session empty/error: empty copy, alert, retry action, and stable detail.
- Timeline known-empty/error/partial: distinct copy, retry path where applicable,
  preserved session identity, and one valid row retained in the partial fixture.
- Filter empty: failure filter on an all-success session shows a clear-filter
  recovery without claiming the session itself is empty.
- Keyboard: Escape closes detail, clears selection, and restores focus to the
  originating session button.
- Rapid selection: a second selection owns the resulting detail; stale results
  do not reopen or overwrite it.
- Theme/motion: ready state was inspected in light and dark themes; the loaded
  production stylesheet contains the global `prefers-reduced-motion: reduce`
  zero-duration fallback used by the new transitions.
- Console: zero browser console entries after the acceptance sequence.

The PNG files in this directory are viewport screenshots captured during that
acceptance run.

