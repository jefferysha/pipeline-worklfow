# Proposal: Open-source documentation and solution site

## Intent

Turn pipeline-lite into an immediately understandable open-source product for
new users, maintainers, and evaluators. The repository needs an industry-grade
README, durable usage documentation, and a polished solution page that explain
what the plugin does, how to install it for supported hosts, and how its
governed workflows behave.

Classification: documentation and frontend product experience.

## Scope

- Replace the repository README with a concise open-source entry point.
- Add structured user documentation covering installation, updates, concepts,
  workflows, CLI usage, dashboard operation, customization, troubleshooting,
  architecture, security, contribution, and release behavior.
- Build a responsive open-source solution page inside the existing dashboard
  application and expose a stable route or view for it.
- Keep all claims traceable to current repository behavior and tests.

Explore selected a three-layer information architecture:

- an English-first root README with a complete Chinese counterpart;
- task-oriented canonical guides under `docs/usage/`;
- a bilingual, read-only Dashboard `overview` at `/?view=overview`.

The overview reuses the existing SPA, tokens, localization, components, server,
and production port. The brand mark becomes its entry while the five
operational rail destinations and Progress default remain unchanged.

## Non-goals

- No change to pipeline runtime semantics, CLI contracts, workflow state, or
  installation behavior.
- No new hosted service, telemetry, authentication, billing, or external
  publication in this Change.
- No unsupported compatibility promises.
- No second frontend runtime, public website, router, remote asset, or external
  deployment.

## Acceptance signal

A new user can start from the README, select the correct host setup command,
understand default/simple/free/custom workflows, launch the 18765 dashboard,
and navigate a production-quality solution page and task-oriented docs without
reading source code. All documented commands and feature claims are verified
against the current implementation.

The experience must also make discussion mode, adapter fidelity tiers, the
default document/read-receipt chain, and short/custom Workflow document
boundaries explicit.
