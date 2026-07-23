---
name: nestjs-patterns
description: First-party NestJS layering and test guidance.
license: MIT
metadata:
  author: pipeline-lite
---

# NestJS Patterns

Keep controllers thin, application services explicit, and infrastructure behind ports. Validate
input at the boundary, preserve the project's error contract, and test domain behavior separately
from framework wiring. Avoid leaking ORM or HTTP types into core business rules.
