# 技能 token → 官方安装地址 registry（安装地基数据）

> 目的：为"用户安装 pipeline-lite 插件后全功能全量使用"提供地基数据——每个技能 token 的**官方最新版**来源
> 与安装命令（用户硬约束：装官方最新、不写死、不 vendored）。
> 方法：先本地枚举（manifest + EXTERNAL-SKILLS.md + 各 SKILL.md 依赖节 + 官方 marketplace 本地克隆 +
> `~/.agents/.skill-lock.json` provenance），再联网补缺（WebSearch/WebFetch）。全程只读，未执行任何
> `claude plugin install` / `npx skills add` / `npm install`（都会改用户全局配置）。凡结论带出处；拿不准标「待核实」。
> 前置调研：`docs/research/2026-07-11-skills-distribution.md`（本机"装没装"基线，本文补齐"官方从哪装"）。

---

## 1. 一句话结论

**pipeline 的 55 个技能 token 不是同一个来源——它们分散在「官方 marketplace 4 个插件 + `skills` CLI（`npx skills add`）拉 6 个 GitHub skill 仓 + openspec npm CLI + 4 个 builtin + 本仓自带」5 条完全不同的安装通道；34 个能钉到确切官方源、10 个只有语义等价物（token 名是占位式、上游无同名技能）、11 个查无任何已知源——后两批共 21 个必须走"声明+WARN+find-skills 手动提示"的降级面，不能硬装。**

关键纠偏：官方 marketplace 本地克隆并非"255 个插件都在本地"——`marketplace.json` 编目 255 个，但只有 **37 个是 vendored（`source: ./plugins/...`）**，其余 218 个是 `git-subdir`/`url` 外链，本地只有元数据没有技能内容。绝大多数 pipeline 裸技能 token 在 37 个 vendored 插件里 grep 不到，也不在 255 编目的任何插件名下——它们根本不是 claude 插件，而是 `skills` CLI 生态的 GitHub skill 仓。

### TL;DR

| 维度 | 数值 |
|---|---|
| 待解析 token 总数（M，a\|b 备选算 1 个） | **55** |
| 完全解析（确切官方源 / builtin / 已装 / 本仓自带） | **34 / 55** |
| 仅语义等价（占位式 token 名，上游无同名，有近似替代） | **+10 / 55**（stack cluster） |
| 真·UNRESOLVED（无任何已知官方源） | **11 / 55** |
| 去重后实际安装动作 | **官方插件 4 个 + `npx skills add` 6 个 GitHub 仓 + npm 1 个 = 11 条命令覆盖 ~44 token**（装插件数 << token 数） |
| 已装（无需再动） | superpowers@claude-plugins-official 6.1.1（覆盖 7 个 `superpowers:*`）、claude-hud 0.3.0（与 pipeline 无关） |

**UNRESOLVED 11 个**（无已知官方源，进降级面）：`search-first`、`deep-research`、`market-research`、`zoom-out`、`code-tour`、`github-ops`、`browser-qa`、`e2e-testing`、`uiforge`、`web-artifacts-builder`、`uiuxdesign-pro`。

**语义等价 10 个**（token 名占位、上游无同名、有 agents-inc/skills 等近似替代，进降级面并附候选）：`shadcn-ui`、`tailwind-css-patterns`、`react-patterns`、`nestjs-patterns`、`postgres-patterns`、`python-patterns`、`python-testing`、`docker-patterns`、`deployment-patterns`、`frontend-patterns`。

---

## 2. registry 主表

列义：`token | 类别 | 所属插件/仓 | 所在 marketplace/源 | 安装命令 | 备选关系 | severity | 出处`
- 类别：`installed`(已装官方插件) / `official`(官方 marketplace vendored 插件,未装) / `npx-skills`(GitHub skill 仓,经 `skills` CLI) / `npm-cli` / `builtin` / `in-repo`(随本仓 pipeline-lite 分发) / `semantic`(占位 token,仅语义等价) / `unresolved`
- severity 取自 manifest（mandatory/recommended）∪ 各 SKILL.md 自标（强制/推荐/条件/可选/三选一）。
- 出处：本地 `file:line` 或 web URL。

### 2.1 命名空间 token

| token | 类别 | 插件/仓 | marketplace/源 | 安装命令 | 备选 | severity | 出处 |
|---|---|---|---|---|---|---|---|
| `superpowers:brainstorming` | installed | superpowers | claude-plugins-official | `claude plugin install superpowers@claude-plugins-official`（已装 6.1.1） | — | 强制 | manifest:71-73; cache `.../superpowers/6.1.1/skills/brainstorming` |
| `superpowers:writing-plans` | installed | superpowers | claude-plugins-official | 同上 | — | 强制(be)/推荐(fe) | manifest:74-75,78; SKILL pipeline-spec/build |
| `superpowers:test-driven-development` | installed | superpowers | claude-plugins-official | 同上 | — | 强制(fe/be) | manifest:77-78 |
| `superpowers:verification-before-completion` | installed | superpowers | claude-plugins-official | 同上 | — | 强制 | manifest:79-81 |
| `superpowers:finishing-a-development-branch` | installed | superpowers | claude-plugins-official | 同上 | — | 强制(ship)/推荐(verify) | manifest:83-84; SKILL pipeline-verify |
| `superpowers:subagent-driven-development` | installed | superpowers | claude-plugins-official | 同上 | — | 条件(build_mode) | EXTERNAL-SKILLS.md:27; pipeline-build |
| `superpowers:dispatching-parallel-agents` | installed | superpowers | claude-plugins-official | 同上 | — | 条件(build_mode) | EXTERNAL-SKILLS.md:28; pipeline-build |
| `commit-commands:commit-push-pr` | official | commit-commands（**命令非技能**） | claude-plugins-official | `claude plugin install commit-commands@claude-plugins-official` | — | 强制(fe/be) | manifest:83-84; 插件 `commands/commit-push-pr.md` |
| `commit-commands:commit` | official | commit-commands（**命令非技能**） | claude-plugins-official | 同上 | — | 可选 | EXTERNAL-SKILLS.md:33; 插件 `commands/commit.md` |
| `opsx:propose`\|`openspec-propose` | npm-cli + in-repo | openspec CLI / 本仓 | @fission-ai/openspec（npm）/ pipeline-lite | `npm install -g @fission-ai/openspec`（opsx 侧）；openspec-propose 随本仓分发 | a\|b | 强制 | manifest:69,74-75; skills/openspec-propose/SKILL.md; pipeline-open/SKILL.md:36 |
| `opsx:explore`\|`openspec-explore` | npm-cli + in-repo | openspec CLI / 本仓 | 同上 | 同上 | a\|b | 强制(fe/be) | manifest:71-72; skills/openspec-explore |
| `opsx:apply`\|`openspec-apply-change` | npm-cli + in-repo | openspec CLI / 本仓 | 同上 | 同上 | a\|b | 强制(ship fe/be) | manifest:83-84; skills/openspec-apply-change |
| `opsx:archive`\|`openspec-archive-change` | npm-cli + in-repo | openspec CLI / 本仓 | 同上 | 同上 | a\|b | 强制(ship fe/be) | manifest:83-84; skills/openspec-archive-change |

