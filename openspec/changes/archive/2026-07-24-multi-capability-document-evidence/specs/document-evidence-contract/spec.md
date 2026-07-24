## MODIFIED Requirements

### Requirement: Document records SHALL prove production provenance and current content
The `pipeline document record` command SHALL register a named document slot only when the target is
a nonempty regular file within `openspec/` or `docs/`, the caller supplies a phase-appropriate
producer, and invocation history contains the required skill evidence. Each record SHALL contain
its document kind, safe relative path, SHA-256 digest, producer, and registration timestamp.

Singleton kinds SHALL have one slot per kind, so re-registering changed or moved content replaces
the prior path/digest and invalidates stale read receipts. `delta-spec` SHALL have one stable slot
per capability derived from the governed delta path. Different capabilities SHALL coexist and
each SHALL require its own exact-hash read receipt; rewriting one capability SHALL
replace only that capability's slot.

#### Scenario: Two capability deltas remain independently auditable
- **WHEN** a governed Change registers delta specs for capability A and capability B
- **THEN** the ledger retains both records
- **AND** later phase reads create exact-hash receipts for both

#### Scenario: Rewriting one capability delta replaces only its slot
- **WHEN** capability A is re-registered after its canonical delta content changes
- **THEN** the old capability A digest and read receipts are replaced
- **AND** capability B's record and receipts remain intact

#### Scenario: Singleton document move still converges
- **WHEN** a proposal or other singleton document is re-registered at a new valid path
- **THEN** every stale legacy record for that singleton kind is replaced by the new record

#### Scenario: Ambiguous delta path is rejected
- **WHEN** a caller attempts to register `delta-spec` outside the governed capability path shape
- **THEN** registration fails closed without modifying the ledger

#### Scenario: Symlink aliases cannot manufacture capabilities
- **WHEN** a lexical capability path resolves through a parent symlink or path alias
- **THEN** registration rejects it because its project-relative real path differs

#### Scenario: Legacy delta records require explicit lossless migration
- **WHEN** an upgraded ledger contains a delta record outside the canonical capability path
- **THEN** ordinary registration preserves that record
- **AND** read and evidence evaluation fail closed with a `document migrate-delta` repair command
- **AND** migration succeeds only when the explicitly named canonical file has the exact old digest
- **AND** the migration is atomic and idempotent while preserving producer and read receipts
