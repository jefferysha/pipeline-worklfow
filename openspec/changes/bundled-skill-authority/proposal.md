# Proposal

## Problem

An explicitly selected pipeline-lite release/profile can be blocked when a
machine also contains a different global skill with the same bare id. The
runtime currently mixes the release's bundled root with unrelated Codex roots
inside one ambiguity set.

## Outcome

Treat the selected plugin release's bundled skills as the authoritative first
tier. Only when a requested id is absent there may the runner consult external
Codex or agent-neutral roots. Continue to fail loudly on ambiguity inside the
selected external tier.

## Scope

Production skill-content location and regression coverage for Codex and the
legacy runner-neutral adapter.

## Non-goals

Do not weaken access/schema checks, silently pick among multiple external
sources, or read Claude-only roots for a Codex runner.

## Acceptance signal

The real `default + pm` AFK loop runs past wiring when bundled and global
`brainstorming` contents differ, while external-source ambiguity tests remain
red.

## Intent

> TODO(open): The pipeline entry skill must turn the user's request into a concise problem, goal, scope, and acceptance signal.

## Scope

> TODO(open): Record the first agreed scope and explicitly mark assumptions for explore.
