# pipeline skill 去哪了：本机技能分发现状调研

> 调研目的：回答用户验收反馈第 1 点——「原来默认的 pipeline skill 怎么没有了，有哪些都需要安装」。
> 方法：先读既有事实底座（scratchpad `maps/skills.md`），再逐条抽查源文件核实；本机额外做了
> `~/.claude/plugins/`（cache / marketplaces / installed_plugins.json / known_marketplaces.json）
> 全量排查和 `claude` CLI 的 `--help` 实测，补全了"怎么装"的具体命令。全部结论标注出处；
> 无法从源码/本机状态直接证实的，标「待核实」，不编造。

---

## 1. 一句话结论

**「原来默认的 pipeline skill」不是被删除了，是它从来没有以 Claude Code 插件的身份装在这台机器上。**
本仓（pipeline-lite）在 `~/.claude/plugins/installed_plugins.json`、`known_marketplaces.json`、
`plugins/cache/`、`plugins/marketplaces/` 四处都查无任何痕迹——不是"装过又卸载"，是从未注册过。
`~/.claude/settings.json` 的 `enabledPlugins` 只挂了 `claude-hud` 和 `superpowers` 两家。仓库里
`skills/pipeline*`、`skills/openspec-*` 这 14 个技能目录、以及 `hooks/gate.sh` 等 hook，现在只是一份
源码 checkout（dev checkout）——Claude Code 从没被告知要加载它们，在普通会话里它们和不存在没有区别。

往下还有第二层，即便装好插件也不会自动解决：`templates/manifest.yaml` 里点名的 28 个「阶段×赛道
强制/推荐技能」token（`superpowers:brainstorming`、`opsx:explore`、`frontend-design`……），本机逐条核对
下来只满足 11 个（不到四成，来自已装的 superpowers 插件、`~/.claude/skills/` 里的自备技能、
外加 1 个 Claude Code builtin），17 个缺失（超六成）——`frontend-design`/`web-design-guidelines`/
`browser-qa`/`e2e-testing`/`commit-commands` 等一大票，本机压根没有。更关键的是——**连老仓那套"缺技能就拦你出这个阶段"的检测代码，这次轻量重写压根没有
迁移过来**。`templates/manifest.yaml:67` 自己写着"消费方：guard 强制 skill 校验面…（待 A1 后续接线）。
派生就绪待消费"；`pipeline doctor` 现在的 11 项体检（`packages/cli/src/commands/doctor.ts:199-210`）
逐条看下来，没有一项检查技能装没装；阶段出口用的 `pipeline check`（`packages/cli/src/commands/check.ts`）
通篇搜不到 `skill` 字样。对照老仓 `workflow-plugin/skills/pipeline/scripts/pipeline-doctor.sh`
（307 行，只读参考），那边是真刀真枪扫 `~/.claude/skills/` + `plugins/cache/`、mandatory 缺了就
"该阶段出口 HARD 阻断"（:163）——manifest 里的数据表被原样搬过来了，扫描/阻断代码没有搬。

### TL;DR：本机现在缺什么

| # | 缺什么 | 影响 | 出处 |
|---|---|---|---|
| 1 | **pipeline-lite 插件本体未装** | 本仓 14 个 pipeline/openspec skill + 全部 hooks，在普通 Claude Code 会话里都拿不到——这是"怎么没有了"的直接答案 | `~/.claude/plugins/installed_plugins.json`、`~/.claude/settings.json`（enabledPlugins） |
| 2 | manifest 点名的 28 个强制/推荐技能 token，本机只满足 11 个（不到四成），17 个缺失（超六成） | 就算装好 pipeline-lite，agent 也拿不到 `frontend-design`/`web-design-guidelines`/`taste-skill`/`browser-qa`/`e2e-testing`/`commit-commands` 等一大票技能 | `templates/manifest.yaml:68-93` vs 本机 `~/.claude/skills/`、`installed_plugins.json` 逐 token 核对（见第 2 节大表） |
| 3 | "缺技能就拦你"的检测代码没有迁移 | 上面两条缺失目前**不会有任何代码级提示**，纯靠各 SKILL.md 里的文字纪律"自觉" | `templates/manifest.yaml:67`；`doctor.ts:199-210`；老仓 `pipeline-doctor.sh:163`（对照组） |

