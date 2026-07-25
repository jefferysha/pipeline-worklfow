# Pipeline Lite Open-source Documentation — Product Truth Research

**Status:** Explore research input  
**Date:** 2026-07-25  
**Track:** frontend  
**Change:** `open-source-docs-solution-site`  
**Scope:** read-only audit of the current repository; this document does not change runtime behavior

## 1. Purpose

This report defines the product claims that the README, usage documentation, and
in-product open-source solution page may safely make. Each claim is tied to
current source or verification evidence, and each boundary identifies wording
that would overstate the implementation.

The product should be introduced as:

> Pipeline Lite is a local-first workflow-governance plugin for coding agents.
> It packages declarative workflows, OpenSpec evidence, phase-specific Skills,
> review gates, a CLI, a local dashboard, automation controls, and adapters for
> multiple agent hosts in one release.

It should **not** be introduced as a hosted SaaS, an autonomous replacement for
human review, a semantically perfect task classifier, or a platform with equal
enforcement fidelity on every supported host.

## 2. Audited product baseline

- The user-facing plugin manifest is `pipeline-lite` version `0.2.0`, licensed
  MIT, and points to the public repository
  `jefferysha/pipeline-worklfow`
  (`.codex-plugin/plugin.json:1-17`).
- The monorepo and CLI packages are currently version `0.1.0`; the root package
  is private and requires Node.js 22 or later
  (`package.json:1-11`, `packages/cli/package.json:1-13`).
- The package is a workspace-built plugin distribution, not a confirmed
  published npm CLI. Public installation instructions must use host plugin
  installation and `pipeline setup --<host>`, not claim that
  `npm install -g` is supported.
- The latest full verification report records 5,118 passing root assertions,
  920 dashboard assertions, 426 hook assertions, 262 adapter assertions,
  15 bundle-smoke assertions, and zero mandatory external Skill dependencies
  (`docs/superpowers/reports/2026-07-25-workflow-governance-architecture-audit-verify.md:43-62`).
- Browser verification confirmed the current packaged dashboard on
  `127.0.0.1:18765`, distinct running/waiting states, workflow-derived step
  counts, and healthy `/api/health` and `/api/snapshot` endpoints
  (`docs/superpowers/reports/2026-07-25-workflow-governance-architecture-audit-verify.md:64-75`).

The spelling `pipeline-worklfow` is the current repository and package identity.
Documentation should not silently “correct” it in commands or URLs.

## 3. Public claim registry

