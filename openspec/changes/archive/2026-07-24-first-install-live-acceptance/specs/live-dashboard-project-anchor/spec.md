# Live Dashboard Project Anchor Delta

## ADDED Requirements

### Requirement: Newly registered projects become usable without a dashboard restart

When a project is added to the machine registry after the dashboard starts, the first workflow-related request MUST capture the existing validated filesystem anchor and continue normally.

#### Scenario: CLI registration after server startup

- Given the dashboard started before any project was registered
- When `pipeline init` registers a real non-symlink project directory
- Then `/api/workflows` and Track configuration requests for that root succeed without restarting the server

### Requirement: Lazy capture never permits re-anchoring

The server MUST capture only a currently registered, real directory with matching descriptor and realpath identity. Once captured, any path replacement, rename, symlink swap, unsafe path, or inaccessible path MUST fail closed and MUST NOT replace the retained anchor.

#### Scenario: Registered path is replaced after first use

- Given a registered root has been captured successfully
- When its pathname resolves to a different filesystem identity
- Then the request is rejected with HTTP 403
- And the original retained anchor remains authoritative

#### Scenario: Request names an unregistered root

- When a workflow request names a root absent from the machine registry
- Then the server returns HTTP 404
- And no anchor is created
