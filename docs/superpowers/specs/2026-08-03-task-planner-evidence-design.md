# Generic Skill invocation evidence design

## Outcome

Every Skill, including Task Planner, can produce privacy-minimized, append-only, verifiable evidence of its bound inputs, questions/default decisions, terminal outcome, artifacts, and validators across interactive and AFK execution.

## Aggregate and identity

`SkillInvocationEvidenceV1` is a kernel bounded context with a strict event codec and repository. Every event binds `projectId`, `workflowDefinitionId`, `workflowRunId`, `stepId`, `stepVisit={runId,transitionSequence}`, optional `taskPlanRevisionId/workItemId`, and optional `attemptId/reservationId`. Redundant identities must agree; absence or mismatch fails closed. The public production command always derives these coordinates from canonical state; caller-supplied binding is not an exported seam.

Task Planner uses the same aggregate and declares its input/output schemas; it is not a privileged special case.

## Event model

```text
InvocationStarted
  -> QuestionAsked -> DecisionRecorded (0..N)
  -> InvocationCompleted | InvocationFailed | InvocationInterrupted
  -> ArtifactBindingIntent -> ArtifactBound (0..N, completed only)
```

Started and terminal events are unique. Exact replay is idempotent; conflicting replay is corruption. A started invocation without a terminal event remains incomplete and can only be closed as interrupted after ownership/recovery checks.

## Key rules

1. The repository uses the Change lock, strict closed JSONL records, append+fsync, bounded reads, and fail-closed handling of malformed lines.
2. Native/Codex adapters reuse the existing trusted Skill receipt verifier; a text claim or compatibility history line cannot mint v1 completion.
3. Invocation input/output proof stores schema IDs, field classifications, bounded digests, and validation verdicts, not raw prompts or raw Skill output.
4. QuestionEvent proves the versioned question key/schema/options and whether it was actually shown. It does not store display prose.
5. User decisions store stable selected option IDs; free text stores presence/classification and a keyed digest only.
6. A recommended-default decision must reference the exact frozen InteractionPolicy rule, original question key, selected default, and rationale code. Hard-gate questions can never default.
7. ArtifactBinding can commit only after matching invocation completion and current artifact digest. Document artifacts reference canonical document evidence; other artifacts use the invocation repository's structured binding records.
8. Cross-run/visit/item/attempt references, missing questions, multiple terminal decisions, interrupted completion, stale policy, or artifact digest drift are rejected.
9. A trusted application command owns evidence minting. It validates the started event and current aggregate together with host/runner receipts for questions, answers, outputs, validators and terminal completion; a raw event append function is internal infrastructure.
10. Codex document producers, native/Task Planner execution and AFK prepared runs call the same command at real lifecycle boundaries. At least one real persisted invocation is exercised through the production server; fixture-only evidence is insufficient.
11. Before every append, all existing aggregates must project successfully and the resulting JSONL must remain within event/byte/invocation/question/artifact budgets.
12. Artifact intents validate public refs before persistence, reference a declared output, and bind only when trusted validator results match the declared contract.

## Persistence and compatibility

The structured ledger is canonical for v1 evidence. Existing `Skill:`/`CodexSkillRead:` history remains a compatibility projection during migration; v1 gates never reverse-convert raw history into v1 events. The separate pre-init bootstrap boundary is not relaxed: supported Open orchestration binds/activates a Change before producer Skill read.

## Privacy projection

The stable server DTO exposes Skill ID/version, status/times, subject IDs, input/output field names/classification/validation status, question key/requiredness/shown state, decision mode/selected option/rationale and privacy-safe free-text presence/classification, artifacts, and validators. It excludes transcript paths, absolute Skill paths, host session/turn IDs, raw prompts/answers/output, internal digests, and credentials. The Dashboard renders those verdicts and rejects redundant run-identity drift; the server preserves path-forbidden 403 separately from missing 404.

## Failure model

Invocation status is `started | completed | failed | interrupted | incomplete | corrupt`. `incomplete` is honest absence of terminal evidence; `corrupt` blocks projection/writes until official recovery. Failed/interrupted invocations cannot bind artifacts or satisfy a required Skill gate.

## Alternatives rejected

- Extending raw `.pipeline-history.jsonl`: no stable record identity or strict corruption semantics.
- Recording full prompts/answers/output: unnecessary privacy exposure.
- Treating Skill bundle materialization as invocation: it proves available content, not actual invocation.
- Special Task Planner receipts: would fragment the generic Skill contract.
- Accepting pre-init reads without exact intent: cross-Change replay risk.

## Assumptions / Decision Log

- Decision: `StepVisitId` is the shared `{runId,transitionSequence}` value object; existing document tuple representation remains backward compatible.
- Decision: recommended-default rules belong to PR3 InteractionPolicy snapshots and are referenced here, not copied into AutomationPolicy.
- Decision: non-document artifact provenance lives in the invocation evidence repository; documents remain canonical in document ledger.
- Decision: free text is digest/classification only in v1; readable summaries are deferred.
- Decision: the current >128 transcript bug is repaired in PR1; pre-init bootstrap is a separate deferred hardening concern.

## Verification matrix

Tests cover strict codec/budgets including boundary append, concurrent append/replay, whole-ledger semantic degradation, all identity mismatches and caller override rejection, terminal uniqueness/recovery, actual-question/answer receipt proof, default-policy binding to the matching question, hard gates, privacy projection, artifact output/ref/validator binding, native/Codex adapters, AFK attempts, production lifecycle wiring, a real persisted server projection, Dashboard validator states, stable 403/404, and compatibility projection without reverse minting.

```coverage
touches: auth, skill-provenance, privacy, api-boundary, append-only-ledger
L1_api:      filled -> #privacy-projection
L2_data:     filled -> #aggregate-and-identity
L3_rules:    filled -> #key-rules
L4_state:    filled -> #event-model
L5_errors:   filled -> #failure-model
L6_security: filled -> #privacy-projection
L7_perf:     filled -> #verification-matrix
L8_deps:     filled -> #persistence-and-compatibility
L10_terms:   filled -> #event-model
```