**最要紧的一件事：先把 pipeline-lite 装成 Claude Code 插件**（第 2 节给三种可操作命令）——不装好这一步，
第 2、3 条无从谈起，用户会话里连 `pipeline`/`openspec-explore` 这些最基础的技能都调不到。

---

## 2. 技能来源清单大表

本机实测依据：
- `~/.claude/skills/` 现有 17 个条目（全部是指向 `~/.agents/skills/` 或第三方仓库的 symlink）：
  `code-review diagnosing-bugs find-skills grill-with-docs gsap-core gsap-performance gsap-react
  gsap-utils handoff huashu-design impeccable improve-codebase-architecture ppt-master research
  tdd to-issues to-prd`。
- `~/.claude/plugins/installed_plugins.json` 仅 `claude-hud@claude-hud 0.3.0` +
  `superpowers@claude-plugins-official 6.1.1` 两条记录；`~/.claude/settings.json` 的
  `enabledPlugins` 同口径。
- `~/.claude/plugins/known_marketplaces.json` 仅注册了 `claude-plugins-official`、`claude-hud`
  两个 marketplace；`plugins/cache/`、`plugins/marketplaces/` 目录下均无 pipeline-lite 或其前身
  `pipeline-workflow`（旧仓 `workflow-plugin/.claude-plugin/plugin.json` 里的插件名，版本 1.0.22，
  私有 gitlab 仓库）的任何文件。`~/.claude/plugins/plugin-catalog-cache.json` 搜不到
  `pipeline-lite`/`pipeline-workflow` 字样——它不在任何公开可发现的插件目录里，只能按路径装。

| 技能（代表） | 来源 | 安装方式（可复制命令） | 缺失时行为 | 本机状态 |
|---|---|---|---|---|
| `pipeline`、`pipeline-open/explore/spec/build/verify/ship/archive`、`pipeline-lite`、`learn-record`、`openspec-propose/explore/apply-change/archive-change`（14 个，本仓 `skills/*/SKILL.md`） | 本仓 `skills/` 随 **pipeline-lite 插件**分发（`.claude-plugin/plugin.json:2` name=`pipeline-lite`） | 三选一，见下方「2.1 具体怎么装」 | 会话里 `Skill` 工具候选根本不出现这些 id；`hooks/gate.sh` 的三 marker 门、skill DAG 门也不会触发——不是报错，是**沉默不存在** | **缺**（文件都在磁盘上，未注册进当前 Claude Code 会话） |
| `superpowers:brainstorming`、`:writing-plans`、`:test-driven-development`、`:verification-before-completion`、`:finishing-a-development-branch`（manifest 引用的 5 个）+ `:subagent-driven-development`、`:dispatching-parallel-agents`（EXTERNAL-SKILLS.md 声明但 manifest 未点名） | 外部插件 **superpowers**（`claude-plugins-official` marketplace） | `claude plugin install superpowers@claude-plugins-official` | EXTERNAL-SKILLS.md:20「声明 ≠ 必装：缺失时按各 SKILL 内标注降级（强制项缺失 → 停流程提示安装，不许静默替代）」——纯 prose 纪律，无代码硬拦 | **已装 6.1.1**——EXTERNAL-SKILLS.md 声明的 7 个（含 manifest 未点名的 2 个）全部存在，manifest 实际引用的 5 个自然也都在（`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/` 实测核对）✓ |
| `commit-commands:commit-push-pr`（ship 阶段 mandatory）、`:commit` | 外部插件 **commit-commands**（marketplace 同 superpowers） | `claude plugin install commit-commands@claude-plugins-official` | 同上 prose 降级；老仓 `pipeline-doctor.sh:162` 特别注明这是"命令类 token，无 skill 单源，installer 装不了，须走 `/plugin install`" | **缺**（installed_plugins.json 无此插件） |
| `grill-with-docs`、`huashu-design`（`prototype` 的备选）、`improve-codebase-architecture`、`to-prd`、`to-issues`、`handoff`、`find-skills`、`code-review`、`diagnosing-bugs`、`gsap-*`、`ppt-master`、`impeccable`、`research`、`tdd` | 用户环境自备（`~/.claude/skills/`，实为 symlink 到 `~/.agents/skills/` 等私有技能库） | 用 `find-skills` skill 检索到之后手动放置/symlink 到 `~/.claude/skills/<name>/` | 同上 prose 降级 | **均存在** ✓（`prototype` 本身缺失，但 manifest 里是 `prototype\|huashu-design` 二选一备选，huashu-design 命中即算过） |
| `verify`、`run`、`code-review`、`security-review` | Claude Code **builtin**（EXTERNAL-SKILLS.md:81-84 标注） | 随 Claude Code 自带，无需安装 | 不适用 | **存在** ✓（`code-review` 同时也在 `~/.claude/skills`，双来源不冲突） |
| `frontend-design`、`web-design-guidelines`、`design-taste-frontend\|taste-skill`、`browser-qa`、`e2e-testing`、`verify\|verification-loop`、`search-first`、`hallmark`、`shadcn-ui`、`tailwind-css-patterns`、`react-patterns`、`react-best-practices`、`prototype`、`hue`、`uiforge`、`web-artifacts-builder`、`market-research`、`zoom-out`、`triage`、`skill-creator`、`github-ops`、`code-tour` 等 | 用户环境自备（EXTERNAL-SKILLS.md 声明，本机未放置） | 同上（`find-skills` 检索 + 手动安装） | 同上 prose 降级（强制级=停流程提示装；推荐/条件/可选=按 SKILL.md 标注跳过） | **全部缺失** |
| `pipeline-researcher`（recommended，`explore.pm`） | 随本仓 `agents/pipeline-researcher.md` 分发（是 agent 定义，不是 skill） | 随 pipeline-lite 插件一起装 | recommended 级，理论上"缺只 WARN"（见第 3 节：目前连 WARN 都没有代码触发） | 仓库文件存在；插件未装 → 不可用 |

