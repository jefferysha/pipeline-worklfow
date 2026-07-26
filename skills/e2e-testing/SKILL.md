---
name: e2e-testing
description: First-party end-to-end test design and execution guidance.
license: MIT
metadata:
  author: tenon
---

# End-to-end Testing

Choose tests that cross real boundaries: UI to API, command to filesystem, or workflow state to
generated evidence. Make fixtures isolated and assertions observable. Run the narrow scenario,
then the project's designated suite. Keep screenshots, logs, or structured output when an E2E
failure is diagnosed.
