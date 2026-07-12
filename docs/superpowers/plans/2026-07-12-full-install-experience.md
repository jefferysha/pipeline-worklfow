# 计划:安装插件后全功能全量可用(总计划,分批做)

> 设计真相源:`docs/superpowers/specs/2026-07-12-full-install-experience-design.md`(已提交 b2831e6)。数据地基:`docs/research/2026-07-12-skill-install-sources.md` Section 6。
> 授权:用户拍板选项 4(全都要,分批做,逐批验收)+「直接执行」;uiforge 删除。
> 姿势铁律(记忆库):禁 Workflow 工具;批量任务 Agent 工具多路后台并行,主会话只编排/合并/守门。文件边界纪律照旧。
> 推送红线:未经「推」不 push。术语「阶段」不「相位」。

三批对齐 spec §8:批 1 地基 → 批 2 技能齐全 → 批 3 运行时。每批末三连 build + 全量测试守门,给用户真机验收。**本文档先详出批 1(Phase 1)任务书;批 2/3 列任务清单,到批时各自展开为任务书**(每批一个 spec→plan→执行小循环)。

---

## 全局约束(每任务隐含,来自 spec §4)

- 按名选装禁整装;技能装上游最新非写死;官方/第三方标注;终端互动(--yes/--dry-run);全局副作用显式确认;凭证只报 set/未设不回显;「阶段」文案;不 push。
- marketplace 地址 = `jefferysha/pipeline-worklfow`(origin)。
- CLI bundle `packages/cli/dist/pipeline.mjs` 现被 `.gitignore` 的 `dist/` 忽略,已有 `#!/usr/bin/env node` shebang。
- hooks 调 CLI 走 `$CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`(router.sh:125 / gate.sh:151),路径不改。

---

## 批 1 · Phase 1 地基(3 任务;文件边界清晰,三路并行)

### F1 · marketplace.json 自托管 + 插件资产校验

- **一句话目标**:补 `.claude-plugin/marketplace.json`,让 `claude plugin marketplace add jefferysha/pipeline-worklfow` + `claude plugin install pipeline-lite@pipeline-lite` 走通。
- **涉及文件**:
  - `.claude-plugin/marketplace.json`(新建)
  - (只读校验,不改)`.claude-plugin/plugin.json`、`hooks/hooks.json`、`skills/`、`agents/`
- **内容规格**(对齐 claude-hud 范本 + 本仓 plugin.json):
  ```json
  {
    "name": "pipeline-lite",
    "owner": { "name": "bigdata_storage_compute_engine" },
    "metadata": { "description": "7 阶段开发流水线的轻量重建(open→…→archive)", "version": "0.1.0" },
    "plugins": [{
      "name": "pipeline-lite",
      "source": "./",
      "description": "<取自 plugin.json.description>",
      "category": "workflow",
      "tags": ["workflow","pipeline","state-machine","openspec","hooks","lite"]
    }]
  }
  ```
- **TDD**:①JSON 有效且 `name`/`plugins[0].source==="./"`/`plugins[0].name==="pipeline-lite"` 字段断言(可加一条 `packages/server` 或 cli 侧的纯解析测试,或 `tools/verify-skills.sh` 扩一条 marketplace.json 存在+形状校验);②`plugin.json` 与 marketplace 的 name 一致性断言。
- **验收(真机)**:`claude plugin marketplace add <本地仓路径>` 识别该 marketplace;`claude plugin install pipeline-lite@pipeline-lite` 装成功(可装后 `claude plugin uninstall` 复原,不留全局污染);装后普通会话 `/pipeline-lite` skill 可见、session-start hook 触发。
- **server-cli-kernel**:否(纯清单 + 校验脚本)。

### F2 · CLI bundle 随插件入包

- **一句话目标**:让构建好的 `pipeline.mjs` 随 `claude plugin install`(git clone)一起到位,hooks 装完即工作。
- **涉及文件**:
  - `.gitignore`(加否定行 `!packages/cli/dist/pipeline.mjs`,置于 `dist/` 之后)
  - `packages/cli/dist/pipeline.mjs`(force-track 入库;`git add -f`)
  - `docs/DIST-RELEASE.md`(新建,一句话:该 bundle 是分发产物,改 cli 后须 `npm run build` 重构并提交;后续可加 CI 新鲜度校验,本批 YAGNI)
- **决策**:采用「force-track 单文件 bundle」而非改 hooks 路径——hooks 的 `packages/cli/dist/pipeline.mjs` 引用零改动,churn 最小。bundle 有 shebang,天然可执行。
- **TDD**:①`git ls-files packages/cli/dist/pipeline.mjs` 非空(入库);②bundle 首行 shebang 断言;③hooks 相对路径引用回归(router.sh/gate.sh 的 `_CLI_BUNDLE`/`SG_BUNDLE` 路径不变——只读断言,不改)。
- **验收(真机)**:临时 `git clone`(或 `git archive`)本仓到干净目录 → `packages/cli/dist/pipeline.mjs` 在 → `node <clone>/packages/cli/dist/pipeline.mjs status` 能跑(模拟 plugin install 后 hooks 调 CLI 的路径)。
- **server-cli-kernel**:否(打包/gitignore)。
- **风险**:committed 构建产物需随 cli 改动重构提交(release 纪律,DIST-RELEASE.md 登记);本批不做 CI 新鲜度门(登记 YAGNI)。