### 2.1 具体怎么装（pipeline-lite 插件本体）

本仓目前**没有** `.claude-plugin/marketplace.json`（`find . -iname marketplace.json` 全仓搜索为空），
所以走标准 `claude plugin marketplace add` + `claude plugin install` 两步式官方流程之前，得先给仓库
补一份 marketplace 清单（参考同机已装的 `claude-hud`：它自己的仓库根下有
`.claude-plugin/marketplace.json`，`plugins: [{ name: "claude-hud", source: "./" }]` 自引用）。
这件事本身值得先拍板要不要做（见第 5 节）。**在此之前，本机可用的装法有两条：**

```bash
# 方式 A（会话级，最快验证，不持久化）——claude --help 实测确有此参数：
claude --plugin-dir /Users/a1234/Documents/code-manager/projects/pipeline-worklfow

# 方式 B（跨会话持久化，比照本机 huashu-design 等条目的实际做法：
#   ~/.claude/skills/<name>/ 全是 symlink）——
#   claude plugin init --help 显示 "Scaffold a new plugin at ~/.claude/skills/<name>/
#   (auto-loads next session as <name>@skills-dir)"，据此推断把一个完整插件目录
#   （含 .claude-plugin/plugin.json + hooks/ + skills/）放进这个位置也会被同一套
#   自动加载逻辑捡起来；本报告未重启会话做端到端验证，标【待核实】：
ln -s /Users/a1234/Documents/code-manager/projects/pipeline-worklfow ~/.claude/skills/pipeline-lite
# 之后新开一个会话生效
```

方式 C（标准做法，需要先补 marketplace.json，当前不可用）：

```bash
claude plugin marketplace add /Users/a1234/Documents/code-manager/projects/pipeline-worklfow
claude plugin install pipeline-lite@<marketplace 名字>   # 名字取自新建的 marketplace.json
```

以上三条命令均为本机 `claude --help` / `claude plugin --help` / `claude plugin marketplace add --help` /
`claude plugin init --help` 实测输出所支持的调用形态，**没有实际执行安装**（会修改用户全局 Claude Code
配置，超出本次调研范围，留给用户自己拍板执行）。

---

## 3. 「缺了会怎样」分级说明

