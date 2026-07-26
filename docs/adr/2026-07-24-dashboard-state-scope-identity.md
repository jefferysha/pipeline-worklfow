# ADR: Dashboard 单例身份包含 Tenon 状态域

## Context

Tenon intentionally exposes one Dashboard endpoint on `127.0.0.1:18765`. The managed
launcher currently accepts an existing process when its semantic version and immutable release
match. That proves which code is running, but not which machine-state directory the process reads.

`TENON_RUNTIME_HOME` is the single isolation boundary for the complete Tenon data/state/config
domain. A same-release process started with another state root can therefore pass the
current health check while serving the wrong projects. The first-install acceptance reproduced this:
the isolated installer reported a healthy Dashboard but the UI opened the source repository owned
by a previously running process.

## Decision

Treat a Dashboard process as the tuple:

`{endpoint, release identity, machine-state scope identity}`.

The machine-state scope identity is `sha256-v1-<digest>`, computed from a namespaced, canonical
absolute Tenon `stateRoot`. Only the digest is exposed; the path is never returned by health, written
to the pidfile, or logged.

- `@tenon/kernel` 的 `resolveProductPaths` 是 data/state/config 及其产品文件的唯一解析器；
  CLI 和 server 都消费它，`~/.claude` 只用于发现 Claude 宿主资产。
- `/api/health` exposes the additive `stateScopeId` field.
- Server singleton reuse requires an exact state-scope match before applying the existing
  version/release rules.
- A missing or mismatched scope identity is a migration/takeover case. The new process may signal
  only the PID reported by health or its own scope pidfile after verifying that PID really owns the
  loopback listener.
- The CLI managed-start readiness check requires both the expected release and expected state scope
  before it reports success or opens the browser.

## Alternatives considered

### Keep release ID as the complete singleton identity

Rejected. It proves code provenance but cannot distinguish registries, secrets or project sets.
This is the reproduced bug.

### Return the canonical state-root path in health

Rejected. It would make diagnosis simple but unnecessarily expose a local user path through an
unauthenticated loopback health endpoint.

### Use an ephemeral process UUID

Rejected. Every restart would look like a different state domain, eliminating safe singleton reuse.

### Store a random ID inside each state root

Rejected for this contract. Copying a hermetic state directory would copy the ID and make two
different paths appear identical. It also adds a mutable bootstrap file and a creation race before
the health boundary can be evaluated.

### Allow one port per state root

Rejected. It turns a deliberate single product endpoint into port discovery and lifecycle
management. The explicit launcher already defines which state domain should own 18765, so safe
verified takeover is simpler and preserves the public contract.

## Consequences

The first new server replaces a legacy server that lacks `stateScopeId` once. Existing health
clients remain compatible because the field is additive. Same-scope same-release starts keep their
fast reuse behavior, while hermetic installs and tests can no longer silently attach to another
registry. A SHA-256 path fingerprint prevents direct path disclosure but is an identity token, not
a general-purpose secret; it must not be used for authorization.