| Area | Safe public claim | Primary evidence | Boundary / wording to avoid |
| --- | --- | --- | --- |
| Packaging | One plugin release includes CLI, runtime, hooks, Skills, dashboard assets, workflow templates, and adapters. | `.codex-plugin/plugin.json:1-17`; `openspec/specs/plugin-distribution/spec.md` | Do not describe separate products that users must assemble manually. |
| License | The current repository declares the MIT license. | `LICENSE`; `.codex-plugin/plugin.json:8-11` | Do not claim third-party components have no separate license obligations. |
| Runtime | Node.js 22 or later is required by the source workspace and CLI. | `package.json:6-8`; `packages/cli/package.json:5-6` | Do not advertise support for older Node.js versions. |
| Host-scoped setup | Setup requires exactly one host flag, for example `pipeline setup --codex`. | `packages/cli/src/commands/plugin-host.ts:8-21,43-57` | Do not imply one setup mutates every installed agent host. |
| Native installation | Codex and Claude use their host-owned plugin marketplace and inventory commands. | `packages/cli/src/commands/plugin-host.ts:68-89` | Do not construct or promise private host cache paths. |
| Non-native installation | Cursor, Gemini, Copilot, Pi, Devin, Zed, Aider, Continue CLI, Cline, and Amp are selectable adapter targets; non-native targets support `--target`. | `packages/cli/src/commands/plugin-host.ts:8-21`; CLI `setup --help` | Do not present all adapters as Tier A or as native marketplace plugins. |
| Stable command | Setup publishes stable `pipeline` and `pipeline-hook` launchers while the release payload remains immutable. | `packages/cli/src/commands/setupHost.ts`; `packages/cli/src/runtime/release-store.ts` | Do not promise a fixed hidden cache directory. |
| Runtime location | Managed payload/state/config uses OS-standard application-data locations; the command launcher is stable. | `runtime/pipeline-bootstrap.mjs`; `packages/cli/src/runtime/release-store.ts` | Do not document a single hard-coded macOS path as cross-platform truth. |
| Update | `pipeline update --<host>` verifies and atomically activates a host-scoped release; native hosts may enable `--auto-update`. | `packages/cli/src/commands/update.ts`; `openspec/specs/plugin-runtime/spec.md` | Do not claim non-native adapters self-update independently or that an already-running agent reloads Skills immediately. |
| Recovery | The bootstrap revalidates content and has an exact managed rollback/repair path. | `runtime/pipeline-bootstrap.mjs`; `pipeline runtime repair --rollback` | Do not call this a hidden backdoor or arbitrary unsigned fallback. |
| Default workflow | The default workflow is `open → explore → spec ⇄ build ⇄ verify → ship → archive`. | `templates/workflows/default.yaml:1-106` | Do not flatten it into a one-way checklist; requirements and verification can return to earlier phases. |
| Review gates | Explore, Spec, and Verify are review-gated, with review receipts tied to the exact transition. | `templates/workflows/default.yaml:13-31,69-88`; `openspec/specs/document-evidence-contract/spec.md` | Do not claim continuous authorization erases review/evidence requirements or grants publication rights. |
| Simple workflow | Narrow, explicitly bounded low-risk edits can route to `change → verify → done`, with escalation when scope expands. | `templates/workflows/simple.yaml:1-54`; `packages/kernel/src/tracks/builtins.ts:26-40,58-74` | Do not say “every small task” is simple; API, auth, schema, dependency, architecture, release, and cross-module changes are excluded. |
| Chat mode | Pure discussion and system notifications do not create a governed Change. | `hooks/router.sh`; `openspec/specs/normal-chat-routing/spec.md` | Do not confuse chat with the free Track. |
| Free Track | Every workflow can be selected with a free Track that removes domain routing/coverage/Skill overlays while retaining the chosen workflow's own structure and gates. | `packages/kernel/src/tracks/builtins.ts:120-131`; `openspec/specs/normal-chat-routing/spec.md` | Do not claim free mode bypasses workflow governance or review gates. |
| Custom workflows | Projects can define declarative workflow steps, transitions, gates, Skills, artifacts, and document contracts. | `.pipeline/workflows/*.yaml`; `packages/kernel/src/workflow`; CLI workflow commands | Do not imply custom YAML can execute arbitrary code or override reserved built-ins. |
| Routing | Built-in routing scores explicit regular-expression signals after applying exclusions and priorities. | `packages/kernel/src/tracks/builtins.ts:25-40`; `hooks/router.sh` | Do not describe routing as semantic AI classification or guarantee correct intent inference from ambiguous prompts. |
| Effective plan | CLI, hooks, Todo projection, and Dashboard consume the same compiled workflow/Track plan. | `openspec/specs/effective-workflow-plan/spec.md`; latest verification report, lines 35-37 and 68-73 | Do not hard-code seven Todo rows for simple, free, or custom workflows. |
| OpenSpec documents | The default workflow governs proposal, OpenSpec design/tasks, superpower design, ADR, delta spec, implementation plan, verification report, and applied spec. | `packages/kernel/src/workflow/document-contract.ts:16-73` | Do not claim state initialization alone writes meaningful documents; phase Skills author them and the CLI records evidence. |
| Document reads | Later default phases must have current read receipts for the documents they consume. | `packages/kernel/src/workflow/document-contract.ts:114-140`; `openspec/specs/document-evidence-contract/spec.md` | Do not claim a file's existence is sufficient; digest, producer, phase visit, and read receipt matter. |
| Short workflows | A short custom workflow may declare a versioned document contract for only its own steps; a workflow without a contract has no automatic document governance. | `packages/kernel/src/workflow/document-contract.ts:154-186`; `openspec/specs/declarative-document-governance/spec.md` | Do not force the default seven-phase OpenSpec document set onto every three-step workflow. |
| Skill provenance | Governed outputs and transitions require current-visit evidence from the selected bundled Skill identity. | `openspec/specs/interaction-and-skill-provenance/spec.md`; `openspec/specs/skill-content-resolution/spec.md` | Do not accept an old visit, another Change, a same-named untrusted Skill, or fabricated transcript evidence. |
| Bundled Skills | Mandatory Skills are bundled with the release; external lookup is only a true-not-found fallback. | `templates/skill-sources.yaml`; latest verification report, lines 57-58 | Do not tell new users to install a long manual dependency list. |
| Dashboard | One local production server serves both the SPA and API on `127.0.0.1:18765` by default. | `packages/server/src/main.ts:50-59,84-103`; `packages/server/src/port.ts:1-13` | Do not present the Vite development port as a second production frontend. |
| Dashboard startup | `pipeline dashboard --open` starts/reuses the packaged server, waits for compatible health, and opens the UI; `--port` overrides the port. | `packages/cli/src/commands/dashboard.ts`; CLI `dashboard --help` | Do not accept a listening port as proof that the correct release is running; health includes release/scope identity. |
| Dashboard UI | The UI covers projects, progress/Todo, AFK, workflow/Track/hook/automation configuration, and machine/advanced views. | `packages/dashboard-app/src/shell/Nav.tsx`; `packages/dashboard-app/src/features` | Do not claim every capability is available when its snapshot capability flag is false. |
| Local API | The server exposes local health, snapshot, event stream, workflow/Track, run, automation, AFK, loop, configuration, and diagnostics surfaces. | `packages/server/src/server.ts`; `packages/server/src/routes` | Do not market this as a versioned public cloud API or remote multi-tenant control plane. |
| Local security | Mutations are loopback-only, require a local Host header, a random handshake token, and bounded JSON; trusted project roots and symlink checks constrain filesystem operations. | `packages/server/src/main.ts:50-53,84-112`; `packages/server/src/token.ts`; `packages/server/src/serverSupport.ts`; `packages/server/src/workflowTrustedFs.ts` | Do not claim protection against a malicious same-UID local process or elimination of every filesystem race on macOS. |
| AFK | AFK can scan, enqueue, inspect, run, and cancel sandboxed jobs; L1 is report-only by default. | CLI `afk --help`; `packages/automation/src`; `packages/kernel/src/loops` | Do not claim setup automatically launches autonomous coding, or that Docker/image/agent credentials are unnecessary. |
| Loop autonomy | Loops use explicit L1/L2/L3 graduation, budgets, concurrency, failure/dry-run guards, and enforcement rules. | CLI `loops --help`; `packages/kernel/src/loops/enforce.ts` | Do not market unattended mutation/merge without sandbox, allowlist, gate, budget, and credential qualifications. |
| PM automation | The PM Track may enqueue work after Spec completes, subject to automation admission. | `packages/kernel/src/tracks/builtins.ts:77-92` | Enqueueing is not the same as automatically starting a Docker worker. |
| Channel | Channel is an orthogonal event-sourced worker communication bus with create/send/wait/interrupt/forum/spawn operations. | `packages/cli/src/commands/channel.ts` | It deliberately does not mutate canonical pipeline gates/state and should be documented as advanced/compatibility tooling, not the default runtime. |
| Memory bridge | `pipeline mem` provides read-only cross-runtime session discovery/context extraction for supported local runtimes. | `packages/cli/src/commands/mem.ts` | Do not imply it writes another runtime's memory or that every runtime/backend is always available. |
| Tap | Tap provides opt-in local client tracing and explicit CA-based forward interception. | `packages/cli/src/commands/tap.ts`; `packages/tap/src` | Do not enable or describe TLS interception as default telemetry; captured headers, prompts, and tokens are sensitive local data. |
| Extension points | Declarative workflows, custom Tracks, bundled Skills, adapter registry entries, loop templates, and local API clients are supported extension surfaces. | `packages/kernel/src/workflow`; `packages/kernel/src/tracks`; `adapters/registry.yaml`; `templates/skill-sources.yaml` | Do not promise a stable third-party executable plugin ABI beyond documented contracts. |

