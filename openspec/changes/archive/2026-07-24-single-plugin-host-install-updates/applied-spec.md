# Applied specification receipt: single-plugin host installation and updates

- Date: 2026-07-24
- Source: `openspec/changes/single-plugin-host-install-updates/specs/plugin-distribution/spec.md`
- Target: `openspec/specs/plugin-distribution/spec.md`

## Applied effects

The durable main specification now requires one complete plugin payload, exactly one explicit
host owner per setup/update invocation, verified immutable native-host releases, bounded
host-scoped updates, bundled mandatory workflow skills, digest-bound default-pipeline document
continuity, and dashboard health identity on the default port `18765`.

Application created the new `plugin-distribution` capability. No unrelated main specification was
modified and no conflict resolution was required.
