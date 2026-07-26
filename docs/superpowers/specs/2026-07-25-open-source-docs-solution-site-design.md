# Pipeline Lite Open-source Documentation and Solution Overview

Status: Explore decision record  
Date: 2026-07-25  
Change: `open-source-docs-solution-site`  
Track: frontend

## Outcome

Pipeline Lite will ship one coherent open-source documentation experience with
three deliberately different surfaces:

1. an English-first root README with a complete Chinese counterpart;
2. task-oriented canonical usage documentation under `docs/usage/`;
3. a bilingual, read-only `overview` view inside the existing Dashboard SPA.

The overview is reached through `/?view=overview` and the Pipeline brand button.
It is bundled with the same React application and served by the same loopback
server and port (`127.0.0.1:18765`). The five operational rail views remain
unchanged. Progress remains the default installed-user view.

This Change does not create a second frontend runtime, public website, package,
router, API, telemetry system, or hosting commitment.

## Verified product position

Pipeline Lite is a local-first workflow-governance plugin for coding agents. A
single release packages declarative workflows, OpenSpec evidence, phase Skills,
review gates, CLI and hooks, the local Dashboard, automation controls, and host
adapters.

The public story must preserve these boundaries:

- a pure discussion creates no Change;
- an explicitly bounded low-risk edit can use the `simple` workflow;
- normal product and engineering work uses the governed seven-phase default;
- the `free` Track removes domain overlays, not the selected Workflow's gates;
- a custom Workflow follows its declared graph and document contract;
- a short Workflow does not inherit the full default document set unless its
  contract asks for those documents;
- continuous delegation never removes evidence, review, publication, security,
  cost, or external-side-effect boundaries;
- adapter support has explicit fidelity tiers and is not identical everywhere.

## Audience and reading paths

| Audience | First surface | Successful outcome |
| --- | --- | --- |
| Evaluator | README or overview | Understand the problem, execution modes, evidence model, installation boundary, and project status. |
| New Codex/Claude user | README → installation → quickstart | Select exactly one host, validate the runtime, trigger a task, inspect its workflow, and open the Dashboard. |
| Operator | `docs/usage/` | Operate review gates, Dashboard, updates, recovery, AFK, loops, and diagnostics safely. |
| Workflow author | custom-workflow and evidence guides | Author a validated graph, Track, Skill DAG, and bounded document contract. |
| Contributor | contribution and architecture guides | Build, test, review, and submit changes without violating repository rules. |

## Content architecture

### Root README

The README is the repository conversion surface, not the full manual. Its
ordered content is:

1. product name, concise value, language switch, and only truthful badges;
2. a real Dashboard visual or in-product overview link;
3. problem-to-outcome comparison;
4. discussion/simple/default/free/custom mode matrix;
5. prerequisites and host-selected setup;
6. a five-minute first-task path;
7. evidence, review, and local-safety model;
8. adapter fidelity summary;
9. module/architecture map;
10. documentation routes;
11. development verification;
12. support, security, contribution, conduct, and license.

No npm-global installation, unified release version, public hosted docs URL,
benchmark percentage, hot-reload guarantee, or identical-host claim will appear.

### Canonical usage documentation

`docs/usage/README.md` is the navigation authority. Guides are organized by
user task rather than monorepo package:

- installation and lifecycle;
- first governed Change;
- routing and execution modes;
- default workflow and review;
- custom Workflows and Tracks;
- documents, Skills, and evidence;
- Dashboard and local API;
- AFK and loop governance;
- advanced channel/memory/tap tooling;
- troubleshooting and recovery;
- security model;
- contributor development and verification.

Every task guide uses the same pattern: goal, prerequisites, steps, expected
result, verification, common failures, and next action. Reference claims point
to the CLI, manifests, specs, tests, or source that owns them.

### In-product overview

The `overview` page answers adoption questions in one scroll:

1. outcome-oriented hero and Codex setup command;
2. local-first and evidence-backed trust strip;
3. mode chooser for discussion/simple/default/free/custom;
4. responsive seven-phase default workflow;
5. evidence chain from Skill to document/read/review/transition;
6. public module map;
7. host fidelity tiers and exact installation boundary;
8. five-minute quickstart;
9. security and operating boundary;
10. documentation and community calls to action.

The page contains short translated summaries only. It does not import Markdown,
fetch GitHub, display live project status, or duplicate the complete manual.

## Frontend architecture

```text
AppShell
├── Nav
│   ├── brand button -> overview
│   └── five operational PRIMARY_VIEWS (unchanged)
├── SolutionView (?view=overview)
│   ├── translated static product model
│   ├── workflow/evidence presentations
│   └── safe repository/document links
└── existing operational views
```

Ownership:

