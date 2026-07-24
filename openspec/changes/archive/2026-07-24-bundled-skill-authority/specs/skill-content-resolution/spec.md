# Skill Content Resolution Delta

## ADDED Requirements

### Requirement: Selected release bundle SHALL be authoritative

When production execution is assembled with a selected plugin root, a bare
skill id present in that root SHALL resolve from that bundle without including
machine-global candidates in the same ambiguity set.

#### Scenario: Global content diverges from bundled content

- **GIVEN** the selected release bundles skill `brainstorming`
- **AND** a runner-native global root contains a different `brainstorming`
- **WHEN** the `default + pm` profile is materialized
- **THEN** the bundled content is selected
- **AND** wiring is not paused for cross-tier ambiguity.

### Requirement: Tier descent SHALL occur only on not-found

Production resolution MAY consult runner-native or compatible external roots
only when every higher trust tier reports `SkillContentNotFoundError`.

#### Scenario: Bundled candidate is damaged

- **WHEN** the bundled path exists but is inaccessible, invalid, or damaged
- **THEN** resolution fails closed
- **AND** no lower tier is consulted.

### Requirement: External ambiguity SHALL remain fail-loud

Candidates within the same external trust tier SHALL retain canonical content
hash comparison. Divergent candidates SHALL raise a source-ambiguity error.