## 4. Canonical installation and lifecycle commands

The public quick start should make host selection explicit:

```bash
# After adding/installing the Pipeline Lite plugin through the selected host:
pipeline setup --codex

# Or select exactly one other supported host:
pipeline setup --claude
pipeline setup --cursor --target /path/to/project

# Check and update the managed release:
pipeline runtime status
pipeline update --codex

# Start or open the local workbench:
pipeline dashboard --open
```

The full supported host flags are:

```text
--codex --claude --cursor --gemini --copilot --pi
--devin --zed --aider --continue --cline --amp
```

Rules the docs must state:

1. Exactly one host flag is accepted per setup or update operation
   (`packages/cli/src/commands/plugin-host.ts:43-57`).
2. `--target <dir>` is the installation boundary for non-native adapters.
3. `--auto-update` is a native-host facility; it is not a generic self-updater
   owned by every adapter.
4. The setup validates the complete payload before activation. The launcher
   points to a content-addressed managed release, and update retains an exact
   rollback candidate.
5. An agent process that already loaded hooks or Skills may require a new
   session. Codex hook trust can require one explicit `/hooks` trust action.
6. `pipeline runtime repair --rollback` is a bounded recovery operation, not an
   unrestricted escape path.

For source contributors, distinguish development from end-user installation:

