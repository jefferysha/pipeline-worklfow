# Pet Adoption Center — Lessons Learned

## Browser evidence must remain observable without becoming implementation state

The responsive acceptance run produced screenshots and temporary browser logs.
Durable screenshots belong under `design-demos/shots/`, while transient browser
state belongs in verifier-owned roots that the workspace fingerprint excludes.
This keeps visual evidence reviewable without invalidating the Build baseline.

## Custom Workflows must enforce their declared skill DAG

The `pet-adoption-live` Workflow correctly blocked Ship until `github-ops` had
an auditable read receipt. A custom Workflow is therefore not just a UI label:
its real phase graph, serial skill dependencies, document reads, reviews, and
guards must all remain executable through the same canonical state machine.

## Accessibility defects need interaction-level regressions

Reduced motion, live error summaries, and hero-caption readability were only
closed after browser-level checks. Static markup checks alone are insufficient
for focus movement, announcement timing, responsive layout, and motion policy.