### 2.2 裸技能 token — 已解析（确切官方源）

| token | 类别 | 插件/仓 | marketplace/源 | 安装命令 | 备选 | severity | 出处 |
|---|---|---|---|---|---|---|---|
| `frontend-design` | official | frontend-design | claude-plugins-official | `claude plugin install frontend-design@claude-plugins-official` | — | 强制(fe/pm) | manifest:76-77; vendored `plugins/frontend-design/skills/frontend-design/SKILL.md` |
| `skill-creator` | official | skill-creator | claude-plugins-official | `claude plugin install skill-creator@claude-plugins-official` | — | 可选 | EXTERNAL-SKILLS.md:51; vendored `plugins/skill-creator/skills/skill-creator/SKILL.md` |
| `grill-with-docs` | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill grill-with-docs` | — | 强制 | manifest:70-73; skill-lock; web github.com/mattpocock/skills |
| `improve-codebase-architecture` | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill improve-codebase-architecture` | — | 强制(be) | manifest:72; skill-lock |
| `prototype`\|`huashu-design` | npx-skills | mattpocock/skills / alchaincyf/huashu-design | github | `npx skills add mattpocock/skills --skill prototype` **或** `npx skills add alchaincyf/huashu-design` | a\|b（huashu 为推荐默认） | 三选一(pm)/条件 | manifest:76; pipeline-build SKILL「三选一」; skill-lock(huashu); web(mattpocock prototype) |
| `triage` | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill triage` | — | 条件 | EXTERNAL-SKILLS.md:46; pipeline-open; web(mattpocock triage) |
| `handoff` | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill handoff` | — | 推荐(pm)/可选 | EXTERNAL-SKILLS.md:48; skill-lock(skills/productivity/handoff) |
| `to-prd` ⚠️ | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill to-prd`（**上游疑已改名 to-spec，待核实**） | — | 强制(pm) | manifest:82; skill-lock(skills/engineering/to-prd); web README 现列 `to-spec` |
| `to-issues` ⚠️ | npx-skills | mattpocock/skills | github: mattpocock/skills | `npx skills add mattpocock/skills --skill to-issues`（**上游疑已改名 to-tickets，待核实**） | — | 强制(pm) | manifest:82; skill-lock(skills/engineering/to-issues); web README 现列 `to-tickets` |
| `find-skills` | npx-skills | vercel-labs/skills | github: vercel-labs/skills | `npx skills add vercel-labs/skills --skill find-skills`（vercel-labs/skills 本身即 `skills` CLI 仓） | — | 可选 | EXTERNAL-SKILLS.md:41; skill-lock; web vercel-labs/skills |
| `web-design-guidelines` | npx-skills | vercel-labs/agent-skills | github: vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` | — | 强制(fe/pm) | manifest:77,79-80; web claudemarketplaces + vercel-labs/agent-skills README |
| `react-best-practices` | npx-skills | vercel-labs/agent-skills | github: vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill react-best-practices` | — | 推荐(fe)/条件 | manifest:93; web vercel-labs/agent-skills README「Available Skills」 |
| `design-taste-frontend`\|`taste-skill` | npx-skills | Leonxlnx/taste-skill | github: Leonxlnx/taste-skill | `npx skills add Leonxlnx/taste-skill --skill taste-skill`（design-taste-frontend 侧无源，用 taste-skill 侧） | a\|b | 强制(UI 评修) | manifest:76-80; EXTERNAL-SKILLS.md:63; web github.com/Leonxlnx/taste-skill(`skills/taste-skill/`) |
| `hallmark` | npx-skills | nutlope/hallmark | github: nutlope/hallmark | `npx skills add nutlope/hallmark` | — | 推荐/三选一 | manifest:92-93; EXTERNAL-SKILLS.md:56; web github.com/nutlope/hallmark |
| `hue` | npx-skills | dominikmartn/hue | github: dominikmartn/hue | `npx skills add dominikmartn/hue` | — | 推荐 | EXTERNAL-SKILLS.md:57; pipeline-build; web github.com/dominikmartn/hue |
| `pipeline-researcher` | in-repo | 本仓 agent | pipeline-lite | 随本仓分发（`agents/pipeline-researcher.md`），无需外装 | — | 推荐 | manifest:89; agents/pipeline-researcher.md |
| `verify`\|`verification-loop` | builtin | Claude Code builtin | — | 无需安装（verify 侧=builtin；verification-loop 侧无源） | a\|b | 强制(fe)/推荐(be) | manifest:80; EXTERNAL-SKILLS.md:81(builtin) |
| `verify` | builtin | Claude Code builtin | — | 无需安装 | — | 强制(fe)/推荐(be)/可选 | EXTERNAL-SKILLS.md:81 |
| `run` | builtin | Claude Code builtin | — | 无需安装 | — | 可选 | EXTERNAL-SKILLS.md:82 |
| `security-review` | builtin | Claude Code builtin | — | 无需安装 | — | 可选 | EXTERNAL-SKILLS.md:83 |
| `code-review` | builtin | Claude Code builtin（另 mattpocock/skills 亦有同名，双源不冲突） | — | 无需安装 | — | 可选 | EXTERNAL-SKILLS.md:84; skill-lock(mattpocock code-review) |

### 2.3 裸技能 token — 仅语义等价（占位式 token，上游无同名）

> 这批 token 名（`react-patterns`/`shadcn-ui`/`*-patterns`）像"理想占位名"——在官方 marketplace、mattpocock、vercel-labs、agents-inc 里**都查无同名技能**。agents-inc/skills（150+ 技能、有独立 marketplace）覆盖同一技术域但用 `<domain>-<subcategory>-<name>` 命名，是**语义等价**而非精确匹配。建议进降级面并附候选，不做 token 名硬装。

| token | 类别 | 语义候选（exact id 不同） | 候选安装命令 | severity | 出处 |
|---|---|---|---|---|---|
| `shadcn-ui` | semantic | `web-ui-shadcn-ui`@agents-inc | `claude plugin marketplace add agents-inc/skills` + `claude plugin install web-ui-shadcn-ui@agents-inc` | 条件 | manifest:92-93; web agents-inc/skills marketplace.json |
| `tailwind-css-patterns` | semantic | `web-styling-tailwind`@agents-inc | 同上换 id | 条件 | manifest:92-93; web 同上 |
| `react-patterns` | semantic | `web-framework-react`@agents-inc | 同上换 id | 条件 | manifest:93; web 同上 |
| `nestjs-patterns` | semantic | `api-framework-nestjs`@agents-inc | 同上换 id | 条件 | EXTERNAL-SKILLS.md:72; web 同上 |
| `postgres-patterns` | semantic | `api-database-postgresql`@agents-inc | 同上换 id | 条件 | EXTERNAL-SKILLS.md:73; web 同上 |
| `docker-patterns` | semantic | `infra-ci-cd-docker`@agents-inc | 同上换 id | 条件/可选 | EXTERNAL-SKILLS.md:75; web 同上 |
| `python-patterns` | semantic | agents-inc 有 Python 域（exact id 待核实） | 待核实 | 条件 | EXTERNAL-SKILLS.md:74 |
| `python-testing` | semantic | agents-inc 有 Python/测试域（exact id 待核实） | 待核实 | 条件/可选 | EXTERNAL-SKILLS.md:74; pipeline-verify |
| `deployment-patterns` | semantic | agents-inc infra/CD 域（exact id 待核实） | 待核实 | 推荐(be)/可选 | EXTERNAL-SKILLS.md:76; pipeline-ship |
| `frontend-patterns` | semantic | agents-inc web 域 / vercel `composition-patterns`（exact id 待核实） | 待核实 | 可选 | EXTERNAL-SKILLS.md:68 |

### 2.4 裸技能 token — UNRESOLVED（无任何已知官方源）

| token | 类别 | severity | 联网结论 | 出处 |
|---|---|---|---|---|
| `search-first` | unresolved | 推荐 | 无同名公开技能/仓 | manifest:90-91; EXTERNAL-SKILLS.md:37 |
| `deep-research` | unresolved | 推荐 | 有大量同名技能（Weizhena/daymade/standardhuman/199-biotechnologies/alirezarezvani…），**无单一权威源** | EXTERNAL-SKILLS.md:38; pipeline-explore |
| `market-research` | unresolved | 推荐 | 同上，多个 marketing/research 仓，无单一权威源 | EXTERNAL-SKILLS.md:39 |
| `zoom-out` | unresolved | 可选 | 无同名公开技能 | EXTERNAL-SKILLS.md:40 |
| `code-tour` | unresolved | 可选 | 无同名 claude 技能（易与 VSCode CodeTour 混淆） | EXTERNAL-SKILLS.md:50 |
| `github-ops` | unresolved | 可选 | 无同名技能（官方有 `github` 插件但语义不符） | EXTERNAL-SKILLS.md:49 |
| `browser-qa` | unresolved | 强制(pm/fe) | 无同名；候选 browserbase/skills(`ui-test`)、anthropics `webapp-testing`、官方 `playwright` 插件——均非精确匹配 | manifest:79-80; EXTERNAL-SKILLS.md:78 |
| `e2e-testing` | unresolved | 强制(fe)/推荐(be) | 无同名；候选 petrkindlmann/qa-skills、neonwatty/qa-skills、`playwright-e2e-testing`——均非精确 | manifest:80; EXTERNAL-SKILLS.md:79 |
| `uiforge` | unresolved | 推荐 | 联网明确查无此技能 | EXTERNAL-SKILLS.md:58 |
| `web-artifacts-builder` | unresolved | 可选 | 无同名公开技能 | EXTERNAL-SKILLS.md:59 |
| `uiuxdesign-pro` | unresolved | 可选 | 无同名；候选 nextlevelbuilder/ui-ux-pro-max-skill（非精确） | EXTERNAL-SKILLS.md:60 |

---

## 3. 去重安装清单（init 安装器真命令集）

一个插件/仓含多技能，故去重后安装动作 **11 条覆盖 ~44 token**（远少于 55）。

### A. 官方 marketplace（`claude-plugins-official` 本机已注册，**无需 `marketplace add`**）
```bash
# 已装,跳过: superpowers（覆盖 7 个 superpowers:* → brainstorming/writing-plans/tdd/
#   verification-before-completion/finishing-a-development-branch/subagent-driven-development/
#   dispatching-parallel-agents）——installed_plugins.json 已有 6.1.1
claude plugin install commit-commands@claude-plugins-official   # commit-commands:commit(-push-pr) 2 命令
claude plugin install frontend-design@claude-plugins-official   # frontend-design
claude plugin install skill-creator@claude-plugins-official     # skill-creator
```

### B. `skills` CLI（`npx skills add`，GitHub skill 仓，拉默认分支=最新）
```bash
# mattpocock/skills — 7 token（⚠️ to-prd/to-issues 上游疑改名 to-spec/to-tickets，装前 --list 核对）
npx skills add mattpocock/skills --skill grill-with-docs improve-codebase-architecture \
    prototype triage handoff to-prd to-issues
