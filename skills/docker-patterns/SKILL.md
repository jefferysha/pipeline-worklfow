---
name: docker-patterns
description: First-party container build, runtime, and supply-chain checklist.
license: MIT
metadata:
  author: pipeline-lite
---

# Docker Patterns

Use minimal deterministic images, non-root runtime users, explicit health checks, and no secrets in
layers. Keep development and production configuration separate. Build and run the image during
verification; record the tag, command, ports, and any environment assumptions.