- `shell/Nav.tsx` expands `View` with `overview`, but `RailView` and
  `PRIMARY_VIEWS` stay unchanged;
- `shell/dashboardLocation.ts` allowlists the new query value;
- `solution/SolutionView.tsx` owns the page composition;
- `solution/solutionModel.ts` owns bounded static workflow/module/link data;
- `i18n/translations.ts` owns symmetrical `zh` and `en` strings;
- `App.tsx` renders the overview before project/onboarding gating.

The solution feature may depend on shared UI, icons, and i18n. It may not import
API, snapshot state, progress, AFK, workbench, machine, or feature-owned models.

## Navigation and state

- Direct link: `/?view=overview`.
- The logo becomes a minimum 40-pixel button with an accessible name and
  `aria-current="page"` when active.
- The page works with zero registered projects, snapshot loading/failure, and
  an offline SSE connection.
- Selecting an operational rail view returns to the existing application.
- URL/localStorage/back-forward handling continues through the current location
  model; no second router is introduced.
- The default remains `progress`; adding documentation must not displace active
  operators.

## Visual and interaction direction

The page uses the current neutral OpenAI-inspired token system:

- blue for structure and selection;
- green only for verified/success;
- red only for human attention or failure;
- system sans and mono fonts;
- crisp surfaces, compact borders, and restrained motion;
- real workflow stages, commands, and evidence types as visual material.

Desktop uses an asymmetric hero and two/three-column grids. Tablet and mobile
reflow to one column; the workflow becomes an ordered vertical sequence.
Command surfaces scroll internally instead of forcing page overflow. Motion is
non-essential and honors reduced-motion preferences.

The implementation uses Lucide and existing components. It introduces no remote
font, CDN, model-authored SVG, decorative stock image, or new dependency.

## Accessibility contract

- Exactly one page `h1` and a logical heading hierarchy.
- The existing `main` remains the only main landmark.
- Every action is a native link or button.
- External new-tab links use `rel="noreferrer noopener"`.
- Icons without meaning are hidden from assistive technology.
- The workflow/evidence diagrams have equivalent visible text.
- Focus is visible, order is logical, and no interaction is pointer-only.
- Chinese and English layouts are both verified at desktop and mobile widths.
- The page remains fully usable with reduced motion and without animation.

## Documentation truth and drift control

The initial release uses explicit source-backed copy plus automated checks:

- README/docs links resolve inside the repository;
- documented setup, update, runtime, dashboard, and verification commands are
  checked against actual CLI help or invoked in dry/read-only form;
- default port is checked against the server constant/test;
- workflow stages and mode shapes are checked against bundled YAML;
- `PRIMARY_VIEWS` remains the operational navigation truth;
- release/test counts are not hard-coded as timeless product claims.

A general generated claim registry is a valid future extension, but this Change
will not add a second schema until the current documentation surface proves the
need. Focused tests are enough for the bounded claims introduced here.

## Community readiness boundary

This Change adds real, maintainable community files:

- `CONTRIBUTING.md`;
- `CODE_OF_CONDUCT.md` using the Contributor Covenant text and attribution;
- `SECURITY.md` with private GitHub reporting guidance and no invented SLA;
- `SUPPORT.md` distinguishing questions, bugs, and security reports.

It does not add empty governance, citation, release-cadence, or changelog
boilerplate. The existing GitHub repository is the only public URL used. The
plugin manifest's `0.2.0` and workspace packages' `0.1.0` remain separately
identified; no single release badge masks that mismatch.

## Alternatives

### Separate public documentation site

Rejected for this Change. It would add a package, build/deployment pipeline,
hosting identity, public URL, SEO/social metadata, duplicated tokens, and a new
publication boundary. The user requested a solution page, not authority to
publish a public service. A future public docs site can consume these canonical
guides after an explicit hosting decision.

### Pathname split (`/overview` and `/app`)

Rejected. The current server intentionally serves the SPA at `/` and
`/index.html`; a pathname split changes server fallback, token injection, deep
links, installed defaults, and security tests. Query routing already provides a
stable deep link.

### Sixth operational rail item

Rejected. Overview is product orientation, not an operational control surface.
The logo provides a discoverable brand-level entry while preserving the five
current operational destinations.

### README-only documentation

Rejected. It reproduces Tenon runtime's overloading problem, makes reference drift more
likely, and gives operators no task-shaped path through advanced features.

### Separate Markdown renderer inside the Dashboard

