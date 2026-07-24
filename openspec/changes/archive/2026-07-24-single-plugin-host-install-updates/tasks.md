# Tasks

## Open

- [x] Define the single-package problem, explicit host-selection boundary, scope, non-goals, and
  acceptance signals.
- [x] Preserve dashboard, AFK, tap, channel, and adapter subsystems as product capabilities.

## Explore

- [x] Map package roots, host manifests, setup/update paths, skill distribution, launchers, and
  runtime trust boundaries.
- [x] Record the architecture decision for native host ownership, immutable managed releases, and
  opt-in automatic updates.
- [x] Produce the reviewed Superpowers design for installation, update, restart, rollback, and
  document continuity.

## Spec

- [x] Define the OpenSpec delta for one packaged plugin, explicit host setup, bundled mandatory
  skills, release updates, and document evidence continuity.
- [x] Produce the implementation plan with exact packages, compatibility paths, tests, and release
  verification.

## Build

- [x] Add and validate native Codex manifest/marketplace alongside Claude compatibility metadata.
- [x] Implement strict `pipeline setup --<host>` selection and preserve every registered adapter.
- [x] Implement the stable launcher, fresh-install bootstrap, native update commands, and opt-in
  bounded automatic updates.
- [x] Add first-party default-workflow skill implementations and migrate mandatory references.
- [x] Make registry, doctor, and verification prove that every mandatory skill is packaged.
- [x] Document release versioning, update, restart, rollback, and adapter reapply behavior.
- [x] Require Claude marketplace metadata in managed candidates and prove missing metadata cannot
  replace the active selection.

## Verify

- [x] Run manifest, setup/update, launcher, runtime, document, hook, adapter, skill, bundle, build,
  and full regression tests.
- [x] Complete an isolated first-install E2E and verify the dashboard health release matches the
  active immutable runtime.

## Ship

- [x] Apply the verified distribution delta to the durable main OpenSpec and prepare the direct
  `main` release commit.

## Archive

- [x] Archive the Change with complete document/read receipts and final operational evidence.
