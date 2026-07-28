# ADR: Codex owns login; Tenon owns bounded status guidance

- Status: accepted
- Date: 2026-07-28
- Change: `guide-codex-auth-during-plugin-install`
- Authorization: Change-bound continuous execution

## Context

Tenon's current install-time readiness output treats `OPENAI_API_KEY` and
`CODEX_HOME/auth.json` presence as proxies for Codex authentication. This can
mislead ChatGPT subscription users into believing that an API key is mandatory,
while users who are not logged in receive an incomplete acquisition path.
Shell bootstrap, packaged setup, update, doctor, documentation, and
clean-install acceptance can also drift if each owns separate wording.

The official Codex CLI already owns login through browser, device code, and API
key flows, and exposes a read-only `codex login status` command. Tenon must not
become a credential manager for that host.

## Decision

Add one CLI-owned, bounded `codex login status` probe and one fixed guidance
renderer. The public state is only `authenticated`, `unauthenticated`, or
`unavailable`; captured command output is discarded.

Foreground Codex setup, successful manual Codex update, and doctor consume the
same contract. `install.sh` continues to delegate post-install behavior to the
packaged setup, while failing early with a prerequisite message when the Codex
CLI itself is missing. Dry-run and automatic background update never perform an
interactive login or wait for input.

Guidance presents:

- `codex login` for ChatGPT subscription access when the plan includes Codex;
- `codex login --device-auth` for remote/headless use;
- the official API-key creation page plus
  `printenv OPENAI_API_KEY | codex login --with-api-key` for usage-based
  Platform access;
- `codex login status` for verification.

## Alternatives

### Infer login from `OPENAI_API_KEY` or `auth.json`

Rejected. It conflates authentication methods, can be stale, and makes a
host-owned secret file part of Tenon's contract.

### Run `codex login` automatically

Rejected. It blocks noninteractive installs, chooses an external authentication
side effect without user intent, and cannot decide the user's billing model.

### Put the complete logic in `install.sh`

Rejected. Repeated setup, update, doctor, npx bootstrap, and tests would retain
separate truth sources.

## Consequences

- Login absence remains visible but does not roll back an otherwise valid Tenon
  installation.
- A small bounded subprocess runs during explicit foreground Codex lifecycle
  checks.
- Old or incompatible Codex CLIs degrade honestly to `unavailable` and receive
  upgrade/login instructions.
- AFK credential forwarding remains a separate readiness concern and must not
  be presented as the local Codex login authority.
- Documentation and clean-install acceptance gain explicit no-secret and
  noninteractive scenarios.
- Hook trust remains an independent user action after installation.