```bash
git clone https://github.com/jefferysha/pipeline-worklfow.git
cd pipeline-worklfow
npm ci
npm run build
npm test
```

The repository is private at the npm-package level (`package.json:2-4`), so the
README must not currently advertise a published `npm install -g pipeline-lite`
path.

## 5. Workflow selection and document behavior

### 5.1 Mode matrix

| User intent | Track/workflow result | Step shape | OpenSpec/document behavior |
| --- | --- | --- | --- |
| Pure question or discussion | `chat`; no Change | none | no governed documents |
| Explicit, low-risk single-scope edit matching allowlist and no exclusion | `simple` / `simple` | change → verify → done, or escalated | no default OpenSpec contract |
| Normal product/frontend/backend work | matching Track / usually `default` | seven-phase default graph | full default document contract |
| Explicit “free” request | `free` + selected workflow | exactly the selected workflow | workflow contract still applies |
| Explicit custom workflow | selected Track + named custom workflow | exactly custom YAML | only declared `document_contract`; absent means none |

The router must never revive an unrelated old Change merely because it is the
most recent. A previous Change resumes only when the current request explicitly
identifies or resumes it. Ambiguous custom selection must be surfaced rather
than guessed (`hooks/router.sh`; `openspec/specs/normal-chat-routing/spec.md`).

### 5.2 Default document chain

The current default governance matrix is:

| Phase | Documents created/registered | Documents required as current reads |
| --- | --- | --- |
| Open | proposal, OpenSpec design, tasks | none |
| Explore | superpower design, ADR | proposal, OpenSpec design, tasks |
| Spec | delta spec, superpower plan, plan | Open + Explore documents |
| Build | no new fixed document; tasks may be updated | all planning/design documents |
| Verify | verification report; tasks may be updated | all planning/design documents |
| Ship | applied spec; tasks may be updated | planning/design + verification report |
| Archive | no new fixed document; tasks may be updated | all prior documents including applied spec |

Source of truth:
`packages/kernel/src/workflow/document-contract.ts:47-73,83-140`.

The correct product statement is “the default workflow requires these governed
documents and current read receipts.” It is inaccurate to say “the pipeline
automatically generates all documents” without qualification. Phase Skills and
the active coding agent create substantive content; the pipeline validates
producer identity, records SHA-256 evidence, and prevents later steps from
silently consuming missing or changed documents.

### 5.3 Short and custom workflows

Workflow length and document governance are independent:

