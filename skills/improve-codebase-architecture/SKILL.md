---
name: improve-codebase-architecture
description: First-party architecture review for backend and cross-cutting pipeline changes.
license: MIT
metadata:
  author: tenon
---

# Improve Codebase Architecture

Map the relevant boundaries, ownership, data flow, and failure modes before proposing changes.
Prefer existing domain contracts and seams over new cross-layer dependencies. Identify coupling,
state ownership, migration implications, and observability gaps. Record material alternatives and
the selected trade-off in an ADR.
