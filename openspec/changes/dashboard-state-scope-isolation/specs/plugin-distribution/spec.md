# Plugin Distribution Delta

## ADDED Requirements

### Requirement: Dashboard health identifies the active machine-state scope

The managed Dashboard singleton SHALL identify both the active immutable release and the
canonical machine-state scope used for project registry, token, secrets and pidfile storage.
The health response SHALL expose an opaque, deterministic `stateScopeId` and SHALL NOT expose the
machine-state Home path. The identifier is an identity comparison value and SHALL NOT be accepted
as an authorization credential.

#### Scenario: Same release starts for a different state Home

- **GIVEN** a healthy Dashboard is listening on the configured port for state scope A
- **WHEN** the same immutable release is explicitly started with state scope B
- **THEN** the existing process is not reused
- **AND** takeover may proceed only after the reported PID is verified as the real loopback
  listener owner
- **AND** the new health response carries state scope B's identifier.

#### Scenario: Same release starts for the same state Home

- **GIVEN** a healthy Dashboard is listening for the requested state scope and release
- **WHEN** the managed launcher starts again
- **THEN** it reuses the existing process
- **AND** does not replace or duplicate the singleton.

#### Scenario: Legacy health has no state-scope identity

- **GIVEN** a prior Dashboard health response has no `stateScopeId`
- **WHEN** a scope-aware managed Dashboard starts
- **THEN** the legacy process is treated as a one-time migration takeover candidate
- **AND** listener ownership verification remains mandatory before signalling it.

#### Scenario: Managed startup waits for the exact intended process

- **WHEN** setup or update starts a Dashboard from an immutable release
- **THEN** readiness succeeds only when both `releaseId` and `stateScopeId` match the launcher
  expectation
- **AND** a browser is not opened for a process with a mismatched state scope.

### Requirement: Machine-state scope identity is canonical and path-private

The state-scope identifier SHALL be derived by one shared first-party primitive from a namespaced
canonical absolute state-Home path. Equivalent relative/trailing-slash inputs SHALL produce the
same identity. The health response, server log and pidfile SHALL NOT contain the state-Home path.

#### Scenario: Lexically equivalent state roots

- **WHEN** two inputs resolve to the same absolute path
- **THEN** they produce the same full-length versioned state-scope identifier.
