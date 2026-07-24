# Tasks

## Packaging and host setup

- [ ] Add and validate native Codex manifest/marketplace alongside Claude compatibility metadata.
- [ ] Implement strict `pipeline setup --<host>` selection and preserve adapter coverage.
- [ ] Implement a stable launcher plus fresh-install bootstrap script.

## Release updates

- [ ] Implement native `pipeline update --codex|--claude` and opt-in automatic update handling.
- [ ] Document release versioning, update, restart, and adapter reapply behavior.

## Self-contained default skills

- [ ] Add first-party default-workflow skill implementations and migrate mandatory references.
- [ ] Make registry/doctor/verification prove that every mandatory skill is packaged.

## Verification and release

- [ ] Add focused tests for manifests, setup/update command plans, launcher behavior, and bundle completeness.
- [ ] Run hooks, adapters, skill verification, build/bundle, and targeted workflow tests.
- [ ] Inspect only intended staged files, commit, and push `main`.