npx skills add vercel-labs/agent-skills --skill web-design-guidelines react-best-practices
npx skills add Leonxlnx/taste-skill --skill taste-skill      # design-taste-frontend|taste-skill 的可用侧
npx skills add nutlope/hallmark                               # hallmark
npx skills add dominikmartn/hue                               # hue
npx skills add alchaincyf/huashu-design                       # prototype|huashu-design 的推荐默认侧
# find-skills 随 vercel-labs/skills(=skills CLI 仓)分发,按需:
# npx skills add vercel-labs/skills --skill find-skills
```

### C. npm CLI（openspec）
```bash
npm install -g @fission-ai/openspec   # 提供 openspec 二进制 + opsx:* 斜杠命令(4 个 opsx token)
# openspec-* 兜底技能随本仓 pipeline-lite 分发,无需外装;但兜底仍调 openspec 二进制,故此 npm 装是硬前提
```

### D.（可选）agents-inc/skills — stack cluster 语义替代（**非官方源,需先 add**；token 名不精确匹配,建议只做提示不自动装）
```bash
claude plugin marketplace add agents-inc/skills
claude plugin install web-ui-shadcn-ui@agents-inc web-styling-tailwind@agents-inc \
    web-framework-react@agents-inc api-framework-nestjs@agents-inc \
    api-database-postgresql@agents-inc infra-ci-cd-docker@agents-inc
