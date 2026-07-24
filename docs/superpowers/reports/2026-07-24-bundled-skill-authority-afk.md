# Bundled Skill Authority AFK Evidence

## Result

PASS for L1 report-only execution.

## Bound execution

- Change: `bundled-skill-authority`
- Workflow: `default`
- Skill profile: `backend`
- Loop: `bundled-authority-live`
- Image: `sandcastle:local`
- Sandbox: `sandcastle-mrz6ol4s-f8eb2a`
- Host baseline:
  `a14b4cea47a1c4dd03cd86d2323922656125f57c`

## Observed state sequence

1. Dashboard/API reported `automation=queued`.
2. After claim, dashboard/API reported `automation=running` and the concrete
   sandbox/worktree.
3. The L1 run settled as `automation=paused` with
   `cause=verification-inconclusive`.

The paused terminal is the expected L1 human-handoff behavior: the sandbox
reported `verify_result=pass`, but the verifier did not authorize an automatic
merge. The host Git SHA remained exactly the baseline above.

## Runtime evidence

- Agent provider: OpenAI Codex through the local TAP forwarder.
- Sandbox output included `execution_mode=agent/codex`.
- Image AFK-script and CLI attestation matched the host bundle before launch.
- The selected release bundle resolved its own skills even though other
  machine roots contained divergent same-name content.
- No sandbox business patch was merged into main.
