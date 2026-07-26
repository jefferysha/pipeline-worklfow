---
name: deployment-patterns
description: First-party deployment planning, rollout, and rollback discipline.
license: MIT
metadata:
  author: tenon
---

# Deployment Patterns

Define preflight checks, configuration ownership, rollout order, monitoring signals, and rollback
conditions before release. Make migrations and compatibility windows explicit. Do not claim a
deployment is safe until its runtime health and recovery path have been verified.
