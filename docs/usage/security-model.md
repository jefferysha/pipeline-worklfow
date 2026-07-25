# Security model

## Goal

Explain the trust boundaries around local HTTP, managed releases, project files,
hooks, automation, credentials, and diagnostics.

## Scope

Pipeline Lite targets a local, single-user developer workstation. It is not a
remote multi-tenant service and should not be exposed directly to an untrusted
network.

## Dashboard boundary

- The server binds to `127.0.0.1`.
- Local Host headers are validated.
- A random 256-bit handshake token is stored with restrictive permissions.
- Mutations require the token and JSON content type.
- Request bodies are bounded.
- Secrets returned to the UI are masked.
- Server reuse validates release and state-scope identity.

Read endpoints remain part of the local workstation trust model. A malicious
process running as the same OS user may be able to access local resources; the
loopback boundary is not a sandbox.

## Project filesystem

Dashboard operations use registered project roots as trust anchors and reject
untrusted path traversal/symlink cases. Workflow file operations use realpath,
descriptor, and inode checks where available.

The implementation does not claim to eliminate every hostile same-UID
time-of-check/time-of-use race on platforms that lack the necessary `*at`
filesystem primitives. Do not register untrusted writable roots.

## Managed releases

Release payloads are validated, content-addressed, staged, and atomically
activated. The launcher revalidates the selected payload. Recovery can select
only a previous complete verified release.

This protects against accidental partial/corrupt updates; it is not a substitute
for host marketplace/source trust or OS account security.

## Hooks and review

Host capabilities vary by adapter tier. Tier C static guidance is not a native
hard veto. Codex requires explicit hook trust.

Review receipts bind the current Change/visit/event. Continuous delegation does
not authorize:

- bypassing evidence or guards;
- publishing, deploying, or sending external content;
- spending money or using new credentials;
- changing production systems or real user data;
- weakening security boundaries.

## Credentials and AFK

AFK runner credentials are read through controlled environment/config sources
and doctor reports only presence/source, never values. Container execution
requires a trusted image and explicit autonomy policy.

L3 unattended execution should be enabled only after reviewing:

- sandbox/image provenance;
- paths and operation allowlists;
- budget/concurrency limits;
- verification and review gates;
- Git/merge policy;
- cancellation and recovery.

## Tap and sensitive diagnostics

Tap is off by default. Forward interception requires an explicit local CA and
can expose prompts, headers, tokens, bodies, and CA private material. Keep all
captures local, minimize retention, and sanitize before sharing. Never put raw
traces or secrets in GitHub Issues.

## Reporting

Use the private instructions in [SECURITY.md](../../SECURITY.md). Do not disclose
an unpatched vulnerability or secrets in a public Issue.

## Verification

```bash
pipeline doctor --json
pipeline runtime status --json
curl --fail http://127.0.0.1:18765/api/health
```

Review host fidelity in [installation](installation.md) and optional automation
controls in [AFK and loops](automation-and-loops.md).

## Common failures

- binding/proxying the Dashboard to a public interface;
- treating localhost as authorization-free;
- placing tokens in logs or fixtures;
- running an untrusted AFK image;
- enabling Tap interception without a retention plan;
- assuming every adapter has a hard pre-tool veto.

## Next action

For operational help, use [Support](../../SUPPORT.md). For vulnerabilities, use
the private reporting path in [SECURITY.md](../../SECURITY.md).

