# Learning: Workflow Runtime Integrity

## What caused the original failures

- The router treated any previously active Change as recoverable context, so a
  new unrelated conversation could inherit an old objective.
- Track selection conflated manual availability with content-scoring
  eligibility, leaving no neutral executable Workflow entry.
- The implementation baseline included pipeline and verifier-owned output, so
  normal receipts and browser evidence invalidated Verify.
- Custom Workflows had no reserved canonical completion for a terminal
  `archive` node, leaving otherwise completed runs active.
- Dashboard process identity and release identity were not checked together,
  allowing an obsolete non-default port to survive an update.

## Durable rules

- Resume only after explicit user intent and bind continuous authorization to
  one Change.
- Keep `chat`, `simple`, routable governed Tracks, and manual `free` execution
  semantically distinct.
- Bind router caches to a release contract digest, not file timestamps.
- Exclude control/verifier-owned roots by ownership while retaining shipped
  artifacts in the implementation fingerprint.
- Complete terminal Archive only after the Workflow's declared skill, guard,
  document, and review contracts.
- Operate one managed dashboard from the active release on port `18765`.
