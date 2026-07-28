# Codex authentication guidance during Tenon plugin installation

## Outcome

Every Codex-facing Tenon installation or maintenance path gives an accurate,
non-blocking authentication result:

- an already authenticated ChatGPT or API-key user is not told that
  `OPENAI_API_KEY` is mandatory;
- an unauthenticated user receives browser, headless/device-code, and API-key
  instructions plus `codex login status`;
- an unavailable or older Codex CLI produces an honest `unknown` result and an
  actionable compatibility instruction;
- no path reads, copies, logs, or stores credential values.

## Evidence and constraints

- The official Codex contract supports ChatGPT sign-in and Platform API-key
  sign-in for local work.
- `codex login`, `codex login --device-auth`,
  `printenv OPENAI_API_KEY | codex login --with-api-key`, and
  `codex login status` are the documented commands.
- The current Tenon readiness model conflates local Codex authentication with
  `OPENAI_API_KEY` or `CODEX_HOME/auth.json` presence.
- `install.sh` delegates to packaged `tenon setup --codex --yes`; setup is the
  first stable runtime layer shared by first and repeated installation.
- `tenon update --codex` and `tenon doctor` have separate output paths and can
  drift unless they consume the same probe and renderer.
- Clean-install acceptance intentionally uses isolated credential-free homes.
  Authentication absence must remain non-fatal and must not weaken hook-trust or
  package-discovery assertions.

## Considered architectures

| Option | Benefit | Failure mode | Decision |
| --- | --- | --- | --- |
| Duplicate shell messages in `install.sh` | Small first patch | Setup, update, doctor, docs, and npx bootstrap drift immediately | Rejected |
| Automatically run `codex login` during installation | Appears convenient | Blocks CI/headless use, introduces external auth side effects, cannot choose the user's billing model | Rejected |
| CLI-owned bounded probe plus one renderer, called by setup/update/doctor; bootstrap delegates | One status model, injectable tests, no secret access, idempotent maintenance | Requires a small shared contract and explicit compatibility states | Selected |

## Authentication status model

```text
CodexAuthStatus
├── authenticated
│   └── `codex login status` exit 0
├── unauthenticated
│   └── command exits 1 and bounded stderr is exactly `Not logged in`
└── unavailable
    ├── Codex CLI not on PATH
    ├── status command unsupported
    ├── status exits 1 without the exact not-logged-in sentinel
    ├── status exits with another nonzero code
    ├── timeout
    └── spawn/permission failure
```

The probe invokes exactly `codex login status` with stdin ignored and a bounded
timeout. Current Codex uses exit `1` for both `Not logged in` and authentication
store errors, so exit status alone is insufficient. The runner may retain only a
small bounded stderr buffer long enough to compare the trimmed value with the
exact `Not logged in` sentinel. It returns only the secret-free classification
signal and immediately discards the buffer. Exit `1` without that exact sentinel,
an overflow, `ENOENT`, timeout, or incompatible CLI is `unavailable`.

`OPENAI_API_KEY`, `CODEX_HOME`, and `auth.json` content do not participate in
this local status. Existing AFK readiness may still show whether credentials
can be forwarded into a container, but its copy must explicitly distinguish
that transport readiness from local Codex login.

## Single guidance contract

The shared renderer emits only fixed, non-secret text:

```text
[Codex 认证] 未登录或无法确认。
  ChatGPT 订阅：如果你的方案包含 Codex，运行 `codex login`
  远程/无头：运行 `codex login --device-auth`
  API Key：在 https://platform.openai.com/api-keys 创建后，
           运行 `printenv OPENAI_API_KEY | codex login --with-api-key`
           （Platform 按用量计费）
  验证：`codex login status`
```

`authenticated` prints a concise ready line and the verification command.
`unavailable` first explains that the Codex CLI/status check is unavailable,
then gives the same login branches so copied logs remain actionable. English
and Chinese documentation carry semantically equivalent text; runtime output
uses the repository's current Chinese CLI convention.

## Integration points

### First and repeated installation

`install.sh --codex` continues to own only marketplace registration and plugin
resolution. The packaged `tenon setup --codex --yes` invocation performs the
shared auth check after the candidate runtime is installed and verified.
Therefore first install and an identical repeated install use the same path.
Dry-run prints the future auth-check step but does not invoke Codex status.

If the `codex` executable itself is missing, `install.sh` fails before
marketplace mutation with an explicit CLI prerequisite message. It cannot use
the packaged probe because no package has been resolved yet.

### Setup and runtime readiness

`tenon setup --codex` renders local authentication immediately after host setup.
The AFK runtime section separately reports credential forwarding readiness and
must no longer tell a subscription-authenticated local user that an API key is
the only required Codex credential.

Non-Codex adapter setup does not emit Codex local-login guidance merely because
the complete package contains a Codex adapter.

### Update

