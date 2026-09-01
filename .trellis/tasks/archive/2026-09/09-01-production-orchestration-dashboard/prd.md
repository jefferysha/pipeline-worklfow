# Production orchestration dashboard

## Goal

构建实时看板、Skill/MCP 产出与阻塞展示，以及带 revision 控制的操作面

## Requirements

- Add a production orchestration board that consumes typed snapshots/events, not ad-hoc server fields.
- Render Change, Work Item, Run and Gate lanes with selected Skill/MCP/version, dependencies, resource claims, lease, artifact refs, validation and blocker reasons.
- Add safe controls for pause/resume/approve/reject/retry/cancel/replan/bind artifact with confirmation, progress and failure states.
- Handle SSE reconnect using last event/revision, stale revision conflicts, unavailable capabilities and reduced-motion/accessibility requirements.
- Keep existing Dashboard views compatible and expose the new board through truthful capability flags.

## Acceptance Criteria

- [ ] A live fixture updates the board from intake through completed or blocked without page reload.
- [ ] Refresh/reconnect restores the last canonical revision and does not duplicate events or optimistic state.
- [ ] Every control sends expected revision and displays conflict/reload guidance; no UI code writes status directly.
- [ ] Opaque output is shown only through safe summary/artifact references; secrets and raw provider payloads are absent.
- [ ] Keyboard, screen-reader, focus, contrast and reduced-motion tests pass for lanes, details and destructive controls.
