---
name: simple-task
description: "Execute a strictly bounded local change inside the built-in simple workflow."
---

# Simple Task

Use this skill only when the canonical Change has `track=simple`, `workflow=simple`, and
`phase=change`.

## Boundary check

Before editing, inspect the named target and its direct tests. The task stays simple only when all
of these are true:

- the user gave a concrete local target;
- the intended result is a typo, copy/comment edit, one-line or one-file value change, unused
  import removal, or equally bounded mechanical adjustment;
- it does not change a public API or contract, schema/migration, database behavior, auth/security,
  permissions, concurrency/transactions, dependencies, deployment/release, production data, or
  another external side effect;
- it does not require cross-module, frontend-plus-backend, architectural, or new-feature work.

If any condition is false, do not stretch this workflow. Run:

```bash
pipeline transition "$PIPELINE_CHANGE_NAME" scope-expanded
```

Then hand the original request and the simple Change name back to the root `pipeline` skill. It
must create a new default Change from `open` and immediately record the escalation edge:

```bash
pipeline set "<new-default-change>" depends_on "$PIPELINE_CHANGE_NAME"
```

The old Change remains terminal `escalated`, and the new Change's `depends_on` field is the
machine-readable audit link. Never mutate the simple Change into a default workflow in place.

## Execute

1. Make the smallest change that satisfies the stated target.
2. Do not perform opportunistic refactors or formatting outside the local target.
3. Run the narrowest meaningful static check or test for that file.
4. Re-evaluate the boundary after the diff. If scope expanded, use `scope-expanded`.
5. If the boundary still holds, run:

```bash
pipeline transition "$PIPELINE_CHANGE_NAME" change-complete
```

The next step is `verify`; load only its declared `verification-before-completion` skill. On a
focused verification failure use `verify-fail` and return to `change`. On success use
`verify-pass` and finish at `done`.
