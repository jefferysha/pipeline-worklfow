# Codex authentication contract for Tenon installation guidance

## Scope

This note fixes the external authentication facts that Tenon may present during
Codex plugin installation, setup, update, and diagnosis. It does not authorize
Tenon to perform login, inspect credential contents, infer plan entitlements, or
change OpenAI billing.

## Official contract

The OpenAI Codex manual currently documents two supported sign-in methods for
local Codex work:

1. **Sign in with ChatGPT** for subscription access when the user's ChatGPT plan
   includes Codex.
2. **Sign in with an API key** for usage-based Platform access.

The supported user actions are:

```bash
# Browser-based ChatGPT sign-in
codex login

# Device-code sign-in for remote or headless environments
codex login --device-auth

# API-key sign-in; the key is read from stdin and is not placed in argv
printenv OPENAI_API_KEY | codex login --with-api-key

# Read-only verification
codex login status
```

API keys are created at <https://platform.openai.com/api-keys>. Tenon must say
that Platform API-key use is usage-based, while ChatGPT subscription access is
subject to the user's actual plan. It must not promise that every subscription
includes Codex.

Primary source: <https://learn.chatgpt.com/docs/auth>.

## Local compatibility observation

On 2026-07-28 the installed `codex-cli 0.144.1` exposed all four commands above.
`codex login status` returned exit `0` with `Logged in using ChatGPT` for the
current authenticated profile. Against an isolated empty `CODEX_HOME`, it
returned exit `1` and `Not logged in`.

The initial implementation assumed it could consume only command availability
and exit status. Verify disproved that assumption against current upstream
source: `run_login_status` exits `1` for both `Ok(None)` (`Not logged in`) and
authentication-store errors (`Error checking login status: ...`). A malformed
isolated `auth.json` reproduced the same ambiguity locally. The implementation
therefore must conservatively consume command availability, exit status, and
only an exact bounded `Not logged in` sentinel. It must not expose the captured
buffer.

## Security boundary

- Never read or parse `auth.json`.
- Never read an API-key value for status detection.
- Never print an API-key value.
- Never put a key directly in command arguments.
- Never launch an interactive login from setup, update, doctor, CI, or a hook.
- Never persist or expose `codex login status` output. Retain only a small
  bounded in-process buffer for the exact not-logged-in sentinel comparison,
  then discard it.
- A command timeout, unsupported subcommand, or spawn failure means
  `unknown`, not `authenticated` or `unauthenticated`.

## Product consequences

Tenon needs three states, not an `OPENAI_API_KEY` boolean:

| State | Meaning | Guidance |
| --- | --- | --- |
| `authenticated` | `codex login status` exited `0` | Confirm verification command; no acquisition warning |
| `unauthenticated` | Codex CLI exits `1` and bounded stderr is exactly `Not logged in` | Show ChatGPT, device-code, and API-key branches |
| `unavailable` | CLI missing, status unsupported/timed out, output overflowed, or any nonzero result lacks the exact sentinel | Explain that status could not be confirmed and show installation/login follow-up without blocking |

Environment variables and `auth.json` existence remain relevant to AFK container
credential forwarding, but they are not the authoritative local Codex login
status and must not replace this contract.
