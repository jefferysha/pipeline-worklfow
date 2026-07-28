# ADR: Stateless verification evidence composer

- Status: accepted
- Date: 2026-07-28
- Change: `verification-evidence-composer`

## Context

Verify reports need concrete checks, outcomes, skipped reasons, and risks, but
the Dashboard only exposes document evidence. 上游 A demonstrates concise
structured session sections that omit empty content. 上游 B demonstrates
closed, deterministic verification evidence with mutually exclusive evidence
and skip semantics. Tenon separately has a trusted `VerificationResult`
contract whose integrity must remain unchanged.

## Decision

Implement a separate untrusted draft formatter in the kernel, expose it through
a stateless Dashboard POST route protected by existing request guards and
registered-root validation, and add a Verify-only accessible Dashboard dialog.
The output is copyable Markdown. It is never persisted or interpreted as
trusted verification evidence.

## Consequences

- Users get a complete guided authoring path with deterministic output.
- Kernel, HTTP, and UI share one contract instead of duplicating formatting.
- Existing state, ledger, report, gate, and trusted verification behavior stay
  compatible.
- Users retain responsibility for reviewing and explicitly placing the
  fragment into the governed report.
- Automatic report mutation can be considered later only with a separate CAS
  and document-governance design.
