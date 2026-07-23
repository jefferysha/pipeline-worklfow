---
name: verify
description: First-party runtime behavior verification protocol.
license: MIT
metadata:
  author: pipeline-lite
---

# Verify

Run the changed system through its real entry points. Capture command, environment, input, expected
result, observed result, and error behavior. Do not substitute a successful build for a runtime
check; report an unavailable runtime as blocked evidence instead of a pass.
