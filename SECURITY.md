# Security policy

## Supported versions

This repository does not currently publish a stable-version support matrix or
security-response SLA. Security fixes are evaluated against the current
repository branch and the affected distributed plugin/runtime identity.

When reporting, include the exact plugin manifest version, CLI/runtime version,
host, operating system, and `pipeline runtime status --json` output after
removing local paths or identifiers you do not want to share.

## Report a vulnerability privately

Use GitHub's private vulnerability reporting for this repository:

[Open a private security advisory](https://github.com/jefferysha/pipeline-worklfow/security/advisories/new)

Do not open a public Issue for an unpatched vulnerability. Do not include
tokens, credentials, private keys, CA material, raw prompts, real user data, or
unredacted Tap traces.

If private advisory creation is unavailable, open a public Issue asking the
maintainers to enable a private contact channel, but include no vulnerability
details.

## What to include

- affected host and adapter fidelity tier;
- affected commit/release/runtime identity;
- concise impact and attacker assumptions;
- minimal reproducible steps or a sanitized proof of concept;
- whether the Dashboard, hooks, filesystem, AFK/Docker, Git, Tap/TLS, update,
  or credentials boundary is involved;
- suggested mitigation, if known;
- whether disclosure is time-sensitive.

## In scope

Examples include:

- bypassing review, guard, Skill, document, or transition enforcement;
- unauthorized Dashboard mutation or project-root escape;
- token, credential, prompt, trace, or CA-material disclosure;
- unsafe release activation, rollback, or adapter installation;
- command/shell injection or unsafe deserialization;
- cross-project or cross-Change state corruption;
- container/runner escape caused by Pipeline Lite configuration;
- a host adapter claiming a hard veto that can be bypassed under its documented
  supported conditions.

## Usually not a vulnerability

- a documented Tier B/C adapter degradation;
- missing Docker or optional runner credentials;
- a user explicitly exposing the loopback service through an external proxy;
- a malicious same-UID process reading resources already available to that OS
  account, unless Pipeline Lite creates an additional unintended exposure;
- unsupported modification of canonical state or managed release files;
- availability problems without a security impact.

These may still be valid non-sensitive bugs; use [SUPPORT.md](SUPPORT.md).

## Disclosure and handling

Please allow maintainers to reproduce and coordinate a fix before public
disclosure. Maintainers will communicate through the private advisory when
available. No fixed acknowledgement, remediation, or release time is promised;
status depends on severity, reproducibility, maintainer availability, and the
affected host/release path.

See the full [local security model](docs/usage/security-model.md).