manifest.yaml 和各 SKILL.md 里出现的分级词，实际含义和代码后果分两条线，容易混：

- **`mandatory_skills` / `recommended_skills`**（`templates/manifest.yaml:68-93`）：这是"阶段×赛道"
  维度的强制/推荐表，老仓 `evidence` 派生而来。
- **强制/推荐/条件/可选**（各 `skills/pipeline-*/SKILL.md` 末尾"外部 skill 依赖"节，如
  `skills/pipeline-explore/SKILL.md:183-190`、`skills/pipeline-build/SKILL.md:278-296`、
  `skills/pipeline-verify/SKILL.md:271-281`）：这是单个技能自己声明的"这个具体外部依赖对我有多重要"，
  四级更细，例如 `skills/pipeline-build/SKILL.md:280-281` 把 `superpowers:subagent-driven-development`
  标"条件（build_mode）"，:292-295 把 `shadcn-ui`/`tailwind-css-patterns`/`react-patterns`/
  `react-best-practices` 标"条件"（看技术栈），:285-287 把 `huashu-design`/`hallmark`/`prototype`
  三个原型引擎标"三选一"。

两条线**目前都只是文字标注，代码层零消费**。逐级看实际后果：

| 级别 | manifest.yaml 里写的目标行为 | 现在真实发生的事 |
|---|---|---|
| 强制（mandatory） | 缺了应该拦（老仓语义：该阶段出口 HARD 阻断） | **不拦**。`pipeline check`（阶段出口命令）通篇无 `skill` 字样；`pipeline doctor` 11 项体检没有一项查 mandatory_skills；`manifest.yaml:67` 自注"待 A1 后续接线" |
| 推荐（recommended） | 缺只 WARN，不阻断 | **连 WARN 都没有**——WARN 也是需要代码去检测再打印的，检测代码不存在，WARN 自然不存在 |
| 条件（各 SKILL.md 自标） | 看技术栈/模式，不适用则跳过 | 纯靠 agent 自己读 SKILL.md 文字判断，无代码校验 |
| 可选（各 SKILL.md 自标） | 锦上添花，缺了跳过不提示 | 同上，本来就不要求 |

代码层真正会拦人的只有两处，都跟"具体缺哪个技能"无关：

1. **三 marker 交互门**（`hooks/gate.sh:106-115`）：拦的是"有没有走 AskUserQuestion 让用户确认"，
   跟当前该走哪个 skill 完全无关，是三个物理文件 marker（confirm/review/interaction）的新鲜度判定。
2. **skill DAG 门**（`hooks/gate.sh:123-169` → `packages/cli/src/commands/internalSkillGate.ts:95-125`）：
   **只在非 default 的自定义 workflow 下生效**（`gate.sh:120-122` 明确写了 `workflow==='default'`
   这条最高频路径完全跳过整段判定），且只挡"调用某个具体 Skill 工具"本身合不合规（step 有没有声明它 /
   它的 `depends_on` 完成没有），不挡"这个阶段允不允许出口"。任何内部异常都 fail-open 放行
   （`internalSkillGate.ts:124-127`）。default workflow（也就是绝大多数用户用的内置 7 阶段流程）完全碰不到这道门。

对照组——**老仓真的做过这件事**：`workflow-plugin/skills/pipeline/scripts/pipeline-doctor.sh`
（307 行，只读参考，不改）：

- `:121` 注释写明活跃根 = `~/.claude/skills/` + `~/.claude/plugins/cache/`（已安装且启用的插件），
  **明确排除** `plugins/marketplaces/` 和 `~/.agents/skills/`——这两处只是符号链接源，没链进
  `~/.claude/skills/` 前 Claude Code 不加载，算进去会把"源里有但没装"误判成"已装"。
- `:125-142` 还会读 `~/.claude/settings.json` 的 `enabledPlugins.<key>=false`，把被禁用插件的
  cache 目录过滤掉——同一个坑：文件还在磁盘上，但插件被关了，Claude Code 不会加载。
- `:157-164`：manifest token 缺失 + severity=mandatory → `add REQ "...缺则该阶段出口 HARD 阻断"`，
  同时塞进 `MISSING_SK` 数组。
