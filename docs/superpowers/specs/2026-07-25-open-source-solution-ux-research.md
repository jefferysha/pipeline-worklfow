# Open-source solution / overview UX research

Date: 2026-07-25  
Track: frontend  
Scope: repository README and usage-documentation entry experience, plus one open-source
solution / overview page. This is research only; no production implementation is included.

## Executive recommendation

For the current request, add a **read-only `overview` view to the existing dashboard SPA** and
open it through the brand mark, while keeping the five operational rail destinations unchanged.
Use `/?view=overview` rather than adding a pathname router. Put the view in a new
`packages/dashboard-app/src/solution/` feature domain, reuse the existing theme, i18n provider,
Button/Card/Badge primitives, and ship it in the same Vite bundle served by the same loopback
server on port `18765`.

The page should be a curated orientation surface, not a second documentation truth source:

- the root README explains the product, value, five-minute path, support, and contribution entry;
- `docs/usage/` owns complete, task-oriented manuals and tutorials;
- the overview page summarizes capabilities and links to the canonical repository documents;
- behavioral claims on all three surfaces must be backed by current commands, tests, or contracts.

This is the lowest-risk architecture because the repository already has one SPA, one visual
system, one i18n contract, and one production server. It does not add a router, package, build
pipeline, dependency, or deployment promise. If the intended page must be publicly discoverable
and indexable without installing Pipeline, select the separate static-site option in
[Architecture C](#architecture-c--separate-public-documentation-site) instead; a loopback
dashboard cannot satisfy that requirement.

## Research method

The audit used:

1. direct source inspection of the dashboard shell, view projection, i18n, design tokens,
   component primitives, server static routing, tests, README, package metadata, license, and
   repository structure;
2. read-only probes of `127.0.0.1:18765`;
3. comparison with official or primary open-source documentation surfaces:
   [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes),
   [Trellis](https://github.com/mindfold-ai/Trellis),
   [OpenAI Codex](https://github.com/openai/codex),
   [Dagger documentation](https://docs.dagger.io/), and
   [Backstage getting started](https://backstage.io/docs/getting-started/generated-index/).

No third-party page framework was selected. The local code already supplies the necessary
primitives, and adding a dependency would increase surface area without solving a missing
capability.

## Current-state evidence

### Application shell and navigation

| Evidence | Observed contract | Consequence for an overview page |
| --- | --- | --- |
| `packages/dashboard-app/src/App.tsx:22-30` | Theme, root, and view are local preferences; the allowlisted views come from `PRIMARY_VIEWS`. | A new view must be explicit in the view union and location parser; unknown values intentionally fall back. |
| `packages/dashboard-app/src/App.tsx:47-61` | URL view wins, then localStorage, then `progress`. | A direct `?view=overview` link can be supported without changing the installed user's default landing page. |
| `packages/dashboard-app/src/App.tsx:76-99` | The shell owns view state, theme, flash, and the single snapshot subscription. | The solution view belongs at application assembly, but should remain data-independent. |
| `packages/dashboard-app/src/App.tsx:131-155` | View/root/change are mirrored into the query string and `popstate` restores them. | Back/forward and shareable-link behavior already exist; no router dependency is required. |
| `packages/dashboard-app/src/App.tsx:223-274` | The app uses a sticky left rail and one full-width `<main>`. | The overview can reuse the shell and should not introduce a second global header/navigation system. |
| `packages/dashboard-app/src/App.tsx:278-363` | No-project onboarding currently replaces every non-machine view. | The overview must be rendered before the onboarding switch so a first-time user can read it with zero projects. |
| `packages/dashboard-app/src/shell/Nav.tsx:18-31` | `View` and the five operational `RailView` values are coupled but separately named. | Add `overview` to `View`, not `RailView`; keep the operational rail at five items. |
| `packages/dashboard-app/src/shell/Nav.tsx:59-74` | The brand mark is non-interactive and already carries the product title. | Convert this mark into the separate Overview entry with an accessible name and current-state indication. |
| `packages/dashboard-app/src/shell/Nav.tsx:74-111` | The operational rail is generated from `PRIMARY_VIEWS` and uses `aria-current="page"`. | Do not append a sixth product-marketing item to the workflow operations list. |
| `packages/dashboard-app/src/shell/Nav.test.tsx:31-112` | Tests intentionally lock the primary rail to five operational views and current-page semantics. | Preserve that test; add brand-entry tests rather than weakening the navigation contract. |

### URL and view model

The application does not use React Router. `packages/dashboard-app/src/shell/dashboardLocation.ts`
is a deliberately small URL-state model:

- lines 3-27 whitelist five `?view=` values and preserve non-empty root/change values;
- lines 30-39 only mutate dashboard-owned query keys and preserve foreign keys such as `debug`;
- lines 42-63 resolve macOS `/tmp` and `/private/tmp` aliases against registered roots;
- `dashboardLocation.test.tsx:4-15` verifies allowlisting and foreign-query preservation;
- `App.test.tsx:89-124` verifies direct change links and URL updates during view changes.

Therefore the minimum change is to extend this existing model. Installing a router for one static
view would create two navigation authorities and violate the repository's minimum-dependency
constraint. A pathname such as `/overview` is not currently viable without server work because
the server only serves the SPA for `/` and `/index.html`; unknown routes resolve to 404
(`packages/server/src/serverGetActivityRoutes.ts:33-38`,
`packages/server/src/server.test.ts:565-571`).

### Design system and visual foundation

The existing UI is sufficient for a polished solution page:

- `packages/dashboard-app/src/index.css:18-42` defines the light palette, system font stack,
  radii, shadows, code surface, semantic blue/green/red/purple colors, and focus tokens.
- `packages/dashboard-app/src/index.css:43-102` provides system dark-mode and explicit
  light/dark overrides.
- `packages/dashboard-app/src/index.css:104-186` exposes the same runtime tokens through
  Tailwind and shadcn semantic names.
- `packages/dashboard-app/src/components/ui/button.tsx:7-64` supplies focus-visible,
  disabled, link, outline, and size variants.
- `packages/dashboard-app/src/components/ui/card.tsx:5-92` supplies composable card regions.
- Badge, tabs, separator, tooltip, dialog, popover, select, and table primitives already exist
  under `packages/dashboard-app/src/components/ui/`.
- Lucide is already used by the shell; new icons do not require another asset package.
- The app uses no external font or CDN, which is appropriate for a local, security-sensitive
  control plane.

The page should retain the repository's “OpenAI palette × Trellis layout” language: neutral
surfaces, blue for structure and selection, green only for confirmed success, red only for
attention/error, restrained motion, high information density, and no decorative gradient wall.

### Internationalization

`packages/dashboard-app/src/i18n/index.tsx:4-14` persists `zh`/`en` and defaults to Chinese.
`resolvePath` returns the key for a missing translation (`:16-24`), making missing strings visible
but not safe to ignore. The existing tests enforce:

- exact Chinese/English key-set equality
  (`packages/dashboard-app/src/i18n/i18n.test.tsx:20-25`);
- every literal `t('...')` call resolves to a known key (`:28-77`);
- switching language rerenders live content (`:93-115`);
- app-level theme and language changes update the rendered shell
  (`packages/dashboard-app/src/App.test.tsx:217-237`).

All solution-page copy must therefore live under symmetrical `solution.*` dictionaries. Do not
hard-code Chinese UI strings in the new view. Existing `translations.ts` is a 2,220-line
configuration exception; this task should not introduce a second translation mechanism merely to
avoid extending it.

### Accessibility and responsive behavior

Current positive patterns include semantic `<main>`, `<nav>`, buttons, `aria-current`,
status regions, named dialogs, keyboard-safe Radix primitives, and focus-visible styles. The rail
contracts at `Nav.tsx:47-52` and `:59-171` collapse labels below 720 px while retaining button
titles and accessible text.

The current solution-page risks to address explicitly are:

- the brand mark is a 34 px non-button, so its conversion to navigation needs at least a 40–44 px
  target, a visible focus ring, an accessible label, and current-page semantics;
- the solution hero must have one `<h1>` and a logical heading outline;
- repeated capability cards need headings, not clickable `<div>` elements;
- copy/code actions must use buttons and announce success without stealing focus;
- diagrams must have an equivalent text explanation;
- motion must respect `prefers-reduced-motion`;
- dense capability grids must reflow to one column at 320 px without horizontal scrolling;
- both languages must be tested because English labels expand and Chinese paragraphs wrap
  differently.

### Production serving on port 18765

The code contract is coherent:

- `packages/server/src/port.ts:1-13` defines `18765` as the production default and validates
  overrides.
- `packages/server/src/main.ts:50-123` binds to `127.0.0.1`, applies version-aware process reuse or
  preemption, injects the dashboard build, writes the token handshake, and logs the actual URL.
- `packages/dashboard-app/vite.config.ts:6-36` reserves `5173` for development and proxies `/api`
  to `18765`; production remains one origin.
- `packages/server/src/serverTransport.ts:137-172` serves only the bundled index and `/assets/*`,
  injects the token before `</head>`, prevents asset traversal, and marks fingerprinted assets
  immutable.
- `packages/server/src/server.test.ts:573-614` verifies the index/token/asset contract through a
  real HTTP server.

However, the read-only live probe performed during this research found **no listener on
`127.0.0.1:18765`**: both `/api/health` and `/` failed to connect, and `lsof` returned no owning
process. This does not invalidate the source contract, but it means no current visual or runtime
claim can be made for the live dashboard in this research phase. Build/verify must start the exact
current distribution and repeat the browser matrix below.

### README and public-project hygiene gaps

The current root README is useful internal documentation but is not yet a reliable open-source
front door:

1. It opens with “lightweight TypeScript rebuild” and an unresolved `[workflow-plugin]` reference
   rather than a stable product name, audience, problem, and outcome (`README.md:1-9`).
2. It gives installation, routing, dashboard, custom-workflow, and development details, but lacks
   a concise feature map, screenshots, prerequisites table, support channels, contribution
   workflow, security-reporting guidance, compatibility matrix, troubleshooting entry, and
   documentation index.
3. The dashboard section is stale. It still describes a default Inbox/Board, project registration
   form, project switcher, keyboard shortcuts, and a workbench dropdown
   (`README.md:156-176`), while current code and tests define five rail views, default Progress,
   no registration form, and a direct Workbench view
   (`App.test.tsx:54-87`, `Nav.test.tsx:31-79`).
4. The README is already 248 lines. GitHub recommends keeping README content to what users need to
   start and contribute, and moving detailed material into longer documentation.
5. The repository has an MIT `LICENSE` and a GitHub Actions CI workflow, but no
   `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, changelog, issue templates, or
   `package.json` repository/homepage/bugs metadata.
6. `.claude-plugin/plugin.json` identifies the distributable plugin as `pipeline-lite` version
   `0.2.0`, while the root package and README use `pipeline-worklfow`. Naming must be normalized
   in the public narrative without silently changing package IDs.

These are documentation/product-surface issues, not reasons to add a documentation framework.

## External pattern synthesis

The referenced projects converge on a clear information hierarchy:

| Pattern | Primary evidence | Application here |
| --- | --- | --- |
| Explain what, why, first use, help, and maintainership before exhaustive reference | GitHub's README guidance | Keep root README short and task-oriented; link to manuals. |
| Product identity → why it matters → capability table → prerequisites → copyable quickstart → use cases → how it works → community | Trellis README | Good shape for a coding-agent workflow product; avoid copying its claims or visual identity. |
| One obvious install/run sequence, then route readers to platform-specific docs | OpenAI Codex README | Put Codex and Claude installation side by side and explain when to choose each. |
| “What do you want to do?” orientation, explicit requirements, a bounded-time quickstart, and core concepts | Dagger docs | Organize tutorials by outcome, not package names. State Docker/credential prerequisites only where needed. |
| Separate installation, configuration, deployment/use, support, and updating | Backstage getting started | Split usage documents into stable task groups and keep update/repair discoverable. |

The consistent lesson is not “use a docs framework”; it is “give each reader a short route to the
next successful action.” The Pipeline page should do that with progressive disclosure.

## Information architecture for the solution page

### Page objective

In one scroll, a new visitor should be able to answer:

1. What problem does Pipeline solve?
2. What guarantees make it different from a prompt template?
3. Which execution path will my task use?
4. Which host do I install it into?
5. What runs locally and what requires Docker or credentials?
6. Where do I go for a complete tutorial, troubleshooting, or contribution?

### Recommended section order

1. **Hero**
   - Product: Pipeline Lite.
   - Outcome: a verifiable workflow control plane for coding agents.
   - One-sentence mechanism: state machine + OpenSpec/document receipts + Skill evidence +
     review gates + local dashboard.
   - Primary CTA: “Install for Codex”; secondary CTA: “Read the 5-minute guide”.
   - MIT/open-source badge and repository link; no fabricated download/star/performance numbers.

2. **Trust strip**
   - Local-first, host-selected install, immutable validated runtime, explicit review gates,
     evidence-backed transitions.
   - Clarify that optional Docker/credentials are needed for AFK execution, not core CLI use.

3. **Choose the right execution path**
   - Discussion: no Change.
   - Simple: `change → verify → done`.
   - Default: seven governed phases.
   - Free: selected Workflow without domain coverage overlays.
   - Custom: project-defined DAG and document contract.
   - This is the most important conceptual correction to “every task runs full PM/frontend/backend”.

4. **Seven-phase workflow**
   - Render a responsive ordered sequence for open → explore → spec → build ⇄ verify → ship →
     archive.
   - Mark Explore/Spec/Verify exits as review-gated.
   - Explain build/verify retry and requirements-changed return without hiding them in a diagram.

5. **Capability map**
   - Kernel and state.
   - CLI and normal-chat routing.
   - Bundled Skills and host adapters.
   - OpenSpec, Superpowers, ADR, document hashes, and read receipts.
   - Dashboard/SSE.
   - AFK automation and Docker sandcastle.
   - Loop governance and budgets.
   - Tap diagnostics and legacy channel compatibility.
   - Setup, updates, repair, and rollback.

6. **How the pieces connect**
   - Conversation/hook → router → Change/workflow → phase Skills/documents → review receipt →
     transition → dashboard/ledger.
   - Use a CSS/HTML flow with a text alternative; do not embed a second workflow-canvas engine.

7. **Five-minute quickstart**
   - Host tabs: Codex and Claude.
   - Prerequisite: Node.js 22+.
   - Install/setup, one-time Codex hook trust note, initialize or use normal conversation, open
     dashboard, inspect status, enable auto-update optionally.
   - Code blocks must be copyable and remain truthful for released artifacts.

8. **Tutorial routes**
   - First install and host trust.
   - Normal conversation and task routing.
   - Simple/default/free/custom behavior.
   - Create a custom Workflow and document contract.
   - Human review and document evidence.
   - Dashboard operations.
   - AFK and loop governance.
   - Update, repair, rollback, troubleshooting.
   - Contributor development and verification.

9. **Security and operating boundary**
   - Loopback-only server, same-origin injected token, trusted project roots, secrets excluded from
     repository/logs, and no promise that local dashboard is a hosted SaaS.

10. **Community footer**
    - GitHub repository, Issues, contribution guide, security policy, license, release history.
    - Only show links that actually exist.

### Content source discipline

The page should not import Markdown at runtime or fetch GitHub. It should contain short,
translated summaries and stable repository URLs. Canonical commands and contracts remain in
versioned Markdown. This avoids:

- bundling a Markdown renderer and sanitization surface;
- coupling local page availability to the network;
- rendering secrets or local paths from repository documents;
- maintaining full tutorials in TypeScript translation dictionaries.

## Architecture options

### Architecture A — dashboard-native overview view (recommended)

**Shape**

```text
App / Nav / dashboardLocation
          |
          +-- ?view=overview
                  |
                  +-- solution/SolutionView.tsx
                  +-- solution/SolutionView.test.tsx
                  +-- existing i18n + design tokens + UI primitives
                  +-- canonical GitHub/docs links

pipeline dashboard -> 127.0.0.1:18765 -> same index + same assets
```

**Minimal implementation boundary**

- Add `'overview'` to `View` and to the URL whitelist, but not to `RailView` or
  `PRIMARY_VIEWS`.
- Make the brand mark a real navigation button/link to `overview`.
- Render `SolutionView` before project/onboarding routing, so it works with zero projects and
  during snapshot failure.
- Add `solution.*` strings in both languages.
- Add focused tests in `SolutionView`, `Nav`, `dashboardLocation`, `App`, and i18n.
- Use existing Button/Card/Badge/Tabs primitives and CSS tokens; introduce no dependency.
- Keep `/` behavior and default `progress` landing unchanged; direct entry is
  `/?view=overview`.

**Benefits**

- One package, one build, one port, one theme, one translation system.
- Lowest implementation and regression cost.
- Makes the new page available in every installed plugin release.
- Preserves the security model and offline assets.
- Does not force an app-router migration for one view.

**Costs / limits**

- It is a local installed-product page, not a public website.
- Search engines and non-installing GitHub visitors cannot discover it.
- External documentation links leave the local app.
- AppShell still establishes the snapshot subscription unless assembly is further split; keep the
  page render independent even if that connection fails.

**Use when**

The user's “solution page” means an installed overview/orientation page and no public deployment
has been requested.

### Architecture B — pathname-routed landing and application

**Shape**

```text
/ or /overview       -> public-style solution view
/app or /dashboard  -> operational dashboard
```

This could use either a tiny hand-written pathname model or React Router.

**Benefits**

- Semantically clean URLs.
- The landing page can be the default while the operational UI has an explicit location.
- Easier future separation into public and authenticated/local sections.

**Costs / risks**

- Current server returns the SPA only for `/` and `/index.html`; every new pathname needs a
  deliberate fallback route and security review.
- Token injection, unknown-route 404 behavior, Vite base path, static assets, deep links, browser
  history, and all server tests change together.
- It changes the established installed-user default and URL contract.
- React Router is unnecessary unless multiple nested routes and layouts are already committed.

**Use when**

The product decision is to make the overview the default installed landing page and introduce a
durable multi-page URL model. It is not the minimum solution.

### Architecture C — separate public documentation site

**Shape**

```text
packages/docs-site or a dedicated static-site root
  -> public landing / solution / guides / reference
  -> GitHub Pages or another explicitly chosen host

packages/dashboard-app
  -> local operational console only
```

**Benefits**

- Public, indexable, shareable, screenshot/social-preview friendly.
- Documentation navigation can scale beyond one page.
- No local token or project state is present.
- Clean separation between marketing/docs and the operational control plane.

**Costs / risks**

- Adds a package, build, deployment, dependency/update, accessibility, and link-checking surface.
- Creates visual-token and content drift unless a shared content/build contract is designed.
- Requires explicit hosting/release authority and URL decisions.
- A full docs framework is disproportionate if the requested deliverable is one page.

**Use when**

The page must be accessible before installation, serve SEO/community acquisition, or grow into a
documentation portal. This is the correct long-term public architecture, but it is a separate
delivery decision rather than a safe default.

## Decision matrix

| Criterion | A: in-app query view | B: pathname split | C: public docs site |
| --- | ---: | ---: | ---: |
| Current-scope implementation cost | Low | Medium | High |
| Reuses current design/i18n/components | Full | Full | Partial |
| Preserves 18765 contract | Full | Requires server change | Independent |
| Public discoverability / SEO | None | None unless separately hosted | Strong |
| Security-boundary change | Minimal | Medium | New deployment boundary |
| Content drift risk | Medium | Medium | High without tooling |
| Scales to many documentation pages | Limited | Medium | Strong |
| Recommended now | **Yes** | No | Only if public hosting is required |

## Proposed frontend ownership

```text
packages/dashboard-app/src/
├── App.tsx                         # assemble overview, no solution-domain details
├── shell/
│   ├── Nav.tsx                     # brand overview entry; five operational items unchanged
│   └── dashboardLocation.ts        # allowlisted ?view=overview
├── solution/
│   ├── SolutionView.tsx            # page composition and semantic sections
│   ├── SolutionWorkflow.tsx        # small presentational seven-phase visualization, if needed
│   └── SolutionView.test.tsx       # content, link, accessibility, language behavior
├── components/ui/                  # reuse only; no solution-domain imports
└── i18n/translations.ts            # symmetrical solution.* strings
```

Dependency direction remains:

```text
App/shell -> solution view -> shared UI/lib/i18n
```

The solution feature must not import `progress`, `workbench`, `afk`, `machine`, `state`, or `api`.
It describes those domains but does not own or query their state. No new global state is needed.

## Visual direction

### Tone

- Credible engineering product, not a generic AI landing page.
- Evidence and mechanics over slogans.
- Crisp two-dimensional surfaces with one structural accent.
- Use real workflow states and commands as the visual material.

### Layout

- Maximum readable width around 1180–1240 px inside the existing content column.
- Hero: asymmetric two-column at desktop; copy/CTA left, compact workflow/evidence console right.
- Capability map: 3 columns desktop, 2 tablet, 1 mobile.
- Quickstart: host tabs over one command surface; prerequisites and trust note adjacent.
- Workflow: horizontal seven-step rail above 900 px, wrapped ordered cards below.
- Documentation/tutorial routes: grouped by “Get started / Operate / Extend / Recover / Contribute”.

### Color and type

- Keep system font and mono stack from `index.css`.
- Neutral background and white/dark cards.
- Blue = structure/selected/current; green = verified/success; red = human attention or failure;
  purple/amber only for secondary semantic categories.
- Avoid unsupported benchmark numbers, star counters, fake terminal output, neon gradients,
  glassmorphism overuse, and external logos without explicit asset/license review.

### Motion

- Optional small entrance staggering and copy-button feedback using existing motion helpers.
- Never animate the seven-phase meaning into existence; all information must be present without
  animation.
- Reduce or remove transforms under `prefers-reduced-motion`.

## Browser acceptance matrix

The final implementation is not complete until it is tested from the exact current production
bundle served by the exact current server. Unit tests and Vite build alone are insufficient.

| Area | Scenarios | Acceptance |
| --- | --- | --- |
| Production serving | Start current `pipeline dashboard`; request `/`, `/?view=overview`, `/api/health`, and fingerprinted assets on `127.0.0.1:18765` | HTML/health/assets are 200; one listener owns 18765; title/content match this repository; no stale process. |
| Navigation | Open overview directly; click brand from each operational view; click back/forward; reload; switch back to Progress | URL and current indicator are correct; five operational rail items remain; no lost root/change state outside the existing contract. |
| Zero-project/offline | No registered projects; snapshot loading; snapshot error; disconnect SSE while on overview | Overview remains readable and actionable; it is not replaced by onboarding or a blank/error state; no mutation is attempted. |
| Viewports | 1440×900, 1024×768, 768×1024, 390×844, 320×568 | No horizontal page scroll; cards/steps reflow; code blocks scroll internally; brand target and CTAs remain usable. |
| Themes | System light, system dark, explicit light, explicit dark | Text, borders, code blocks, badges, focus rings, and illustrations remain legible; no hard-coded color breaks. |
| Languages | Chinese and English at every viewport | All visible strings switch; no raw translation keys; no clipped navigation, CTA, tabs, or cards. |
| Keyboard | Tab from brand through CTAs, tabs, copy controls, documentation links, and shell settings; Shift+Tab; Enter/Space | Logical order, visible focus, no trap, button/link semantics correct, settings dialog behavior unchanged. |
| Semantics | Inspect landmarks/headings/names with accessibility tree | One `h1`; ordered heading levels; one main; named navigation; decorative icons hidden; diagrams have text equivalents. |
| Reduced motion | Emulate `prefers-reduced-motion: reduce` | No essential content depends on animation; transitions are removed or effectively instantaneous. |
| Links | Repository, docs, issue, license, security, contribution links | Every rendered link exists, opens the intended destination, and external new-tab links use safe rel attributes. |
| Console/network | Fresh load, language/theme switch, navigation, copy actions | No console errors, React warnings, unexpected 4xx/5xx, duplicate API subscriptions, or external asset/CDN requests. Expected SSE aborts from deliberate navigation are documented separately. |
| Regression | Projects, Progress, Automation, Workbench, Machine; no-project onboarding | Existing views and tests remain unchanged except intentional brand behavior; existing deep links still work. |

### Automated coverage expected

- `SolutionView.test.tsx`: semantic sections, content, CTA/link targets, no API calls, copy feedback,
  both languages.
- `Nav.test.tsx`: brand entry, focus/name/current state, `PRIMARY_VIEWS` still length five.
- `dashboardLocation.test.tsx`: overview allowlist, query preservation, invalid-view fallback.
- `App.test.tsx`: direct entry, zero-project render, back/forward, default still Progress, offline
  render independence.
- `i18n.test.tsx`: existing completeness and literal-key gates.
- Existing server tests plus a focused assertion that `/?view=overview` is served through `/`
  query routing; no `/overview` claim.

### Verification commands for the implementation phase

```bash
npx vitest run --config packages/dashboard-app/vitest.config.ts \
  packages/dashboard-app/src/solution/SolutionView.test.tsx \
  packages/dashboard-app/src/shell/Nav.test.tsx \
  packages/dashboard-app/src/shell/dashboardLocation.test.tsx \
  packages/dashboard-app/src/App.test.tsx \
  packages/dashboard-app/src/i18n/i18n.test.tsx
npm run typecheck:web
npm run test:web
npm run build:web
npm run build:server
```

Then start the exact built distribution and execute the real-browser matrix. The repository does
not define a dedicated browser-E2E npm script; do not claim one.

## Documentation architecture implied by the page

The page should link to a task-oriented document set rather than reproduce it:

```text
README.md
docs/
└── usage/
    ├── README.md                 # documentation index and audience routes
    ├── installation.md          # prerequisites, Codex, Claude, adapters, uninstall
    ├── quickstart.md             # first conversation -> Change -> dashboard -> completion
    ├── task-routing.md           # discussion/simple/default/free/custom
    ├── default-workflow.md       # seven phases, review gates, return edges
    ├── custom-workflows.md       # DAG, Skills, guards, document_contract
    ├── documents-and-evidence.md # OpenSpec, Superpowers, ADR, hashes/read receipts
    ├── dashboard.md              # five current views and 18765 production/dev model
    ├── automation-and-loops.md   # AFK, Docker, budgets, authority levels
    ├── updates-and-recovery.md   # auto-update, status, repair, rollback
    ├── cli-reference.md          # command families with canonical --help boundaries
    └── troubleshooting.md        # hook trust, stale server, token, Docker, skills
```

Public-project supporting files should be added or intentionally waived:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- release/changelog entry
- `.github/ISSUE_TEMPLATE/`
- repository/homepage/bugs metadata where release tooling consumes it

README links must be relative so forks and branches render correctly. Detailed behavioral claims
must link to the canonical usage document or contract rather than a dated verification report.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Overview becomes a stale second README | Treat docs as canonical; keep page copy short; test commands/links where practical. |
| Marketing copy overclaims runtime guarantees | Only claim behavior backed by current code/spec/tests; show optional prerequisites and known boundaries. |
| Sixth rail item degrades operational navigation | Keep `PRIMARY_VIEWS` unchanged; use the brand entry as a separate Overview destination. |
| No-project onboarding hides the page | Route overview before snapshot/project gating. |
| New page accidentally calls privileged endpoints | No imports from `api`/`state`; no mutation controls; add a no-fetch component test. |
| README and current UI diverge again | Rewrite stale Dashboard section from current view tests and add doc checks for key commands/links. |
| Local page is mistaken for a public website | Label it as installed overview; do not promise public URL/SEO without Architecture C. |
| Translation file grows further | Accept the existing configuration exception for this bounded page; do not create a parallel content runtime. |
| Direct `/overview` links 404 | Document and test `/?view=overview`; only claim pathname routing after server fallback work. |
| Stale process on 18765 serves old UI | Build first, inspect `/api/health` version/release, resolve exact listener, then browser-test content identity. |

## Conservative assumptions

1. The requested “one open-source solution page” is an installed, local product-overview view,
   because no public hosting or deployment target was specified.
2. The current operational default remains Progress; the new page is explicit and discoverable
   through the brand mark.
3. Chinese and English remain equally supported.
4. The page introduces no telemetry, remote assets, user tracking, authentication, or public
   server exposure.
5. Documentation reflects currently implemented behavior, not roadmap promises.

## Open decisions

1. **Audience boundary:** Is the page only the installed `18765` overview, or must it be public and
   indexable before installation? Public/indexable requires Architecture C.
2. **Default landing:** Should new installed users see Overview first, or should Progress remain
   the invariant default? This report recommends preserving Progress.
3. **Public product name:** Should public copy standardize on “Pipeline Lite”, while retaining the
   existing repository/package identifiers for compatibility?
4. **Documentation language:** Should detailed `docs/usage/` be Chinese-first with bilingual
   overview/README, or should every long-form guide have a maintained English counterpart?
5. **Community surface:** Which support/reporting channels are real and maintained (GitHub Issues,
   Discussions, email/security contact)? The page must not render placeholders.

## Final design conclusion

Architecture A satisfies the current request with the smallest coherent change: one static
feature-domain page in the existing SPA, explicit query routing, brand-level entry, no new
operational navigation item, no API ownership, and complete reuse of the repository's visual,
i18n, accessibility, test, and 18765 serving contracts. It leaves the door open for a future
public site without prematurely coupling the local control plane to a deployment platform.