```

### 无需安装
- **builtin**：`verify` `run` `security-review` `code-review`。
- **本仓自带**（随 pipeline-lite）：`pipeline-researcher`(agent)、`openspec-propose/explore/apply-change/archive-change`(兜底技能)。

---

## 4. UNRESOLVED 清单 + 降级建议

均进"声明+WARN+手动提示"降级面（EXTERNAL-SKILLS.md:20「声明 ≠ 必装,缺失按 SKILL 标注降级」；本机无代码硬拦，见前置调研第 3 节）。

| token | severity | 降级建议 |
|---|---|---|
| `browser-qa` / `e2e-testing` | **强制** | 唯二"强制级却无源"——最需拍板。建议：①用 `find-skills` 检索 + 手动；②或把 token 重定向到确有源的候选（`playwright` 官方插件 / browserbase/skills / neonwatty/qa-skills）并更新 manifest。强制级缺失应"停流程提示装",不许静默替代。 |
| `search-first` / `zoom-out` / `code-tour` / `github-ops` / `uiforge` / `web-artifacts-builder` / `uiuxdesign-pro` | 推荐/可选 | 缺只 WARN,不阻断。init 时打印"未找到官方源,`find-skills` 检索或忽略"。 |
| `deep-research` / `market-research` | 推荐 | 多个候选无单一权威源。建议在 manifest 里把 token 钉到某个确定仓(如 standardhuman/deep-research-skill)再纳入 B 组,或保持降级+提示。 |
| `shadcn-ui` / `tailwind-css-patterns` / `react-patterns` / `nestjs-patterns` / `postgres-patterns` / `docker-patterns` / `python-patterns` / `python-testing` / `deployment-patterns` / `frontend-patterns`（语义等价 10 个） | 条件/可选 | token 名是占位式。两条路：①把 manifest token 改成 agents-inc 精确 id（`web-framework-react` 等）纳入 D 组；②保持占位名 + 降级提示"技术栈相关,`find-skills` 按栈检索"。条件级本就"不适用则跳过",降级成本低。 |

---

## 5. 风险 / 坑

1. **`opsx` 不是 marketplace 插件别名**。官方 `marketplace.json` 的 `renames` 只有 adlc/airwallex/convex-backend/vals/wordpress.com，**无 opsx/openspec**。`opsx:` 是 npm 包 `@fission-ai/openspec`（`pipeline-open/SKILL.md:36`、`pipeline/SKILL.md:209`）项目集成注入的斜杠命令命名空间。`a|b` 备选的 b 侧 `openspec-*` 是**本仓手工 vendored 的技能副本**（`skills/openspec-propose/SKILL.md` frontmatter author=openspec、compatibility=Requires openspec CLI），随 pipeline-lite 分发——所以只要装了 pipeline-lite + openspec 二进制,opsx token 永远有兜底,**真·硬依赖是 openspec 二进制(npm),不是任何插件**。

2. **`a|b` 备选装哪侧**：
   - `opsx:*|openspec-*` → b 侧(openspec-*)本仓自带,a 侧(opsx)靠 openspec 二进制,二者共用同一二进制,装 npm 即两侧皆活。
   - `prototype|huashu-design` → pipeline-build SKILL 标 huashu 为"推荐默认",优先 alchaincyf/huashu-design；prototype 侧在 mattpocock/skills 亦可。
   - `design-taste-frontend|taste-skill` → design-taste-frontend 侧**无已知源**,只能装 taste-skill 侧(Leonxlnx)。
   - `verify|verification-loop` → verify=builtin,零成本满足,verification-loop 侧无源可忽略。

3. **版本钉不钉（用户要最新=不钉）**：`npx skills add owner/repo` 默认拉 GitHub 默认分支=最新(符合要求,但 `.skill-lock.json` 会记 commit,复现用)。`claude plugin install @claude-plugins-official` 拉的是官方 `marketplace.json` 里 **pin 死的 sha**（如 superpowers pin 到 `d884ae0…`）——要真最新需先 `claude plugin marketplace update` 刷新编目。**不钉=接受漂移**：已实锤一例——mattpocock 疑把 `to-prd/to-issues` 改名 `to-spec/to-tickets`(README 现名 vs skill-lock 旧名),不钉版本时 `--skill to-prd` 可能失效,装前务必 `npx skills add mattpocock/skills --list` 核对当前 id。

4. **装插件/技能会改用户全局 `~/.claude`/`~/.agents`（副作用登记）**：
   - `claude plugin install …` → 改 `~/.claude/plugins/installed_plugins.json`、`settings.json` 的 `enabledPlugins`、`plugins/cache/` 落包。
   - `claude plugin marketplace add agents-inc/skills` → 改 `~/.claude/plugins/known_marketplaces.json`（新增非官方源）+ 拉 `marketplaces/` 克隆。
   - `npx skills add …` → 改 `~/.agents/skills/`（或 `~/.claude/skills/`,视 `-a`/`-g` 标志）+ `~/.agents/.skill-lock.json`。
   - `npm install -g @fission-ai/openspec` → 改全局 npm；项目内 `openspec init` 还会写项目 `.claude/commands/opsx/`。
   本次调研**未执行**任何一条。

5. **`commit-commands:commit(-push-pr)` 是命令不是技能**：`commit-commands` 插件只有 `commands/*.md`（`commit.md`/`commit-push-pr.md`/`clean_gone.md`）无 `skills/`。靠扫 `SKILL.md` 的安装器/检测器**找不到**这俩 token,须知道它们是斜杠命令、装插件即得(老仓 `pipeline-doctor.sh:162` 亦注明"命令类 token 无 skill 单源")。

6. **官方 marketplace 本地克隆的覆盖幻觉**：任务假设"255 插件都是主力数据源",实际只有 37 个 vendored 有技能内容,218 个是外链元数据。跨这 218 个 grep 技能名会漏(本地没内容)——已改用 `marketplace.json` 编目名 + 联网补。pipeline 裸技能几乎全不在这 255 编目里,是 `skills` CLI 生态而非 claude 插件生态,这是全表最关键的认知纠偏。

7. **`frontend-design` 双源**：既是官方 vendored 插件(`frontend-design@claude-plugins-official`),又可 `npx skills add anthropics/claude-code --skill frontend-design`。优先官方插件(与 A 组统一通道)。`code-review` 亦双源(builtin + mattpocock/skills),builtin 优先。

---

## 附：数据出处索引

- 本地：`templates/manifest.yaml`(:68-93 skill 表)、`skills/EXTERNAL-SKILLS.md`(:22-84)、`skills/pipeline-*/SKILL.md`「外部 skill 依赖」节、`skills/openspec-*/SKILL.md`(frontmatter)、`agents/pipeline-researcher.md`。
- 本机状态：`~/.claude/plugins/known_marketplaces.json`(2 源)、`installed_plugins.json`(superpowers 6.1.1/claude-hud 0.3.0)、`~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`(255 编目,37 vendored；superpowers src=url obra/superpowers；commit-commands/frontend-design/skill-creator=`./plugins/…`)、vendored 插件 `plugins/*/skills/*/SKILL.md` 实测索引、`~/.agents/.skill-lock.json`(mattpocock/skills、vercel-labs/skills、greensock/gsap-skills、alchaincyf/huashu-design)。
- Web：github.com/mattpocock/skills、github.com/vercel-labs/skills(=skills CLI)、github.com/vercel-labs/agent-skills、github.com/Leonxlnx/taste-skill、github.com/nutlope/hallmark、github.com/dominikmartn/hue、github.com/agents-inc/skills(marketplace.json)、vercel.com/changelog/introducing-skills、npmjs.com/package/@fission-ai/openspec。

---

## 6. 深挖补正（2026-07-12 联网）

> 触发：上一轮把 21 个 token 判成「UNRESOLVED / 仅语义等价」，其根因是**只枚举了官方 marketplace 的 37 个 vendored 插件**，没联网扒第三方 skills 聚合仓。本轮 `gh api` 直接拉取候选仓的 **git tree（recursive）** 逐一比对 `SKILL.md` 真实路径 + WebFetch 真实内容，**21 个降级 token 里 18 个钉到确切源**，只剩 3 个软状态（uiforge 真无源、uiuxdesign-pro 仅候选、zoom-out 上游已删）。全程只读，未执行任何安装。

### 6.0 头条：`ecc` = **Everything Claude Code** = `affaan-m/ECC`（一条主力安装通道）

用户所说「browser-qa/e2e-testing 都是 ecc 中的 skill」**完全属实**。`ecc` 不是 git SHA，而是 **`affaan-m/ECC` 仓**（旧名 `affaan-m/everything-claude-code`，gh api 证实 `everything-claude-code` 302→`affaan-m/ECC`；其 `.claude-plugin/marketplace.json` 的 `name` 字段字面就是 `"ecc"`，owner=Affaan Mustafa）。这是一个**多 harness 技能聚合巨仓**，顶层 `skills/` 目录实测有 **278 个 `skills/<name>/SKILL.md`**（README 另称 67 agents / 94 commands；GitHub 报告 star≈228K，数字异常高，姑且记录）。

- **它是 skill 仓**（不是 MCP、不是单命令）。技能布局是**标准扁平** `skills/<token>/SKILL.md`，天然契合 `npx skills add` 的按名安装。
- **正源 canonical**：`affaan-m/everything-claude-code`（Affaan Mustafa 2025-09 Anthropic 黑客松获奖项目，现已改名 `affaan-m/ECC`，旧名 301 重定向、**两名同仓**均可用）。**不存在 `mit-network/…` 正源**——`plugin.json` 里的 "MIT" 只是 license 字段；`worldflowai/`、`chchwa/affaan-m-…` 等是社区 fork，非 canonical。
- **⛔ 禁整装（本设计硬约束）**：`plugin.json` 的 `"skills": ["./skills/"]`（v2.0.0 自述 67 agents / **278 skills** / 94 commands）意味着 `claude plugin install ecc@ecc` 会**整包灌入全部 278 技能**——**禁用**。pipeline 只要其中 15 个。
- **✅ 唯一合规路 = 按名选装**（已实证 vercel `skills` CLI 支持，见 6.5）：`npx skills add affaan-m/ECC --skill <只要的名字…>`，只落地被点名的技能到 `~/.agents/skills/`，不碰其余 263 个。
- **官方性**：**非官方**（第三方社区仓，非 Anthropic、非 vercel）。但覆盖面极大、精确同名，是本轮最大增量源。

**ECC 顶层 `skills/` 精确命中本清单 15 个 token**（均 `skills/<token>/SKILL.md` 逐字同名，已 `gh api` 落实）：
`browser-qa`、`e2e-testing`、`search-first`、`deep-research`、`market-research`、`code-tour`、`github-ops`、`react-patterns`、`python-patterns`、`python-testing`、`nestjs-patterns`、`postgres-patterns`、`docker-patterns`、`deployment-patterns`、`frontend-patterns`（另有同域 bonus：`kubernetes-patterns`、`git-workflow`、`strategic-compact`、`context-budget`、`tdd-workflow`、`verification-loop` 等）。

### 6.1 browser-qa / e2e-testing 最终判定（强制级两枚 —— 解决）

| 事项 | 结论 |
|---|---|
| **playwright 插件是什么** | 官方 `claude-plugins-official` 的 `playwright`（`source: ./external_plugins/playwright`）是 **Microsoft 的 MCP server，不是 skill**——提供浏览器驱动工具（导航/点击/填表/截图/跑脚本），不含 `browser-qa`/`e2e-testing` 同名技能。出处：本地 marketplace.json + claude.com/plugins/playwright。 |
| **browser-qa 真源** | **ECC `skills/browser-qa/SKILL.md`（精确同名 skill）**。其正文自述：「automate visual testing and UI interaction verification…**Uses the browser automation MCP (claude-in-chrome, Playwright, or Puppeteer)**」——即**技能=编排层，Playwright MCP=引擎**，二者互补不互斥。出处：github.com/affaan-m/ECC/blob/main/skills/browser-qa/SKILL.md |
| **e2e-testing 真源** | **ECC `skills/e2e-testing/SKILL.md`**：「Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky test strategies」。出处：同仓 blob。 |
| **推荐接入** | 强制级满足方式＝**装技能 + 装引擎**：① `npx skills add affaan-m/ECC --skill browser-qa e2e-testing`（技能/工作流层）② `claude plugin install playwright@claude-plugins-official`（浏览器 MCP 引擎，官方）。另可选纯技能替代源：`neonwatty/qa-skills`、`petrkindlmann/qa-skills`（50 QA 技能）、`lackeyjb/playwright-skill`、`adampaulwalker/qa-test`。agents-inc 侧也有 `web-testing-playwright-e2e` / `web-testing-cypress-e2e`（语义等价，TS/JS 向）。 |

### 6.2 全 token 补正结论表

字段：`token｜上一轮｜本轮确切源 + 安装命令｜skill/MCP｜官方性｜出处`

**A. 原 11 个 UNRESOLVED**

| token | 上一轮 | 本轮确切源 + 安装命令 | 类型 | 官方性 | 出处(真实 URL) |
|---|---|---|---|---|---|
| `browser-qa` | unresolved(强制) | **ECC `skills/browser-qa`**：`npx skills add affaan-m/ECC --skill browser-qa`（+引擎 `claude plugin install playwright@claude-plugins-official`） | skill(+MCP 引擎) | 非官方(ECC) | github.com/affaan-m/ECC/blob/main/skills/browser-qa/SKILL.md |
| `e2e-testing` | unresolved(强制) | **ECC `skills/e2e-testing`**：`npx skills add affaan-m/ECC --skill e2e-testing` | skill | 非官方(ECC) | github.com/affaan-m/ECC/blob/main/skills/e2e-testing/SKILL.md |
| `search-first` | unresolved | **ECC `skills/search-first`**（"Research-before-coding…invokes the researcher agent"）：`npx skills add affaan-m/ECC --skill search-first` | skill | 非官方(ECC) | github.com/affaan-m/ECC/blob/main/skills/search-first/SKILL.md |
| `deep-research` | unresolved(多源无权威) | **钉到 ECC `skills/deep-research`**（取代"多仓同名无单一权威"）：`npx skills add affaan-m/ECC --skill deep-research` | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/deep-research |
| `market-research` | unresolved(多源) | **ECC `skills/market-research`**（旧 URL `everything-claude-code/tree/main/skills/market-research` 即此）：`npx skills add affaan-m/ECC --skill market-research`。另官方 `anthropics/financial-services` 有 "Market Researcher" 但那是 **Cowork agent 非 skill** | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/market-research |
| `code-tour` | unresolved | **ECC `skills/code-tour`**：`npx skills add affaan-m/ECC --skill code-tour`。语义替代：`alexanderop/walkthrough`（交互式 HTML+Mermaid 代码走查） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/code-tour；github.com/alexanderop/walkthrough |
| `github-ops` | unresolved | **ECC `skills/github-ops`**（另 ECC `git-workflow`）：`npx skills add affaan-m/ECC --skill github-ops`。注意官方 `github` 插件是 MCP 非 skill | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/github-ops |
| `web-artifacts-builder` | unresolved | **anthropics/skills `skills/web-artifacts-builder`（官方！）**：`npx skills add anthropics/skills --skill web-artifacts-builder`（React18+TS+Vite+Tailwind+shadcn/ui→单 bundle.html） | skill | **官方 Anthropic** | github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md |
| `zoom-out` | unresolved | **曾在 `mattpocock/skills` `skills/engineering/zoom-out`，上游已删除**（该 blob 现 404、当前 tree 无此技能）；专用镜像 `PJ-SBN-593844/skill-zoom-out` 亦 404。无活跃精确源→降级；ECC 语义近邻 `strategic-compact`/`context-budget` | skill(已失源) | (removed) | mattpocock/skills tree(main，无 zoom-out)；旧链 404 |
| `uiuxdesign-pro` | unresolved | **无精确同名**；最强候选 `nextlevelbuilder/ui-ux-pro-max-skill`（"UI/UX Pro Max" 设计推理引擎）；另 `plugin87/ux-ui-agent-skills`、`HermeticOrmus/LibreUIUX-Claude-Code`——均非逐字匹配 | skill(候选) | 非官方 | github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| `uiforge` | unresolved | **仍真无源**：4 次不同措辞搜索(`uiforge`/`ui-forge`/UI generation skill)均 0 命中；仅撞到 `skill-forge`/`claude-forge`（技能创建器，语义不符）。疑为项目内部命名或笔误——**建议问用户确认指向** | — | — | WebSearch×4 无结果 |

**B. 原 10~11 个 stack 语义等价 —— 全部钉到确切 id**

| token | 上一轮 | 本轮确切源 + 安装命令 | 类型 | 官方性 | 出处 |
|---|---|---|---|---|---|
| `shadcn-ui` | semantic | **agents-inc `web-ui-shadcn-ui`**：`claude plugin install web-ui-shadcn-ui@agents-inc`（ECC 无 shadcn） | plugin/skill | 非官方(agents-inc) | github.com/agents-inc/skills → dist/plugins/web-ui-shadcn-ui |
| `tailwind-css-patterns` | semantic | **agents-inc `web-styling-tailwind`**：`claude plugin install web-styling-tailwind@agents-inc`（ECC 无 tailwind） | plugin/skill | 非官方(agents-inc) | dist/plugins/web-styling-tailwind |
| `react-patterns` | semantic | **ECC `skills/react-patterns`（精确）**：`npx skills add affaan-m/ECC --skill react-patterns`（另 agents-inc `web-framework-react`） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/react-patterns |
| `react-best-practices` | 已解析 | 维持 **vercel-labs/agent-skills `react-best-practices`**：`npx skills add vercel-labs/agent-skills --skill react-best-practices` | skill | Vercel | vercel-labs/agent-skills README |
| `nestjs-patterns` | semantic | **ECC `skills/nestjs-patterns`（精确）**（另 agents-inc `api-framework-nestjs`） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/nestjs-patterns |
| `postgres-patterns` | semantic | **ECC `skills/postgres-patterns`（精确）**（另 agents-inc `api-database-postgresql`） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/postgres-patterns |
| `python-patterns` | semantic(待核实) | **ECC `skills/python-patterns`（精确）**——agents-inc 是 TS/JS 向，**无 Python**，ECC 是唯一精确源 | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/python-patterns |
| `python-testing` | semantic(待核实) | **ECC `skills/python-testing`（精确）**（agents-inc 无 Python） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/python-testing |
| `docker-patterns` | semantic | **ECC `skills/docker-patterns`（精确）**（另 agents-inc `infra-ci-cd-docker`；ECC 另有 `kubernetes-patterns`） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/docker-patterns |
| `deployment-patterns` | semantic(待核实) | **ECC `skills/deployment-patterns`（精确）**——agents-inc 仅 `mobile-deployment-eas`(mobile 向)，ECC 是通用精确源 | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/deployment-patterns |
| `frontend-patterns` | semantic(待核实) | **ECC `skills/frontend-patterns`（精确）**（另 agents-inc web-* 家族） | skill | 非官方(ECC) | github.com/affaan-m/ECC/tree/main/skills/frontend-patterns |

> agents-inc 结构已实证：marketplace `name=agents-inc`、222 个插件、插件 id 与 `dist/plugins/<id>` 目录逐字一致，安装即 `claude plugin install <id>@agents-inc`。stack 里 8 个走 ECC 精确同名（更贴 token 名）、2 个（shadcn/tailwind）走 agents-inc、1 个（react-best-practices）维持 vercel。

**C. ecc 追查** —— 见 6.0：**已定位＝`affaan-m/ECC`（marketplace `ecc`／plugin `ecc@ecc`／npm `ecc-universal`），278 skills 巨仓，非官方**。用户表述属实，纳为主力安装通道。

### 6.3 修正后的去重安装清单（覆盖 ~53 / 55 token）

> 相对第 3 节的增量：新增 **ECC 通道（覆盖 15 token）**、**anthropics/skills 官方 web-artifacts-builder**、**playwright MCP 引擎**、agents-inc 从"可选 D 组"**收窄为仅 shadcn+tailwind 2 个**（其余栈 token 改走 ECC 精确同名）、mattpocock 行更正 `to-prd→to-spec`/`to-issues→to-tickets`（本轮 tree 已实锤两处改名）并**移除已删的 zoom-out**。

```bash
# ── A. 官方 marketplace（claude-plugins-official 已注册，无需 add） ──
# 已装跳过: superpowers（7 个 superpowers:*）
claude plugin install commit-commands@claude-plugins-official      # commit-commands:commit(-push-pr)
claude plugin install frontend-design@claude-plugins-official      # frontend-design
claude plugin install skill-creator@claude-plugins-official        # skill-creator
claude plugin install playwright@claude-plugins-official           # ★新增：browser-qa/e2e-testing 的 MCP 引擎（Microsoft）

