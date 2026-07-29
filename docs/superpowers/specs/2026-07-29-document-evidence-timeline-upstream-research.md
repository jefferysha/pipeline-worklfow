# Document Evidence Timeline：上游研究与 Tenon Dashboard 映射

## 决策与范围

- 读取日期：2026-07-29（UTC+08:00）。
- 问题：怎样让 Tenon Dashboard 解释一份治理文档**由谁/何时登记**、以及**是否被当前阶段以当前 digest 读取**，而不新增第二份状态、写端点或执行控制？
- 结论：在既有 `GET /api/snapshot` 的 document-evidence item 上增加可选、只读的时间线投影；它只呈现已验证 ledger fact，且当前读取只接受与记录 SHA-256 和当前 workflow visit 一致的 receipt。Dashboard 把它作为解释层，不作为 gate 或 transition 控制器。

本报告不复制上游代码，也不把 trace、verification-evidence composer、context-bundle preview 的既有能力重新包装为新功能。

## 固定上游版本与一手来源

| 上游 | 默认分支固定 SHA | latest stable release/tag | 读取时的来源 |
| --- | --- | --- | --- |
| [Chorus](https://github.com/Chorus-AIDLC/Chorus) | `main` / [`be647877b4b56a61e480e939d6a6d31b3f84f7f9`](https://github.com/Chorus-AIDLC/Chorus/commit/be647877b4b56a61e480e939d6a6d31b3f84f7f9) | GitHub Release [`v0.14.5`](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5), same SHA | [repository API](https://api.github.com/repos/Chorus-AIDLC/Chorus), [release API](https://api.github.com/repos/Chorus-AIDLC/Chorus/releases/latest), [tag](https://github.com/Chorus-AIDLC/Chorus/tree/v0.14.5) |
| [Trellis](https://github.com/mindfold-ai/Trellis) | `main` / [`c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`](https://github.com/mindfold-ai/Trellis/commit/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c) | 无 GitHub Release（`/releases/latest` 为 404）；最新稳定语义 tag [`v0.6.10`](https://github.com/mindfold-ai/Trellis/tree/v0.6.10)，同 SHA。`v0.7.0-beta.1` 是 prerelease，不当作 stable。 | [repository API](https://api.github.com/repos/mindfold-ai/Trellis), [releases](https://github.com/mindfold-ai/Trellis/releases), [tags](https://api.github.com/repos/mindfold-ai/Trellis/tags) |
| [Comet](https://github.com/rpamis/comet) | `master` / [`5927d720c07aae80350511e1e2e611546c201ab4`](https://github.com/rpamis/comet/commit/5927d720c07aae80350511e1e2e611546c201ab4) | 最新 GitHub Release 是 prerelease [`0.4.0-beta.9`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9)；稳定 tag 回退为 [`0.3.9`](https://github.com/rpamis/comet/tree/0.3.9) / `053f76d8ac6aaa499b1d3f8752cb5637fc4fb914`。 | [repository API](https://api.github.com/repos/rpamis/comet), [releases API](https://api.github.com/repos/rpamis/comet/releases/latest), [tags](https://api.github.com/repos/rpamis/comet/tags) |
| [Maestro-Flow](https://github.com/catlog22/maestro-flow) | `master` / [`5375fb589f182c1c7e9cade69b4acd3ccd03bac1`](https://github.com/catlog22/maestro-flow/commit/5375fb589f182c1c7e9cade69b4acd3ccd03bac1) | GitHub Release [`v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58) / `be4cf1f8f7931574c720abe0dc8d813fb29abc21` | [repository API](https://api.github.com/repos/catlog22/maestro-flow), [release API](https://api.github.com/repos/catlog22/maestro-flow/releases/latest), [tag](https://github.com/catlog22/maestro-flow/tree/v0.5.58) |
| [claude-tap](https://github.com/liaohch3/claude-tap) | `main` / [`547925c9bd66f73cdcf9a4779fc88a4ffa247738`](https://github.com/liaohch3/claude-tap/commit/547925c9bd66f73cdcf9a4779fc88a4ffa247738) | GitHub Release [`v0.1.141`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141), same SHA | [repository API](https://api.github.com/repos/liaohch3/claude-tap), [release API](https://api.github.com/repos/liaohch3/claude-tap/releases/latest), [tag](https://github.com/liaohch3/claude-tap/tree/v0.1.141) |

All pins above were resolved from the repositories' GitHub APIs on 2026-07-29; release/tag status is deliberately distinguished from a moving default branch.

## Source-backed signals and applicable limits

| Source | Verified signal | Tenon mapping / non-copy boundary |
| --- | --- | --- |
| Chorus [AI-DLC workflow](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/README.md#ai-dlc-workflow) and [permission matrix](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/docs/PERMISSIONS.md) | It separates document writes, task reporting, and human-level verify/admin actions; its documentation says agent permissions gate REST, MCP, and UI. | Make the timeline an explanatory read surface only. It must not offer approval, re-record, re-read, repair, or transition controls, because those would expand the Dashboard's authority boundary. |
| Trellis [task-artifact design](https://github.com/mindfold-ai/Trellis/blob/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c/.trellis/tasks/archive/2026-05/05-10-task-artifacts-and-tiers/design.md) | Artifact consumers have a defined read order; optional artifacts are skipped; its SessionStart context stays compact and loads details on demand. It explicitly declines a new persistent artifact-metadata store. | Preserve one canonical Tenon ledger and expose only a compact per-document fact. Do not introduce a second “timeline database”, inline document bodies, or infer a read from artifact presence. |
| Comet [0.4 architecture](https://github.com/rpamis/comet/blob/5927d720c07aae80350511e1e2e611546c201ab4/docs/architecture/ARCHITECTURE.md) | It separates user-facing state from resumable run state and stores trajectory/context/artifacts/checkpoints so interrupted work can be recovered from evidence rather than agent recollection. | A Dashboard event needs identity binding, not just a friendly timestamp: the read projection must remain tied to the currently effective digest and run visit. Tenon already owns those facts; no Comet-style runtime is needed. |
| Maestro-Flow [README](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/README.md) and [dashboard event bus](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/dashboard/src/server/state/event-bus.ts) | It presents an adaptive lifecycle with verify/review/test decision points and ships a visual dashboard/event infrastructure. | A chronological display helps orient a developer, but it must never claim that temporal order implies successful gating. Tenon remains the source of phase/readiness truth. |
| claude-tap [README](https://github.com/liaohch3/claude-tap/blob/547925c9bd66f73cdcf9a4779fc88a4ffa247738/README.md) and [history retention helper](https://github.com/liaohch3/claude-tap/blob/547925c9bd66f73cdcf9a4779fc88a4ffa247738/claude_tap/history.py) | The local trace viewer emphasizes inspectable evidence, local storage, redaction, portable review artifacts, and bounded history cleanup. | Surface minimal metadata only: kind, producer identity, timestamps, and digest-valid read status. Do not put document body, host absolute path, arbitrary ledger history, prompt/trace content, or secrets into the snapshot. |

## Read-only Tenon baseline

The current change is `document-evidence-timeline-20260729`; its proposal and design describe a gap in explaining registered and read documents, not a new workflow or trace system.

| Layer | Current verified interface | Gap relevant to this change |
| --- | --- | --- |
| Kernel ledger | [`DocumentRecord`](../../../packages/kernel/src/state/document-ledger.ts) stores `kind`, safe project-relative `path`, SHA-256, `producer`, `recordedAt`, and digest-bound reads (`phase`, `sha256`, `readAt`, optional `visitId`). Duplicate phase/visit receipts are rejected. | Facts already exist but are not projected as per-item provenance/timing. |
| Server snapshot | [`DocumentEvidenceSnapshot`](../../../packages/server/src/types.ts) returns governed/pass/blockers plus item `kind`, status, requiredRead, paths, and producer candidates; [`snapshot.ts`](../../../packages/server/src/snapshot.ts) computes it from the ledger. | It collapses a recorded artifact into status and candidate producers, so a user cannot see the actual producer or when the relevant facts happened. |
| Dashboard decoder | [`decodeDocuments`](../../../packages/dashboard-app/src/api/snapshotDecoder.ts) validates the current narrow shape and safely drops invalid optional `documents`. | New fields need explicit decoding and an old-server fallback; the client must not derive time facts from file status. |
| Dashboard surface | [`TaskDocumentsSection`](../../../packages/dashboard-app/src/shared/TaskDocumentsSection.tsx) renders status, paths, expected producers, blockers, and its real empty state. | No loading/error/timeline explanation exists at the item level. |

The snapshot is already an SSE-refreshed, server-evaluated read model. That makes an optional snapshot projection lower risk and less duplicative than a new endpoint, client-side file read, or a persisted event store.

## Recommended minimal design rationale

1. **Project verified facts, not an event log.** Add optional evidence metadata per item: actual `producer`, `recordedAt`, and `currentReadAt` only when a receipt belongs to the displayed/current phase, matches the current record SHA-256, and (where available) matches the current workflow visit. This is a timeline of the current proof chain, not an unbounded history browser.
2. **Keep absence truthful.** Missing ledger, no matching record, stale digest, unread required document, or a legacy receipt without current visit identity must render as the existing incomplete/error evidence—not as a “no activity yet” timeline fact. An absent optional field is compatible with old servers and must have a clear UI fallback.
3. **Preserve authority and privacy.** The route remains `GET /api/snapshot`; it performs no record/read/repair/transition. Do not send raw document content, absolute filesystem paths, non-current historical receipt IDs, host session data, or secrets to the browser.
4. **Avoid a false success narrative.** Display event labels such as “recorded” and “read for this phase”, with timestamp and actual producer, but do not turn them into pass verdicts. `documents.pass`, transition readiness, and review gates retain their current semantics.
5. **Use a graceful compact UI.** In the existing document section, show a small ordered two-event line per eligible item (recorded → current-phase read), locale-formatted in Chinese and English. Preserve current status/paths/blockers, plus loading/error/empty states for the snapshot rather than inventing a separate client fetch.

## Alternatives considered

| Alternative | Result | Reason |
| --- | --- | --- |
| New persistent timeline/event store | Reject | Duplicates ledger/run history, adds mutation/concurrency/reconciliation risk, and contradicts Trellis's useful “no new artifact metadata store” boundary. |
| Expose every receipt and ledger revision | Reject | Makes old/stale reads easy to misread as current proof and enlarges privacy/payload surface. |
| Add a separate timeline endpoint | Defer | Could be justified for pagination/history later, but the current item facts fit the existing snapshot and preserve one refresh/error model. |
| Optional current-proof metadata on snapshot items | Recommend | Small read-only end-to-end slice; preserves compatibility and exposes the exact facts developers need to diagnose a blocked phase. |

## Acceptance and open questions for the next design/spec step

- Server tests should cover record-only, matching current read, stale digest receipt, legacy/no-visit receipt, missing ledger, and multiple records without leaking a non-current read.
- Decoder tests should cover full new DTO, old DTO without timeline fields, malformed optional timeline fields, and no whole-snapshot crash.
- Dashboard tests should cover Chinese/English labels, recorded-only, recorded-and-read, incomplete/stale state, snapshot loading/error/empty behavior, and keyboard-readable ordering.
- Decide whether a record kind can legitimately aggregate multiple paths in one item. If yes, the DTO must either provide an unambiguous per-record child entry or omit timing instead of pairing one timestamp with many paths.
- Decide the user-facing timestamp precision/timezone formatting once, in the existing i18n/formatting boundary; retain ISO timestamps in the API.

## Non-duplication conclusion

This is distinct from the existing Trace Timeline (tap request metadata), Context Bundle budget preview (handoff materialization), and Verification Evidence Composer (draft Markdown). The proposed surface answers a separate, currently unprojected question: **which governed OpenSpec document fact is current for this phase, who registered it, and has that exact digest been read during this visit?**