- `openspec_contract: required` selects the complete legacy seven-phase
  OpenSpec contract.
- `document_contract.version: v1` can assign any supported document slot and
  read requirement to the actual steps of a short custom workflow.
- No declared contract means no document governance is inferred.

Therefore a three-step workflow does **not** automatically create all default
OpenSpec, superpower, and ADR files. It does so only when its declarative
contract asks for them. This distinction should be shown with one short custom
workflow example in the usage guide.

## 6. Host fidelity matrix

The adapter registry is the authoritative capability matrix
(`adapters/registry.yaml:1-29`):

| Tier | Hosts | Inject | Veto | Track | Required documentation caveat |
| --- | --- | --- | --- | --- | --- |
| A | Claude Code, Codex, Gemini CLI, Continue CLI, Cline, Amp | native | native | native | Codex hooks require trust; Gemini's known sub-agent injection limitation does not reduce main-agent tier; Amp evidence is adapter-level rather than a credentialed end-to-end host run. |
| B | Cursor, GitHub Copilot coding agent, Pi, Aider | mixed | mixed | mixed | Cursor/Copilot inject statically or later; Pi veto is advisory; Aider veto occurs at commit rather than write time. |
| C | Devin, Zed | static/degraded | manual CLI receipt | manual/degraded | No native enforcement hook; never imply hard runtime veto or automatic Skill tracking. |

Specific source anchors:

- Tier definitions: `adapters/registry.yaml:13-29`
- Claude/Codex: `adapters/registry.yaml:31-72`
- Cursor: `adapters/registry.yaml:74-96`
- Gemini: `adapters/registry.yaml:98-119`
- Copilot: `adapters/registry.yaml:121-142`
- Pi: `adapters/registry.yaml:144-166`
- Devin/Zed: `adapters/registry.yaml:168-218`
- Aider: `adapters/registry.yaml:220-244`
- Continue is explicitly Continue **CLI**, not its IDE extension:
  `adapters/registry.yaml:246-260`

The README should offer “12 host adapters with explicit fidelity tiers,” not
“identical enforcement on 12 hosts.”

## 7. Dashboard and local API

### 7.1 One production frontend

There is one production dashboard runtime:

```text
http://127.0.0.1:18765
```

The server binds loopback, chooses 18765 by default, serves the built SPA, and
owns `/api/*` on the same origin
(`packages/server/src/main.ts:50-59,84-103`;
`packages/server/src/port.ts:1-13`). A Vite port is a development-only tool and
must not appear in end-user architecture as another frontend.

The current top-level workbench areas are projects, progress, AFK, workbench,
and machine (`packages/dashboard-app/src/shell/Nav.tsx`). Feature documentation
can group them as:

- Projects: register/select trusted project roots and inspect Changes.
- Progress: effective workflow graph, current state, Todo, history, and evidence.
- AFK: readiness, queue, worker state, logs, and control.
- Workbench: workflows, Tracks, hooks, automation, loops, and secrets/config.
- Machine/advanced: runtime identity, traffic/traces, and diagnostics.

### 7.2 Local security model

The server is designed for a local, single-user workstation:

- loopback-only binding;
- strict local Host checking;
- random 256-bit handshake token stored with mode `0600`;
- token-protected JSON mutations with a 64 KiB body limit;
- registered project-root trust anchors;
- symlink, realpath, descriptor, and inode checks for workflow files;
- release/version/state-scope matching before server reuse.

This is meaningful local hardening, but not a multi-tenant remote-server
security claim. The filesystem implementation explicitly cannot promise the
complete removal of a hostile same-UID TOCTOU window on platforms without the
required `*at` primitives (`packages/server/src/workflowTrustedFs.ts`).

### 7.3 API claim boundary

The local API includes health, snapshot, server-sent events, projects, Changes,
runs, workflows, Tracks, hooks, automation, loops, AFK, configuration, traffic,
and operational actions (`packages/server/src/server.ts`;
`packages/server/src/routes`). The UI must use returned capability flags for
optional surfaces.

