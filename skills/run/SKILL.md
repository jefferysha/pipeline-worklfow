---
name: run
description: First-party safe local runtime launch checklist for verification.
license: MIT
metadata:
  author: pipeline-lite
---

# Run

Use the project's documented local command and avoid production credentials or destructive data.
State the URL, port, dependencies, and shutdown method. Verify that the process is healthy before
giving it to a browser or another verification lane, then stop it when no longer needed.
