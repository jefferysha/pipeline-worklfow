---
name: test-driven-development
description: First-party red-green-refactor discipline for pipeline build work.
license: MIT
metadata:
  author: tenon
---

# Test-driven Development

For each behavior change:

1. Add or update a focused test that fails for the intended reason.
2. Implement the smallest correct change to make it pass.
3. Refactor only while the relevant test stays green.
4. Run the narrow test first, then the wider suite selected by project rules.
5. Record any untestable boundary and the manual evidence used instead.

Never replace a failing assertion with a weaker one merely to make the suite pass.