After a successful `tenon update --codex`, render the same bounded status and
guidance. An update failure preserves the current release and does not mask its
primary error with an auth warning. Automatic background update prints no
multi-line login tutorial; `tenon doctor` remains the explicit follow-up.

### Doctor

Doctor adds a stable `auth:codex` check:

- green for authenticated;
- yellow for unauthenticated or unavailable, because Codex login is a user
  prerequisite and Tenon's static/runtime diagnostic can still execute;
- never red solely because login is absent.

JSON carries only status and fixed detail/hint strings, never captured command
output.

### Documentation and acceptance

README plus English and Chinese installation guides explain both billing paths,
headless login, and verification. Bootstrap tests cover missing CLI, dry-run
zero execution, already authenticated, unauthenticated, and status unavailable.
CLI tests cover the pure state mapping, rendering, setup/update/doctor
integration, non-Codex silence, timeout, and output redaction. Clean-install
acceptance asserts the expected unauthenticated guidance while continuing to
prove an isolated home and unchanged external state.

## Failure semantics

| Failure | Required behavior |
| --- | --- |
| `codex` absent before bootstrap | Fail before mutation; explain prerequisite |
| `codex login status` exit `0` | Report authenticated; do not show acquisition warning |
| Status exits `1` with stderr exactly `Not logged in` | Warn and show all three login branches plus verification |
| Status exits `1` with auth-store/config error or oversized output | Report unable to confirm; use fixed guidance without echoing the error |
| Status exits with another nonzero code | Report unable to confirm and show compatibility guidance |
| Status command unsupported or times out | Report unable to confirm; show guidance; installation remains successful |
| Captured output contains secret-like text | Discard it; public result and renderer use fixed strings only |
| Noninteractive stdin or CI | Never wait or launch login; print deterministic follow-up |
| Subscription plan unknown | Say “if your plan includes Codex”; never infer entitlement |
| Update candidate fails | Preserve primary update error and active runtime; no auth side effect |

## Assumptions and decision log

- The user explicitly requested continuous completion, so low-risk Explore
  choices are recorded here rather than asked interactively.
- Installation success and Codex authentication readiness are separate
  outcomes. Missing auth is visible but not an installer transaction failure.
- Host authentication remains owned by Codex. Tenon only diagnoses status and
  presents official commands.
- The implementation targets the current official CLI contract. Older CLIs
  degrade to `unavailable` with an upgrade instruction. The only human-text
  comparison permitted is the exact official `Not logged in` sentinel; no other
  ad hoc error text is parsed.
- API-key login uses stdin. Tenon never suggests putting a key literal in shell
  history or command arguments.
- Hook trust remains a separate explicit Codex safety boundary after login and
  installation.

## Red-team review

- A fake `OPENAI_API_KEY` cannot turn the local auth check green.
- A readable `auth.json` cannot turn the local auth check green and is never
  opened by the new probe.
- An API key accidentally printed by a hostile wrapper cannot reach Tenon
  output because subprocess output is discarded.
- `CI=1`, a closed stdin, or a non-TTY cannot start a browser or wait for input.
- A timeout does not become a false unauthenticated fact; it becomes unknown.
- A ChatGPT-authenticated user receives no “set OPENAI_API_KEY” requirement.
- An unauthenticated user sees both subscription and Platform choices, including
  the usage-based billing distinction.

## Coverage

```coverage
touches: auth, plugin-distribution
L1_api:      filled -> CodexAuthStatus and stable doctor check/output contract
L2_data:     filled -> Secret-free status enum plus bounded exact sentinel signal; no credential payload is retained
L3_rules:    filled -> Auth ownership, non-blocking install, billing-language and no-secret invariants
L4_state:    filled -> First/repeated install, setup, update, doctor and clean-install state transitions
L5_errors:   filled -> Missing CLI, nonzero status, incompatibility, timeout and update-failure behavior
L6_security: filled -> No auth.json/key reads, fixed output, stdin API-key guidance and no automatic login
L7_perf:     filled -> One bounded status subprocess per explicit foreground lifecycle command
L8_deps:     filled -> Official Codex CLI commands and compatibility fallback
L10_terms:   filled -> Authentication status model and integration topology
```

## Verification strategy

1. Pure tests for exit/spawn/timeout mapping, exact/ambiguous exit-1 behavior,
   bounded stderr overflow, and proof that captured output is not propagated.
2. Renderer snapshots for authenticated, unauthenticated, unavailable, Chinese
   CLI output, and documented English/Chinese commands.
3. Setup/update/doctor tests, including non-Codex and automatic-update cases.
4. Shell bootstrap tests for missing CLI, dry-run zero invocation, repeated
   installation, and packaged setup delegation.
5. Clean temporary-home install acceptance with no copied credentials and
   expected guidance.
6. Secret-pattern scan of test logs and changed files.
7. Full repository build, test, bundle, OpenSpec strict validation, and
   independent standards/spec review on a frozen candidate.
