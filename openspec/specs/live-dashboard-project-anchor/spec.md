# Live Dashboard Project Anchor Specification

## Purpose

Define fail-closed filesystem identity and lifecycle rules for projects registered with a running
Dashboard so late registration remains usable without weakening root trust.

## Requirements

### Requirement: A registered project is available without restarting the dashboard

The global dashboard MUST accept projects added to the machine registry after process startup. On the first workflow-related request, it MUST capture the project through the validated filesystem anchor primitive and continue without a restart.

#### Scenario: Project is registered after Dashboard startup

- **GIVEN** the Dashboard is already running
- **WHEN** a project is added to the machine registry and receives its first workflow-related request
- **THEN** the Dashboard captures it through the validated filesystem anchor
- **AND** the request continues without restarting the Dashboard.

### Requirement: Project identity is fail-closed

Only a currently registered real directory with matching descriptor, inode, and realpath identity may be captured. Capture occurs at most once. A later rename, replacement, symlink swap, inaccessible path, or identity mismatch MUST return HTTP 403 and MUST NOT replace the retained anchor. An unregistered root MUST return HTTP 404 and MUST NOT create an anchor.

#### Scenario: Captured project identity changes

- **GIVEN** the Dashboard retained an anchor for a registered project
- **WHEN** its directory identity no longer matches because of rename, replacement, symlink swap, inaccessibility, or other mismatch
- **THEN** the request returns HTTP 403
- **AND** the retained anchor is not replaced.

#### Scenario: Root is not registered

- **WHEN** a workflow-related request names an unregistered root
- **THEN** the request returns HTTP 404
- **AND** no filesystem anchor is created.

### Requirement: Registry removal releases retained resources

When a project is removed from the machine registry, the dashboard MUST close and discard its retained descriptor so a later explicit registration begins from a new unanchored identity.

#### Scenario: Registered project is removed

- **GIVEN** the Dashboard retained an anchor for a registered project
- **WHEN** that project is removed from the machine registry
- **THEN** the retained descriptor is closed and discarded
- **AND** a later explicit registration begins without reusing the old anchor.
