---
name: openspec-propose
description: First-party OpenSpec proposal and default-change artifact authoring.
license: MIT
metadata:
  author: pipeline-lite
  version: "2.0.0"
---

# OpenSpec Propose

Create or complete the OpenSpec artifacts owned by the active default pipeline change. This is a
packaged workflow skill; it never requires the separately distributed `openspec` CLI.

## Inputs

- A clear feature, fix, research, or product request.
- The selected `change`, `track`, and `preset` from `<pipeline-dispatch>` or the `pipeline` CLI.

If the request cannot safely produce a kebab-case change name, ask the user. If several active
changes exist and the user asked to resume without naming one, use `pipeline list --json` and ask
them to select; never guess based on modification time.

## Procedure

1. Create the canonical change when it does not already exist:

   ```bash
   pipeline init "<change>" --track "<pm|frontend|backend>" --preset "<full|tweak|hotfix>"
   ```

   `pipeline init` creates the OpenSpec change directory, default document skeleton, document
   ledger, and canonical state atomically. Do not call `openspec new`, `openspec init`, or install
   a global dependency.

2. Read the current `proposal.md`, `design.md`, and `tasks.md` before changing them. Preserve any
   user-written or previously approved content; replace only explicit open-phase scaffold text.

3. Write the three open artifacts:

   - `proposal.md`: problem, intended outcome, scope, non-goals, and acceptance signal.
   - `design.md`: initial architecture or interaction hypothesis, risks, and questions that explore
     must validate. Do not fake a final architecture in open.
   - `tasks.md`: seven phase headings (`Open`, `Explore`, `Spec`, `Build`, `Verify`, `Ship`,
     `Archive`) with open work first. Implementation checkboxes belong in `Build` only after spec.

4. Verify that all three files are non-empty, then register their evidence with the real skill name:

   ```bash
   CHANGE="<change>"
   pipeline document record "$CHANGE" proposal "openspec/changes/$CHANGE/proposal.md" --producer openspec-propose
   pipeline document record "$CHANGE" openspec-design "openspec/changes/$CHANGE/design.md" --producer openspec-propose
   pipeline document record "$CHANGE" tasks "openspec/changes/$CHANGE/tasks.md" --producer openspec-propose
   pipeline document status "$CHANGE"
   ```

   A record can succeed only after the host has observed this Skill invocation. Do not invent a
   producer name to bypass that evidence check.

5. Present the three artifacts to the user and stop at the phase boundary. The pipeline entry skill
   owns the later explore/spec/build dispatch; do not implement application code from this skill.

## Guardrails

- The task list is a living source of truth, not a one-time Todo list.
- New capability requirements are created in spec as
  `openspec/changes/<change>/specs/<capability>/spec.md`; open must not pretend they already exist.
- When a file changes after registration, re-register it so its digest-bound evidence stays current.