# ── B. npx skills add（GitHub skill 仓，拉默认分支=最新） ──
npx skills add mattpocock/skills --skill grill-with-docs improve-codebase-architecture \
    prototype triage handoff to-spec to-tickets          # ★更正：to-prd→to-spec, to-issues→to-tickets（已删 zoom-out）
npx skills add vercel-labs/agent-skills --skill web-design-guidelines react-best-practices
npx skills add Leonxlnx/taste-skill --skill taste-skill
npx skills add nutlope/hallmark
npx skills add dominikmartn/hue
npx skills add alchaincyf/huashu-design
npx skills add anthropics/skills --skill web-artifacts-builder     # ★新增：官方

# ★新增：ECC 按名选装（⛔绝不用 `claude plugin install ecc@ecc` 整装 278 个；只拉这 15 个）
# 装前先 `npx skills add affaan-m/ECC --list` 核名；--skill 可重复给多名（vercel CLI 文档语法）
npx skills add affaan-m/ECC \
  --skill browser-qa --skill e2e-testing --skill search-first --skill deep-research \
  --skill market-research --skill code-tour --skill github-ops --skill react-patterns \
  --skill python-patterns --skill python-testing --skill nestjs-patterns \
  --skill postgres-patterns --skill docker-patterns --skill deployment-patterns \
  --skill frontend-patterns
