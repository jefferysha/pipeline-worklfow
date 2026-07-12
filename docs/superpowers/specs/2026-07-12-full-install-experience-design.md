# 设计:安装插件后全功能全量可用(含 codex 对等)——2026-07-12

> 触发:用户「用户安装插件后可以全功能都全量使用,codex 也是一样」。范围拍板=选项 4(全都要,排总计划分批做,逐批验收)。硬约束:技能装**官方最新/上游源,不写死不 vendored**;大仓**只按名选装,绝不整装**;安装**终端里互动式**跑。
> 事实底座:`docs/research/2026-07-11-skills-distribution.md`(插件未装的根因)、`docs/research/2026-07-12-skill-install-sources.md`(token→安装地址 registry,尤其 **Section 6** 深挖补正=本设计的权威数据源)。
> 推送红线不变:未经用户「推」不 push。凭证红线不变。术语「阶段」不「相位」(决议 #8)。

---

## 1. 目标与成功判据

**目标**:一个新用户装上 pipeline-lite 插件后,能全量使用 7 阶段流水线的**全部**功能——各阶段所需技能到位、hooks/gates 生效、AFK 自动化用 claude-code 或 codex 任一 runner 都能真跑。

**成功判据(可测)**:
1. `claude plugin marketplace add <repo> && claude plugin install pipeline-lite@pipeline-lite` 走通;装完普通会话里 14 个 pipeline/openspec skill + 全部 hooks + 4 个 agent 生效;`pipeline` 命令在终端可用。
2. `pipeline setup` 一条命令(终端互动)把 manifest 点名的外部技能**按名从上游最新源装齐**(~53/55 token),装前列出计划+官方/第三方标注+受影响全局目录,确认后执行,已装跳过。
3. `pipeline doctor` 能报出每个 manifest 强制/推荐技能装没装:强制缺→提示装(阻断语义),推荐缺→WARN。
4. codex 与 claude-code 在就绪清单里**同等呈现**:镜像含两 runner CLI、凭证各自可配、就绪三灯对两者都点亮。
5. 全程不写死技能副本(不 vendored);大仓无任何一条整装。

---

## 2. 技能源 registry(数据地基;权威=研究 Section 6)

安装地址不写进代码,落一份数据文件 **`templates/skill-sources.yaml`**,`pipeline setup`(安装)与 `pipeline doctor`(检测)共同消费。每 token 一条:

```yaml
# 由 docs/research/2026-07-12-skill-install-sources.md Section 6 派生;token→上游最新源
version: 1
skills:
  browser-qa:        { tool: skills-cli, source: affaan-m/ECC, skill: browser-qa, tier: mandatory, official: false, engine: "playwright@claude-plugins-official" }
  e2e-testing:       { tool: skills-cli, source: affaan-m/ECC, skill: e2e-testing, tier: mandatory, official: false }
  react-patterns:    { tool: skills-cli, source: affaan-m/ECC, skill: react-patterns, tier: recommended, official: false }
  # …（ECC 共 15 个 token,含 search-first/deep-research/market-research/code-tour/github-ops/
  #    python-patterns/python-testing/nestjs-patterns/postgres-patterns/docker-patterns/
  #    deployment-patterns/frontend-patterns）
  shadcn-ui:         { tool: claude-plugin, source: agents-inc, plugin: web-ui-shadcn-ui, tier: recommended, official: false }
  tailwind-css-patterns: { tool: claude-plugin, source: agents-inc, plugin: web-styling-tailwind, tier: recommended, official: false }
  react-best-practices:  { tool: skills-cli, source: vercel-labs/agent-skills, skill: react-best-practices, tier: recommended, official: false }
  web-design-guidelines: { tool: skills-cli, source: vercel-labs/agent-skills, skill: web-design-guidelines, tier: mandatory, official: false }
  web-artifacts-builder: { tool: skills-cli, source: anthropics/skills, skill: web-artifacts-builder, tier: optional, official: true }
  frontend-design:   { tool: claude-plugin, source: claude-plugins-official, plugin: frontend-design, tier: mandatory, official: true }
  commit-commands:commit-push-pr: { tool: claude-plugin, source: claude-plugins-official, plugin: commit-commands, tier: mandatory, official: true }
  skill-creator:     { tool: claude-plugin, source: claude-plugins-official, plugin: skill-creator, tier: optional, official: true }
  # superpowers:* → { tool: claude-plugin, source: claude-plugins-official, plugin: superpowers, official: true }（本机已装,幂等跳过）
  grill-with-docs:   { tool: skills-cli, source: mattpocock/skills, skill: grill-with-docs, tier: mandatory, official: false }
  to-prd:            { tool: skills-cli, source: mattpocock/skills, skill: to-spec, tier: mandatory, official: false }   # ★上游改名 to-prd→to-spec
  to-issues:         { tool: skills-cli, source: mattpocock/skills, skill: to-tickets, tier: mandatory, official: false } # ★改名 to-issues→to-tickets
  # …（mattpocock 其余:improve-codebase-architecture/prototype/triage/handoff）
  taste-skill:       { tool: skills-cli, source: Leonxlnx/taste-skill, skill: taste-skill, tier: mandatory, official: false }
  huashu-design:     { tool: skills-cli, source: alchaincyf/huashu-design, tier: mandatory, official: false }
  hallmark:          { tool: skills-cli, source: nutlope/hallmark, tier: recommended, official: false }
  hue:               { tool: skills-cli, source: dominikmartn/hue, tier: optional, official: false }
  # opsx:* → { tool: npm, source: "@fission-ai/openspec", provides: openspec-binary, tier: mandatory, official: false }
  # builtin(verify/run/security-review/code-review)与本仓自带(pipeline-researcher/openspec-*)不列入安装
  # 软状态(可选级,声明+WARN 不阻断):uiuxdesign-pro(候选 nextlevelbuilder/ui-ux-pro-max-skill)、zoom-out(上游已删,降级)
  # uiforge:从 manifest 删除(用户拍板,真无源)
```

字段语义:`tool`∈{claude-plugin,skills-cli,npm,builtin,bundled};`tier` 决定 doctor 缺失时阻断还是 WARN;`official` 决定 setup 清单的标注;`engine` 是该技能额外需要的 MCP 引擎(browser-qa 需 playwright)。**这份 yaml 是唯一真相源**——研究里的命令集(Section 6.3)即其派生。

---

## 3. 架构:三阶段 + 统一入口 `pipeline setup`

三阶段依赖顺序:地基(能装)→ 技能齐全(装什么/怎么装/缺了报)→ 运行时(装完能真跑)。统一入口 `pipeline setup` 把 Phase 2+3 的安装/检查串成一条终端互动命令(= 用户要的「初始化时安装」)。

### Phase 1 · 地基——插件可安装 + CLI 到位

- **`.claude-plugin/marketplace.json`(自托管)**:参照 claude-hud 范本,`plugins:[{name:"pipeline-lite", source:"./", description, category, tags}]`——让 `claude plugin marketplace add <repo>` + `claude plugin install pipeline-lite@pipeline-lite` 走通(现仅有 plugin.json,缺此文件标准流程走不通)。
- **CLI 随插件到位**:hooks 调 CLI 走插件相对路径 `$CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`(router.sh:125/gate.sh:151),故**把构建好的 `pipeline.mjs` 纳入插件包**(提交或安装期就位),装完 hooks 即工作、无需 build 步。用户终端的 `pipeline` 命令由 `pipeline setup` 首步软链到 PATH(或 `npm link`)解决。
- **plugin.json 校验**:skills/hooks/agents 按目录约定自动发现(superpowers 的 plugin.json 也不显式声明),核实三目录被正确加载。
- **交付**:一条安装命令走通 + `pipeline` 上 PATH。

### Phase 2 · 技能齐全——registry + 多工具选装器 + 缺技能检测(A1)

- **registry 数据**(§2):`templates/skill-sources.yaml`。
- **`pipeline setup` 的技能安装段**:读 registry,按 `tool` 分组生成命令:
  - `claude-plugin`:官方聚焦插件 `claude plugin install <plugin>@<source>`(superpowers 已装跳过);agents-inc 先 `marketplace add` 再逐 id 装(每 id=单技能插件,天然选装)。
  - `skills-cli`:`npx skills add <source> --skill <名…>`**按名选装**;装前 `npx skills add <source> --list` 核当前 id(应对 mattpocock 改名类漂移=「最新」语义)。
  - `npm`:`npm install -g @fission-ai/openspec`。
  - **硬纪律**:任何多技能大仓(ECC/mattpocock/anthropics/agents-inc)一律按名/按 id 选装,**禁整装**(研究 6.5)。ECC 兜底 `npx degit affaan-m/ECC/skills/<name>` 只拉子目录。
  - **幂等**:已装的跳过(扫 ~/.claude/skills + ~/.agents/skills + plugins/cache);失败一条不阻断其余,末尾汇总。
- **缺技能检测(A1 迁移)**:`pipeline doctor` 新增技能在位检查——扫真实安装位(对齐老仓 pipeline-doctor.sh:121 口径:`~/.claude/skills` + `~/.claude/plugins/cache` 启用项 + `~/.agents/skills` + builtin,排除 `enabledPlugins=false`),对 manifest `mandatory_skills`/`recommended_skills` 逐 token 判在位:强制缺→红+「跑 pipeline setup 装」提示(阻断语义,呼应老仓 HARD),推荐缺→黄 WARN。`session-start.sh` 只加一行轻量「AFK/技能就绪见 pipeline doctor」提示,**不在 hook 里跑安装**(SessionStart 零 spawn 纪律)。
- **交付**:registry + setup 安装段 + doctor 检测。

### Phase 3 · 首跑运行时——docker/镜像/双 runner 一键(codex 对等)

- **`pipeline setup` 运行时段**:探 docker(复用 v6 `GET /api/docker/images`/readiness 口径的 server 直调 `docker info` 先例,CLI 侧同款)→ 缺镜像给一键 `bash tools/sandcastle/build.sh`(默认镜像 `WITH_CLAUDE_CODE=true`,`WITH_CODEX` 跟随,两 runner CLI 都在)→ 双 runner 凭证检查(claude-code `CLAUDE_CODE_OAUTH_TOKEN` / codex `OPENAI_API_KEY`,secrets store v6 已建,`pipeline` 侧只读探测 set/未设,不回显值)→ 复用 v6 就绪三灯。
- **codex 对等**:镜像/凭证/runner 选择 runtime 层 v6 已对等;本阶段确保 setup 清单对两 runner **同等列出**(哪个凭证已配、镜像里两 CLI 都在),不让 codex 成二等公民。
- **交付**:setup 运行时段 + 「全功能就绪」清单(docker/镜像/两 runner 凭证/技能齐全 一屏)。

### 统一入口 `pipeline setup`(终端互动)

```
pipeline setup            # 互动:列计划(命令+官方/第三方+受影响全局目录)→确认→执行→就绪清单
pipeline setup --yes      # 非互动(自动化/CI):跳确认全装
pipeline setup --dry-run  # 只打印计划不执行(可测,不碰全局)
pipeline setup skills     # 只跑技能安装段
pipeline setup runtime    # 只跑运行时检查段
```

流程:① 读 registry + 探本机已装 → 算出「待装差集」;② 列计划(每条命令、来源官方/第三方、写哪个全局目录 ~/.claude 或 ~/.agents);③ 终端确认(`--yes` 跳过);④ 分组执行(claude-plugin / skills-cli / npm / marketplace-add),`--list` 核最新、逐条容错、失败不阻断;⑤ 运行时段(docker/镜像/凭证);⑥ 打印「全功能就绪」清单 + 未装/软状态技能的 `find-skills` 手动提示。

---

## 4. 全局约束(每任务隐含)

| 约束 | 内容 |
|---|---|
| 按名选装禁整装 | ECC/mattpocock/anthropics 用 `--skill`;agents-inc 逐 id;**无任何整装大仓**(研究 6.5) |
| 最新非写死 | `npx skills add` 拉默认分支=最新;装前 `--list` 核 id(mattpocock 已实锤改名);不 pin sha |
| 官方/第三方标注 | setup 计划里每源标官方(Anthropic/claude-plugins-official/anthropics/skills/vercel)或第三方(ECC/agents-inc/mattpocock/Leonxlnx/nutlope/dominikmartn/alchaincyf) |
| 终端互动 | setup 默认互动确认;`--yes` 供自动化;`--dry-run` 只打印(测试/预览) |
| 全局副作用显式 | 改 `~/.claude/plugins`+settings(claude plugin)、`~/.agents/skills`+`.skill-lock.json`(skills CLI)、全局 npm(openspec)——计划里列清,确认后才写 |
| 凭证红线 | 凭证探测只报 set/未设,不回显值;不进日志 |
| 术语「阶段」 | 全部新增用户可见文案用「阶段」不「相位」 |
| 推送红线 | 全程不 push |
| 决议 #2 | Phase 2 doctor/gate 检测不改 gate/interactive-skill-gate 强制常开锁定 |

---

## 5. 错误处理与边界

- **软状态技能**(可选级):`uiuxdesign-pro`(候选 `nextlevelbuilder/ui-ux-pro-max-skill`,registry 标 candidate)、`zoom-out`(上游已删,registry 标 removed→降级 WARN)。均声明+WARN+find-skills 提示,不阻断。`uiforge`:**从 manifest 删除**(用户拍板,真无源)。
- **安装失败**:单条命令失败(网络/源不可达/名漂移)→ 记入末尾汇总,不 abort 其余;强制级失败在汇总里红字标出并给手动命令。
- **`npx skills add --skill` 可行性**:研究已实证 Vercel CLI 支持任意 GitHub 仓按名(6.5);实现时 setup 先 `--list` 探测,某名报歧义则走 degit 兜底。
- **幂等/重跑**:`pipeline setup` 可反复跑,已装跳过(扫安装位);doctor 反映当前真实在位态。
- **agents-inc 非官方 marketplace**:`marketplace add agents-inc/skills` 引入非官方源——计划里显式标注,确认后才 add。
- **凭证探测滞后**(v6 已登记):server 进程 env 快照问题——setup 的凭证灯注「服务进程视角,终端 doctor 为准」,沿 v6 §4.3 诚实口径。

---

## 6. 测试策略

- **registry 解析**:yaml→结构化,tool/tier/official 字段;缺字段兜底。
- **命令生成**(纯函数,mock exec):registry + 已装差集 → 分组命令列表;断言 ECC 走 `--skill` 多名、agents-inc 逐 id、无整装命令;已装跳过;官方/第三方标注正确。
- **`--dry-run`**:打印计划不执行(集成测试主力,不碰全局)。
- **doctor 技能检测**:mock 安装位(临时 ~/.claude/skills + ~/.agents/skills)→ mandatory 缺红/recommended 缺黄/都在绿;排除 enabledPlugins=false。
- **marketplace.json**:格式校验 + `claude plugin` 能识别(真机冒烟,不入 CI)。
- **真实安装**:改全局配置,**不入 CI**;`pipeline setup` 真机手动验收(Phase 各批验收时跑)。
- **codex 对等**:readiness/凭证对两 runner 对称(复用 v6 测试面 + 新增 setup 清单断言)。

---

## 7. 范围外(YAGNI)

| 项 | 为什么不做 |
|---|---|
| vendored 冻结技能副本 | 用户明令「装最新不写死」——一律从上游拉 |
| 整装大仓 | 用户明令「只装那几个」——按名选装 |
| 自动静默安装 | 用户要终端互动确认;`--yes` 仅供自动化 |
| ECC 全 278 技能 / agents-inc 全 222 插件 | 只装 manifest 需要的 |
| `uiforge` 找源 | 真无源,用户拍板从 manifest 删除 |
| macOS Keychain 凭证后端 | v6 已登记 YAGNI,文件方案够 |
| gate 层硬拦技能(A1 代码级出口阻断) | 本设计做**检测+提示装**(doctor),不做 gate.sh 出口硬阻断——那是独立拍板项(v6 登记),本轮 doctor 的强制缺「提示装」已满足「全量可用」目标 |

---

## 8. 分批实施(逐批验收)

按 Phase 分三批,每批独立可验收:
- **批 1(Phase 1 地基)**:marketplace.json + CLI 入包 + `pipeline setup` 骨架(--dry-run/软链 PATH)。验收:真机 `claude plugin install pipeline-lite@pipeline-lite` 走通、`pipeline` 可敲、`setup --dry-run` 出计划。
- **批 2(Phase 2 技能)**:skill-sources.yaml + setup 安装段 + doctor 检测 + manifest 删 uiforge/改 to-spec 等。验收:`setup` 真装齐(真机)、`doctor` 正确报缺、幂等重跑跳过。
- **批 3(Phase 3 运行时)**:setup 运行时段 + 就绪清单 + codex 对等断言。验收:缺镜像给 build.sh、两 runner 凭证对称呈现、就绪清单一屏。

每批完成三连 build + 全量测试守门,给用户真机验收 URL/命令。实施计划(任务级)由 writing-plans 产出。
