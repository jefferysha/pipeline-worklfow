# document-evidence-timeline Specification

## ADDED Requirements

### Requirement: Snapshot exposes current document provenance

The server SHALL add optional provenance fields to each governed document evidence item: the actual producer, the ISO-8601 registration time, and the current-phase read time only when it is bound to the record's current digest and current step visit. It SHALL not expose a digest, visit ID, document body, host session, or absolute path.

#### Scenario: A current document has a matching read receipt

- **WHEN** a record is current and has a receipt matching the active phase, digest, and visit
- **THEN** its snapshot item includes producer, recordedAt, and readAt

#### Scenario: A historical receipt does not match the current proof

- **WHEN** a record is stale, unread, or only has a prior-visit receipt
- **THEN** its snapshot item omits readAt and retains the existing incomplete status

### Requirement: Dashboard explains evidence without granting control

The Dashboard SHALL show a keyboard-accessible, localized provenance timeline under each document item when metadata is available. It SHALL distinguish registered-only, read-for-current-phase, unavailable metadata, and existing incomplete states. It SHALL not offer record, read, repair, approval, or transition controls.

#### Scenario: An older server omits optional provenance

- **WHEN** the snapshot has the established document DTO without timeline fields
- **THEN** the client accepts it and renders a localized unavailable state without failing the Change detail

#### Scenario: A malformed provenance object arrives

- **WHEN** optional timeline metadata fails decoding
- **THEN** the client rejects the malformed documents projection through its existing snapshot error path