- `:165`：severity=recommended → `add DEG "...未装 —— recommended，缺只 WARN、不阻断"`。
- `:27`、`:289`：`MISSING_SK` 数组配合 `--missing` 标志输出，供"AskUserQuestion 三选一自动安装编排"
  消费——`skills/pipeline/SKILL.md:41-44` 自己也承认这件事"待迁移（M3 #26b）"，当前 lite 内核的
  降级面只是"外部 skill 依赖已在 `skills/EXTERNAL-SKILLS.md` 显式清单化，安装期由
  `bash tools/verify-skills.sh` 硬校验"——但 `verify-skills.sh` 校验的是"这个引用有没有在
  EXTERNAL-SKILLS.md 里声明"（声明一致性），**不是"这台机器上装没装"**（`tools/verify-skills.sh:101-126`
  通篇没有任何路径去检查 `~/.claude/skills` 或 `~/.claude/plugins`）。这句 SKILL.md 里的自我描述如果
  读快了容易被误解成"已经有运行时检测"，实际上没有。

简言之：老仓的"扫描已装技能 + mandatory 硬阻断 + recommended WARN + 缺失清单喂给自动装机引导"这一整套，
数据表（manifest mandatory_skills/recommended_skills）原样搬进了本仓，**扫描和阻断代码没有搬**。
`BACKLOG.md`/`GOAL.md` 通篇也搜不到"mandatory skill 校验/检测"相关的开放条目——这件事目前连待办都没有，
只在 `manifest.yaml:67` 留了一句注释。

---

## 4. UI 未安装标注方案（设计，本轮不实现）

### 4.1 server 侧：检测"已装"三源

对齐老仓 `pipeline-doctor.sh:121-149` 的口径（这是仓库里唯一明确写清楚"哪些目录算数、哪些不算数"
的参考实现，抄这个语义最稳）：

1. `~/.claude/skills/<name>/SKILL.md` 是否存在（需要 follow symlink——本机现有 17 个条目全部是
   symlink，`readdirSync`/`existsSync` 默认跟随符号链接，Node 侧天然满足）。
2. `~/.claude/plugins/installed_plugins.json` 里每个 `<plugin>@<marketplace>` 键，去对应的
   `installPath` 下找 `skills/*/SKILL.md`，收集技能名；同时读 `~/.claude/settings.json` 的
   `enabledPlugins.<key>=false` 排除掉被禁用的插件——这条排除逻辑是 `pipeline-doctor.sh:125-142`
   踩出来的坑，必须照抄，否则会把"装了但被关掉"误判成"已装"。
3. builtin 短名单——写死 `verify/run/code-review/security-review`（来自 `skills/EXTERNAL-SKILLS.md:81-84`），
   因为它们不落在任何一个目录里，没法靠扫描发现。

**明确不查** `~/.claude/plugins/marketplaces/`（市场索引缓存，不代表装了——`pipeline-doctor.sh:122`
同一条注释里点出的另一个坑）。

### 4.2 `GET /api/skills/registry` 升级

现状：`packages/server/src/skillsRegistry.ts:27-30` 的 `listAllSkills()` 返回 `string[]`
（本仓 `skills/*/SKILL.md` 目录名 ∪ `EXTERNAL-SKILLS.md` 声明行）；
`packages/server/src/server.ts:427-433` 直接透传成 `{ skills: string[] }`。

改动面：

- `skillsRegistry.ts` 新增 `detectInstalled(): Set<string>`（读 4.1 三源，纯 fs 读）。
- 新增 `listAllSkillsDetailed(repoRoot): SkillEntry[]`，
  `SkillEntry = { name, installed, source, installCmd? }`，
  `source ∈ 'local-plugin' | 'external-marketplace' | 'builtin' | 'user'`：
  - `local-plugin`：来自本仓 `skills/*/SKILL.md`；
  - `external-marketplace`：`EXTERNAL-SKILLS.md` 里"superpowers 系""commit-commands 系"两段；
  - `builtin`：`EXTERNAL-SKILLS.md:81-84`"验证"段落标 builtin 的四个；
  - `user`：`EXTERNAL-SKILLS.md` 其余声明。
  `installCmd` 按 source 给对应模板（marketplace 类给 `claude plugin install <name>`；
  user 类给"用 find-skills 检索安装"提示；local-plugin 类给第 2.1 节的三条命令）。