Documentation may publish this as a local integration API. It should not promise
a hosted endpoint, remote access, multi-tenancy, or an indefinitely stable public
API version unless a separate compatibility contract is added.

## 8. Automation and advanced tools

### AFK and loops

- AFK offers `enqueue`, `scan`, `status`, `run`, and `cancel`.
- The default autonomy level is L1/report-only.
- L2 is assisted execution; L3 is explicitly graduated unattended execution.
- Loop enforcement includes budgets, maximum in-flight work, dry/failure
  streaks, kill/warn decisions, and policy rules.
- Actual execution requires the configured sandbox/image, agent runtime, and
  credentials. Setup may report these as unavailable without invalidating the
  core interactive installation.
- PM Spec completion may enqueue eligible work; queue creation is not the same
  as starting an autonomous worker.

### Channel

`pipeline channel` is an event-sourced worker bus with context, messages,
wait/interrupt, registry/forum, spawn/kill/run, and pruning operations. Its
implementation deliberately does not modify pipeline state, review gates,
barriers, or build SHA (`packages/cli/src/commands/channel.ts`). It belongs in
an “Advanced / compatibility” section, not the first-run tutorial.

### Memory bridge

`pipeline mem` is read-only session discovery and context extraction across
supported local runtimes (`packages/cli/src/commands/mem.ts`). OpenCode's SQLite
path can depend on the exact Node 22 minor version and may degrade when the
runtime lacks the needed SQLite support. This is a convenience bridge, not a
cross-agent memory synchronization service.

### Tap

`pipeline tap` supports local client startup, reverse/forward modes, and optional
local-CA interception (`packages/cli/src/commands/tap.ts`;
`packages/tap/src`). Trace capture is off by default. Forward interception and
OAuth capture require explicit CA configuration and can expose prompts, headers,
and tokens. Documentation must include a conspicuous local-data/security warning
and must never describe Tap as hidden telemetry.

## 9. Extension model

The supported extension points should be documented in increasing risk order:

1. **Custom workflows** — declarative YAML under
   `.pipeline/workflows/<name>.yaml`; validated graph, transitions, gates,
   Skills, artifacts, and document contract.
2. **Custom Tracks** — project-local routing and policy definitions managed by
   `pipeline tracks create|update|delete`; built-ins are protected.
3. **Skills** — packaged under `skills/` and resolved through
   `templates/skill-sources.yaml`; mandatory default Skills ship in the bundle.
4. **Adapters** — capability/fidelity declarations in
   `adapters/registry.yaml`, with conformance tests.
5. **Loop templates/runners** — explicit, graduated automation policies.
6. **Local API clients** — integrations against the loopback Dashboard API,
   within its local security and compatibility boundary.

Custom workflows are declarative, not a general executable-plugin sandbox.
Reserved built-ins cannot be shadowed. Track changes that break active
references must fail rather than silently rewrite active runs.

## 10. Recommended open-source information architecture

### Root README

The README should stay outcome-oriented and fit a first visit:

1. one-sentence value proposition;
2. screenshot/solution overview;
3. why Pipeline Lite;
4. default/simple/free/custom workflow comparison;
5. installation with explicit host selection;
6. five-minute quick start;
7. evidence and safety model;
8. adapter fidelity summary;
9. architecture/module map;
10. documentation links;
11. development/test commands;
12. contributing, security, license, and project status.

### Usage documentation

Recommended canonical documents:

- installation and updates;
- first governed Change;
- default workflow and review receipts;
- simple/chat/free/custom routing;
- OpenSpec, Skill, document ledger, and read receipts;
- Dashboard and local API;
- custom workflow and Track authoring;
- AFK/loops;
- advanced channel/mem/tap;
- troubleshooting and recovery;
- security model;
- contributor development/testing.

### In-product solution page

The requested “open-source solution page” should be a stable view inside the
existing dashboard, not another web app or port. It should reuse the product's
real workflow/Track model and link to existing workbench views. Static marketing
copy should be limited to claims in this report. The page can present:

