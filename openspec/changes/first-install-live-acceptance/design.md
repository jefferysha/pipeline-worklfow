# Design: one-time lazy root anchor for live registration

## Current failure

`createDashboardServer` captures anchors only from the registry snapshot at
process startup or from `POST /api/projects`. The CLI writes the same
registry directly after a successful `pipeline init`, so the dashboard sees
the root in `/api/snapshot` but cannot serve workflow/track APIs.

## Chosen design

In `workflowRootForRequest`, retain the current order:

1. Normalize the submitted root and verify it is in the current machine
   registry.
2. Reuse and validate an existing anchor when present.
3. When there is no anchor, capture a new `WorkflowRootAnchor` from the
   registered path and store it in the map.

Capture happens only for a currently registered root and uses the existing
`captureWorkflowRootAnchor` checks: final path must be a real directory,
not a symlink, and its opened fd/realpath identities must agree. Once stored,
the normal assertion path remains unchanged; a swapped root is rejected rather
than captured again. Registry removal still closes and drops the retained fd.

## Security rationale

The registry is already the server's trust boundary at startup. Accepting a
new entry on first use has the same trust source as restarting the server,
while preserving the stronger post-capture immutability check. The server does
not learn arbitrary request paths and never re-learns a failed existing anchor.

## Verification

Add a real server integration test that starts with an empty registry, writes
a project via the same kernel registry primitive used by CLI init, then
exercises a workflow/track endpoint successfully. Keep the existing
path-replacement tests as the no-reanchor proof. The isolated browser journey
will verify the complete user-facing path.
