# ADR: Bind Codex skill completion evidence to an explicit Change

## Status

Accepted

## Context

The default OpenSpec ledger and custom workflow DAG require evidence that a packaged Skill was
actually loaded.  Claude normally supplies this through `PostToolUse`.  In a real Codex App normal
conversation, a bundled `SKILL.md` read reached `PreToolUse` and completed in the host transcript,
but the paired `PostToolUse` callback did not arrive.  The old fallback also selected the newest
Change by mtime, which could attach evidence from a new conversation to an unrelated old Change.

## Decision

Keep native `PostToolUse` as the primary fast path.  Add a narrow Codex adapter path with all of
the following conditions:

1. `pipeline` resolves a new, resumed, or user-selected Change and runs `pipeline session activate
   <change>` before any phase Skill is loaded.
2. A Codex `PreToolUse` hook accepts only an exact bundled-cache `skills/<id>/SKILL.md` read and
   writes a pending receipt bound to that selected Change, host session, turn, tool-use id, and
   transcript path.  It never writes workflow history directly.
3. `pipeline document record` and custom workflow DAG checks hold the target Change lock, inspect
   only same-Change receipts, and append `CodexSkillRead` only after the host-owned JSONL proves a
   completed `exec` call for that exact asset plus successful output.
4. Evidence, decision recording, and custom DAG dispatch resolve the explicit active pointer; they
   no longer choose a Change by modification time.  Missing or malformed selection/evidence means
   no write or no proof, never a guessed target.

The kernel still consumes the existing append-only history contract.  Transcript parsing remains
adapter infrastructure and does not create a second document-ledger format.

## Consequences

- A stale old Change cannot satisfy a new Change's document or DAG proof.
- A pending PreTool receipt, a project-controlled `SKILL.md`, an unrelated transcript turn, or an
  unsuccessful output cannot unlock a document record or dependent Skill.
- Normal Codex conversations recover from the observed missing callback without using `codex exec`
  as the workflow mechanism.
- Direct phase-skill use must explicitly activate a target first; without that deterministic target
  the hook intentionally records nothing rather than guessing.
