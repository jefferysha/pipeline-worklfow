---
name: postgres-patterns
description: First-party PostgreSQL schema, migration, and query review.
license: MIT
metadata:
  author: tenon
---

# PostgreSQL Patterns

Model constraints in the schema, write reversible migrations where feasible, and explain indexes
with the query they protect. Plan rollout and rollback for data changes. Test transaction,
concurrency, nullability, and authorization boundaries rather than only happy-path queries.
