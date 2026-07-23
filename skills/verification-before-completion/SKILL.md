---
name: verification-before-completion
description: First-party completion gate requiring fresh evidence rather than assertion.
license: MIT
metadata:
  author: pipeline-lite
---

# Verification Before Completion

Before reporting completion:

1. Re-read the requested outcome and acceptance criteria.
2. Run the relevant build, tests, static checks, and behavior smoke test.
3. Inspect the changed files and staged diff for unintended changes or secrets.
4. State exactly what passed, what was not run, and any remaining risk.
5. Write the verification report and register it in the document ledger before leaving verify.

Evidence must be current for this change; earlier green output is not proof after later edits.
