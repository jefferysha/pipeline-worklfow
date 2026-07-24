# Normal-chat workflow routing

## Requirements

### Requirement: normal chat preserves effective Track workflow bindings

For every enabled effective Track, the router's generated data contract SHALL carry the Track's
validated default workflow along with its id, label, priority, and routing pattern.

#### Scenario: custom Track is routed

- **WHEN** a project contains a routable custom Track whose default workflow is `pet-adoption`
- **AND WHEN** a new user prompt routes to that project
- **THEN** the normal-chat dispatch exposes `pet-adoption` as the recommended workflow for that
  Track rather than substituting `default`.

### Requirement: custom choices require explicit selection before Change creation

For a new objective in a project that has a custom routable Track or a non-default workflow
binding, the router SHALL mark its dispatch as selection-required and include valid candidate
Track/workflow pairs.

#### Scenario: user chooses between default and custom paths

- **WHEN** a prompt can be served by the recommended custom path and a built-in/default path
- **THEN** the root pipeline skill asks the user which pair to use before running `pipeline init`
- **AND THEN** the new Change stores the selected pair through the canonical CLI/API path.

### Requirement: clean projects preserve default routing

A project whose effective routable Tracks are all built-in and bound to `default` SHALL continue
to dispatch the winning Track and default workflow without a selection question.

### Requirement: cache incompatibility fails closed

The hook SHALL reject a cache that lacks the workflow binding required by its current schema and
regenerate it on the cold path; it SHALL not guess or silently fall back to an old value.