- product promise and supported audiences;
- default, simple, free, and custom workflow cards;
- evidence chain from Skill → document digest/read → review receipt → transition;
- modules and adapter fidelity tiers;
- install/update commands;
- local-first security statement;
- links to usage, extension, contribution, and license documentation.

It must not invent live runtime status when no project is selected and must
preserve loading, empty, error, and capability-disabled states.

## 11. Open-source readiness gaps

The repository currently contains `LICENSE`, but the following standard
community files were not found during this audit:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `GOVERNANCE.md`
- `SUPPORT.md`
- `CITATION.cff`
- GitHub issue forms/configuration
- pull request template

The current docs change can reasonably add contribution, security, support, and
community conduct guidance because the user requested an industry-standard
open-source presentation. Governance, citation, changelog policy, and issue
forms should only be added when their owners and maintenance process are real.
Empty boilerplate would be less trustworthy than an explicit “not yet
established” project-status note.

Other truth gaps:

- plugin manifest version is `0.2.0`, while root/CLI packages are `0.1.0`;
- no public hosted documentation or solution-page URL is currently established;
- no verified public release cadence or semantic-version compatibility policy
  is present;
- marketplace install/update behavior is tested in isolation, but the latest
  verification intentionally did not mutate the real user's home or publish a
  release (`docs/superpowers/reports/2026-07-25-workflow-governance-architecture-audit-verify.md:145-157`);
- five real-credential integration cases remain explicit skips.

Until these are resolved, omit release/version badges that imply a single
unified version, avoid “production SLA” language, and describe the dashboard
page as bundled/local rather than publicly hosted.

## 12. Claims that must not appear

- “Every prompt starts the full seven-phase pipeline.”
- “Every short workflow generates the full OpenSpec/superpower/ADR set.”
- “Free mode bypasses governance.”
- “The router understands intent semantically.”
- “All 12 hosts have identical hard enforcement.”
- “All Skills are downloaded and installed separately.”
- “Documents are generated automatically without agent/Skill execution.”
- “Review gates can be bypassed by continuous authorization.”
- “18765 is a public remote service.”
- “Dashboard mutations need no authentication because it is localhost.”
- “AFK starts unattended coding automatically after setup.”
- “PM auto-enqueue automatically starts Docker.”
- “Tap is telemetry” or “Tap captures every OAuth flow by default.”
- “The project is published as a global npm CLI.”
- “Updates hot-reload Skills into an already-running agent session.”
- “The runtime has a hidden backdoor.”
- “Pipeline Lite guarantees secure multi-user remote operation.”
- “Semantic versioning, release cadence, or API compatibility is guaranteed.”

## 13. Verification evidence usable in public docs

The current repository may truthfully state that the latest recorded acceptance
run passed:

- 5,118 root assertions with five credential-gated skips;
- 920 dashboard assertions;
- 426 hook assertions;
- 262 adapter-conformance assertions;
- 15 bundle-smoke assertions;
- 63 bundled Skill directories and zero mandatory external Skill dependencies;
- TypeScript, web, server, and bundle builds;
- a five-fixture workflow oracle with zero inconsistencies;
- browser verification of current `18765` runtime, workflow-derived Todo states,
  and healthy API endpoints.

Source:
`docs/superpowers/reports/2026-07-25-workflow-governance-architecture-audit-verify.md:43-75`.

If these counts are placed in the README, label them with the audit date and
update/remove them on later releases rather than presenting them as timeless.

## 14. Open decisions for Explore

1. Should the root README be English-first with a Chinese translation link, or
   a compact bilingual README?
2. Should the in-product solution view use a new stable query view such as
   `?view=overview`, or become the default empty-state/onboarding view?
3. Should this change add real `CONTRIBUTING.md`, `SECURITY.md`,
   `CODE_OF_CONDUCT.md`, and `SUPPORT.md`, or limit scope to README plus usage
   documentation and track the community files separately?
4. Which version should public docs name until plugin `0.2.0` and CLI/root
   `0.1.0` are reconciled?
5. Is the first public documentation release intended to describe the current
   source/main channel, or a tagged release with a stable compatibility policy?
