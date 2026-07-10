# 计划:2026-07-11 v5 交互重建(demo 定稿 → 真实现)

> 交互真相源:`design-demos/v5-progress-workbench.html`(六轮用户验收定稿)。视觉真相源仍为 v4(token 不变)。
> 授权:用户 /loop 指令「后续不用再问我,自动执行拆分任务,全部执行完成后交付」。
> 交付门槛(用户原话拆解):①每个前端功能可点击且功能正常;②每一个设置都真实起效果;③真机跑通一条完整 pipeline workflow + 一条 AFK pipeline;④工作流编排所有设置起作用;⑤测试完整(TDD 三连门);⑥Claude 与 codex 双 runner 完整支持。
> 推送红线不变:未经用户「推」,不 push origin/main。

## 决议登记(open questions 拍板,依据=用户已确立原则)

| # | 问题 | 决议 |
|---|---|---|
| 1 | @xyflow/react 去留 | 彻底移除(含 WorkflowCanvas/StepDetailPanel/layout.ts),T18 执行 |
| 2 | Hook 配置存储 | `.pipeline/hooks.json` per-root,阶段×hook 开关矩阵;缺省全启用(fail-open);gate.sh 交互门与 internal-skill-gate 安全门**强制常开**,UI 呈锁定态 |
| 3 | Loop 口径 | 按终审裁减:编排页内「自动运行」卡,健康度/台账/漂移/模板新建全不做;多 loop 用卡头小下拉选中(单 loop 隐藏) |
| 4 | 「放弃」动作 | 新增 POST /api/afk/:name/dismiss:failed/conflict → off(退出自动化,现场保留),CAS 语义对齐 retry |
| 5 | archive 去留 | 进度与收件箱一律排除 archived;分组头计数尾缀「· N 已归档」纯文本 |
| 6 | SettingsView 能力去向 | 技能矩阵/穿梭框并入工作台(T14);AdvancedPanel/TrafficPanel 暂留 advanced/ 不挂导航 |
| 7 | POST /api/projects 与聚合/注销 | 端点保留(兼容+测试);「全部项目」聚合保留;项目注销保留切换器 hover 态;注册 UI 入口删 |
| 8 | 改词口径 | 仅用户可见文案「相位→阶段」;testid/CSS 类/代码标识符(phase)不动 |
| 9 | 健康灯 | /api/afk/snapshot 现有聚合够用;busy 黄从既有 token 派生,不引入新原色 |
| 10 | history legacy | 只读 .pipeline-history.jsonl;老 change 时间线显示「早期记录不可用」 |
| 11 | 进度虚拟化 | 本轮不做(<50 行现实规模) |
| 12 | allowlist/denylist 语义 | 路径 glob;存储+展示(T3/T16)之外,**真实生效**:run 结算时 git diff --name-only 对 denylist 匹配,违规判 conflict 保留现场(并入 T4 验收) |
| 13 | T8 动作条归属(评审登记) | 四动作(继续/打回/重试/终止+放弃)**props 化下放宿主**:TaskDetail 只留 automation 感知的 foot 标签与 actions 插槽,端点调用/busy 守卫/二次确认归 T9(收件箱)与 T11(进度)各自实现——组件零业务端点;两宿主动作文案与语义以 demo v5 prg-dfoot/收件箱右卡动作条为唯一口径,T9/T11 验收各自钉住,防两处漂移 |
| 14 | T20 runner 下拉 UI 侧归属(评审登记) | T20 worktree 只交付数据面(kernel `LOOP_RUNNERS` 双选项清单、`PATCHABLE_SCALAR_FIELDS`+runner、server LoopRow.runner 回显、POST /api/loops/update 可写 runner);编排页「自动运行」卡 runner 下拉因同文件互斥(LoopCard.tsx 属 T16 worktree,且 T16 参数清单不含 runner)**不随 T20 落地——归 Wave 5 收口批:T17 用现成的 row.runner + LOOP_RUNNERS 双选项 + POST /api/loops/update 在 LoopCard 补挂下拉(预估小改),T19 验收补钉 T20 验收项「UI 下拉双选项」单测+真机点击断言**。同批周知(评审 low,均登记不改码):①update 端点 runner 仍收自由字符串(schema 不收紧 enum,兼容历史 `cron`/`cron-session`),写端点对新写值做 LOOP_RUNNERS 软校验(warning 不拒绝)列为可选增强 backlog;②codex CLI 在但认证失效的子路径沿既有诚实分流口径(agent_exit 非零落 .sandcastle-build.agent.log,run 按确定性产物判 verify),报错可见度弱于 CLI 缺失路径(后者 exit 96 硬错落 automation_last_error),如需强化(agent_exit 非零同步落 automation_last_error)亦为 backlog |

