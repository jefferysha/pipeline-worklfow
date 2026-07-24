# First-install Live Acceptance Verification

## Verdict

PASS. The published implementation preserves one-time filesystem identity capture and makes a project registered after dashboard startup immediately available.

## Evidence

- `npm test -- packages/server/src/server.test.ts`: 270/270 passed on the frozen implementation baseline.
- `bash tools/test-bundle.sh`: 15/15 passed.
- `bash tools/verify-skills.sh`: 64 referenced paths, 63 packaged skill directories, zero external runtime dependencies.
- `pipeline doctor --json`: 18 green, 0 yellow, 0 red.
- `pipeline setup --codex --auto-update --yes`: published managed runtime revision 48 and confirmed bounded daily auto-update.
- `http://127.0.0.1:18765/` and `/api/health`: HTTP 200; health releaseId equals the active content-addressed runtime.

## Review tracks

- Independent code/architecture review: PASS; registration is still the nomination boundary, lazy capture is one-shot, and existing identity checks remain authoritative.
- Runtime/API track: PASS; dashboard root, health, and workflow endpoints are live on 18765.
- Codex review track: PASS using the already reviewed published diff and current focused regression evidence.

## Spec comparison

The server root-anchor lifecycle and integration coverage match `openspec/specs/live-dashboard-project-anchor/spec.md`. No auth, schema, database, or new dependency boundary was introduced.
