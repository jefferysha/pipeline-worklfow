---
name: openspec-apply-change
description: First-party application of a change delta spec into durable main OpenSpec evidence.
license: MIT
metadata:
  author: tenon
  version: "2.0.0"
---

# OpenSpec Apply Change

## Document language

The applied specification follows the Change-pinned locale and defaults to Chinese. Use
`tenon document scaffold <change> applied-spec` for a missing structure, then replace every
placeholder with truthful delivery content in that pinned locale. Keep paths, document kinds, producer ids,
commands, hashes, and OpenSpec machine tokens in English. A scaffold is not evidence that this
Skill ran.

Apply approved delta specifications using the files already owned by the pipeline. This is normally
called in ship after verification, and it does not invoke an external OpenSpec CLI.

1. Resolve the active change using `tenon status <change>` and confirm `phase=ship` plus
   `verify_result=pass`. Read the governed inputs first:

   ```bash
   tenon document read "<change>" all
   ```

2. For every `openspec/changes/<change>/specs/<capability>/spec.md`, read the delta and its target
   `openspec/specs/<capability>/spec.md`. Apply additions, modifications, and removals deliberately;
   preserve unrelated main-spec content. If the target does not exist, create it with the delta's
   durable requirements. Compare requirement and scenario identities before writing. Re-running an
   already applied delta must be a byte-preserving no-op, not a duplicate append or conflict.

3. Write `openspec/changes/<change>/applied-spec.md` with the source delta paths, main-spec target
   paths, before/after digests, `changed` or `no-op` result, summary of effects, date, and any
   conflict resolution. This report is the auditable
   application receipt, not a substitute for the main specs themselves.

4. After this Skill has actually been invoked, register the receipt:

   ```bash
   CHANGE="<change>"
   tenon document record "$CHANGE" applied-spec \
     "openspec/changes/$CHANGE/applied-spec.md" --producer openspec-apply-change
   tenon document status "$CHANGE"
   ```

5. Report the applied paths and remaining release work. Do not push, create a pull request, or
   archive the change unless the active pipeline phase and user authority permit it.