#   注：shadcn/tailwind 不在 ECC，走下方 agents-inc；current CLI 亦接受空格变参 `--skill a b c`

# ── C. npm CLI（openspec） ──
npm install -g @fission-ai/openspec                                # opsx:* 4 命令 + openspec 二进制

# ── D. agents-inc（非官方 marketplace；★按 id 精确装,不整装 222 个,只这 2 个） ──
claude plugin marketplace add agents-inc/skills
claude plugin install web-ui-shadcn-ui@agents-inc                  # shadcn-ui
claude plugin install web-styling-tailwind@agents-inc             # tailwind-css-patterns
```

**命令条数**：**15 条**（A 组 4 + B 组 8[含 ECC 按名 1 行] + C 组 1 + D 组 marketplace-add 1 + install 逐 id）。核心是**全部走精确选装**：ECC/anthropics/mattpocock/vercel 用 `--skill`，agents-inc 用 `<id>@agents-inc` 逐个——**没有任何一条整装大仓**。token 覆盖从 ~44 提到 **~53 / 55**。
**无需安装**：builtin（verify/run/security-review/code-review）、本仓自带（pipeline-researcher、openspec-* 兜底）。

### 6.4 仍真·软状态最终清单（3 个）

| token | 状态 | 建议 |
|---|---|---|
| `uiforge` | **真无源**（4 次搜索 0 命中） | 唯一彻底查无——**建议问用户确认指向**（是否内部命名/笔误/私有仓）。 |
| `uiuxdesign-pro` | **仅候选**（无逐字同名） | 候选 `nextlevelbuilder/ui-ux-pro-max-skill`（推荐）/`plugin87/ux-ui-agent-skills`；可在 manifest 重定向到候选 id 或降级提示。 |
| `zoom-out` | **上游已删**（原 mattpocock，现 404） | 无活跃精确源；用 ECC 语义近邻 `strategic-compact`/`context-budget`，或钉旧 commit（违"装最新"，不建议）。 |

> 净结果：上一轮 21 个降级 token → **18 个钉到确切源**（含 2 枚强制级 browser-qa/e2e-testing 全解决、11 个 stack 全钉确切 id），仅剩上表 3 个软状态。核心纠偏＝**`ecc`(Everything Claude Code) 一个非官方巨仓补齐了 15 个 token**，playwright 则厘清为「MCP 引擎而非同名技能」。

### 6.5 大仓统一纪律：一律按名选装，禁整装（ECC/mattpocock/agents-inc）

**硬约束**：对任何"一仓多技能"的大仓，只用 `--skill`（或按 id）精确拉 pipeline manifest 需要的，**绝不整插件/整仓下载**。三种通道的正确姿势：

| 大仓 | 整装（⛔禁） | 按名选装（✅唯一合规） | 说明 |
|---|---|---|---|
| **ECC**（affaan-m/ECC，278 skills） | `claude plugin install ecc@ecc`（`plugin.json` `skills:["./skills/"]`→全 278） | `npx skills add affaan-m/ECC --skill <名> [--skill <名>…]` | 只落地被点名者到 `~/.agents/skills/` |
| **mattpocock/skills** | `--skill '*'` | `npx skills add mattpocock/skills --skill grill-with-docs …` | 已按名 |
| **agents-inc/skills**（222 插件） | 全 install | `claude plugin install web-ui-shadcn-ui@agents-inc`（**每个 id=单技能插件**，逐个装即天然选装） | marketplace 内每插件即 1 技能 |
| **anthropics/skills** | `--skill '*'` | `npx skills add anthropics/skills --skill web-artifacts-builder` | 已按名 |

**ECC 按名可行性——已实证（vercel `skills` CLI README）**：
1. **任意 GitHub 仓可用**：`skills add <owner>/<repo>` 不需预注册（支持 owner/repo、完整 URL、GitLab、任意 git URL）。
2. **发现机制**：CLI 扫描 `skills/`、`.agents/skills/` 等容器目录里的 `SKILL.md`，扁平 `skills/<name>/SKILL.md` 走一层、catalog `skills/<cat>/<name>/SKILL.md` 走两层——ECC 是**标准扁平**，被覆盖。
3. **多名一次装**：文档示例 `npx skills add vercel-labs/agent-skills --skill frontend-design --skill skill-creator`（可重复 `--skill`；current CLI 亦收空格变参）。
4. **镜像去重**：ECC 同名技能在 `skills/`、`.agents/skills/`、`docs/<lang>/skills/` 多处镜像；CLI 规则"**较浅层的 SKILL.md 遮蔽更深层**"，顶层 `skills/<name>` 胜出，不会误装 doc 译本。装前 `--list` 核一眼即可。

**兜底（万一 CLI 对某名报歧义/拉不到）**：按目录手动取单技能，不落整仓——
`npx degit affaan-m/ECC/skills/<name> ~/.claude/skills/<name>`（degit 只拉该子目录），或 `gh api repos/affaan-m/ECC/contents/skills/<name>` 逐文件取。

**结论**：ECC **支持**按名选装，无需整装；pipeline 只从 ECC 精确拉上表 15 个 token（shadcn/tailwind 不在 ECC，另走 agents-inc 两个 id）。整装路 `ecc@ecc` 在本设计里明令禁用。
</content>
</invoke>