- `server.ts:427-433` 响应体从 `{ skills: string[] }` 升级为 `{ skills: SkillEntry[] }`。

**兼容策略**（任务点名要写清楚——这是本轮设计里最容易踩的坑）：现有两个消费方都硬编码
`Promise<{ skills: string[] }>`：
- `packages/dashboard-app/src/workbench/SkillChain.tsx:198`（自定义 workflow 编辑面板的候选源）；
- `packages/dashboard-app/src/workbench/SkillTransferModal.tsx:37,44`（穿梭框弹窗）。

直接把 `skills` 字段换成对象数组，这两处会在编译期类型报错、运行期把整个对象当字符串用
（`SkillChain.tsx:37` 的 `SKILL_ID_RE.test(id)`、`SkillTransferModal.tsx:52` 的 `all.filter(...)`
字符串方法全部失效）。两个可选策略：

- **方案 a（推荐）**：破坏性升级，同一次改动里把两个消费方一起改掉——它们都在
  `packages/dashboard-app/src/workbench/` 下，改动量不大（见 4.4），反正前后端同仓库一起发布，
  没有需要保护的第三方消费者。
- **方案 b**：新增字段而不改老字段，`{ skills: string[], skillsDetailed: SkillEntry[] }`——
  多一份重复数据、多维护一条兼容分支，除非确认有仓外的第三方在读这个端点，否则没必要。

### 4.3 前端改动

- `SkillChain.tsx:356-365` 的 `chip()` 渲染函数：`installed === false` 时加一个淡纹
  `wb-chip--uninstalled` 修饰类 + 一个小 badge（如"未安装"字样），`title`/hover 展示
  `installCmd`，可以做成点击复制（`navigator.clipboard.writeText`）。
- `:424` 起的候选面板列表（`wb-skp-list`，"+ 添加"时选技能的地方）同样要处理——这里其实比已选
  chip 更要紧，因为这是用户往自定义 workflow 里"新增"技能的入口，未安装的候选如果没有视觉区分，
  用户会把从没装过的技能拖进 workflow，回头才发现调不动。
- `SkillTransferModal.tsx` 同款处理：它也是从 registry 拿候选，穿梭框两侧列表加同样的 badge。
- `workbench/data.ts:14` 的 `MANDATORY_SKILLS` 静态镜像：这是 `/api/config` 请求失败时的兜底数据，
  本身不含 installed 信息——这条兜底分支只能展示技能名、不展示是否已装（可接受，因为触发条件是
  "server 都连不上"的极端情况）。
- **"manifest 强制技能缺失时工作台顶部黄条"**：需要一个新的横幅组件——取当前 phase×track 对应的
  `mandatory_skills` 列表（`GET /api/config` 已有，`packages/server/src/config.ts:74` 起的
  `readMandatorySkills`），任一 token 的全部 `a|b` 备选都不在 installed 集合里 → 显示黄条。
  这是一处新组件 + 一处顶层布局挂载点改动，挂载点在 Workbench 主壳哪一层，本报告未展开，留给
  落地时单独探路。

### 4.4 改动面清单与工作量估计

| 文件 | 改动 | 量级 |
|---|---|---|
| `packages/server/src/skillsRegistry.ts`（现 30 行） | 新增 `detectInstalled()` + `listAllSkillsDetailed()`，原 `listAllSkills` 保留或改薄封装 | 中，预估 +60~90 行（三源探测逻辑） |
| `packages/server/src/server.ts:427-433` | 响应体结构升级 | 小，几行 |
| `packages/server/src/skillsRegistry.test.ts`（新建/扩） | 三源探测的真 fs 测试（比照本仓"零 mock 真 fs"纪律） | 中 |
| `packages/dashboard-app/src/workbench/SkillChain.tsx`（现 487 行） | `chip()` 加 badge；`:198` fetch 类型换；候选面板列表同款处理 | 中，文件内改 3~4 处 |
| `packages/dashboard-app/src/workbench/SkillTransferModal.tsx`（现 164 行） | `:37,44` fetch 类型换 + 穿梭框两侧 badge | 小~中 |
| `packages/dashboard-app/src/workbench/data.ts`（现 43 行） | 类型对齐（若要让兜底路径也过 TS 类型检查） | 小 |
| 新增顶部黄条组件 + 挂载点改动 | 需要先定位 Workbench 壳层挂载点 | 未估，留待落地时单独探路 |

