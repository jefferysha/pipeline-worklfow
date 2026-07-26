# Support

Tenon is an open-source local developer tool. The project does not
currently promise a support SLA, hosted service, release cadence, or
compatibility window.

## Before opening a report

Read:

- [Installation](docs/usage/installation.md)
- [Quickstart](docs/usage/quickstart.md)
- [Troubleshooting](docs/usage/troubleshooting.md)
- [CLI reference](docs/usage/cli-reference.md)
- [Security model](docs/usage/security-model.md)

Run the read-only diagnostic bundle:

```bash
tenon doctor --json
tenon runtime status --json
tenon list --json
tenon status <change-name> --json
tenon document status <change-name> --json
```

For Dashboard problems:

```bash
curl --fail http://127.0.0.1:18765/api/health
```

## Questions and non-sensitive bugs

Search or open a
[GitHub Issue](https://github.com/jefferysha/tenon/issues).

Include:

- a short problem statement and expected result;
- exact reproduction steps;
- host and adapter;
- operating system and Node.js version;
- relevant plugin/CLI/runtime identity;
- the selected Workflow and Track;
- sanitized command output and exit codes;
- whether the problem reproduces in a new host session;
- whether Codex hook trust is active.

Reduce the report to the smallest project/Change that demonstrates the issue.

## Never post publicly

- access tokens, API keys, OAuth material, cookies, or private keys;
- raw prompts or model responses containing private data;
- local CA private material;
- unredacted Tap traces or HTTP headers;
- real customer/user data;
- an unpatched vulnerability.

For vulnerabilities, follow [SECURITY.md](SECURITY.md).

## Feature and design proposals

Explain the user problem, current workaround, affected Workflow/Track/host, and
the smallest public contract change. Avoid starting with an implementation that
has not established the product need.

## Contribution help

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[contributor development](docs/usage/contributor-development.md). A patch should
state which checks ran and disclose any skipped credentialed or browser
verification.