Rejected. It adds parsing/sanitization/dependency surface and makes local page
availability depend on repository-file access. The page needs summaries and
links, not a second documentation runtime.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Overview becomes a stale second README | Keep it short; canonical details live in `docs/usage/`; add command/link/model checks. |
| Marketing copy overclaims behavior | Use the product-truth registry and explicit tier/status language. |
| New users with zero projects cannot reach it | Render overview before onboarding/project gates. |
| The logo loses brand semantics | Preserve visible icon/title and add accessible button/current-state behavior. |
| README language duplicates drift | Keep the two README files structurally aligned and validate their canonical links/commands. |
| Long pages hurt performance | Static bounded arrays, no remote data/assets, no large media or new dependencies. |
| Public-site expectation is inferred | Label the page as the bundled local overview and avoid any public hosting URL. |
| Existing dashboard regressions | Focused App/Nav/location/i18n tests plus full web suite and real browser regression. |

## Browser acceptance

The exact built distribution must be served by the current `pipeline dashboard`
on `127.0.0.1:18765`. Verification covers:

- direct overview deep link, brand navigation, back/forward, reload, and return
  to each operational view;
- no-project, loading, disconnected, and current-project states;
- 1440×900, 1024×768, 768×1024, 390×844, and 320×568;
- light/dark and Chinese/English;
- keyboard-only navigation, visible focus, headings/landmarks, reduced motion;
- no horizontal page overflow, raw translation keys, console errors, unexpected
  network failures, or external asset requests;
- `/`, `/?view=overview`, `/api/health`, and fingerprinted asset identity from
  the exact current release.

## Assumptions and decision log

| Decision | Conservative resolution |
| --- | --- |
| Public product name | Use **Pipeline Lite**; preserve `pipeline-worklfow` only where it is the real repository/package identifier. |
| README language | English root plus a complete Chinese counterpart; detailed guides use English as the canonical open-source reference, while the in-product overview remains bilingual. |
| Solution location | Bundled local `overview` query view; no external publication. |
| Installed default | Preserve Progress. |
| Community support | Use GitHub Issues for non-sensitive support and GitHub private vulnerability reporting where enabled; never ask for secrets in an Issue. |
| Version statement | Describe plugin manifest and workspace versions separately; no misleading version badge. |
| Documentation target | Describe current `main` behavior and label commands/features by verified implementation, not a nonexistent tagged compatibility promise. |

Continuous authorization permits these low-risk presentation decisions and is
recorded here. It does not authorize a public deployment, npm publication, or
external release.

## Documentation challenge review

| Assumption challenged | Evidence | If false | Resolution |
| --- | --- | --- | --- |
| The page should be local and bundled | Existing single SPA/server and no public-host request or hosting identity | A public site needs a separate package and publication decision | Keep `?view=overview`; document public site as a future option |
| One production frontend is required | Server/Vite/README contracts all identify 18765 as the production entry | A second runtime would require install/update/health/security ownership | Reuse the existing bundle and port |
| Full seven-phase docs apply to every task | Router, simple YAML, free Track, and document-contract code contradict it | Users would choose the wrong mode and expect nonexistent files | Lead with the five execution outcomes and contract-driven documents |
| Product claims can be copied from the old README | Current UI no longer has the described inbox/board/registration flow | New docs would preserve existing drift | Rebuild claims from current code/tests/CLI help |
| Every host has equal enforcement | Adapter registry defines A/B/C fidelity | Users would receive false safety guarantees | Publish the tier matrix and caveats |
| Community boilerplate is automatically trustworthy | No owner, SLA, cadence, or public release policy exists | Empty files would imply commitments the project cannot keep | Add only contribution, conduct, support, and security guidance that can be maintained |

```coverage
touches: documentation, navigation, localization, accessibility, open-source-product-surface
L1_api:      waived -> no HTTP or public API shape changes; the existing query-state contract gains one allowlisted view
L2_data:     waived -> no persistence, schema, migration, or user-data change
L3_rules:    filled -> #verified-product-position
L4_state:    filled -> #navigation-and-state
L5_errors:   filled -> #browser-acceptance
L6_security: filled -> #community-readiness-boundary
L7_perf:     filled -> #visual-and-interaction-direction
L8_deps:     waived -> no new package, router, runtime, font, CDN, or asset dependency
L10_terms:   filled -> #domain-terms
```

## Domain terms

- **Overview:** the bundled, read-only product orientation view at
  `?view=overview`; it is not the operational default or a public hosted site.
- **Execution mode:** the user-visible outcome of routing: discussion, simple,
  default, free, or custom.
- **Workflow:** the authored graph of steps, transitions, gates, Skills, and
  optional document contract.
- **Track:** the routing, coverage, and automation overlay applied to a selected
  Workflow.
- **Evidence chain:** Skill visit, authored document digest, later-step read
  receipt, exact review receipt, and accepted transition.
- **Fidelity tier:** adapter capability level for injection, veto, and Skill
  tracking; it is not a quality ranking of the host itself.