粗粒度工作量（仅供拍板参考，非承诺）：server 侧探测 + 端点半天～1 天；前端 chip/穿梭框 badge 半天；
顶部黄条（含挂载点定位 + 新组件 + 联调）半天～1 天；测试（server 真 fs + 前端 render）半天。
合计约 **2~3 天**，不含第 5 节"gate 层硬拦"（那是独立的、工作量更大的问题）。

---

## 5. 开放问题（需拍板）

1. **要不要做 gate 层硬拦（= `manifest.yaml:67` 说的"待 A1 后续接线"）？**
   老仓 `pipeline-doctor.sh` 的参考实现已经有（mandatory 缺 → 该阶段出口 HARD 阻断，recommended
   缺 → WARN，见第 3 节对照组）；新仓目前连 backlog 条目都没有——`BACKLOG.md`/`GOAL.md` 通篇搜不到
   "mandatory skill 校验/检测"相关的开放项，只有 `manifest.yaml:67` 注释里一句"待接线"。如果做，
   接哪个点是三选一：
   - `pipeline check`（阶段出口命令，对齐老仓语义，改 `packages/cli/src/commands/check.ts`，目前
     该文件里没有任何 `skill` 相关代码）；
   - `hooks/gate.sh`（工具调用粒度，更早介入但可能更烦人，且要小心不能破坏"default workflow 零
     spawn"这条硬规则，`hooks/gate.sh:19-22` 明确写了这条纪律）；
   - 仅 `pipeline doctor`（体检面板，不阻断，最保守，改动最小）。
   三选一直接决定工作量和"打扰用户的程度"，需要用户拍板。如果不做，第 4 节的"顶部黄条"就是唯一的
   用户可见反馈——纯提示不拦人，这本身也是一种明确选择，需要用户认下来而不是含糊过去。

2. **installed 检测对 marketplace 插件命名空间（`superpowers:brainstorming` 这种带冒号的 token）怎么判？**
   第 4.1 节的检测口径是按"裸技能名"扫目录/插件包里的 `SKILL.md`，产出的是不带插件前缀的名字集合
   （如 `brainstorming`）；但 manifest token 是 `superpowers:brainstorming` 这种"插件:技能"形式。
   现状还有一个更直接的口子没开：`SkillChain.tsx:37` 的 `SKILL_ID_RE = /^[a-zA-Z0-9_-]+$/` 直接把
   带冒号的名字判非法（自定义 workflow 编辑面板里连候选都不给选）。这次改动要不要一并放开这条正则，
   还是保持"自定义 workflow 里不许引用外部插件技能"这条既有限制？
   若放开，`detectInstalled()` 要在两种匹配精度里选一种：
   - **精确匹配**：把 `installed_plugins.json` 里 `<plugin>@<marketplace>` 键，映射到该插件包内
     实际的 `skills/*/SKILL.md` 名字，拼成 `<plugin>:<skillName>` 去对 manifest token——精度高，
     实现量接近第 4.1 节现有逻辑的翻倍（因为要建立"插件名 → 其内部技能名列表"的映射，而不只是
     "有没有装这个插件"）。
   - **前缀匹配**：只要 `superpowers@*` 系插件装了，`superpowers:` 开头的 token 全部记 installed，
     不细粒度到具体某个技能是否真的在该插件包内——实现简单，但精度低（插件包里若干技能，可能只是
     整体装了但具体某个技能被后续版本改名/移除，也会被误判为已装）。
   这两个问题不拍板，`detectInstalled()` 对 `superpowers:*`/`opsx:*`/`commit-commands:*` 这一大类
   token（manifest 28 个里目测占了小一半）会全部误判成"未装"，或者需要在第 4 节方案之外再加一层
   特判逻辑——建议先定匹配策略再动代码。
