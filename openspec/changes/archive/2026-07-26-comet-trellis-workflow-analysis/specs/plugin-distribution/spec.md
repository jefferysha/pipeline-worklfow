# Single Plugin Distribution Delta

## ADDED Requirements

### Requirement: One plugin release SHALL expose one canonical Skill root

The repository `skills/<id>/SKILL.md` tree SHALL be the only maintained source
of first-party Skill content. Packaging SHALL copy that tree once into the
immutable plugin payload, and a running native installation SHALL expose
exactly one Selected Skill Root for that release. Manifests, registries,
workflows, tests, and documentation SHALL reference canonical Skill IDs rather
than duplicate Skill content.

#### Scenario: Native Codex setup is repeated

- **WHEN** `pipeline setup --codex` or its idempotent update path is run more
  than once
- **THEN** exactly one immutable selected payload Skill root is discoverable
- **AND** no same-name project or user projection is added.

#### Scenario: Package verification finds duplicate Skill content

- **WHEN** two maintained payload paths claim the same canonical Skill ID
- **THEN** release verification fails before activation
- **AND** identifies both paths.

### Requirement: Native and static Skill projections SHALL be mutually exclusive

The Codex compatibility adapter MAY create project `.agents/skills` links only
for a host that cannot discover the native pipeline-lite plugin. When a verified
native Selected Skill Root exists, the adapter SHALL skip project Skill
projection. Switching modes SHALL not leave both roots discoverable.

#### Scenario: Adapter detects a native installation

- **GIVEN** a verified native pipeline-lite Selected Skill Root
- **WHEN** the compatibility adapter runs for the project
- **THEN** it installs no pipeline-lite project Skill links
- **AND** diagnostics report the native selected root as authoritative.

#### Scenario: Static-only host needs compatibility discovery

- **GIVEN** no native pipeline-lite plugin capability or selected root exists
- **WHEN** static adapter installation is explicitly selected
- **THEN** the project projection is the sole pipeline-lite discovery root
- **AND** rerunning installation remains idempotent.

### Requirement: Legacy duplicate migration SHALL be ownership-safe

A migration from static projection to native discovery SHALL remove only
pipeline-lite-owned symlinks whose lexical target and resolved target match the
adapter's expected source Skill. It SHALL never delete a real directory, a user
file, or a foreign symlink. Ambiguous ownership SHALL fail closed with an
actionable diagnostic.

#### Scenario: Owned legacy links are removed during native migration

- **GIVEN** a project Skill link is a symlink created by the compatibility
  adapter and still resolves to its exact expected source
- **WHEN** native discovery becomes authoritative
- **THEN** the migration may remove that link
- **AND** records the selected native root.

#### Scenario: User-owned content has the same Skill ID

- **GIVEN** the project path is a real directory or points outside the expected
  adapter source
- **WHEN** migration encounters the same canonical Skill ID
- **THEN** the path is preserved
- **AND** setup reports a shadow conflict instead of overwriting or deleting it.

### Requirement: Skill diagnostics SHALL distinguish duplicate projection and shadow conflict

Doctor and installation checks SHALL enumerate all relevant discovery roots,
compute canonical content digests, and report the Selected Skill Root. Multiple
roots with the same ID and digest SHALL be reported as
`duplicate-projection`; the same ID with different digests SHALL be reported as
`shadow-conflict` and SHALL fail closed for execution. Historical cache roots
SHALL not be silently added to the active candidate set.

#### Scenario: Same content appears in two discovery roots

- **WHEN** the same canonical Skill ID and digest are discoverable from native
  and project roots
- **THEN** doctor reports `duplicate-projection`
- **AND** selects only the native canonical root
- **AND** recommends or performs only ownership-safe convergence.

#### Scenario: Different content shadows a canonical Skill

- **WHEN** one Skill ID resolves to different digests in discoverable roots
- **THEN** doctor reports `shadow-conflict` with both sources
- **AND** evidence and execution fail closed until the conflict is resolved.