### F3 · `pipeline setup` 命令骨架 + PATH 软链 + --dry-run

- **依赖**:F2(软链目标 = F2 入包的 bundle;但骨架可与 F1/F2 并行开发,软链路径已知)。
- **一句话目标**:新 CLI 命令 `pipeline setup`,骨架含 `--dry-run`/`--yes`/子命令 + 把 CLI bundle 软链到 PATH;安装段留空(Phase 2 填)。
- **涉及文件**:
  - `packages/cli/src/commands/setup.ts`(新建:`cmdSetup(deps, sub, opts)`;`ensurePipelineOnPath()` 把 `$CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs`(或 `deps` 提供的 self 路径)软链到 `~/.local/bin/pipeline`,chmod +x,已存在且指向同源则跳过;`--dry-run` 打印计划骨架标题「技能安装(待 Phase 2)/运行时检查(待 Phase 3)」;`--yes` 跳确认位)
  - `packages/cli/src/commands/setup.test.ts`(新建)
  - `packages/cli/src/program.ts`(注册 `setup [sub]`,`allowUnknownOption`,description)
  - (可选)`packages/cli/src/deps.ts`(若软链需注入 home/bin 路径与 fs,沿既有 io 注入面)
- **命令面**:`pipeline setup`(互动)/`--yes`/`--dry-run`/`setup skills`/`setup runtime`(后两者本批仅占位分派)。
- **TDD**:①`--dry-run` 打印计划骨架且**不写任何文件/不软链**(注入 fake fs 断言零写);②`ensurePipelineOnPath` 注入临时 bin 目录:首次建软链(指向正确源)、已存在同源跳过、已存在异源覆盖/告警(自定,报告说明);③`setup skills`/`setup runtime` 分派到占位处理(本批打印「待实现」不报错);④缺 `~/.local/bin` 时建目录。
- **验收(真机)**:`pipeline setup --dry-run` 出计划骨架;`pipeline setup`(或 `setup` 首步)后新开 shell `which pipeline` 命中软链、`pipeline status` 能跑。
- **server-cli-kernel**:否(cli)。

**批 1 并行编排**:F1(marketplace.json)∥ F2(.gitignore+dist+doc)∥ F3(setup.ts+program.ts)——三者文件零重叠,三路并行。program.ts 仅 F3 独占。波末三连 build + 全量守门,真机验收「装插件走通 + pipeline 上 PATH + setup --dry-run 出计划」。

---

## 批 2 · Phase 2 技能齐全(到批时展开任务书)

- **S1 · registry 数据**:`templates/skill-sources.yaml`(从研究 Section 6 全量派生 token→tool/source/skill/tier/official/engine)+ `templates/manifest.yaml` 删 `uiforge`、软状态标注(uiuxdesign-pro 候选 / zoom-out removed)。
- **S2 · setup 技能安装段**:读 registry → 按 tool 分组生成命令(claude-plugin/skills-cli `--skill`/npm/agents-inc marketplace-add+逐 id)→ 装前 `--list` 核最新 → 幂等(扫 ~/.claude/skills+~/.agents/skills+plugins/cache 差集)→ 逐条容错 → 末尾汇总(强制缺红)。**禁整装**断言。degit 兜底。
- **S3 · doctor 缺技能检测(A1)**:`pipeline doctor` 新增技能在位检查(扫安装位,对 manifest mandatory/recommended 判在位,强制红+「跑 pipeline setup」/推荐黄)+ `session-start.sh` 一行轻提示(不跑安装)。
- **S4 · 上游漂移同步 + 一致性门**:registry 里 mattpocock `to-prd→to-spec`/`to-issues→to-tickets` 落实;`tools/verify-skills.sh` 扩一条「registry 与 EXTERNAL-SKILLS.md token 集一致」校验。
- **并行**:S1 先行(数据地基)→ S2∥S3 依赖 S1 → S4 收尾。

## 批 3 · Phase 3 运行时(到批时展开任务书)

- **R1 · setup 运行时段**:docker 探测(CLI 侧直调 `docker info`,对齐 v6 server 先例)+ 缺镜像给一键 `bash tools/sandcastle/build.sh`(两 runner CLI)。
- **R2 · 双 runner 凭证 + codex 对等**:凭证检查(claude-code OAUTH / codex OPENAI_API_KEY,复用 secrets store,只报 set/未设)+ 就绪清单两 runner 对称呈现。
- **R3 · 「全功能就绪」清单 + 真机验收脚本**:docker/镜像/两 runner 凭证/技能齐全 一屏聚合;`.playwright-tmp` 下真机验收脚本。

---

## 波末守门(每批)

`npm run build && npm run build:web && npm run build:server` + `npm test` + `npm run test:web` + `npm run typecheck:web`(先 build 再测)。真机验收该批的 spec §8 判据。逐批完成后给用户验收,认可再进下一批。