## 新增任务(草案外,用户 /loop 新要求)

### T20 runner 双支持:codex 路径核验与补全
- **依赖**:T3
- **目标**:先探查现状(loops runner 枚举、automation 沙箱对 codex CLI 的调用路径、codex_review_result 既有链路),然后补全:loops.yaml `runner: codex` 合法且 automation 层能起 codex 无头会话;编排页「自动运行」卡 runner 下拉含 claude-code/codex 两项;codex 不可用环境下报错清晰(而非静默失败)。
- **验收**:单测:runner 枚举校验、codex 命令构造(mock 进程层)、UI 下拉双选项;真机:本机若有 codex CLI 则真跑一轮,否则验证报错路径与文案。npm test 全绿。
- **风险**:codex 集成深度未知,探查后若发现需要大改沙箱层,收缩为「配置层+调用层完整,执行层登记 backlog」并在交付报告明示。
- **收缩登记(评审后补,见决议#14)**:目标中「编排页 runner 下拉」与验收中「UI 下拉双选项」单测不随 T20 worktree 交付(同文件互斥:LoopCard.tsx 属 T16 worktree)——UI 侧归 T17 落地、T19 验收钉住;T20 已交付其全部数据面依赖,UI 补挂为纯小改。

## 执行编排(依赖图分波,同文件互斥)

- **Wave 1(5 路并行)**:T1(server/transition+history)∥ T2(kernel+cli)∥ T4(automation)∥ T6(dashboard model)∥ T12(dashboard 工作台骨架)
- **Wave 2(4 路并行)**:T3(server/loops,接 T1 后避 server.ts 冲突)∥ T5(server/hooksConfig+hooks/*.sh)∥ T7(model,接 T6)∥ T13(工作台编辑区,接 T12)
  - T3 与 T5 同波但 T3 改 loops.ts+server.ts 路由区、T5 新文件 hooksConfig.ts+server.ts 路由区——server.ts 冲突,**T5 排 T3 之后串行**(Wave 2 实为 3 并行 + 1 尾随)
- **Wave 3(4 路并行)**:T8(共享详情组件,接 T1/T7)∥ T10(进度骨架,接 T6)∥ T14(技能编辑,接 T13)∥ T15(Hook 时序线,接 T5/T12)
- **Wave 4(3 路并行)**:T9(收件箱,接 T7/T8)∥ T11(进度详情+动作,接 T4/T8/T10)∥ T16(Loop 卡,接 T3/T12)+ T20(接 T3,可与 T16 并行但避同文件——T20 主战场 automation/kernel,T16 主战场 dashboard,可并行)
- **Wave 5(串行)**:T17(IA 切换)→ T18(退役清理)→ T19(收口真机验收:含真实 workflow 全流程 + AFK 全流程 + 每功能点击级断言)

每任务纪律:TDD 先红后绿;`npm test` + `npm run test:web` + `npm run typecheck:web` 三连门;实现者+评审者双代理;台账写 `.superpowers/sdd/progress.md`(段名 `== PLAN: 2026-07-11-v5-interaction-rebuild`);commit 中文小步、逐文件 add(禁 git add -A);控制字符兜底扫描(收口前 `find packages docs -name "*.ts*" -o -name "*.md" | xargs file | grep -v text`);WorkflowCanvas.test.tsx 的 within() 陷阱、rulesKey 禁手拼 NUL 键等既有教训全部沿用。

## 任务明细(T1-T19 由分解草案定稿,T20 见上)
### T1 数据面:server transition 写 history(G20)+ change history 读端点(G21)

- **依赖**:无
- **目标**:补齐 POST /api/change/:name/transition 的 .pipeline-history.jsonl 记账(kernel createHistoryWriter 已有,server.ts:114 已实例化但 performTransition 不写),并新增 GET /api/change/:name/history 读端点,为详情卡阶段时间线提供数据。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/transition.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/server.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/server.test.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/state/history.ts(只读复用,不改)`
- **验收**:单测(根套件 hermetic):①转换成功后 changeDir/.pipeline-history.jsonl 追加一行 {kind:'transition',from,to,event,ts};转换被 guard 拒绝时不写。②GET 端点:无文件→200 [];有记录→按 ts 升序;非法 name→400、未注册 root→404(沿兄弟端点「两侧规范化再比较」模式)。npm test 全绿。
- **风险**:legacy opaqueTail 里的 transitions_history 是否合并读——建议本任务只读 jsonl,老数据留白;CLI 侧 recordHistory 已存在,注意两入口记录形状一致(对齐 fields.ts::recordHistory 的字段名)。

### T2 数据面:项目注册表写下沉 kernel + CLI init best-effort 自动登记(决策 D)

- **依赖**:无
- **目标**:在 kernel 新增 pipeline-projects.json 读写模块(注入 fs/homedir),CliDeps 注入、main.ts 装配、init.ts 成功后 best-effort 登记 repoRoot;server/registry.ts 改为复用 kernel 读实现。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/state/projectRegistry.ts(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/index.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/cli/src/deps.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/cli/src/main.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/cli/src/commands/init.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/cli/src/commands/init.test.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/registry.ts`
- **验收**:hermetic 单测(HOME/注入路径指向临时目录,绝不碰真实 ~/.claude):①init 成功后 registry JSON 含 resolve 后 root 且去重;②重复 init 不重复登记;③registry 损坏/目录不可写不阻断 init(exit 0,stderr 提示);④原子写(tmp+rename)。CLI integration 测试 + npm test 全绿。
- **风险**:best-effort 语义要钉死——任何注册表故障都不能让 init 失败;server 读逻辑替换须零行为变化(缺失/损坏/非数组→[])。

### T3 数据面:loops schema 扩 allowlist/denylist + loops.yaml 字段写端点(决策 F 前置)

- **依赖**:无
- **目标**:LoopEntry/schema 增 allowlist/denylist(可选字符串数组,默认[]);沿 setAutonomyLevelInYaml 的文本手术先例新增 kernel updateLoopInYaml(patch 既有 loop 的标量与字符串数组字段);server 新增 POST /api/loops/update。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/loops/types.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/loops/registry.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/kernel/src/loops/update.ts(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/loops.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/server.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/loops.test.ts`
- **验收**:单测:①patch cadence/max_runs_per_day/max_in_flight/max_tokens_per_day/on_exceed/goal/design_doc/change_prefix/risk/status/human_gates/kill_criteria/allowlist/denylist 后 loadRegistry 读回一致且无关行(含注释)不动;②autonomy_level 不收(仍走 /api/loops/level);③未注册 root→404、schema 校验失败→400、未知 loop id→400。npm test 全绿。
- **风险**:多字段 YAML 文本手术是本批数据面最大复杂点——限定「已存在 loop 的字段 patch」,不做新建/删除 loop(见 open question);并发写用读-判-写 CAS 对齐 afk retry 先例。

### T4 数据面:automation_current_phase 沙箱内阶段回写(决策 G)

- **依赖**:无
- **目标**:automation runner 检出沙箱日志中的 [TRANSITION] 行时把沙箱内当前阶段写入 change 的 automation_current_phase 字段(run 结束结算/清理),使进度详情能显示「沙箱内阶段:verify(host 阶段在 run 结束后结算)」。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/automation/src/lifecycle/lifecycle.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/automation/src/runner/(按现有 [TRANSITION] 日志产出点接线)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/automation/src/lifecycle/*.test.ts`
- **验收**:单测:①模拟日志含 [TRANSITION] name: a -> b 时 setStateField('automation_current_phase','b') 被调且只在值变化时写(限流);②run 完成/失败/取消路径均结算清理该字段;③snapshot fields 透传(server/snapshot.ts 已全量透传 fields,写断言钉住)。npm test 全绿。
- **风险**:与日志行格式强耦合——以 automation 现有 [TRANSITION] 输出为唯一判据并加测试钉格式;写盘频率与 SSE 指纹联动(每写一次都会推快照,注意别造成风暴)。

### T5 数据面:Hook 启用配置存储 + 读写端点 + hooks/*.sh 读取生效(决策 E 前置)

- **依赖**:无
- **目标**:为工作台 Hook 时序线提供真数据面:确定每 root 的 hook 启用配置存储(建议 .pipeline/hooks.json,阶段×hook 开关矩阵,缺省全启用),server 增 GET/POST /api/hooks,hooks/*.sh 开头读配置、被关闭的 hook 直接短路退出。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/server.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/server/src/hooksConfig.ts(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/hooks/gate.sh`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/hooks/skill-tracker.sh`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/hooks/router.sh`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/hooks/breadcrumb.sh`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/hooks/session-start.sh`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/tools/test-hooks.sh`
- **验收**:单测:端点读写 round-trip、缺文件→全默认启用、未注册 root 404;sh 侧 tools/test-hooks.sh 增用例:配置关掉的 hook exit 0 零副作用、配置缺失/损坏时行为与今天完全一致(fail-open 到启用)。npm test + test-hooks.sh 全绿。
- **风险**:全新数据面,开工前必须拍板存储位置/粒度/哪些 hook 允许关(gate.sh 这类安全门是否强制常开)——见 open_questions;sh 读 JSON 不可假定 jq,用 node -e 兜底;这是 19 个任务里最需要主会话先定方案的一个。

### T6 模型层:五态字典 + 项目×workflow 分组选择器(纯函数)

- **依赖**:无
- **目标**:新建 progressModel.ts:单 change 五态判定(等你确认/等 agent/执行中/排队/失败)、「等 agent 补产出」=gate 相位但 nonempty guard 不过、rulesKey(root,wf) 分组、状态计数、调度器健康灯聚合,供进度视图与收件箱共用同源谓词。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/model/progressModel.ts(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/model/progressModel.test.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/model/workflowModel.ts(rulesKey 复用,禁手拼 NUL 分隔键)`
- **验收**:test:web:①五态判定表驱动全覆盖(gate 可拍板/gate 缺产出→agent/automation running‖scheduled→执行中/queued+datalist→排队/failed→失败,含跑完停住归等你确认);②分组键与排序稳定、聚合(currentRoot='')与单项目双态;③计数与分组行数恒等的不变式断言。
- **风险**:判据必须与 T7 的收件箱准入共享谓词模块,否则「收件箱只收能拍板的」与「进度里等 agent」口径漂移;automation 态枚举以 afk.ts 真实字符串为准。

### T7 模型层:收件箱准入修订 selectInbox + 每阶段产物选择器 stageArtifacts(决策 B)

- **依赖**:T6
- **目标**:selectInbox 改「人现在能拍板」准入:gate 相位且证据/产出齐、或 gate 无自动证据、或 automation∈{paused,failed};缺产出的 gate 卡不进(判给进度「等 agent」)。evidence.ts 扩 stageArtifacts(rules,change):每阶段 outputs+实值+「未产出」pending 占位,喂时间线/阶段 sheet。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/inbox.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/inbox.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/evidence.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/evidence.test.ts`
- **验收**:单测/test:web:准入判据表驱动(证据齐进/缺产出不进/无自动证据进/failed·paused 进/archived 排除);stageArtifacts 对 default 与自定义 workflow 输出每阶段产物清单与 pending 占位(沿 T6 既有「未设占位统一 {key,value:'未产出',pending}」纪律);既有 evidence 8/8 判据测试意图迁移不静默删。
- **风险**:「证据/产出齐」的判定要同时吃 gateEvidence(DEFAULT_RULES 表驱动)与自定义 workflow 的 nonempty-output guard 两条路径——交叉场景(rules 缺失但路径字段非空)在上轮已知只被间接覆盖,本任务补钉。

### T8 共享组件:任务详情双形态(垂直时间线 dtl- + 阶段 sheet dt-tabs)+ history 区

- **依赖**:T1,T7
- **目标**:重写 ChangeDetailCard 为共享 TaskDetail:形态 A 垂直时间线(收件箱右栏,当前/失败阶段高亮框+产物 chip+拷贝);形态 B dt-tabs 阶段 sheet(进度行内展开);「在终端继续」命令区;动作条四动作(继续/打回/重试/终止+放弃)相位与 automation 感知;GSAP 阶段 stagger 入场+reduced-motion 直达终态;history 端点接入。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/ChangeDetailCard.tsx(重构或迁 shared/TaskDetail.tsx)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/ChangeDetailCard.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/api/client.ts(getHistory)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/motion.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/styles.ts(dt-/dtl- 区块)`
- **验收**:test:web:两形态按 stageArtifacts 渲染 7/3 阶段、缺产出 dt-field--miss 占位、data-copy chip 写剪贴板断言值、失败阶段 last_error/attempts/重试放弃说明、命令区文案与 transition 事件一致、history 区有记录时渲染;reduced-motion 用 gsap.matchMedia 断言直达终态。
- **风险**:既有 ChangeDetailCard 测试量大,必须列意图迁移表(旧断言→新断言)且 test:web 全绿;详情卡键盘契约在宿主(上轮 Task 7 登记),两个宿主(收件箱/进度)各自实现时防 Esc 双处理。

### T9 视图:收件箱 v5 重构(master-detail + 人话主文案)

- **依赖**:T7,T8
- **目标**:InboxView 改 master-detail(左列表+右栏 356 sticky 详情):行=名称/track/阶段 g-phase/语义 badge(✓可以放行·失败×N·等你判断)/人话 lead/证据 chips;j/k/Enter/Esc 键盘保留;动作接 transition 与 afk cancel/retry 端点;Esc 收起占位卡。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/InboxView.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/inbox/InboxView.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/styles.ts(ibx- 区块)`
- **验收**:test:web:①准入过滤后仅「能拍板」行渲染;②选中行右栏详情联动、j/k 移动+scrollIntoView、Enter 打开、Esc 收起(输入焦点旁路);③放行/打回走 transition、失败卡重试/放弃走 afk 端点且 busy 守卫;④聚合(全部项目)模式行带 root 且详情 root 正确(上轮 Task 9→11 教训:禁用 currentRoot 哨兵)。
- **风险**:既有 InboxView 测试的意图迁移量大;「放弃」端点映射未定(见 open_questions),先按 demo 文案挂禁用态或走既定端点由主会话定。

### T10 视图:进度骨架(分组卡 + chevron 箭头带 + 筛选条)

- **依赖**:T6
- **目标**:新建 ProgressView:Linear 式整组一张卡(项目×workflow 轻组头可折叠)、行内 chevron 铰接箭头带(past/cur/fail/fut 四态+未到达 gate 红点)、筛选条=项目下拉多选(空=全部)+五态计数 chips 单选、空态与底部说明、调度器健康灯。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/progress/ProgressView.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/progress/ProgressView.test.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/styles.ts(prg- 区块,busy 黄用 color-mix 派生禁硬编码色值)`
- **验收**:test:web:①分组头折叠/展开 aria-expanded;②项目多选与状态 chip 联动过滤、空组隐藏、全空显 prg-empty;③箭头带段数=workflow 步数、四态类名与 gate 红点断言、aria-label 含「第 N/M」;④健康灯文案聚合(N执行N排队N失败)。
- **风险**:clip-path 箭头带在 jsdom 只能断言类名不能断言视觉——真机验收(T18)补;行 grid 210/1fr/230 与长 workflow 名溢出用 demo 的 max-width+ellipsis 方案。

### T11 视图:进度行展开详情 + 动作接线 + AFK 融入 + GSAP 动效

- **依赖**:T4,T8,T10
- **目标**:点行展开阶段 sheet(复用 T8 形态 B):快捷钮(执行中→终止=cancel、失败→重试=retry+放弃)、实现阶段 tab 内日志尾部(复用 useAfkLog 轮询+follow 开关)、沙箱内阶段行(automation_current_phase);GSAP:箭头带入场 stagger、执行中段光泽 repeat:-1、失败段抖动,reduced-motion 全降级。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/progress/ProgressView.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/progress/ProgressView.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/afk/useAfkLog.ts(移位或跨目录复用)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/motion.ts`
- **验收**:test:web:①点行/Enter/Space 展开且按钮点击不触发展开;②终止仅 automation==='running' 可点(上轮 Task 7 cancel-gate 纪律)、重试仅 failed/conflict/paused、成功后 resync;③useAfkLog 轮询两拍内容变化断言、follow 开关;④沙箱内阶段行渲染 automation_current_phase;⑤gsap.matchMedia reduce 分支直达终态、光泽层无 GSAP 时透明。
- **风险**:光泽 repeat:-1 timeline 必须随行折叠/视图切换 kill(内存与 CPU);失败抖动 demo 未实现——按决策 C 补,沿 motion.ts 词汇 150-250ms。

### T12 视图:工作台骨架(线性 stepper + 右栏摘要/流程预览/GSAP 预演)

- **依赖**:无
- **目标**:新建 WorkbenchView(工作流编排 pane):workflow 下拉切换、stepper 阶段卡横排(序号/名称/gate 徽章/配置摘要 N技能·N钩子·N产出/技能 chips)、+添加阶段、右栏摘要卡(阶段/复核门/技能/钩子计数)+流程预览(按转换事件顺序,gate 红点)+▶预演(GSAP 逐节点点亮,reduced-motion 直达终态)。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/WorkbenchView.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/StepperRail.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/WorkbenchView.test.tsx(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/styles.ts(wb- 区块)`
- **验收**:test:web:①/api/workflows 数据渲染 stepper、卡摘要计数与 rules 一致;②点卡切换选中态与编辑区联动占位;③右栏摘要四行计数、流程预览节点序=steps 序且 gate 节点带红点;④预演按钮触发点亮序列(mock GSAP/reduce 断言终态)。过渡期与 WorkflowEditorView 并存,不动旧路由。
- **风险**:React 重写不搬 @xyflow 概念——layout.ts/画布坐标全不复用;数据读写仍走既有 /api/workflows 与 workflowModel(rulesKey 纪律),保存留 T13。

### T13 视图:工作台阶段编辑区(基本/产出物/guards 中文化/Inputs UI 移除)

- **依赖**:T12
- **目标**:阶段编辑卡:名称/只读 ID/复核门开关(人话说明「停在此阶段等人放行——出现在收件箱」);产出物 chips 增删 + 「产出非空方可推进」开关(=nonempty-output guard);guards/gate 全中文化;Inputs UI 不渲染(schema/serialize 保留兼容,保存不丢字段);脏守卫沿上轮 Task 15 四件套先例;保存走 POST /api/workflows/:name 且成功后 rules 缓存失效。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/StepEditor.tsx(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/WorkbenchView.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/model/workflowModel.ts(如需序列化辅助)`
- **验收**:test:web:①编辑名称/gate/outputs/nonempty 开关→保存 body 与 kernel serialize 形状一致、含 inputs 原样透传;②保存成功缓存失效+摘要联动刷新;③脏状态未保存 chip+切 workflow 确认 Dialog(经共享 Dialog);④default workflow 只读或拒改文案(server 端 400 已挡,前端预示)。
- **风险**:kernel validate 错误(循环依赖/未知字段)要原文上抛展示;非 dirty 保存钮 disabled(上轮 minor 收口项一并吃掉)。

### T14 视图:工作台技能编辑(依赖链可视化 + 添加面板)

- **依赖**:T13
- **目标**:技能区:依赖链可视化(chip→箭头→chip,拓扑序,PreToolUse 门真实拦截的人话说明)、移除×、添加面板(从 /api/skills/registry 选技能+依赖下拉),写回 step.skills[].depends_on。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/SkillChain.tsx(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/StepEditor.tsx`
- **验收**:test:web:①链渲染顺序=skillDag 拓扑序、无依赖并列显示;②添加面板列注册表技能、选依赖后 chip 入链;③循环依赖/未知技能保存被 kernel validate 拒并展示错误;④移除技能连带清空指向它的 depends_on。
- **风险**:依赖链可视化用 flex+箭头字符/内联 SVG(demo wb-chain 方案),不引画布;skillDag.ts 是唯一权威判定入口,前端不自造 DAG 逻辑。

### T15 视图:工作台 Hook 会话时序线(四时机人话卡 + 开关)

- **依赖**:T5,T12
- **目标**:Hook 区:会话时序线(SessionStart→PreToolUse→PostToolUse→Stop 四时机节点+循环弧)、每 hook 人话卡+启用开关,读写 T5 的 /api/hooks 配置;明示「钩子作用在终端 Claude Code 会话内,不在本面板」。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/HookTimeline.tsx(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/StepEditor.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/api/client.ts(hooks 端点)`
- **验收**:test:web:①四时机分组渲染真实 hooks 清单(与 hooks/*.sh 名单一致,时机归类以 plugin 注册为准);②开关写回端点、失败回滚+错误提示;③强制常开 hook(若拍板)渲染禁用态+原因;④摘要卡钩子计数联动。
- **风险**:时机归类要从 plugin.json/hook 脚本注释里核实,不得凭名字猜;依赖 T5 拍板结果,若 hook 粒度改为「全局非分阶段」则本卡从 StepEditor 上移到工作台顶层。

### T16 视图:「自动运行(Loop)」卡并入编排页(滑杆化参数)

- **依赖**:T3,T12
- **目标**:编排页内 Loop 卡:滑杆/步进器化全参数(cadence 档位+自定义/max_runs_per_day/max_in_flight/max_tokens_per_day/on_exceed/autonomy L1-L3/human_gates/kill_criteria/allowlist/denylist/goal/design_doc/change_prefix/risk/status 开关),推荐值默认;保存走 T3 的 /api/loops/update;升降档沿 /api/loops/level+既有升档确认 Dialog;健康度环/台账/漂移检测不做 UI。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/LoopCard.tsx(新建+测试)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workbench/WorkbenchView.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/api/client.ts(loops update)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/loops/LoopsPanel.tsx(升档确认逻辑迁移来源)`
- **验收**:test:web:①/api/loops/snapshot 读回显全参数、推荐值默认标注;②改参数→保存 patch body 精确(不夹带未改字段);③L3 升档走确认 Dialog、降档直发(上轮 Task 13 风险不对称纪律);④status 开关=active/paused;⑤断言页面不渲染就绪环/台账/漂移(决策 F 裁减)。
- **风险**:demo v5 的 Loop 治理是完整独立 tab,决策 F 已裁——以 F 为准但需主会话确认裁减清单(open question);computeReadiness/computeBudgetStatus 本轮只用于升档确认核对文案,不出图形。

### T17 IA 切换:导航收敛 3 视图 + 「相位」→「阶段」全局改词 + Onboarding 教学态

- **依赖**:T2,T9,T11,T13,T14,T15,T16
- **目标**:Nav View 收敛为 'inbox'|'progress'|'workbench'(收件箱计数徽章保留),App.tsx 接线新视图;i18n/translations.ts 及散落文案「相位」全改「阶段」(代码标识符 phase 不动);Onboarding no-project 改纯教学态(跑 pipeline init 即出现),注册 UI 与 'pipeline projects add' 幽灵命令全删。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/shell/Nav.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/shell/Nav.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/App.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/App.test.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/i18n/translations.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/shell/Onboarding.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/shell/Onboarding.test.tsx`
- **验收**:test:web:①导航仅 3 项+收件箱计数、workbench 下拉组删除;②Onboarding 无注册表单、文案含 pipeline init、复制命令为 init 非 projects add;③rg '相位' packages/dashboard-app/src 除注释/测试历史引述外 0 命中、rg 'projects add' 0 命中;④切视图后 App 集成测试(上轮 Task 11 建议的聚合渲染护栏一并补)。
- **风险**:这是不可回退的切换点——必须排在全部新视图任务之后;Nav 项目切换器聚合/注销入口去留见 open question。

### T18 退役清理:旧视图硬删除 + @xyflow/react 依赖移除

- **依赖**:T17
- **目标**:删除 SettingsView/SkillTransferModal、AfkWorkbench、BoardView、WorkflowEditorView/WorkflowCanvas/StepDetailPanel/layout.ts 及其测试;board/events.ts 转换镜像逻辑先迁入进度消费处再删壳;package.json 移除 @xyflow/react;上轮登记的 AfkPanel 未接线文件、AdvancedPanel TOOLS 调试清单 loops 重复项一并处置。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/settings/`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/afk/AfkWorkbench.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/board/`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/WorkflowEditorView.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/StepDetailPanel.tsx`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/src/workflow/layout.ts`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/packages/dashboard-app/package.json`
- **验收**:npm run typecheck:web + npm run test:web + npm test 三连门全绿;npm ls @xyflow/react 报 empty;rg 'BoardView|SettingsView|AfkWorkbench|WorkflowCanvas|xyflow' src 0 命中;npm run build:web 通过且 bundle 体积下降(记录数字);删除的 testid 逐条登记意图迁移表(哪些语义已由新视图断言接替)。
- **风险**:board/transition-mirror.test.ts 与 events.ts 承载转换镜像正确性,迁移不是删除;SettingsView 里技能注册表/穿梭框、AdvancedPanel/TrafficPanel 的能力去向需拍板(open question)——未拍板前保守保留 advanced/ 目录。

### T19 收口:真机验收脚本 + 双主题截图 + 文档台账

- **依赖**:T18
- **目标**:以 .playwright-tmp/acceptance-restyle.mjs 为骨架写 acceptance-v5.mjs 全流程真机验收;docs/TEST-REALITY.md 改判(G20/G21 闭合、G22 维持既定 YAGNI、新缺口如实登记);.superpowers/sdd/progress.md 与 docs/loops/progress.md 台账续写;README 更新 3 视图 IA。
- **涉及文件**:
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/.playwright-tmp/acceptance-v5.mjs(新建)`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/docs/TEST-REALITY.md`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/.superpowers/sdd/progress.md`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/docs/loops/progress.md`
  - `/Users/a1234/Documents/code-manager/projects/pipeline-worklfow/README.md`
- **验收**:真机断言(三连 build+清孤儿端口 8796-8799,禁 networkidle):①3 视图导航+计数徽章;②收件箱 j/k/Enter 开详情、时间线产物 chip、放行盖章、缺产出卡不在收件箱而在进度「等 agent」;③进度筛选联动、行展开、终止钮 running 才可点、日志两拍变化;④工作台 stepper 编辑保存 round-trip、Hook 开关生效、Loop 滑杆保存;⑤ACCEPTANCE_ALL_PASS + 0 page error + 全视图双主题截图;⑥收口前全仓 file 扫描零二进制源文件(上轮 NUL 教训)。
- **风险**:SSE 长连下 Playwright 等待纪律沿上轮 Global Constraints;GSAP 光泽循环在截图流程中需 reduced-motion 或显式暂停,防截图抖动。
