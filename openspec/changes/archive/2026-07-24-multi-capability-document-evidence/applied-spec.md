# Applied specification receipt

Date: 2026-07-24
Change: multi-capability-document-evidence

## Applied mappings

- Source:
  `openspec/changes/multi-capability-document-evidence/specs/document-evidence-contract/spec.md`
- Target: `openspec/specs/document-evidence-contract/spec.md`

## Effects

- Replaced kind-wide delta evidence identity with one canonical slot per capability.
- Added exact-hash read requirements for every retained capability delta.
- Rejected non-canonical and symlink-aliased capability paths.
- Preserved legacy records until explicit `document migrate-delta`.
- Added lossless, atomic, idempotent migration with digest/provenance/receipt conflict checks.

The target retains all unrelated document-evidence requirements. Reapplying this delta is a no-op.
