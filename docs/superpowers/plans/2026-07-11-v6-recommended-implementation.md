# 计划:2026-07-11 v6「都走推荐」实施(数据面+配置面+编排页重构)

> 交互真相源(本轮):`design-demos/v6-workbench-flow.html` 方案 A(「流程即真相」)+ `design-demos/v6-config-copilot.html` 方案 A(「终端生成,UI 审阅」)。视觉真相源仍为 v4(token 不变),demo 像素非圣旨(上轮教训 13)——像素级取值以现有组件既定 token/间距为准,demo 只定信息架构与交互模式。
> 授权:用户对 v6 轮全部方案「都走推荐」拍板,本计划是下一执行轮唯一真相源,精确到文件与验收判据。
> 推送红线不变:未经用户「推」,不 push origin/main。凭证红线不变:key 绝不落仓库内文件(`.pipeline/` 在仓库内,不可用);凭证值不进任何日志/错误消息。
> 术语纪律:本文档一律用「阶段」,不用「相位」(决议 #8,仅用户可见文案;代码标识符 `phase` 不动)。

---

## 0. 前置声明:本轮刚合入的改动,计划不得重复

`git log ff3a8a9..HEAD --oneline`(12 commits)已完成以下工作,下述任务清单不再安排:

- **「+ 添加阶段」已从禁用占位变真功能**(`15d1c30`):`StepperRail.tsx` 按钮已可点、`WorkbenchView.tsx` 已接 Dialog 收阶段名/ID + 转换边线性接线。T11(StepperRail 重写)基线是"已可用的添加阶段"，不是 v5 地图记录的"永久禁用占位"。
- **进度视图小改批**(`0145a80`/`7300d7f`/`dac32c6`/`b603093`/`80cb6d5`):「等 agent」→「等产出」+ title 提示、调度灯讲清楚沙箱统计范围+并发上限展示、执行中段常驻视觉区分、组头 workflow 徽章加「工作流:」前缀。这些是本轮验收反馈②/③点的既有修复,不在本计划任务范围内。
- **本轮五份输入文档本身**(`d166df1`/`d0ada9a`/`8c78878`/`a42857e`/`9f7a4ba`/`421dfd9`)已提交 main:skills 研究、loop/凭证方案设计、UX 深度分析、两份 demo。本计划只把它们「落地」，不重新设计。
- **SkillChain.tsx 已按 workflow 类型分岔**(`:164` `isDefault` 判断、`:290-349` default 轨道矩阵 vs `:67-107` 自定义依赖链):Demo1-A 落地清单第 5 条「StepEditor.tsx 技能区按 workflow 类型分岔」**已满足**,T12 不重做,只需在此基础上挪动/瘦身。

`git status` 另有未跟踪文件 `packages/cli/src/commands/afk.test.ts`(T21 image 三段链路证据用测试草稿,与本轮任务无关,`git log --all` 对该路径无历史记录,纯本地 WIP)——执行前建议先确认是否需要提交，避免被 worktree 复制或后续任务误覆盖(见第六节风险)。

---

## 一、拍板登记

| 主题 | 拍板内容 | 出处 |
|---|---|---|
| Demo1-A | 编排页信息架构用「流程即真相」:流程带即入口,门徽章+真实计数/运行脉冲长在图上,点阶段只留基本/技能/产出物编辑区;预演假动画退役换「最近流转」真实回放 | `design-demos/v6-workbench-flow.html:448-505`(方案 A 区块+落地清单) |
| Demo2-A | 配置生产者重构用「终端生成,UI 审阅」:loop 空态不再给裸表单,agent 在终端写草稿落盘 `.pipeline/loops.yaml`,dashboard 只做批准/调整/驳回;字段来源徽章、AFK 就绪三灯、Loop 三方关系条、独立凭证卡四件套配套落地 | `design-demos/v6-config-copilot.html:452-686`(方案 A 区块+落地清单);推荐依据 `docs/ux/2026-07-11-config-experience-analysis.md:184-193`(第五节方案对比) |
| 第 1 点 UI 未安装标注 | 照做研究报告第 4 节:server 三源检测已装技能(本仓 `skills/*/SKILL.md` ∪ `installed_plugins.json` 排除 `enabledPlugins=false` ∪ builtin 四件套)+ `GET /api/skills/registry` 升级为 `SkillEntry[]`(方案 a 破坏性升级,两个消费方同批改)+ 前端未安装 badge + manifest 缺失黄条;**gate 层硬拦(A1)不做,登记开放问题** | `docs/research/2026-07-11-skills-distribution.md:165-251`(第 4 节) |
| A2 loop 三方关系呈现 | 卡头 root 徽章 + 卡内关系条(`change_prefix`→实时匹配 changes 弹层复用既有 Dialog、`phases`→阶段 chips 纯展示);展示已保存真值,不随草稿实时重算 | `docs/proposals/2026-07-11-loop-relations-afk-credentials.md:56-73` |
| A3 零消费字段处置 | 不能一刀切:`phases` 补显示管道但定位「文档性声明,不承诺拦截语义」;`state` 改只读展示「约定路径」文案;`allowlist` 标「预留字段,当前无运行时效果」disclaimer | 同上 `:90-116` |
| B1 镜像列表数据源 | server 直接 `execFile('docker', …)`,对齐 `afk.ts:257-259` 的 `docker kill` 先例,不反向依赖 automation 包 | 同上 `:122-135` |
| B2 新增 GET 端点鉴权 | 不要求 Bearer token,只加 `isLocalHost` Host 头校验(`server.ts:88-95` 复用) | 同上 `:137-148` |
| B3 AutomationCard 镜像输入交互 | 原生 `<input list>` + `<datalist>`,不建自建 combobox,值域校验(`IMAGE_RE`)零改动 | 同上 `:150-158` |
| C2a 凭证存储位置 | `~/.claude/pipeline-secrets.json`,机器级,0600 权限 + tmp+rename 原子写 | 同上 `:173-182` |
| C2b `CODEX_HOME` 要不要进 secrets store | 不进——它是路径不是密钥,现有 host env 透传已工作,只读探测展示 | 同上 `:186-190` |
| C2c `ANTHROPIC_API_KEY` 要不要现在加白名单 | 不加——全链零消费者,加了是摆设字段 | 同上 `:192-196` |
| C3 `GET /api/secrets` 要不要鉴权 | 不要求 token,同 B2 加 Host 校验即可 | 同上 `:216-227` |
| C4 凭证注入优先级 | 宿主 env 显式 > secrets 文件,沿用 `sdk.ts:57,61-62` 装配惯例(合并一次,不逐次读取) | 同上 `:229-241` |
| C5 凭证 UI 归属 | 独立「凭证」卡,不塞进 `AutomationCard`(交互模式/作用域都不同) | 同上 `:243-255` |
| D AFK 首跑就绪探测(用户补充需求,与 8/9 点同批执行) | 新端点 `GET /api/afk/readiness?root=`;`session-start.sh` 保持轻量静态提示,**不做真探测**(docker 探测可能挂起,与 SessionStart「零阻断」纪律冲突) | 同上 `:259-301` |

以上 A2/A3/B1/B2/B3/C2a/C2b/C2c/C3/C4/C5 共 **11 项**为「第 8/9 点」决策(`docs/proposals/...:11-27` 决策速览表);D 项是文档开篇范围声明里点名的「用户补充的 AFK 首跑就绪探测需求」,与前 11 项同批落地但计数上独立标注,不冲突「11 项推荐」的表述(`docs/proposals/...:4`)。

---

## 二、任务分解(13 个任务,三条轨)

编号前缀仅标注所属轨,不代表新的命名空间;下文「涉及文件」标 **【热点】** 的文件在同一波次内被多个任务触碰,需按第三节波次编排的顺序处理。

### A 轨(数据面:server / cli / kernel / automation)

#### T1 · secrets 存储模块 + 三端点(掩码 / 0600 / 原子写 / Host 校验)

- **一句话目标**:新增机器级凭证存储 `~/.claude/pipeline-secrets.json`(kernel 读写原语)+ server 三端点(`POST`/`GET`/`DELETE /api/secrets`),值只回掩码、写盘 0600+原子写、不落仓库。
- **涉及文件**:
  - `packages/kernel/src/state/secrets.ts`(新建:`secretsPath(home)`/`readSecrets(path)`/`writeSecretKey(path, key, value)`/`deleteSecretKey(path, key)`,白名单仅 `CLAUDE_CODE_OAUTH_TOKEN`/`OPENAI_API_KEY`,对齐 `packages/kernel/src/state/projectRegistry.ts` 的 injectable-home + tmp+rename 模式)
  - `packages/kernel/src/state/secrets.test.ts`(新建)
  - `packages/kernel/src/index.ts`(导出)
  - `packages/server/src/paths.ts`(`resolveServerPaths` 加 `secretsPath` 解析)
  - `packages/server/src/types.ts`(`ServerPaths` 接口加 `secretsPath: string`)
  - `packages/server/src/secrets.ts`(新建:HTTP 契约层——body 校验、masked 规则 `value.length>10 ? \`${slice(0,3)}…${slice(-4)}\` : '***'`、调用 kernel 模块)
  - `packages/server/src/secrets.test.ts`(新建)
  - **【热点:server.ts 接力链第 1 棒】** `packages/server/src/server.ts`(`handlePost`(:503 起)新增 `POST /api/secrets`;`handleGet`(:301 起)新增 `GET /api/secrets` + 补 `isLocalHost` 校验;`handleDelete`(:867 起)新增 `DELETE /api/secrets?key=`)
  - `packages/server/src/server.test.ts`
- **server-cli-kernel 是否涉及**:是(kernel 新增存储原语,server 新增 HTTP 契约,架构对齐 v5 T2 项目注册表先例)。
- **TDD 测试要求**:
  - `secrets.test.ts`(kernel):①写入后文件 mode 恰为 `0o600`;②tmp+rename 原子写(同目录 tmp 文件 rename 后不残留);③非白名单 key 写入抛错;④删除单键后其余键保留;⑤文件缺失时读取返回空 keys 集合(fail-open,不抛错)。
  - `secrets.test.ts`(server):①masked 规则精确匹配 `sk-…7f3a` 形态(3 前缀+省略号+4 后缀);②短值(≤10 字符)兜底整体 `***`;③响应体断言不含任何原始 value 子串。
  - `server.test.ts`:①`POST /api/secrets` 401 无 token、400 非白名单 key/超长 value(>4KB);②round-trip:POST 写入→GET 读回 masked 且不含明文→DELETE 后 GET 显示 `set:false`;③`GET /api/secrets` 无需 token,但非法 Host 头(伪造 `Host`)被拒;④端点不接受/不要求 `root` 参数(机器级,无信任锚 404 分支)。
- **验收判据(真机)**:启动 dashboard server,`curl -X POST /api/secrets` 写入测试 key 后 `stat -f%Lp ~/.claude/pipeline-secrets.json` 输出 `600`;`curl GET /api/secrets` 回显 masked 值且不含明文;`DELETE` 后 `GET` 显示 `set:false`;server 进程 stdout/stderr 全程不出现明文 token 字符串(`grep` 校验)。

#### T2 · cli afk run 凭证注入接线(修 claude-code token 缺口)

- **依赖**:T1(读取 kernel secrets 模块)。
- **一句话目标**:`cli afk run` 启动时合并一次 `hostEnv = {...secretsAsEnv, ...process.env}`,并让 claude-code 路径与 codex 路径对称获得凭证透传(此前 `cli afk run` 完全没有为 claude-code 传 `extraEnv`,沙箱脚本判空静默回落「确定性模式」)。
- **涉及文件**:
  - `packages/automation/src/sdk/dockerRunChange.ts`(新增 `claudeCredentialEnv`,与既有 `codexCredentialEnv`(`:97-103`)同构:`runner !== 'codex'` 时挑 `CLAUDE_CODE_OAUTH_TOKEN`;展开序 `{...credEnv, ...opts.extraEnv}` 不变)
  - `packages/automation/src/sdk/dockerRunChange.test.ts`
  - `packages/cli/src/commands/afk.ts`(`run` 分支 `:139` 附近,读取 secrets 合并进 `hostEnv` 后传给 `createDockerRunChange`)
  - `packages/cli/src/deps.ts`(`CliDeps` 新增可选 `readSecretsEnv?: () => Promise<Record<string,string>>`,best-effort 语义,对齐既有 `registerProject?`/`readGateMarkers?` 先例)
  - `packages/cli/src/main.ts`(注入实现:`readSecretsEnv` 用 kernel `secretsPath(homedir())` + `readSecrets`)
  - `packages/cli/src/main.test.ts` 或对应集成测试
- **server-cli-kernel 是否涉及**:是(automation + cli + kernel 读取)。
- **TDD 测试要求**:①`dockerRunChange.test.ts`:`runner!=='codex'` 且 `hostEnv.CLAUDE_CODE_OAUTH_TOKEN` 存在时,docker run argv 含 `-e CLAUDE_CODE_OAUTH_TOKEN=`(mock exec,不起真容器,同既有 `makeFakeExec` 打桩口径);`runner==='codex'` 时不透传该键(两个 runner 互斥透传,回归既有 codex 分支不受影响)。②`afk.test.ts` 或 `main.test.ts`:secrets 文件缺失时行为等价今天(fail-open,不报错不改变行为);secrets 文件有值但同名宿主 env 变量已设置时,宿主 env 值最终生效(C4 优先级断言)。③沙箱脚本侧回归:`tools/test-hooks.sh` 或等价 sh 测试确认 `pipeline-afk-run.sh:66` 判空分支在拿到 token 时不再回落确定性模式(可用现有 `afk-run.integration.test.ts` 若含相关用例则补充断言,不新起集成测试框架)。
- **验收判据(真机)**:本机若配置了测试用 `CLAUDE_CODE_OAUTH_TOKEN`(或用假值验证注入路径,不要求真登录成功),跑 `pipeline afk run` 后确认容器 `docker inspect` 或运行日志显示该 env 已注入(不落日志明文,只验证「非空」);未配置时行为与今天完全一致(回落确定性模式,不报错)。

#### T3 · `GET /api/docker/images` + 超时降级

- **依赖**:T6 完成后接力(见波次编排,server.ts 冲突序,非功能依赖)。
- **一句话目标**:新增单机资源查询端点,`docker images --format '{{.Repository}}:{{.Tag}}'` 过滤 `<none>` 悬空镜像,5s 超时/异常统一降级为 `available:false`,不抛 500。
- **涉及文件**:
  - `packages/server/src/dockerImages.ts`(新建:`listDockerImages(execFn?)` + 导出可复用的 `execDocker(args, timeout=5000)` 封装,供 T4 复用)
  - `packages/server/src/dockerImages.test.ts`(新建,注入 fake exec)
  - **【热点:server.ts 接力链第 3 棒】** `packages/server/src/server.ts`(`handleGet` 新增 `GET /api/docker/images`,无 `root` 参数,加 `isLocalHost`)
  - `packages/server/src/server.test.ts`
- **server-cli-kernel 是否涉及**:是(server 新增只读模块,**不** import `packages/automation` 的 `dockerAvailable`,对齐 `afk.ts:15-19` 零依赖纪律)。
- **TDD 测试要求**:①`dockerImages.test.ts`:注入 fake exec 返回含 `<none>:<none>` 行,断言输出过滤掉;②超时(mock 延迟)/非零退出/spawn 失败(命令不存在)三种异常均收敛为 `{available:false, images:[]}`,不抛异常;③`server.test.ts`:响应形状精确匹配 `{ok:true, available:true, images:[...]}`,`ok` 恒为 `true`(docker 不可用不是 HTTP 失败);④无需 `root` 参数也能 200(不落入信任锚 404 分支)。
- **验收判据(真机)**:本机装了 docker 时 `curl /api/docker/images` 返回真实镜像列表(不含悬空镜像);临时 `docker context stop`/改 `DOCKER_HOST` 断连后请求仍 200 且 `available:false`,响应时间 < 6s(超时生效)。

#### T4 · `GET /api/afk/readiness` 三灯探测

- **依赖**:T1(凭证探测复用 secrets 模块)、T3(docker 探测复用 `execDocker` 封装)。
- **一句话目标**:新端点聚合 docker 可用/镜像存在/凭证已配(按 runner 分)三项只读探测,永不返回凭证明文,只返回 `set`+`source` 标签。
- **涉及文件**:
  - `packages/server/src/afkReadiness.ts`(新建:复用 T3 的 `execDocker`,`docker info` 探测 1,`docker image inspect <configuredImage>` 探测 2 且探测 1 失败时短路,探测 3 纯文件+env 读取不依赖 docker)
  - `packages/server/src/afkReadiness.test.ts`(新建)
  - **【热点:server.ts 接力链第 4 棒/末棒】** `packages/server/src/server.ts`(`handleGet` 新增 `GET /api/afk/readiness?root=`,`root` 必填走信任锚 404,加 `isLocalHost`)
  - `packages/server/src/server.test.ts`
- **server-cli-kernel 是否涉及**:是。
- **TDD 测试要求**:①响应形状精确匹配 proposal 附录 D.1 JSON(`docker.available`/`image.configured,present,build_hint`/`credentials.claude-code.CLAUDE_CODE_OAUTH_TOKEN.set,source`/`credentials.codex.{OPENAI_API_KEY,CODEX_HOME}`);②`docker info` 失败时短路,断言未真正调用 `docker image inspect`(mock 调用次数);③`configuredImage` 取 `readAutomationSettings(root).image || 'sandcastle:local'`(空串走默认);④镜像缺失时 `build_hint` 精确等于 `'bash tools/sandcastle/build.sh'`;⑤凭证 `source` 字段在 secrets 文件与宿主 env 都设置时标为宿主 env(C4 优先级一致);⑥`root` 缺失 400、未注册 404。
- **验收判据(真机)**:未配置任何凭证/无 docker 时三灯全红/黄且文案与 `build_hint` 命令可直接复制执行(执行后镜像确实出现在 T3 的 `/api/docker/images` 列表里,两端点数据一致)。

#### T5 · `session-start.sh` 首跑清单提示(轻量静态提示,不做真探测)

- **依赖**:无(可与 T1 并行)。
- **一句话目标**:检测到 `.pipeline/automation.json` 存在或活跃 change 命中 `automation` 字段时,追加一行静态文案「AFK 就绪状态见 dashboard(就绪三灯)」,**不**新增任何 docker/凭证真探测逻辑,**不**指向 `pipeline doctor`(该命令本轮不扩展,见范围外登记)。
- **涉及文件**:
  - `hooks/session-start.sh`(纯 bash 追加一段判断,零解释器 spawn,守 SessionStart「fail-open、exit 恒 0」纪律,`:8-10` 头注释)
  - `tools/test-hooks.sh`(新增用例覆盖有/无 `automation.json` 两态)
- **server-cli-kernel 是否涉及**:否(hooks/ shell 脚本,不属于 server/cli/kernel TS 包)。
- **TDD 测试要求**:`test-hooks.sh` 新增断言:①`.pipeline/automation.json` 存在时 stdout 含该提示行;②不存在且无活跃 automation change 时不追加(零副作用);③脚本执行时间不因本次改动明显增加(无新增子进程 spawn,保持纯 bash grep)。
- **验收判据(真机)**:`pipeline init` 一个新项目后跑 `pipeline afk enqueue`,新开 Claude Code 会话触发 SessionStart,终端输出含该提示行;未配置 AFK 的普通项目会话输出不受影响(逐字对比无回归)。

#### T6 · skills installed 三源检测 + `GET /api/skills/registry` 升级

- **依赖**:无(可与 T1 并行,server.ts 接力链上排在 T1 之后)。
- **一句话目标**:server 侧新增「已装」三源检测(本仓 `skills/*/SKILL.md` ∪ `installed_plugins.json` 排除禁用插件 ∪ builtin 四件套),`GET /api/skills/registry` 响应体从 `{skills:string[]}` 升级为 `{skills:SkillEntry[]}`(方案 a 破坏性升级,两个消费方同批改)。
- **涉及文件**:
  - `packages/server/src/skillsRegistry.ts`(现 30 行:新增 `detectInstalled(homeDir): Set<string>`(对齐 `pipeline-doctor.sh:121-149` 口径,含 `enabledPlugins=false` 排除)+ `listAllSkillsDetailed(repoRoot, homeDir): SkillEntry[]`;`SkillEntry = {name, installed, source, installCmd?}`)
  - `packages/server/src/skillsRegistry.test.ts`(新建/扩,真 fs 测试,不 mock)
  - **【热点:server.ts 接力链第 2 棒】** `packages/server/src/server.ts:427-433`(响应体结构升级)
  - `packages/server/src/server.test.ts`
  - `packages/dashboard-app/src/api/client.ts`(`fetchSkillsRegistry` 返回类型同步换 `SkillEntry[]`)
  - `packages/dashboard-app/src/workbench/SkillChain.tsx:198`(fetch 消费类型换)
  - `packages/dashboard-app/src/workbench/SkillTransferModal.tsx:37,44`(同上)
- **server-cli-kernel 是否涉及**:是(server 新增检测逻辑;前端类型同步改动是本任务收尾,不算独立轨)。
- **设计决策(需明确记录,避免施工时二次纠结)**:manifest token 的插件命名空间匹配(`superpowers:brainstorming` 带冒号形式)采用**前缀匹配**(装了 `superpowers@*` 系插件即判 `superpowers:` 开头全部 installed),不做精确到插件内部技能名的映射——本轮 badge 是「标注型提示」不是判据,精度换实现成本;此简化在风险节登记。
- **TDD 测试要求**:①`skillsRegistry.test.ts`:真 fs 临时目录模拟 `~/.claude/skills/`(含 symlink)+ `installed_plugins.json`(含一条 `enabledPlugins:false` 记录)断言排除生效;②builtin 四件套(`verify`/`run`/`code-review`/`security-review`)恒标 `installed:true` 且 `source:'builtin'`;③`server.test.ts`:`GET /api/skills/registry` 响应体逐字段匹配新 `SkillEntry[]` 形状;④`SkillChain.test.tsx`/`SkillTransferModal.test.tsx` 回归(类型改动后原有测试全绿,不静默跳过)。
- **验收判据(真机)**:本机(已知 `pipeline-lite` 插件未装,`skills.md` 已实测)请求该端点,响应体含至少一个 `installed:false` 的 `local-plugin` 来源条目(如 `pipeline-open`)和至少一个 `installed:true` 的 `external-marketplace` 条目(如 `superpowers:brainstorming` 前缀匹配命中)。

---

### B 轨(配置面 UI:workbench)

#### T7 · Loop 卡审阅面重构(空态终端引导 + 字段生产者徽章 + 三方关系条)

- **依赖**:无(server/loops.ts 是本任务独有触碰,不与 A 轨任何任务冲突)。
- **一句话目标**:`LoopCard.tsx` 空态从纯 YAML 教学块换成「去终端」引导(prompt 示例 + 复制按钮);全部 15 个草稿字段按 UX 分析表(硬/软/零消费)加静态三色徽章(agent 生成/系统推导/人拍板,**纯前端硬编码规则,不做「谁实际写了这个值」的运行时追踪**——agent 生成协议本轮不落地,见范围外登记);新增关系条(root 徽章 + `change_prefix`→匹配 changes 弹层 + `phases`→阶段 chips)。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/LoopCard.tsx`(现 739 行:①空态区 `:428-435` 替换 `EMPTY_EXAMPLE` pre 块为引导卡+复制按钮;②每字段行旁加 `prov` 徽章,复用 `:701-735` 已导入的 `Dialog` 组件承载匹配 changes 弹层;③卡头 `:443` 附近插入关系条,布局参照现有 `lp-policy` 分组样式纪律)
  - `packages/dashboard-app/src/workbench/LoopCard.test.tsx`
  - `packages/server/src/loops.ts`(`LoopRow` 接口 `:25-48` 加 `matched_changes: string[]` + `phases: string[]`;`buildLoopsSnapshot` `:121-152` 对每 loop 现读一次 `openspec/changes/` 目录,**镜像** `packages/cli/src/commands/loops.ts` 的 `REAL_LOOPS_FS.listChanges` 逻辑而非跨包 import,对齐 server 零运行时依赖纪律;`phases` 直接透传 `loop.phases`)
  - `packages/server/src/loops.test.ts`
  - `packages/dashboard-app/src/api/client.ts`(`WbLoopRow` 类型镜像同步 `matched_changes`/`phases`)
  - `packages/dashboard-app/src/i18n/translations.ts` 【全轨热点,见第三节合并纪律】
  - `packages/dashboard-app/src/styles.ts` 【全轨热点】
- **server-cli-kernel 是否涉及**:是(`server/loops.ts` 小扩展,非独立数据面任务,因与 UI 强耦合)。
- **TDD 测试要求**:①`loops.test.ts`:`matched_changes` 精确等于 `openspec/changes/` 下 `startsWith(change_prefix)` 且排除 `archive` 的目录名;`change_prefix` 为 `null` 时 `matched_changes` 为空数组;`phases` 透传值与 yaml 一致。②`LoopCard.test.tsx`:空态渲染引导卡+复制按钮(断言 `navigator.clipboard.writeText` 调用参数含 prompt 文本);15 个字段徽章逐一断言(如 `goal`→`agent 生成`、`change_prefix`→`系统推导`、`status`→`人拍板`,精确对齐 UX 分析表 §2.1);关系条 root 徽章渲染 `LoopRow.root`;点击 `change_prefix` 展开弹层显示 `matched_changes` 列表(用真值,不随草稿输入实时重算——断言编辑草稿后弹层内容不变,保存后才刷新);`phases` chips 纯展示无点击语义。
- **验收判据(真机)**:一个已有 loop 的项目打开编排页,关系条显示正确的匹配 change 数;修改 `change_prefix` 草稿(不保存)时关系条数字不跳动;保存后关系条随新真值更新;空 loop 项目显示引导卡,复制按钮点击后剪贴板内容为 prompt 示例。

#### T8 · 独立凭证卡 SecretsCard

- **依赖**:T1(端点契约,可用文档冻结的响应形状先行开发+mock测试并行,真集成待 T1 合并);文件级依赖 T13(WorkbenchView.tsx 挂载点排在 C 轨全部完成、结构定型之后插入,避免与 C 轨大改同时踩)。
- **一句话目标**:新建独立「凭证」卡,挂在 `AutomationCard` 之后,掩码显示 + write-only(编辑时清空重填,绝不回填明文)+ per-runner 需要哪些键的说明 + env 优先级提示,保存/删除成功后触发一次 T4 readiness 端点重新拉取。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/SecretsCard.tsx`(新建)
  - `packages/dashboard-app/src/workbench/SecretsCard.test.tsx`(新建)
  - `packages/dashboard-app/src/api/client.ts`(新增 `fetchSecrets`/`postSecret`/`deleteSecret` fetch helper)【热点,见第三节】
  - `packages/dashboard-app/src/workbench/WorkbenchView.tsx`(一行挂载:`<AutomationCard root={root} />` 之后插 `<SecretsCard root={root} />`)【热点,C 轨结束后落地】
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts` 【全轨热点】
- **server-cli-kernel 是否涉及**:否(纯前端消费 T1 端点)。
- **TDD 测试要求**:①掩码只读态渲染 `masked` 值,点击「更新」后输入框为空(不回填明文,断言 `value===''`);②提交成功后变回只读态且值为新 masked;③per-runner 说明区渲染 `CLAUDE_CODE_OAUTH_TOKEN`(claude-code)与 `OPENAI_API_KEY`+`CODEX_HOME`(codex,后者标只读探测态,无编辑入口——对齐决策 C2b);④保存/删除成功回调触发 readiness 重拉(mock fetch 调用次数断言,**不引入 setInterval 轮询**,显式动作触发,呼应 G22 教训不重蹈轮询覆辙);⑤env 优先级提示文案渲染。
- **验收判据(真机)**:真填一个测试 token 保存后卡片显示掩码;不刷新页面切到 AutomationCard 或 T4 readiness 展示区,凭证灯从红/黄变绿(联动生效);删除后灯变回未配置态。

#### T9 · AutomationCard 镜像 datalist 下拉 + 就绪三灯

- **依赖**:T3(镜像列表)、T4(就绪三灯)。
- **一句话目标**:现有镜像纯文本框 `AutomationCard.tsx:180-194` 加 `list`/`<datalist>` 属性消费 `GET /api/docker/images`(`available:false` 时优雅降级回今天的纯文本框,零视觉/行为差异);卡内新增就绪三灯区消费 `GET /api/afk/readiness`。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/AutomationCard.tsx`(不新建文件,不碰 `WorkbenchView.tsx`,卡片已挂载)
  - `packages/dashboard-app/src/workbench/AutomationCard.test.tsx`
  - `packages/dashboard-app/src/api/client.ts`(新增 `fetchDockerImages`/`fetchAfkReadiness`)【热点】
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts`(三灯颜色**必须** `color-mix` 派生,禁硬编码新原色,对齐决议 #9 与既有 `progress.md busy` 黄先例)【全轨热点】
- **server-cli-kernel 是否涉及**:否。
- **TDD 测试要求**:①`GET /api/docker/images` 返回 `available:true` 时 `<datalist>` 渲染选项,`available:false` 时不渲染 `<datalist>`(输入框行为不变,断言原有 `IMAGE_RE` 校验逻辑测试全绿无回归);②请求失败(网络错误/404)时卡片其余部分正常渲染,不阻塞;③三灯分别断言 docker/镜像/凭证三态颜色类名(真值渲染,不做视觉像素级断言,交真机);④镜像缺失时展示 `build_hint` 命令 + 复制按钮。
- **验收判据(真机)**:本机装了 docker 时下拉列出真实镜像;手输一个未来要用的 tag 名不被下拉限制拦截(原生 datalist 语义);三灯与 T4 端点数据一致;点击复制 `build_hint` 后剪贴板内容为 `bash tools/sandcastle/build.sh`。

#### T10 · SkillChain 未安装 badge + manifest 缺失黄条

- **依赖**:T6(数据契约)、T12(StepEditor.tsx 结构在 C 轨瘦身后定型,本任务在其基础上挂载,避免与 T12 同时改同一文件)。
- **一句话目标**:`SkillChain.tsx` 的 `chip()`(现 `:356-365`附近)与候选面板列表(`:424` 起)对 `installed===false` 的技能加淡纹 badge + hover/点击复制 `installCmd`;`SkillTransferModal.tsx` 穿梭框两侧同款处理;新增顶部黄条组件,挂载点在 T12 瘦身后的 StepEditor.tsx 技能分区头部(当前 phase×track 对应 `mandatory_skills` 任一 token 的全部备选均不在 installed 集合时显示)。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/SkillChain.tsx`(现 487 行:`chip()` 加 badge、候选面板列表加 badge、新增 `MandatorySkillsBanner` 子组件或独立文件)
  - `packages/dashboard-app/src/workbench/SkillTransferModal.tsx`(现 164 行:穿梭框两侧列表加 badge)
  - `packages/dashboard-app/src/workbench/data.ts`(现 43 行:`MANDATORY_SKILLS` 兜底数据类型对齐,可选不含 installed 信息)
  - `packages/dashboard-app/src/workbench/StepEditor.tsx`(黄条挂载点,插入技能分区头部)
  - `packages/dashboard-app/src/workbench/SkillChain.test.tsx` / `SkillTransferModal.test.tsx` / `StepEditor.test.tsx`
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts`(badge/黄条颜色 color-mix 派生)【全轨热点】
- **server-cli-kernel 是否涉及**:否。
- **TDD 测试要求**:①`chip()` 对 `installed:false` 技能渲染 `wb-chip--uninstalled` 类 + badge 文案,`title` 含 `installCmd`;②点击 badge 复制 `installCmd` 到剪贴板;③候选面板未安装技能同款视觉区分,断言用户仍可选中(不做代码级拦截,呼应「gate 硬拦不做」的登记);④黄条:构造 `mandatory_skills` 全部备选未装的 fixture,断言黄条渲染;全部或部分已装时不渲染;⑤`GET /api/config` 失败回落静态镜像(`data.ts`)时黄条不渲染(不含 installed 信息,不可判定,保守不显示)。
- **验收判据(真机)**:本机已知 `pipeline-lite` 插件未装,打开自定义 workflow 技能编辑面,`pipeline-*` 系技能候选显示未安装 badge;default workflow 技能矩阵若某阶段×轨道强制技能全部未装,顶部出现黄条,文案含可执行的安装命令。

---

### C 轨(编排页重构:Demo1-A,最大最容易互踩,内部严格串行/单 agent 包干)

> `StepperRail.tsx`/`WorkbenchView.tsx`/`HookTimeline.tsx` 三文件簇本轮被 T11/T12/T13 反复触碰,**必须**按 T11→T12→T13 顺序串行完成(单 agent 全程包干,或强制不并行),不得拆给不同 agent 同时开工——对齐用户编排纪律「同文件先拆片段再并行」与 v5 Wave 2 T3/T5 串行先例。

#### T11 · StepperRail → 流程带(门徽章 + hook 拦截点 + 真实计数/运行脉冲)

- **依赖**:无(C 轨首棒)。基线注意:「+ 添加阶段」Dialog 交互(`15d1c30`)已落地,本任务重写渲染层时**保留**该交互,不倒退回禁用占位。
- **一句话目标**:`StepperRail.tsx`(现 119 行)整体重写为大流程带组件,替换现有 `wb-step` 卡横排;新增门徽章 popover(hover/点击展示该阶段由哪个 hook 拦截,复用 T12 产出的 hook 元数据只读迷你版)+ 按当前 workflow 分组的真实 change 计数与 running 脉冲(数据来自当前 `/api/snapshot` 已加载的项目状态,前端按 `rulesKey(root, workflow)` 分组统计,不新增端点)。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/StepperRail.tsx`(整体重写)
  - **【热点:C 轨接力首棒】** `packages/dashboard-app/src/workbench/WorkbenchView.tsx`(现 816 行:挂载区适配新 `StepperRail` props,新增 stageCounts 纯函数——按当前选中 workflow 对 snapshot 里的 change 按 `phase` 分桶计数)
  - `packages/dashboard-app/src/workbench/StepperRail.test.tsx`
  - `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx`
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts`(门徽章/计数脉冲颜色 color-mix 派生)【全轨热点】
- **server-cli-kernel 是否涉及**:否(复用已有 `/api/snapshot`,不新增聚合端点——见风险节 YAGNI 说明)。
- **TDD 测试要求**:①流程带节点数 = 当前 workflow steps 数(default/自定义两态);②gate 阶段节点带门徽章,点击/hover 展开 popover 显示拦截该阶段的 hook 名(强制常开 `gate`/`interactive-skill-gate` 恒显示,对齐决议 #2);③计数气泡精确等于该阶段真实 change 数(fixture 断言,非动画数字);④running 脉冲仅在该阶段存在 `automation==='running'` 的 change 时显示;⑤「+ 添加阶段」Dialog 交互回归全绿(不倒退)。
- **验收判据(真机)**:打开一个有多个 change 分布在不同阶段的项目,流程带每节点显示正确计数;有 change 正在 AFK 执行中的阶段显示脉冲动效;点击门徽章弹出该阶段的 hook 拦截说明。

#### T12 · 编辑区瘦身 + Hook 时序线挪右栏

- **依赖**:T11(C 轨第二棒)。
- **一句话目标**:`StepEditor.tsx` 保留 per-stage 分区(基本/技能/产出物);Hook 全局时序线(现 slot 注入 `StepEditor.tsx:157`)整体挪到右栏,新增只读迷你版(供 T11 门徽章 popover 复用)+ 安全门说明卡 + manifest 技能矩阵入口卡;`HookTimeline.tsx` 拆出只读迷你渲染函数(复用其 `LOCKED_IDS`/`configurable` 三态判断,不重写判断逻辑)。
- **涉及文件**:
  - `packages/dashboard-app/src/workbench/StepEditor.tsx`(移除 Hook 分区 slot,保留基本/技能/产出物三分区)
  - `packages/dashboard-app/src/workbench/HookTimeline.tsx`(现 201 行:拆出 `HookTimelineMini`(只读,供 T11 popover 用)与既有可编辑版并存,共享 `LOCKED_IDS` 常量与矩阵读取 hook)
  - **【热点:C 轨接力第二棒】** `packages/dashboard-app/src/workbench/WorkbenchView.tsx`(右栏新增「钩子时序(全局)」「安全门说明」「manifest 技能矩阵」三张卡,布局参照 Demo1-A `wsa-side` 结构)
  - `packages/dashboard-app/src/workbench/StepEditor.test.tsx`
  - `packages/dashboard-app/src/workbench/HookTimeline.test.tsx`
  - `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx`
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts` 【全轨热点】
- **server-cli-kernel 是否涉及**:否(纯前端重排,复用 T5(v5 轮已交付)的 `GET/POST /api/hooks`)。
- **TDD 测试要求**:①`StepEditor.test.tsx` 回归:基本/产出物分区断言全绿,Hook 相关断言迁移到 `WorkbenchView.test.tsx` 或 `HookTimeline.test.tsx`(意图迁移表登记,不静默删除断言);②右栏 Hook 时序线仍可编辑(开关写回 `/api/hooks`,乐观更新+回滚逻辑不变,复用既有 `useHooksConfig`);③强制常开两项(`gate`/`interactive-skill-gate`)在新位置**仍**渲染锁定态(决议 #2 红线回归断言);④manifest 矩阵入口卡点击跳转/展开(复用既有 `SkillTransferModal` 或穿梭框入口,不重造)。
- **验收判据(真机)**:点开任意阶段卡,编辑区只剩基本/技能/产出物三块;右栏出现钩子时序卡且开关真实生效(关掉一个 hook 后该 hook 脚本短路,复用 v5 T5 已验证的生效路径);安全门两项开关不可点击且有说明文案。

#### T13 · 预演退役 → 「最近流转」真实回放

- **依赖**:T12(C 轨末棒)。
- **一句话目标**:删除 `WorkbenchView.tsx` 假动画预演整段(GSAP 逐节点点亮 + gate 停顿示意,现约 `toggleRehearsal`/`stopRehearsal`/`wb-pv-track` 一带,原 v5 地图记录 `:285-350`+`:595-633` 共约 110 行,本轮因「添加阶段」功能插入已漂移,以当前代码 `toggleRehearsal`(约 `:386` 起)与 `wb-pv-track` JSX(约 `:693` 起)为准);右栏新增「最近流转」卡,展示当前项目/workflow 分组内变更事件的真实时间线回放。
- **涉及文件**:
  - **【热点:C 轨接力末棒】** `packages/dashboard-app/src/workbench/WorkbenchView.tsx`(删除预演控制状态/refs/JSX,新增 `recentTransitions` 聚合函数)
  - `packages/dashboard-app/src/workbench/WorkbenchView.test.tsx`(删除预演相关断言并登记意图迁移表:reduced-motion 直达终态类断言 → 若「最近流转」本身无循环动画则该类断言随假动画一并移除,登记原因)
  - `packages/dashboard-app/src/i18n/translations.ts` / `styles.ts` 【全轨热点】
- **server-cli-kernel 是否涉及**:否——**数据源决策**:demo 落地清单在此处留了开放问题(「前端二次分组 `/api/snapshot` 还是新增聚合端点」)。本计划选**前端二次分组 + 复用既有单 change 端点**:对当前 workflow 分组内可见的 change(受决议 #11「<50 行规模,本轮不做虚拟化」约束,数量上界可控)逐个调用已有 `GET /api/change/:name/history`(`api/client.ts:364` `getHistory`,G20/G21 已闭合的现成端点),前端合并多个 change 的事件按 `ts` 降序取最近 N 条渲染,**不新增聚合端点**——理由:避免为一个展示型回放卡新造持久化契约,复用现有只读端点符合「不发明新范围」纪律;若未来量级超出 <50 行假设,再评估新增聚合端点(登记见风险节)。
- **TDD 测试要求**:①假动画相关状态/DOM/测试全部移除,`npm run typecheck:web` 无残留引用;②「最近流转」卡对多个 change 的 history 事件正确合并排序(fixture:2 个 change 各含 2 条历史,断言输出按 ts 降序交错);③老 change(legacy,无 jsonl 记录)显示「早期记录不可用」(决议 #10 回归断言,不臆造历史);④archived change 不出现在回放里(决议 #5 回归断言);⑤空项目(无历史事件)显示空态文案,不报错。
- **验收判据(真机)**:一个有多次转换记录的项目打开编排页右栏,「最近流转」显示真实事件时间线(阶段名+时间戳),与该项目 `.pipeline-history.jsonl` 文件内容一致;预演按钮/GSAP 循环动画在页面上完全消失;`npm run build:web` 后 bundle 体积因假动画代码移除而下降(记录数字,非硬性判据)。

---

## 三、波次编排

按文件边界与功能依赖分 4 波,每波末执行三连门:`npm test` + `npm run test:web` + `npm run typecheck:web`,并追加 `npm run build`(kernel/server/cli/automation)+ `npm run build:web`(dashboard-app)——本轮 v5 遗留教训「stale dist 假红」(v5 lesson 1)要求**先 build 再测**,尤其 T2 依赖 T1 的 kernel 导出、T9/T10 依赖 T3/T4/T6 的 server 端点响应形状。

| 波次 | 任务 | 并行/串行说明 |
|---|---|---|
| **Wave 1** | T1 ∥ T5 ∥ T7 ∥ T11 | 四路真并行:T1(server.ts 接力链首棒,同波内先完成)、T5(hooks/,全程独立)、T7(server/loops.ts + LoopCard.tsx,与其余三者均不同文件)、T11(C 轨首棒,StepperRail.tsx + WorkbenchView.tsx,与 T1/T5/T7 均不同文件)。 |
| **Wave 2** | T6(排 T1 之后)∥ T2(依赖 T1 完成)∥ T12(依赖 T11 完成) | T6 是 server.ts 接力链第 2 棒,必须等 Wave1 的 T1 合并入 server.ts 后再动笔(同文件避免冲突,同 v5 T3→T5 先例);T2 功能依赖 T1 的 kernel 导出,但改动文件(automation/cli)与 T6 不重叠,可并行;T12 是 C 轨第二棒,依赖 T11 完成。 |
| **Wave 3** | T3(排 T6 之后)∥ T10(依赖 T6+T12)∥ T13(依赖 T12) | T3 是 server.ts 接力链第 3 棒,排 T6 之后;T10 需要 T6 的数据契约与 T12 定型后的 StepEditor.tsx 结构,两者本波均已完成;T13 是 C 轨末棒,依赖 T12。 |
| **Wave 4** | T4(排 T3 之后)∥ T9(依赖 T3+T4)∥ T8(依赖 T1 契约 + T13 完成) | T4 是 server.ts 接力链第 4 棒(末棒),排 T3 之后;T9 消费 T3+T4 端点,本波内两者均已就绪;T8 需要 WorkbenchView.tsx 在 C 轨(T11-T13)全部稳定后再插入一行挂载,排在 T13 之后。 |

**全轨热点文件合并纪律**(在上述文件级依赖之外,额外要求追加式合并):

- `packages/dashboard-app/src/i18n/translations.ts`、`packages/dashboard-app/src/styles.ts`:被 T7/T8/T9/T10/T11/T12/T13 七个 UI 任务同时追加新 key/新 CSS 区块。纪律:**各任务只在文件尾新增独立区块,不改动其他任务的既有行**,每任务独立 commit;波末合并冲突预期为纯 append-append 冲突,人工按「双保留」拼接(不取一方丢一方),对齐 v5 lesson 3(`styles.ts` 三次追加冲突的教训)。
- `packages/dashboard-app/src/api/client.ts`:被 T7(WbLoopRow 镜像)/T8(secrets fetch)/T9(docker-images+readiness fetch)/T10(skills registry 类型)四个任务追加新导出函数。纪律同上,各自新增独立具名导出,不修改既有函数签名(除 T6 引发的 `SkillEntry[]` 破坏性类型升级,由 T6 与 T10 协调一次性改完,不留旧类型分支)。
- `packages/server/src/server.ts`:被 T1/T3/T4/T6 四个 A 轨任务追加新路由分支。纪律:严格按 T1→T6→T3→T4 顺序接力(即本节波次表的排序),每任务新增路由后立即合并,不允许两个任务同时持有未合并的 server.ts 改动。
- `packages/dashboard-app/src/workbench/WorkbenchView.tsx`:C 轨 T11→T12→T13 内部结构性改动 + T8 的一行挂载。纪律:T8 严格排在 T13 完成之后,不与 C 轨任何一棒同时改该文件。

**worktree 隔离与软链纪律**:引用 `docs/superpowers/plans/2026-07-11-v5-interaction-rebuild.md:45` 与 v5 lesson 2/7/14 原文——每任务独立 git worktree;`git add .` 前先 `git rm --cached` 检查 `node_modules` symlink 与 `.claude/settings.local.json`(本仓 `.gitignore` 不含 `node_modules`,worktree 场景曾误入库);逐文件 `add`,禁 `git add -A`;收口前控制字符兜底扫描(`find packages docs -name "*.ts*" -o -name "*.md" | xargs file | grep -v text`);消费 `rulesKey()` 类字符串键一律走函数,禁手拼分隔符。执行前建议先处理第零节提到的未跟踪 `afk.test.ts` 草稿文件(确认去留),避免 worktree 复制带入无关改动。

---

## 四、红线复述(逐条标注对本轮任务的约束)

| 决议/纪律 | 内容摘要 | 对本轮任务的约束 |
|---|---|---|
| 决议 #1 | `@xyflow/react` 已彻底移除,不得重新引入画布库 | T11/T12/T13:流程带/依赖链可视化继续用 flex+内联 SVG/字符箭头,不引入任何画布库 |
| 决议 #2 | Hook 配置 fail-open;`gate.sh`/`interactive-skill-gate` **强制常开**,UI 呈锁定态 | T12:Hook 时序线挪右栏时 `LOCKED_IDS` 锁定态必须回归断言,不可因「瘦身」误开放;T5:session-start.sh 不得改动 hook 判断逻辑本身 |
| 决议 #3 | Loop 口径终审裁减:健康度/台账/漂移/**模板新建全不做** | T7:关系条是「数据关系澄清」不是「健康度评分」,不得画健康度环/成功率角标;字段生产者徽章是纯前端静态分类,不得演变成模板选择器(呼应 Demo2-C 冲突登记) |
| 决议 #4 | 「放弃」动作 CAS 语义,failed/conflict→off,**现场保留** | T7:Loop 卡「批准/驳回」走 `POST /api/loops/update` 的 `status` PATCH,与既有 `POST /api/afk/:name/dismiss` 是两套不同语义,文案不得混用「放弃」措辞造成误解 |
| 决议 #5 | archive 排除进度与收件箱 | T13:「最近流转」回放排除 archived change |
| 决议 #6 | SettingsView 技能矩阵/穿梭框已并入工作台;AdvancedPanel 暂留无导航 | T10:`SkillTransferModal` 已是并入产物,本轮只加 badge,不改归属 |
| 决议 #7 | 注册 UI 入口已删,`POST /api/projects` 端点保留兼容 | T7:空态「去终端」引导延续「不新增注册表单」纪律,不得反悔加注册入口 |
| 决议 #8 | 仅用户可见文案「相位→阶段」;`phase` 代码标识符不动 | T7/T8/T9/T10/T11/T12/T13 全部新增文案统一用「阶段」;不得新造「相位」措辞;不改 `phase` 字段名/testid |
| 决议 #9 | 健康灯/busy 黄从既有 token `color-mix` 派生,禁硬编码新原色 | T9(三灯)/T10(未安装 badge+黄条)/T11(门徽章/计数脉冲颜色):新色值一律 `color-mix` 派生,复用 `progress.md` busy 黄先例(proposal 决议冲突登记表已列此条) |
| 决议 #10 | history legacy 只读 jsonl,老 change 显示「早期记录不可用」 | T13:「最近流转」回放遇 legacy change 时如实显示不可用,不臆造历史 |
| 决议 #11 | 进度虚拟化本轮不做(<50 行现实规模) | T13:多 change history 合并回放的 N+1 端点调用在此量级下可接受,不做分页/虚拟化;若量级突破需重估(见风险节) |
| 决议 #12 | allowlist/denylist 已真实生效(结算时 `git diff --name-only` 判 conflict) | T7:`denylist` 字段文案须准确反映「真硬消费」,不得暗示「仅存储」;`allowlist` 如实标注「预留字段,当前无运行时效果」 |
| 决议 #13 | 四动作 props 化下放宿主,demo v5 唯一口径 | T7:「批准/驳回」是 loop 审阅面的**新**动作语义,不是四动作模型第五种;不得复用 `TaskDetail` 共享组件的四动作 actions 插槽,避免语义混淆(proposal C.5 已隐含此边界) |
| 决议 #14 | runner 下拉 UI 已补挂;`LOOP_RUNNERS` 软校验为 backlog | T7:审阅面 `runner` 字段沿用现有下拉,demo2-A 展示的「`cron` 非标准值不拦不改」按现状渲染即可,**不**在本轮顺手实现决议 #14① 的 enum 软校验(仍为 backlog,见范围外登记) |
| 能力面模型基线 | 前端只读看进度;人的动作只有继续/打回/重试/终止+放弃;收件箱只收能拍板的事 | T7:「批准/驳回」是把该基线**延伸**到配置面(UX 分析文档核心论点),本质仍是「审阅拍板」而非「生产内容」;T8 凭证卡的保存/删除是设置类 CRUD,不属于该基线约束的 change 生命周期动作 |
| 推送红线 | 未经用户「推」,不 push origin/main | 全部 13 个任务的执行纪律,波末不自动 push |
| 凭证红线 | key 绝不落仓库内文件;凭证值不进日志 | T1:存储位置 `~/.claude/`(机器级,非 `.pipeline/`);T2:hostEnv 合并后任何日志输出不得带凭证值;T8:UI write-only,绝不回填明文 |

---

## 五、范围外登记(YAGNI)

| 项目 | 为什么不做 | 重开条件 |
|---|---|---|
| CLI `pipeline loop init` 向导 | 需要新 CLI 命令 + 「agent 写草稿→dashboard 读草稿→人审阅」的新持久化协议(如 `.pipeline/loops.draft.yaml`),UX 分析文档 §6.2 明确标注这是「下一步独立任务」,本轮机制设计不落地 | 出现「完全不用终端、只靠 dashboard」的用户角色(如 PM/运维)时,按 UX 分析文档 §6.2 与 Demo2-B(向导+推导)方向补齐 |
| `pipeline doctor` 扩展(`afk:docker`/`afk:image`/`afk:credential-*` check id) | UX 分析文档 §6.1 建议但 proposal 决策 D 的 `session-start.sh` 方案改为指向 dashboard 而非 `pipeline doctor`(见第六节输入矛盾);为避免终端提示指向两个不同真相源造成口径漂移,本轮 `session-start.sh`(T5)只指向 dashboard,不扩展 doctor.ts | 出现不依赖 dashboard 的纯终端诊断需求(如无浏览器的 CI/远程场景)时,按 UX 分析文档 §4.2 补齐 doctor.ts 的 afk:* 四个 check id |
| gate 层硬拦(A1,manifest mandatory_skills 缺失时阶段出口硬阻断) | 三选一接入点(`pipeline check`/`hooks/gate.sh`/仅 `pipeline doctor`)未拍板,工作量独立于本轮「标注型 UI」;第 1 点拍板已明确「gate 层硬拦不做」 | 用户看过本轮「未安装 badge+黄条」的纯提示效果后,仍要求代码级拦截时,先拍板接入点三选一 |
| Demo1-B(双层门架)/Demo1-C(检查站泳道) | 用户已拍板方案 A,B/C 是对比方案,不落地 | 方案 A 真机验收后用户对「一览优先,单任务追踪弱」的取舍不满意,要求换检查站泳道的 token 流动式呈现 |
| Demo2-B(向导+推导) | 是方案 A 的兜底路径(UX 分析文档 §5:「与 Demo2-A 并非互斥」),本轮不做独立向导 UI | 出现「完全不用终端」的用户角色需求(同 loop init 向导条件) |
| Demo2-C(模板+微调) | **直接冲突决议 #3**「模板新建全不做」,proposal 决策速览已标注需重开决议才可讨论 | 用户显式重开决议 #3 |
| `ANTHROPIC_API_KEY` 加入凭证白名单 | 全链零消费者(proposal C.1 已验证 grep 零命中),加了是摆设字段,违反「每个设置都真实起效」纪律 | 确认「跳过 OAuth、直接用 API key 认证 claude-code」是真实需求时,须与 `tools/sandcastle/pipeline-afk-run.sh:66` 判断分支**同一实现批次**补齐,不分两轮 |
| macOS Keychain 作为凭证存储后端 | proposal C.2 登记为可选增强,非本轮;文件方案(T1)先覆盖全平台,Keychain 会引入「先查 Keychain 再查文件」的双源优先级复杂度 | 用户对「密钥明文 JSON 落盘(即便 0600)」的安全姿态不满意,且能接受 Linux/CI 环境的兜底复杂度 |
| loops.yaml schema 必填面松绑(如 `phases` `minItems:2`) | proposal 开篇范围声明明确排除,涉及 kernel `validate.ts`/`registry.ts` 字段级校验且需评估既有 `loops.yaml` 文件兼容性 | T7 上线后仍有用户反馈「必须填 ≥2 个 phases」体验差,且完成向后兼容评估 |

---

## 六、风险与未决

- **G24(P2,cancel 竞态窗口)与本轮交界**:T2 改动 `cli/commands/afk.ts` 的 `run` 分支与 `createDockerRunChange` 参数传递,不触碰 `scheduler.ts` claim 时序或 `afk.ts:238` cancel 路径本身,但 hostEnv 合并的「run 启动时读一次」语义需要在 retry 场景下确认稳定(scheduler 失败重试是否会重新合并 hostEnv、读到的 secrets 状态是否可能与首次不同)——T2 验收时补一条 retry 场景断言,不修 G24 本身。
- **G22(AFK 日志轮询非 SSE,维持登记)与本轮交界**:T4 就绪三灯与 T8 凭证卡**不得**引入新的 `setInterval` 轮询——保存物/删除等显式动作触发一次重新拉取即可,避免制造第二个「轮询是否够用」争议;T4/T8 任务书已写明此约束。
- **自定义 workflow 进度页显示 step id 非 label(观察项,登记不修)**:`packages/dashboard-app/src/progress/ProgressView.tsx:112-115` `stepLabel()` 函数注释明确「自定义步 id 原样(rules 不携带 label)」——`ProgressRules` 投影不携带 `step.label`,自定义 workflow 的箭头带显示原始 id 而非用户设置的中文名。本轮任务均不涉及 `ProgressRules` 投影结构,不在本计划范围内修复;若要修,需要 server 端 rules 投影扩展携带 label,超出本轮范围,登记供下一轮评估。
- **T13 的「最近流转」N+1 端点调用量级依赖决议 #11**:若某项目远超 <50 change 的现实规模假设,前端逐 change 调 `GET /api/change/:name/history` 合并排序的性能会退化;本轮按现状规模判定可接受,量级突破时需评估新增聚合端点(而非继续放大 N+1)。
- **T6 的插件命名空间前缀匹配是精度妥协**:`superpowers:*` 系 token 只要装了 `superpowers@*` 系插件即全部判 installed,不校验具体某技能是否真的在该插件包版本内;若插件后续版本移除/改名某技能,会被误判「已装」。本轮判定可接受(badge 是标注不是判据),需要精确匹配时按研究报告 §5 第二个开放问题的「精确匹配」方案重做。
- **未跟踪的 `packages/cli/src/commands/afk.test.ts` 草稿文件**:第零节已记录,执行前建议确认去留,避免被后续 worktree 操作误覆盖或误判为本轮任务产出。

---

## 附:输入间矛盾登记(供执行前确认,不阻塞开工)

1. **`session-start.sh` 首跑提示的指向不一致**:`docs/ux/2026-07-11-config-experience-analysis.md:165` (§4.2) 建议 `session-start.sh` 提示文案指向「跑 `pipeline doctor` 查看」(隐含 doctor.ts 需同步扩展 afk:* 四个 check);而 `docs/proposals/2026-07-11-loop-relations-afk-credentials.md` 决策 D 与 §D.2(:293-301)只规范 `session-start.sh` 本身「保持轻量静态提示」,只字未提 `pipeline doctor` 扩展,且全文档未设计 doctor.ts 的任何改动。本计划按「11 项决策全按推荐落任务」的指令优先级,**采用 proposal 的方案**:T5 的提示文案指向 dashboard(而非 `pipeline doctor`),`pipeline doctor` 扩展整体登记进第五节 YAGNI。
2. **`GET /api/secrets` 鉴权要求的文内前后不一致**:`docs/proposals/2026-07-11-loop-relations-afk-credentials.md` §C.3 开篇写「三个端点全走既有 Host + token + JSON 三道纵深」,但紧随其后的「决策点 C.3」小节与开篇的「决策速览」表(:23)都明确推荐 `GET /api/secrets` **不要求 token**、只加 Host 校验。本计划以「决策速览」表 + 「决策点 C.3」小节(更具体、更晚出现、且是该文档唯一的显式判断分析)为准,T1 的 `GET /api/secrets` 不要求 Bearer token,`POST`/`DELETE` 仍走完整三道纵深。
