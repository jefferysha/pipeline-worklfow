# GOAL — tenon

## 终态 v3.0（重画核心 + loop-engineering 完整整合，2026-07-16 三轮 codex review + brainstorming 定稿）

**v2.0（下方"终态 v2.0"章节）已达成收官——workflow 自定义引擎 + dashboard 工作台，那是上一阶段的
目的。从这里开始是新阶段**：把"兼容旧 shell 内核"从领域核心里请出去、改成显式的 legacy adapter；
建立一等 `WorkflowRun` 身份（本仓当前所有关系都靠猜：hook→change 靠 mtime、loop→change 靠名字
前缀、artifact→文件靠字段字符串、transition→audit 靠 best-effort side log）；把用户自建的
loop-engineering 项目（下称"A"）的治理闭环真正整合进本仓执行链，而不是让"loop"这个词到处出现
却各自失真。

设计源：三轮独立 codex review（方案 v3 架构重画 / loop 完整整合的方法论·映射·可行性）+ 本轮
brainstorming（`/goal` 仪式，AskUserQuestion 拍板 3 处分歧）。原始方案文档在临时目录，可能被系统
清理——关键结论已摘录进下方清单，不依赖外部文件存活。

**达成判定 = 下方清单 G（架构重画）+ 清单 H（loop 完整整合）全部勾满，或经用户/codex 共同确认的
范围调整。** 与 v1.0/v2.0 相同的纪律延续：证据先于勾选、清单只增不删、每个工作包都要走"实施→
自己守门（tsc + 全量测试 + 门禁）→codex review 通过"才能勾选、八门验证全绿才收编。

> **当前状态（2026-07-20）**：v3 清单 G/H 与动态 Track Registry 全部完成；H15 八条由真实
> Codex/Docker loop iteration 和全系统 burn-in 验收。最终门禁：全包 build + web typecheck、主套件
> 4849 passed（4 个仅 Claude 凭证分支 honest-skip）、web 873 passed、H14 real-Codex 10/10 零 skip、
> hooks 258/258、adapters 224/224、skills/bundle/comment-honesty/default-workflow freshness 全绿、
> golden Oracle 全量 5 fixtures 四面 0 差异；生产 dashboard 已用浏览器从 AFK Operations 触发真实
> Codex/Docker 运行并在精确 Change/Run Audit 深链复核执行、验证、usage、skill snapshot 与 ledger。

### 非目标（v3.0）

- 不搬 loop-engineering（A）的源码 / CLI 工具 / MCP 协议 / loop-worktree manifest——A 是需求语料
  和验收反例，不是第二个领域模型（A 有 8 项能力搬进来即违反本仓验收标准：`--auto-fix` 是 no-op
  假按钮、`loop-init` 谎报"Circuit breaker wired"、`goal-audit` 把文件存在误报为
  production-ready 且输出别的仓库的建议、MCP 与 loop-cost 两套成本模型分歧 26.4%、
  `loop-worktree` manifest 制造第二个 Run 账本、`patterns/registry` 不是可执行 workflow、
  `loop-context` 不能宣称是执行面熔断、本仓自己现有 loop 报告不能继续叫"熔断执行面"）
- **channel 子系统不做 adapter/dashboard 扩建**（codex 2026-07-16 独立裁决"方案 D"，见 A4 条目
  批注与下方 G4）：保留能力但移出 kernel、标记"历史迁移能力 / experimental compatibility
  surface"、冻结扩建；loop 执行主链改由 AFK 承担。重开条件见 G4。
- triage / sync（loop 整合 19 环节里唯二"两边都要从头做"的项）本轮排在 W6 之后，若走到就做，
  走不到不算脱靶
- 不改 `_all` 只读口径；不把 handoff 摘要写进 `.breadcrumb`（热路径爆炸）；不改
  `router-gen.mjs` 的 `safeSeg`（实测不可达死代码）；tap 不承担治理事实（usage/completion/
  session ID 来自 provider structured protocol，网络抓包降级为独立诊断工具）

### 清单 G · 架构重画（v3 方案，支点 = 唯一 WorkflowRun）

> 2026-07-17 执行顺序决议（codex 排序评估，scratchpad w1 会话）：**YAML→projection 推迟为
> 倒数第二个大型工作包**（理由超出原风险提示：set/set-many/cas、automation 结算、import 都
> 绕过 TransitionRecord 直写 YAML——"初始快照+effects 重放"今天重建不出完整状态，现在迁移
> 等于同时重构全部状态写入口）；**内核主线串行 G2→动态 Track Registry**（都动
> transition-table，G2 先立 typed guard/action 边界，tracks 的 policyProfile 建在其上，
> 避免先改旧表再被 G2 重写）；**loop 主线（清单 H）与内核主线并行**，内部顺序 = H1 ledger →
> ExecutionContext/loop_id/admission/budget-reservation/kill-switch → H4-H6、H8-H11 →
> H7（等 G2 verifier/action ID 稳定后接线）→ H2 → H14 `tenon loop run` 收口 → H15 只做
> 阶段性真跑不勾终验。G3 的 registry/UI 只读部分可先做，G4 channel 提包是低冲突并行包，
> G3 的"hooks 从 YAML 切 canonical"必须与 projection 迁移同批。projection 落地前 G1 不勾满、
> 不宣称 v3.0 完成；最后是 H15+全系统 burn-in。projection 的将来设计已给全（.pipeline-run/
> current.json 每 mutation 完整 revision、current.json rename 为新唯一提交点、hooks 改读
> canonical、需要明确的写兼容断代点——老 writer 直写 YAML 无法安全兼容），见
> scratchpad codex g1-yaml-projection-scope-review.txt 存档。

- [x] **G1 W1 WorkflowRun 接缝（支点，2026-07-19 收官）**：`WorkflowRun`/`TransitionRecord` domain 类型 + 唯一
      `TransitionApplication` 用例（CLI 与 server 都调它，消灭 `cli/commands/transition.ts` 与
      `server/transition.ts` 两处复制）+ 状态与 audit 原子提交（终结"审计是可选副作用"）+
      default 轨首先迁入 + custom 轨删除独立分支 + `.pipeline.yaml` 退成 adapter。
      **验收锚点 = 已核实的 P1 bug**：dashboard 放行推进到 review 相位不写 `.breadcrumb`/
      `.pipeline-pending-review`（`server/transition.ts` 收尾只写 history，`cli/commands/
      transition.ts:221-249` 收尾多写 breadcrumb + review-marker，两者已逐行核实），
      而 `gate.sh:106-115` 靠 `.pipeline-pending-review` `exit 2` 拦截写类工具——人工复核门
      在 dashboard 入口直接失效。W1 后此 bug 必须自动消失（两入口共用同一收尾）。
      > 2026-07-17 子里程碑（10 轮 codex review 后"通过"，状态与 audit 原子提交这半部分已完成，
      > 唯一 TransitionApplication/default-custom 分支删除/YAML 退成 adapter 仍未开始）：
      > `WorkflowRunRepository`（`transact`/`initChange`/`establishRun`）+ 不可变
      > `TransitionRecord` 落盘（`.pipeline-transitions/`，tmp+link 原子发布，`readChain` 四层
      > 防御性校验）+ `.pipeline.yaml` 内部 runMetadata 三行块 + history 端点从"canonical 链
      > 首条时间戳切分 JSONL"改成"逐条 `transitionRecordId` 来源标记 + 两指针合并保序"，
      > CLI/server 两侧收尾统一走 `runRepo.transact()`（锁覆盖整个 callback，消灭 G1 验收锚点
      > 点名的那个 P1 bug 本身——两入口现在共用同一收尾，breadcrumb/history/marker 顺序一致）。
      > 过程中发现并修复的非架构性但真实的问题：`packages/cli/dist/tenon.mjs`（hooks 与
      > 已发布插件实际执行的 tracked bundle）全程未随本增量的源码改动重新构建，直到 review
      > 第 8 轮才被抓到——已重建 + 在 `.github/workflows/ci.yml` 加了 Build 后的逐字节新鲜度门
      > （`git diff --exit-code -- packages/cli/dist/tenon.mjs`），`docs/DIST-RELEASE.md`
      > 同步更新（这是仓库第二次犯这类 source/dist 脱节，`d34b5f7 → ef84644` 是第一次）。
      > codex 对下一步（唯一 TransitionApplication + 降 YAML 为 projection）的风险提示：
      > 当前 `.pipeline.yaml` 的 rename 是唯一提交点、canonical head/sequence 存在其中——降成
      > projection 前必须先有独立于 YAML 的 WorkflowRun 状态快照/head-sequence/原子提交与
      > 崩溃恢复规则/幂等重建机制，否则会出现"声称是 projection、实际读状态找 head 仍依赖
      > YAML"的名义降级，甚至破坏本增量刚建立的原子性。
      > 2026-07-17 第二个子里程碑（3 轮 codex review 后「通过」，Standards/Spec 双零收官）：
      > 唯一 `TransitionApplication` 用例已落地
      > （`packages/kernel/src/workflow/transition-application.ts`，一轮 codex 架构评估定的
      > 形状——application 自己持有事务边界，内部调用 `runRepository.transact()`，不是接收
      > `tx` 的纯函数；default/custom 双轨分流拆成 `planDefaultTransition`/
      > `planCustomTransition` 两个纯规划函数；判别式 `TransitionApplicationResult` 9 种
      > kind 覆盖全部转换结果，projection 写失败进结构化 `warnings` 而不是让整体失败）。
      > `cli/commands/transition.ts` 与 `server/transition.ts` 都已迁移为薄 adapter（各自
      > 只剩：前置校验 → 构造 TransitionCommand → 调 execute() → 把结果映射成 exit code/HTTP
      > code），G1 验收锚点点名的两处复制正式消灭。可观测行为逐字保持不变——两边原有测试套件
      > （CLI 34 用例、server 196+1 用例）零断言改动全绿通过，这是行为保持不变的直接证据。
      > 过程中发现并修复一处测试基础设施与生产行为脱节的真实 bug：CLI 的
      > `mockWorkflowRunRepository` 测试替身里 `transact()` 硬编码 `workflowId: 'default'`，
      > 在旧实现下无害（`cmdTransition` 从不读 `tx.run`），新实现按 `tx.run.workflowId` 判定
      > 双轨路由后会把所有 custom workflow 测试误路由进 default 分支——已改成真镜像生产
      > `FsWorkflowRunRepository`（对 state 调 `resolveWorkflowName`）。真实 CLI bundle 已
      > 重新构建并端到端验证（`init --workflow` → 正确落在首个 step → `transition` 走 custom
      > 轨正确产出 `transitionRecordId`）。当时 G1 剩余：`.pipeline.yaml` 降为 projection（按上面
      > codex 的风险提示，需要先有独立于 YAML 的 canonical 状态/head/崩溃恢复机制）。
      > **2026-07-19 最终增量完成 projection cutover**：`.pipeline-run/current.json` 成为唯一提交点，
      > 每次 mutation 同时发布完整 immutable revision，SHA-256 绑定精确 state/effects/前代与
      > TransitionRecord 字节；current/twin/previous/head 任一损坏均 fail-loud，YAML 不获回退授权。
      > `.pipeline.yaml` 仅作带 revision/id/digest 的 best-effort adapter，具备 drift 检测、显式
      > `repair-projection` 与 `import-legacy`（整段锁内事务）；StateStore、CLI/server snapshot、
      > dashboard fingerprint 与全部 hooks 均 canonical-first，hook 共享 Bash reader 额外校验
      > current digest + immutable twin。旧 writer 产生的双主漂移默认拒写，用户必须显式选择 canonical
      > 修复或 legacy import。最终真实验证：全量 build/test/H14、5-fixture golden Oracle、binary/server
      > HTTP 冒烟及全仓静态门禁均 exit 0；G1 验收锚点与 projection 剩余项清零。
- [x] **G2 W2 Workflow IR + artifact declaration**（2026-07-18 收官；2026-07-19 当前会话复验）：
      〔进度 2026-07-17：P0 TrackPredicate 前置 PR + P1 IR/编译器/handler + P2 custom transition 接线
      **均过 codex review 收官**。P2 走 3 轮 review（round1 通过 → routing 进 IR 编译器暴露 3 个兼容
      回退不通过 → 二次返工第 3 轮通过）：① 未知 file_path 恢复惰性加载（三 type 一律惰性 ref、只已知
      file_path output 派生 artifact，不阉割 pre-P2 加载面）；② representable 抽 `kernel/src/text` 中性
      共享面（workflow 委托 + 叠加 U+2028/9；tracks 保留独立谓词 + cross-check 钉一致——codex 认可两
      parser `[\s\S]*` vs `(.+?)` 本质差异、不强行统一）；③ guard 附加字段闭集下沉 compile 三处
      （顶层/path/when，GUARD_DATA_KEYS 作 SSOT，堵结构化 API 绕过静默丢字段）。**边际维护债（非阻断）**：
      text 模块"C0/C1 通用腐蚀域"命名偏宽（tracks 实拒 LF/CR/tab）、tracks 仍独立谓词——留 R-line 收口。
      **P3 收官**（3 轮：删 switch → review round1 判 2 阻断 → 返工第 2 轮通过[① fstr 归一 normalizeGuardFields
      局部副本保 default 轨数组边界等价、不污染 action、custom 轨仍 fail-loud；② 新增 default-guard-errors.sh
      fixture + seed 伪命令，14 个 transition 拒绝步走 old/new stderr 逐字面、DUAL 连续 3 次非 DEGRADED
      0-diff]）。原 review round1 判 2 阻断：① default 轨 scalar guard 对数组输入不等价
      （旧 fstr join / 新 scalarValue throw，边界输入回归）② oracle stderr 只有 barrier 有 sidecar、
      explore/spec/build/verify 各失败文案未 old/new 双跑——B/D/E/F 通过。已删两 legacy switch
      checkTransitionPreconditions+applyTransitionEffects、
      建 DefaultEventPolicy 穷尽表、DUAL oracle 非 DEGRADED 连续两次 0-diff、删 switch gate 达成、清 ~20
      失真注释；vitest 2648/web 785/bundle 7 全绿。**合并守门①**：R3 的 tracks/registry.ts 与 Stage B 的
      loops/governance.ts 都 `export interface RegistrySnapshot`，经 kernel barrel `export *` 重复导出致
      `tsc -b 全包` 红——非 P3（P3 文件 tsc --force 零错误）、待 Stage B 返工完成后并行区 barrel 去重。
      设计定稿 scratchpad/codex/p3-design-decisions.txt）：把 transition-table.ts 两个
      legacy switch（`checkTransitionPreconditions` guard + `applyTransitionEffects` action，含 SHA
      freeze/verify/archive/barrier）切到 P1 已有 typed handlers，建静态穷尽 `DefaultEventPolicy` 表
      （EventName 穷尽映射 guards/actions，不读 default.yaml）；default 选边/phase 推进仍由
      eventEdge+FlowEngine 承担（保守分叉）。铁律不双执行（clock/SHA 不调两次）；删 switch 前须扩 dual
      oracle（新 default-effects.sh 6 场景 + stderr diff）**非 DEGRADED 连续两次 0 diff**。与 T-R3/loops
      文件级零冲突（P3 碰 kernel/flow+workflow+tools/oracle）。
      **P4 review round1 判 3 阻断,分流处置中**（C-1 generator 静默吞畸形 artifact + C-2 predicate value
      未转义生成非法 TS → **generator 已修收官**（主会话亲自修，agent 2 次空转后不再赌：C-1 parseArtifactEntries
      遇非 '- field:' fail-loud 不静默吞、C-2 predicate value 加 TRACK_ID_RE 校验杜绝注入非法 TS；
      generate-default-workflow.test 22 绿[+4 反例]、合法 default.yaml 幂等逐字节不误伤、反向验真过）；**E** server/dist/dashboard.mjs 内嵌旧 compile 副本陈旧
      [P4 扩 compile 接受 effective-phase-skills、bundle 未跟] → **登记 session 收尾统一重建所有 bundle**
      [含 dashboard.mjs + 加 freshness gate，现在重建会内联 Stage B 三返的 loops 中间态故推迟]；**A** custom
      workflow 声明 effective-phase-skills 的契约缺口 → **留 P5 入场前钉死**[compile 不分 default/custom]。
      B outputs+artifacts 加法 codex 判可接受、D freshness gate/F 停止线通过。原实施全绿：default.yaml 显式 artifacts[] + codegen 表 default-workflow.generated.ts
      + 查询层 default-artifacts.ts + CI freshness gate；全 6 包 tsc EXIT 0、全仓 3426 通过零失败、oracle
      双跑非 DEGRADED。**2 偏差待 review 裁**：① 必须碰 parse/serialize/compile 让通用 parser 支持
      artifacts[]（codex D6 许可，否则 default.yaml 加 artifacts 后不可加载）② 保留原 outputs + artifacts
      作加法注解（非替换，因 compile 强制 artifact 挂 file_path output + validate 依赖校验）。诚实标注：
      server dashboard.mjs bundle 内嵌旧 compile 副本已陈旧、留 server 收官方。设计定稿
      scratchpad/codex/p4-impl-brief.txt：default.yaml 三处从隐式 outputs:file_path
      改显式 artifacts[]（plan 带 required_when track_not_in:[pm]）→ tools/generate-default-workflow.mjs
      codegen 只读表 default-workflow.generated.ts + 手写查询层 default-artifacts.ts + CI freshness gate；
      不做 P5 register/P6 cutover/EffectiveSkillResolver，custom compileArtifacts 保留；与 loop/tracks
      文件级零交叉可并行）→ **P5 收官**（review round1 **通过无阻断**：6 类 producer 校验 + 锁内 read-resolve-write
      原子（TOCTOU 关闭）+ producer 只授权不持久化、2 偏离[loadWorkflow reframe（A 契约必然，default 走 codegen
      表不走 loadWorkflow）/ matchesTrackPredicate barrel 导出（cycle-safe）]判可接受、停止线守住；2 边际已顺手修
      [skillTokenAlternatives 空判改 trim 拒纯空白 a| |b + 测试、predicates.ts 陈旧注释更正为「P5 已 barrel 导出
      cycle-safe」；manifest-derive+resolver 33 测试绿、tsc kernel 0]）。原全绿：register CLI + resolver + A 契约全绿：tsc 6 包 0 / kernel
      1500 / cli 901 passed[1 failed=afk-run L3 docker 属 Stage B 四返并行区非 P5] / 真 bin E2E works；
      2 偏离待裁：loadWorkflow 拒 default.yaml 作 custom[A 契约必然，default 走 codegen 表不走 loadWorkflow]、
      matchesTrackPredicate barrel 导出[cycle-safe]。设计定稿 scratchpad/codex/p5-impl-brief.txt：artifact register CLI
      `tenon artifact register <change> <field> <path> --producer <skill-id>` + 最小 EffectiveSkillResolver
      [default=manifest skillsFor·a|b 拆 slot / custom=step.skills] + A 契约钉死[拆 compileWorkflow：通用=custom
      契约拒 effective-phase-skills、新 compileDefaultWorkflow 允许、**非 name 猜 origin**]；P6 才切 set/cas、
      T-R6 才升级 resolver 到 Registry profile；与 loop/tracks 零交叉可并行）→ **P6 收官·codex 三轮复审通过
      （2026-07-18）**。CLI-only 动态 cutover：set/set-many/cas 拒『当前有效 artifact 声明集』字段[default
      defaultArtifactsForStep / custom 编译后 StepIR.artifacts、含 file_path output 派生]、改走 register、非
      硬编码；新增共享 effective-artifacts.ts（missing workflow 文件→空集、corrupted/step 缺失→throw
      fail-closed）；checkArtifactPatch 对 curArt+patchedArt **全部字段**（含 track/workflow，custom 可声明其
      为 artifact）判定、堵 file+meta 两类 set-many 切入；runComboWrite artifact 判定先于 cas-miss；oracle 3
      fixture 有效相位 artifact set 改 seed（default-guard-errors 6 处、backend-full/default-effects 各 2 处）。
      **返工两轮**：codex 首审驳 3 阻断（track/workflow 剔除绕过 / oracle 未改完 / 测试缺口）→ 复审驳 3
      更深阻断（meta 切入 / corrupted fail-open / 派生 artifact 测试缺）→ 三审通过。验证：tsc0 / cli vitest
      exit0 / oracle exit0-FAIL0 / 注释门禁0 / bundle 冒烟拒写。余 codex 标注非阻断项（防回归测试增强、
      显式 workflow:"" 遗留兼容边际）。⇒ **G2（P0-P6）整体收官。**〕
      > 2026-07-17 设计裁决（codex，存档 scratchpad g2-workflow-ir-scope-review.txt）：保守
      > 分叉——default 轨继续 eventEdge+FlowEngine（不把 default.yaml 升为转换图真相源），
      > default.yaml 收窄为「default 各 step 的 artifact 字段/类型/producer policy/track 条件
      > 的唯一**作者源**」，经 generate-default-workflow.mjs codegen 成
      > default-workflow.generated.ts（CI freshness 门），运行时消费生成物。typed
      > guard/action 分两个联合（guard=判定，action=状态变换，不许并）；TrackPredicate
      > track-not-in:['pm'] 取代 `tr!=='pm'` 与 `tracks:['backend','frontend']` 两种写法；
      > handler 注册表 = exhaustive mapped type 静态闭集（无运行时插件）；错误文案留 renderer
      > 不进 YAML。`tenon artifact register <change> <field> <path> --producer <skill-id>`，
      > producer 值域=当前 phase×track 的 manifest skills（default 轨）/step.skills（custom
      > 轨），经 EffectiveSkillResolver 接缝注入。分阶段 P0 TrackPredicate 前置小 PR（修
      > guardCheck 对 chat/未知 track 与 transition 层的不一致）→ P1 IR/编译器/handler →
      > P2 custom 接线 → P3 default switch 迁移（legacy oracle 双跑后删 switch）→ P4
      > declaration 真相源+codegen → P5 artifact register → P6 set/cas 对 artifact 字段拒写
      > cutover。与 Track Registry：P0 先行，两包并行，G2 先合并删 PM switch，Registry rebase
      > 后只接 track 解析/workflow 绑定/EffectiveSkillResolver。typed guard/action handler（SHA 冻结/
      barrier/archive 从 switch 变 action）；`default.yaml` 成为 artifact declaration 真相源
      ——**不是收敛成一张表**：transition 放行政策 / handoff 选档政策 / dashboard 展示政策继续
      独立（codex 裁决：`plan` 仅对非 PM track 强制、`PHASE_DOCS` 的 build 条目是选上游上下文
      而非声明产出，不能从 outputs 机械投影）；`tenon artifact register` 结构化 CLI 取代
      agent 手打 `tenon set`，不接受 `--producer-skill <任意字符串>`
- [x] **G3 W3 hook 控制面**（2026-07-19 完成，当前会话复验）：顺序 = 修 G1 的 P1 bug → 冷路径 projection（default 轨行为等价
      验证）→ 补 custom breadcrumb/skills 数据源 → 矩阵并入视图 → 只读 registry →
      **最后才**开放 settings 写入。CC 硬限制：native hook 只能添加/移除/撤销移除，
      不能伪装成开关（`HookMeta.configurable: boolean` → `policy: 'toggleable'|'required'|
      'unsupported'`）
- [x] **G4 W4 provider protocol（2026-07-16 按 codex 方案 D 改写，不再是"移植前作 adapter"）**：
      〔2026-07-17 收官：a) 提包完成——29 文件迁 `packages/channel`（`@tenon/channel`），
      kernel 不再导出 channel、CLI 4 文件重连、bundle 内联无残留 kernel 引用、包零依赖零 tsconfig
      references；b) 兼容面定位已标注（`channel/src/index.ts` + `commands/channel.md` + `README.md`
      均标"历史迁移 / experimental 兼容面，非 v3 默认 agent runtime"）；c) `loop run` 归 H14
      （AFK 实现、不依赖 channel）。codex round1 判"文档定位缺失 + channel.md 失效路径"不通过，
      修正两项后为 conditional pass——代码提包六项技术接线无运行时阻断，收官。〕
      a) channel 子系统从 `kernel` 提取为独立 workspace 包（如 `packages/channel`），kernel 不
      再导出 channel，CLI 是唯一依赖者，保留全部测试/事件格式/`tenon channel` 兼容入口；
      b) channel 标记"历史迁移能力"：保留 echo 能力，**不移植 Claude/Codex adapter、不新增
      server endpoint、不新增 dashboard 页面、不声称是 v3 默认 agent runtime**；
      c) `tenon loop run` 用 AFK 实现（见 H14），不依赖 channel。
      **重开 channel 投资的条件**（同时满足才重开）：出现具名产品场景确实需要运行中多轮输入/
      interrupt-resume/跨进程事件重放/多长驻 worker 协作 + 已证明 AFK 批处理沙箱与 Claude/Codex
      原生能力无法满足 + 有真实调用方（不只是 CLI demo）+ 先完成真实 provider 的 headless e2e +
      明确长期维护者。"dashboard 看起来应该有运行时页面"不构成重启条件。
- [x] **G5 W5 loop 执行链**（2026-07-19 完成，当前会话复验）：以 `ExecutionContext` 为轴的 DAG（**durable ledger 必须先于 usage
      collector**，否则 parser 先形成临时输出契约）；归属 = 显式 `loop_id` 权威 + 最长前缀兼容
      发现 + 等长多命中 fail-closed；修 allowlist 制造的错误安全感（`state-machine.ts:59-66`
      声称 L3 有 allowlist 语义，`lifecycle.ts:294-303` 实际只查 denylist）；验收须区分
      `admission_enforced`/`inflight_enforced`
- [x] **G6 W6 workflow 增删**（2026-07-19 完成，当前会话复验；①，正交，最小）：封装 `deleteWorkflow`（`server.ts:1097-1120`
      端点已存在）+ 新建入口

### 清单 T · 动态 Track Registry（默认内建 Track 固定、track 可增删、每 track 绑定各自 workflow）

> 2026-07-17 设计裁决（codex，存档 scratchpad track-registry-scope-review.txt）：项目级
> `.pipeline/tracks.yaml`（`builtins:` 节只许覆写内建 Track 的 label/workflow，policy v1 锁死；
> `tracks:` 节放额外 track，禁与内建重名；缺文件 = 当前五条内建 Track（chat/simple/pm/frontend/backend）零迁移）。
> `TrackPolicyProfile{reviewSeed, automationEligible, coverageProfile, routing{enabled,pattern,
> priority}, skills{matrix, profile}}`——把 store.ts reviewInit / gate.ts+afk.ts 的 pm 特判 /
> COVERAGE_APPLICABILITY / router_patterns / 技能矩阵参与度全部收敛成能力位；plan/review 豁免
> **不进** policyProfile（保持 P0 的 track-not-in:['pm'] predicate，registry 只做 ID 引用
> 校验）。manifest 的 `phase.track` 键空间改名为全局 **skill profile**（动态 track 经
> `skills.profile` 继承 backend/frontend/pm/_all 表，解析顺序 profile→_all→[]）；
> router_patterns 从 manifest 迁入 registry（router hook 缓存改按项目 + 双失效源 + 重生成
> 失败不许 source stale cache）。删除语义：CRUD 拒删仍被活跃 change/predicate/profile 引用的
> track（归档不阻删）；直改文件造成的 orphan = 容忍读取 + 行为阻断（transition/AFK fail-loud）
> + doctor 报 red。workflow 绑定只接 init 构造点（InitOptions.initialWorkflow），
> resolveWorkflowName 不查 registry——存量 change 零漂移；set/set-many/cas 全部按最终
> {track,workflow} 组合校验，堵旁路。TRACK_ID_RE=^[a-z][a-z0-9_-]{0,31}$，禁 `.` 与 `_all`。

- [x] **T-R1 registry 内核模块**（2026-07-17 完成，6 轮 codex review 通过）：kernel/src/tracks/
      {types,builtins,parse,validate,serialize,registry,representable,index}.ts + 测试。窄 YAML
      解析（对齐 loops/registry.ts），loadTrackRegistry 缺文件 fallback 内建 Track、坏文件
      fail-loud，revision=规范化内容 hash，writeTrackRegistry 完整校验+原子写+目录锁+
      expectedRevision 409+repairCorrupt 修损坏。核心攻坚点全在「writer 自洽合同」（write 成功
      过的文件同 context load 永不失败）：representable.ts 统一 serialize 拒绝面前移到 validate、
      priority 收非负安全整数域（含拒 -0）、修 parser KEY_RE 让 U+2028/9 可读回、拒未配对
      surrogate（UTF-8 落盘会变 U+FFFD）、tracks+allowed 两个数组字段拒稀疏空槽。codex 穷举
      全 BMP+astral+组合串字符域确认无第三破口。
- [x] **T-R2 校验面切换**：BUILTIN_TRACK_IDS 取代 TRACKS 作运行时全集来源；STATIC_ENUMS 删
      track 改走 registry；set-many/cas 按最终组合校验；CLI init/server POST /api/changes 走
      requireTrack+assertWorkflowAllowed；帮助串/向导从 registry 生成。零 G2 依赖。
      〔2026-07-17 收官：init 与 fields 的 set / set-many / cas（track|workflow）全部经统一 gate
      `checkTrackWorkflow`=requireTrack→assertWorkflowAllowed 校验**最终 {track,workflow} 组合**；
      弱 helper checkTrack（旁路成因）已删。TOCTOU 关闭：新增 `runComboWrite` 在**同一把 change 锁**内
      串 read→组装最终组合→校验→write（不绕 setMany/cas 而丢四闸——write→serializePipeline 对全字段
      重过 quoteGate）。server POST /api/changes 已带同 gate、transition 不写 track/workflow（codex F2
      确认无 server 侧旁路）。codex 2 轮：round1 判 set/cas 组合校验旁路 + TOCTOU 不通过 → 返工 →
      round2 通过。**遗留 F1（登记 T-R3/P3 必修）**：migrateWorkflow.ts 的 `store.cas(...'workflow'
      ...'default')` 无组合校验，自定义轨 allowed 不含 default 时迁移会造非法组合。〕
- [x] **T-R3 CRUD**：CLI `pipeline track list/add/update/remove`（--policy-from 复制快照，
      routing 默认关）；server GET/POST/PATCH/DELETE /api/tracks（Host/token 防线+revision
      409）；删除引用扫描；doctor orphan 报告。零 G2 依赖。
      〔设计定稿 2026-07-17，codex 全文 scratchpad/codex/r3-design-decisions.txt，实施任务书
      r3-impl-brief.md〕命名改 Commander 真子命令树 `tenon tracks list/show/create/update/delete`
      （--policy <chat|pm|frontend|backend> 深拷贝 builtin policy 作模板、--workflow-any 表 '*'）；
      kernel 新增 **mutate-under-lock 原语**（mutateTrackRegistry：仓级锁内 read→引用扫描→构造 next→
      全量校验→atomic rename，不嵌套 writeTrackRegistry）；补跨锁 TOCTOU **共同锁序 `registry 锁 →
      change 锁`**（tracks CRUD/init/set track|workflow/set-many/cas 全遵循，杀 loadRegistry 永久
      memoization）；delete 扫全部活跃 change 引用 **fail-closed**；builtin Track label/workflow 可改、
      **policyProfile+id immutable+不可删**（policyProfile 是强类型结构体非字符串，验证/保存/展示不新增
      消费语义）。**本轮 CLI-only**：server /api/tracks 写端点**移 G3**（现有 server/hook 只读不变）。
      **债务登记（codex D6 豁免，不在 R3 修）**：migrateWorkflow.ts `store.cas(...'workflow'...'default')`
      无组合校验旁路留 **P3**——自定义轨 allowed 不含 default 时迁移造非法组合。
      〔2026-07-17 实施完成（单轮全绿：build/vitest 2631/web 785/bundle/真 bundle 手测，262 相关测试
      含跨进程真锁）。codex review round1 判**不通过**，2 阻断：**A** = `state/lock.ts` release
      「owner-check→rm」+ 60s stale-takeover TOCTOU——**全仓锁用户（change/ledger/registry）共担的已接受
      残留**（见 memory 锁残留已接受），非 R3 引入、修 = 全仓换 fencing token 的独立大工程，**本轮不修、
      登记为独立候选工作项**；**D** = scanActiveChanges 复用了会过滤不可读目录的 listChanges，致删/改轨
      的 fail-closed 被绕过（kernel 策略本身 codex 确认通过）→ **已修复收官**（strict scan：新 listChangeDirs
      不过滤枚举全候选逐个读、补真 realDeps fail-closed 测试 + 反向验真防假绿（退回 buggy 版两测试都红）
      + 真 bundle e2e 验 fail-closed；vitest cli 865 / tracks 158 全绿）。B/C/E/F/G 全通过。**合并守门
      待办**：Stage B 返工完成后 verify 共享 test 装配（test-support/integration-harness 的 listChangeDirs）
      未被并发覆盖。〕
- [x] **T-R4 policy 注入**（2026-07-19 完成）：reviewSeed/automationEligible/coverageProfile 接管 store.ts、
      gate.ts、afk.ts、guard.ts coverage 的 pm 字面分支（transition-table 只保留 P0
      selector，出现 capability 判断即停）。需基于 P0 rebase。
- [x] **T-R5 router+dashboard**（2026-07-19 完成）：router_patterns 迁 registry、项目级 cache、动态评分序
      score→priority→registry order；dashboard 删 TRACKS/MATRIX_TRACKS 手抄、矩阵列动态生成
      （继承列只读展示 "X · inherits backend"）、Track 设置 UI（内建锁图标）。与 G2 并行。
- [x] **T-R6 G2 接线**（2026-07-19 完成，当前会话补齐生产装配）：predicate 引用校验 validateWorkflowTrackReferences、
      createEffectiveSkillResolver({registry,manifest})（default 轨查 profile→_all→[]，
      custom 轨用 step.skills，显式优先、稳定去重）、artifact application 只依赖 resolver。
      真依赖 G2 合并。
- [x] **T-R7 收官**（2026-07-19 完成，当前会话复验）：orphan/删除/workflow-delete 全链路集成测试、文档、旧静态常量清账。

### 清单 H · loop-engineering 完整整合（用户 2026-07-16 要求，三路 codex 重新定义目标）

> **可执行定义**：每一次自主执行都属于一个显式 `WorkflowRun`，受一个 `AutomationPolicy` 控制，
> 真实产出的结果、成本和证据会被原子记账，并反馈到下一次准入/重试/转换/合并/停止决定；其余模块
> **只携带和投影**这个闭环，而不伪造自己的 loop。判据见 H15。

**搬 A 的实现（3 项，选算法/行为，不选格式/数字）**
- [x] **H1 run-log**（2026-07-17 完成，6 轮 codex review 通过；loop 线第一增量的 Stage A）：
      typed durable ledger `.pipeline/loops/ledger.jsonl`——5 种记录判别联合（change-loop-binding/
      budget-reservation/reservation-activated/usage/run），窄编解码，仓级锁内 O_APPEND 单行写+
      fsync，宽容读+坏行/内部空白行隔离(fail-closed)，readRunWindow(每 loop 最近 N 条 terminal
      run + 未关闭 reservation 无论多老都保活)。核心攻坚在并发正确性：lock.ts 不可重入 → 用
      AsyncLocalStorage 可撤销令牌实现锁内可重入直通;结构化并发 drain(令牌全程 active 逐批
      allSettled 排空已获准直通再撤销,消除「drain 前撤销→嵌套锁成环」死锁);非 async 外壳 +
      登记即 catch 消除 fire-and-forget rejection 的 unhandledRejection。跨进程集成测试(esbuild
      打包真实 store + 真双子进程)定性为高置信 smoke(黑盒无法做确定性互斥判别,锁协议正确性由
      lock.test.ts + 进程内测试保证)。Markdown progress.md 保留为外部约定,ledger 是硬预算真相源。
      〔**loop 线第一增量 Stage B/C/D（接 Stage A）2026-07-17**：ExecutionContext + 显式 loop_id
      binding + 原子 admission/reservation + kill-switch 四重查 + 结算 + CLI/server 读面 已实现，真容器
      e2e 跑通完整链路（loop→admission→docker run→结算→L3 merge-back）。但 **codex review 判不通过**，
      8 阻断（前 4 硬）：① 同 reservation 双结算双扣账（recovery 与 settleWon 都 append RunRecord）；
      ② Promise.allSettled 吞异常成 ok=true（CLI 照打印跑完一轮）；③ kill-switch 与 merge/docker 启动
      非原子（四重查只缩窗）；④ registry 快照→binding 物化 TOCTOU；⑤ orphan 永久堵 loop；⑥ activation
      失败不保证回 queued；⑦ 预算读面矛盾（budget --json 走 legacy）；⑧ max-runs 计入 expired/claim-lost
      误拒重试。**返工设计已定稿 → 返工已完成 → codex review 判 3 阻断（B registry I/O 吞成 denial / D·G① 非治理写方绕 epoch reverify /
      G② merge 缺 base-SHA CAS；从 8 收敛到 3，A/C/E/F/H+G③ 已过，原语已备只需接线）→ **二次返工中****（8 阻断全落地 / 全 6 包 tsc EXIT 0 / vitest 2965 / 真 docker
      e2e L3 merge-back / bundle 7 / web 785；**两合并守门清零**：LoopRegistrySnapshot 规避 RegistrySnapshot
      碰撞 + listChangeDirs 未被覆盖。3 留待现实均 brief 允许：CLI 部分写方未接 governance writer(epoch
      reverify 兜底) / merge base-SHA CAS 接线 undefined(有锁内 active 复查) / scheduled→running 未置锁
      (docker start 由 start permit 守护)。原设计（codex，scratchpad/codex/stageb-rework-design.txt）：#3+#4 合并成
      **registry governance 机制**——loops.yaml 字节 SHA-256 作 epoch + 治理锁串行化所有 registry 写入/
      admission 物化预占/docker-start 许可/merge 许可，**固定锁序** `governance→ledger` 或
      `governance→change`（**禁同持 ledger+change**，跨域先释放再进下一阶段）；#1 store 层
      `closeReservationIfOpen` 幂等（committed/already-closed）+ 投影 terminal 去重（duplicate→degraded
      不双加）；#2 handleOne 返 HandleResult + allSettled 逐项兜底（ok=failures 空且非 degraded）；
      #5 最小 reconcile 内置 recovery（getExecutionLiveness 注入，container 确证 dead 才关，不加 lease/CLI）；
      #7 budget --json 只增 admission 字段不改 legacy；#8 countsAsRun 排除 claim-lost/expired。
      与 R3/P3 **文件级零冲突**（governance 原语落 kernel/loops 新 governance.ts，afk/loops 内直接构造、
      不碰 cli/{program,main,deps}、不加命令、H9 边界不变）。实施排 R3/P3 之一完成后（避免 triple heavy
      stall）。对应 H6/H8/G5 ExecutionContext 部分，返工通过前均不勾满。
      **review 收敛链：round1 8 阻断 → 返工 → round2 3 阻断 → 返工 → round3 验证时又深挖 mergeback git 协议
      判 3 阻断（① update-ref CAS 失败漏成假成功[只修 permit 预检窗口、未修 merge 期间窗口] ② CAS 失败后
      git merge --abort 反把外部推进覆盖回 ORIG_HEAD ③ abort/reset 清理未核验退出码留脏主树）→ 第四轮返工
      改 `git merge-tree` 纯算[不碰 host 工作树/index/ref、CAS 失败直接标 base-advanced 无需清理]，**全绿待
      最终 review**（merge-tree --write-tree 零 host 副作用 → commit-tree → update-ref 原生 CAS；真 git 交错
      测试 base 停 B 不覆盖 A + host 零副作用快照 + **docker e2e 真跑 L3 merge-back 走 merge-tree 全绿**；
      tsc 6 包 0/automation 326/cli+server 1292。**越界复核项**：改了 afk-run.integration.test.ts[cli/* 属
      P5 区]与 dockerRunChange e2e 的 L3 断言从工作树读改 ref 读[`git show HEAD:<path>`]——因 merge-tree 只推
      base ref 不更新 host 工作树、断言失真是 merge-tree 必然，且顺带修好 P5 review 报的 afk-run failed，判**保留**）。
      **round4 review 判 3 阻断（merge-tree 纯算成功后 host 工作树未同步→主树脏 / fallback+rev-parse exitCode
      未核验 / 快照固化产物缺席）→ 第五轮返工 read-tree -m -u 收官**：agent 读代码发现致命交互（scheduler 在
      merge-back 前就把 automation:running 写进已提交 .pipeline.yaml→host 主工作树恒 dirty，若用 reset --hard 会
      把 running 还原→running→merged CAS 落空→L3 永不 merged），受控偏离改用 `git read-tree -m -u`（two-tree：
      产物落工作树/index + 保留 .pipeline.yaml 等未改动路径本地改动 + merge-touched 路径冲突则原子中止）+ 补全
      rev-parse/write-tree exitCode fail-loud + 快照/e2e 断言改为『产物在工作树 + tracked 干净 + 用户改动保留』。
      **round5 review 通过、Stage B 收官**（真 docker L3 e2e 铁证：产物进工作树且 automation=merged；codex 认可
      read-tree 受控偏离比 reset --hard 更正确；剩余边际——外部 Git 客户端在 CAS→read-tree 间推 ref、read-tree
      错误文案略窄、fallback 仍 reset --hard[本机 git2.39 走 merge-tree 主路径]——均不阻断）。**loop admission
      整体收官**（8→3→1→3→3→通过，6 轮实施 5 轮 review）：双结算幂等 / 故障诚实不吞异常 / kill-switch permit
      原子 / registry governance epoch / base-ref update-ref CAS / merge-back read-tree 全过关。〕
- [x] **H2 context-pruning**（2026-07-19 完成）：搬 `loop-context` 的错误归一化/停滞检测/裁剪算法（A 最值得搬的
      代码，都是真纯函数）并入 `compress/attempt-context.ts`，输入改为 durable
      `RunAttemptRecord`（**不搬它的手工 ledger 协议**——`pattern/level` 字段明示不被 breaker 读）
- [x] **H3 patterns**（2026-07-19 完成）：迁移 7 个具名 pattern 的 goal/trigger/risk/推荐 workflow+skills，落成
      版本化 `AutomationPolicyTemplate`（不搬 A 的 cost 数字/level 结论/无消费者的 phases）

**B 空壳 → 接线（8 项，主战场）**
- [x] **H4 goal**（2026-07-19 完成，当前 Codex 会话 TDD + 反驳式复审收官）：进版本化
      `AutomationPolicy` 快照，每个受治理 `WorkflowRun` 显式携带且首次精确快照不可变；verifier verdict
      同时绑定 policy ID/version 与 goal SHA-256。绑定抛错/回读版本不符会以零扣费 terminal 补偿关闭
      已落 reservation，并保留原错误 fail-loud；同版本伪造内容重算 digest 后拒绝（不搬 `goal-audit`
      计分器——它把文件存在误报为 production-ready）
- [x] **H5 constraints**（2026-07-19 完成，Codex-first）：建 typed `ConstraintPolicy`，admission/写工具
      授权/transition/merge 四处统一消费同一 evaluator。受 policy 管控的 Codex 在容器私有 clone 以
      `workspace-write` 执行，NUL 路径集经真实 binary gate 授权后才把 patch 应用到真实 worktree；拒绝时
      真实 worktree 零业务写，merge 仍在 lifecycle 同表复核（禁止只把 A 的 prompt 复制为"保障"）
- [x] **H6 budget**（2026-07-19 完成，Codex-first provider metering）：durable ledger + 原子
      reservation → claim 前 preflight → `codex exec --json` 官方 `turn.completed.usage` 严格解析 →
      activated attempt 立即写 `UsageRecord(source=provider-structured)` → terminal/merge intent/崩溃恢复
      关联 usage ID 并按 actual total 回账；缺可信 completion 才诚实回退 reserved estimate，负数/小数/
      unsafe integer/cached 或 reasoning 越界/total 矛盾在 kernel codec fail-closed；`on_exceed` 为 typed
      action（不搬 A 的静态预算文件当事实源——它的 daily workflow token 固定写 52000，无实际 metering）
- [x] **H7 verifier**（2026-07-19 完成，多轮对抗返工后收官）：`AutomationPolicy.verifierBinding` 引用 Workflow IR 的 verifier/action
      ID；settlement 必须拿到结构化 verdict 才允许 L2/L3 放行（A 的 verifier prompt 可作 UX
      文案，不能当 gate）
- [x] **H8 kill-switch**（2026-07-19 当前 Codex 会话复核）：`AutomationPolicy.kill_policy` 为
      versioned typed snapshot；schedule 仅选 active、pre-claim 在 governance+ledger 临界区重读、
      transition 在 WorkflowRun transaction 内统一 evaluator 重查、terminal settlement 再重查；Docker
      start 与 merge 各由 governance permit 把 active/epoch 复核和副作用锁在同一临界区，停用统一
      fail-closed 为 paused/kill-switch（A 的 `loop-pause-all` 文档占位未被当实现）
- [x] **H9 state**（2026-07-19 完成，当前 Codex 会话复验 617/617）：policy state、ledger 投影的
      `LoopIteration` state、`WorkflowRun` state 已分离；governed run 的 policy/loop/iteration 身份与
      immutable transition audit 在 `WorkflowRunRepository.transact()` 同一提交边界原子落盘；retry
      沿用 iteration identity，activation/usage/merge/terminal 均校验 reservation owner。registry
      旧 `state` 字段仅兼容读取，新建/更新不再持久化，readiness 不再把它当运行状态事实源
- [x] **H10 skills**（2026-07-19 完成，多轮对抗返工后收官）：policy 加 `skillBundleId`，运行启动时解析并快照；硬规则仍由代码执行，
      只选择性吸收 A 的文案
- [x] **H11 starters/init**（2026-07-19 完成）：保留 `loops init` 为唯一入口，加 template 编译 + binding
      validation + wiring status；**未接线时必须停在 paused**（A 的 `loop-init` 把"空
      ledger+prompt"宣称成"circuit breaker wired"）

**两边都要从头做（2 项，排在 W6 之后，见非目标）**
- [x] **H12 triage**（2026-07-19 完成，Codex-first）：typed `ObserveAction`/`TriageResult` + source connectors，triage 结果
      创建 0..N 个 `WorkflowRun`（可借 A 的 High/Watch/Noise 输出结构当 spec；A 的
      `loop-triage` 只是 prompt，通用 GA example 甚至是 echo）
- [x] **H13 sync**（2026-07-19 完成）：若只要 detect，`drift.ts` 已够；若要修复，新建 typed
      `ReconciliationPlan` + dry-run + CAS apply（A 的 `--auto-fix`/`--dry-run` 完全未消费，
      绝不留一个假的 `--auto-fix` 兼容旗）

**loop run 命令（★硬需求，W5 收口动作，不是起点）**
- [x] **H14**（2026-07-19 完成；强制真实 Codex/Docker 验收 10/10、零 skip） `tenon loop run <loop-id|pattern> [--dry-run] [--level] [--commit]`：
      命令行显式指定归属（`loop_id` 写进 `RunRecord`，不靠名字前缀猜）+ 真执行（不是打印计划）
      + 产出被提交。**用 AFK 实现**（对齐 codex 方案 D 与 G4）：
      - selector 真正把 `<loop-id|pattern>` 限定到对应 change；
      - `--dry-run` 只输出候选/runner/level/镜像/结算策略，**零状态写入、零 Docker、零 git**；
      - 非 dry-run 真调用 automation/Docker/worktree/runner/verify；
      - `--level` 复用现有 L1→L3 语义，不另造状态机；
      - 成功产出的 commit/build SHA 必须从命名分支和 git 事实派生，**不信 agent stdout**；
      - L1/L2 保持 paused 等待人工处置；L3 才允许 merge-back，对齐现有 `settleSuccess`；
      - dashboard 继续消费 AFK/loop 状态，**不创建第二套 channel 运行视图**。
      验收 = 真跑 → 真产出 → 真提交 → ledger 有账 → 超预算真的不启动下一轮，不完成这条链
      不许宣称"跑通了 loop"。

**H15 一次合格 loop iteration 的 8 条标准**（H1-H14 全部完成后的整体验收，不是逐项验收）
1. trigger/cadence 真产生一次 `LoopIteration`
2. admission **原子**检查 status/readiness/预算/并发/kill
3. 每个 `WorkflowRun` 显式携带 `policyId`/`policyVersion`/`iterationId`，不靠 change prefix 猜
4. 运行前注入 goal/constraints/budget reservation/skills/context summary
5. 每次 transition 统一经 `TransitionApplication`，同时写 state 和 audit event
6. provider 回报真实 usage，ledger settle 后才更新预算
7. verifier + allowlist/denylist + autonomy level 共同决定 merge/pause/escalate
8. 每轮无论 success/fail/no-op/skip 都产生 `RunRecord`，反馈下次 context/readiness/graduation

> "每个 step 打印一句 loop"「目录里有 LOOP.md」「复制 A 的 8 个 CLI」——都不算。

---

## 终态 v2.0（工作流自定义引擎 + dashboard 工作台，2026-07-07 brainstorming 定稿）

**v1.0（下方"终态 v1.0"章节）已达成收官——完整 TS 重写 + 与老仓 workflow-plugin 字节级行为
等价，那是上一阶段的目的。从这里开始是新阶段，`与老仓行为等价`不再是新功能的验收约束**
（golden-oracle 作为历史证据链保留，但只覆盖"默认 workflow 预设"，不覆盖本阶段新增的自定义
能力）。详细技术设计见
`docs/superpowers/specs/2026-07-07-workflow-customization-and-dashboard-workbench-design.md`。

**达成判定 = 下方清单 E/F 全部勾满。** 与 v1.0 相同的纪律延续：证据先于勾选、清单只增不删、
八门验证全绿才收编。

> **当前状态（2026-07-08）**：E 全绿（E1-E8 全勾）+ F 全绿（F1-F4 全勾）。E8（workflow 编辑器
> 画布 UI）由独立后续计划补上——`docs/superpowers/plans/2026-07-08-workflow-editor-canvas.md`
> （9 个任务，`.superpowers/sdd/progress.md`），已知简化点见下方 E8 行脚注 +
> `docs/TEST-REALITY.md` G14。**v2.0 已达成本文件自己定义的"E/F 全部勾满"收官判据**。

## 清单 E · Workflow 自定义引擎

> 2026-07-08 集成收尾勾选，证据源：`docs/superpowers/plans/2026-07-07-workflow-customization-engine.md`
> 11 个任务 + `.superpowers/sdd/progress.md`（已合并进 `feature/dashboard-workbench`，见
> `docs/loops/progress.md` iteration-35）。E1/E3/E6 与最初文字表述有真实的、已披露的实现
> 偏差，逐条见下方脚注，不是静默勾掉。

- [x] E1 workflow 定义文件格式：`.pipeline/workflows/<name>.yaml`（Task 5 `loadWorkflow`
      真读该路径），7 相位内置为 `default` workflow（`templates/workflows/default.yaml`，
      数据非写死类型）。**实现偏差**：state 文件只新增了 `workflow` 字段（Task 4），未新增
      设计文档 §2.2 例子里写的独立 `current_step` 字段——Task 8 改为直接复用既有 `phase`
      字段承载自定义 workflow 的当前 step id（`workflow==='default'` 时其值仍是旧 7 相位
      枚举，`workflow!=='default'` 时其值是任意合法 step id），单字段身兼两职、靠 `workflow`
      字段消歧，功能等价但字面上不是"新增 current_step 字段取代 phase"。**2026-07-08
      whole-branch review 补**：11 个任务原本没有留下任何支持的命令把一个 change 摆到自定义
      workflow 的首个 step 上（`set phase` 被 manifest 枚举挡下、`migrate-workflow` 只处理
      已存在的 change）——已补 `tenon init --workflow <name>`（真加载校验后种
      `phase=steps[0].id`），见 `docs/TEST-REALITY.md` init 行。
- [x] E2 skill DAG 依赖：`depends_on` 声明（同 step 内，`skillDag.ts`/Task 6），取代已否决的
      parallel/serial 分组方案；无依赖 skill 天然并行，多依赖精确表达交叉依赖关系
- [x] E3 inputs/outputs：step 级别持久字段契约（`parse.ts`/`types.ts`，Task 2）+ 保存时
      引用校验（Task 3/E5）+ `evaluateStepGuards`（Task 7）按 `outputs` 声明写回字段，
      取代 kernel 硬编码字段表这部分真落地。**已披露缺口**：未驱动现有相位 handoff 压缩机制
      （`packages/kernel/src/compress/handoff.ts` 的 `PHASE_DOCS` 仍是按 7 个固定相位名
      写死的映射表，未读取 step 的 `inputs`/`outputs`）——设计文档
      （`docs/superpowers/specs/2026-07-07-*-design.md`）本身通篇未提 handoff.ts，11 个
      任务也无一涉及，是设计阶段就遗漏的一处衔接，非实现偷工。影响面：`default` workflow
      的 handoff 压缩（B13 护城河功能）完全不受影响、一如既往工作；自定义 workflow 下
      `phase` 是任意 step id，与 `PHASE_DOCS` 键值不匹配，`phaseHandoffDocs()` 静默返回
      空列表——即自定义 workflow 目前拿不到 handoff 压缩这个优化，非崩溃、非误报，登记入
      `docs/TEST-REALITY.md`。
- [x] E4 guards 参数化：现有 guard 规则类型（tasks-at-least/nonempty-output 等，Task 1/7）
      保留为代码实现的可选用类型，"用在哪个 step、参数多少"变成数据；`tasks-at-least` 真实
      计数逻辑仍是 Task 7 标注的诚实 TODO（恒失败，已登记 `docs/TEST-REALITY.md` 缺口 1）
- [x] E5 保存时校验：无循环依赖 + inputs 必须对应更早 step 的 outputs，拒绝非法 workflow
      不等运行时报错（`validate.ts`，Task 3，75 例）
- [x] E6 gate.sh 动态解锁：读 workflow 定义 + 扫描"进入当前 step 以来"的历史记录判定
      skill 解锁状态（Task 9）。**已披露窄例外**：`workflow==='default'` 这条最高频路径
      仍是纯 bash 热路径、零 spawn，CONTRACT §5.4 红线对它的承诺不破；仅当活跃 change 声明
      非 default workflow 且本次调用是 `Skill` 工具时，才委托 `node ... internal-skill-gate`
      做真实 DAG 判定（自定义 workflow 依赖图不值得在 bash 里重新实现一遍）——已作为 CONTRACT
      §5.4 的显式披露例外回写，`tools/test-hooks.sh` 把 `gate.sh` 从"零 node"红线清单里
      单独摘出并改断言"仅此一处合法引用"，非静默破例
- [x] E7 旧格式迁移工具：`tenon migrate-workflow`（Task 10），类比现有 `tenon import`，
      一次性迁移，不做运行时双格式兼容
- [x] E8 workflow 编辑器 UI：真画布节点连线图（`@xyflow/react`，两层：顶层 step 拓扑 +
      钥入某 step 看 skill DAG，同画布切数据源）。已知简化点（非阻塞，登记见
      docs/TEST-REALITY.md）：多项目场景下画布固定编辑 `snapshot.projects[0]` 这个
      project 的 workflow，未做"选哪个项目"的显式切换；guard 新增（只做了移除）；
      画布不支持撤销/重做/多选/minimap；节点/workflow 改名需删除重建。

## 清单 F · Dashboard 工作台

> 2026-07-08 集成收尾勾选，证据源：三份 dashboard 计划的 `.superpowers/sdd/progress.md`
> （均 PLAN COMPLETE、任务逐一审核通过），见 `docs/loops/progress.md` iteration-35。

- [x] F1 导航：新增"工作台"下拉分组（`Nav.tsx` `WORKBENCH_VIEWS`），下辖 AFK 工作台 + loop
      设置，顶部恢复到 3 项（收件箱/看板/设置）+ 1 个分组触发按钮。**F1 收尾当时**workflow
      编辑器（E8 画布 UI）本轮未建、skill 编辑器本就是设置页内弹窗（非独立导航目的地），
      故两者都不占此分组；workflow 编辑器已于 Task 9（GOAL E8 收编）追加为该分组第三项
      （`WORKBENCH_VIEWS` 现为 `['loops', 'afk', 'workflows']` 三项），skill 编辑器仍不
      占用（原因不变，仍是设置页内弹窗、非独立导航目的地）
- [x] F2 Skill 编辑器升级：`SkillTransferModal.tsx` 弹窗双栏穿梭框（左栏全部已注册 skill
      可搜索，右栏当前已选可拖拽排序），复用现有 `POST /api/config/mandatory-skills` 契约
      （skill-editor-transfer-modal 计划，4/4 任务）
- [x] F3 AFK 工作台：`AfkWorkbench.tsx` 列表+详情侧栏（左列表右详情：日志 tail/sandbox·
      worktree 路径/取消·重试操作），新增日志读取端点 + 取消/重试写端点（afk-workbench
      计划，8/8 任务）
- [x] F4 Loop 设置：`LoopsPanel.tsx` 单表视图（loop/就绪分/状态一行一个，点开详情含
      drift/就绪 band + 升降档操作），新增聚合读端点（snapshot）+ 升降档写端点（promote）
      （loop-settings-dashboard 计划，5/5 任务）

---

## 终态 v1.0（2026-07-06 用户指令定稿，已达成收官——历史参照，不再是验收约束）

**不是"把老仓代码搬过来"，而是交付一个行为等价、结构更优、质量有证据的完整替代品**：
老仓（workflow-plugin，本机 `/Users/a1234/Documents/code-manager/projects/workflow-plugin`）
全部核心功能在 TS 单语言内核上重建，且本次重构启动前诊断出的**每一个架构欠账、UI 病灶、
竞品缺口都在新仓被修复或实现**，每项收编都有机器可验证的质量门证据。

**达成判定 = 下方三张清单全部勾满。** loop-lite 的收敛检查（kill 判据）以本文件为唯一
对照物：任何一项未勾即存在缺口、循环不许收官；勾一项必须给出证据（测试名/oracle
报告/commit）。清单只增不删——发现新缺口就补进清单，绝不为收官降低标准。

> **✅ v1.0 收官（2026-07-07 iteration-28）**：四张清单全部达成（A 功能完备 / B 优化点 /
> C 质量保障含无伪测试 / D 竞品超越 9>·5≥·3 护城河）。8 里程碑全收编，~2040 断言全绿、
> golden-oracle 每轮 0 不一致、零伪测试。
>
> **✅ #29-wire / #34-wire 部署接线双双翻真跑（2026-07-07 iteration-30）**：拿到 docker 环境后，
> AFK docker 执行（`tenon afk run` 真调 automation.runRound + 真容器 + 真 git worktree/merge-back
> + 真 barrier build_sha）与 tap daemon 启动器（`tenon tap start` 真绑端口 + CA/TLS MITM +
> bedrock/ws 记录路径真接活）均已真跑验证，不再是 report-only 占位。
>
> **iteration-31（真 token 验证 full CC-in-sandbox）**：用户提供真 CLAUDE_CODE_OAUTH_TOKEN 并要求
> 必须走代理不直连，真跑全链路抓出并修复 3 个此前从未被真凭证触发过的死角（extraEnv 通道缺失、
> host.docker.internal 在本环境对宿主端口静默丢包故改容器内自起 tap、agent 分支缺
> `--dangerously-skip-permissions` 会挂死）。**tap 代理真实拦截+记录+转发了 4 条完整请求到真
> `api.anthropic.com`**（含真实 claude-cli User-Agent/系统提示词/Bearer 头，证明"走代理不直连"
> 约束真实成立）；该 token 被 Anthropic 真服务端拒绝（401，非本仓代码问题，未耗真实额度）——
> **agent 编码这一步本身仍待有效凭证验证**，如实登记不虚报为通过。详见
> docs/TEST-REALITY.md（真测审计）+ progress.md。
>
> **✅ iteration-32（G6 闭环：full CC-in-sandbox「agent 真编码成功」真跑验证通过）**：拿到有效
> 有效测试凭证后真跑到底——agent 真读 design_doc、真建文件、真 git commit，`git show`
> 独立核验（非只信 agent 自报）；tap 记录 8 条真请求逐字确认 `upstream_base_url:
> https://api.anthropic.com` + 真 `anthropic-beta: oauth-2025-04-20` + `response.status: 200`。
> 真跑过程中抓出并修复 2 个此前从未被有效凭证触发过的沙箱环境真缺口（alpine 缺 bash/SHELL 未设
> 导致 Bash 工具报错、容器任意 host-uid 无 passwd 条目导致 HOME 解析成不可写的 `/`）——**唯一
> 剩余诚实缺口彻底清零**。详见 docs/TEST-REALITY.md G6 条目 + progress.md iteration-32。
>
> **✅ iteration-33（长尾挂账清零：G4/G5 + 5 长尾适配器 + dashboard config 端点 + CI + 镜像发布文档）**：
> 4 项并行 fan-out（文件互不相交）+ 主会话 CI/发布脚本收编。G4：新增真 e2e 驱动完整 7 相位 skill
> 编排（含变异测试自证非空转绿）。G5：`node:sqlite` 内建模块真读 OpenCode（零第三方依赖，19 真例，
> schema 经真跑官方包核对而非猜测）。5 长尾适配器（aider/continue/cline/amp/zed）全部真实现，
> continue/cline 经查证由目标档 B 升级为 A；conformance 125→224。Dashboard 配置写端点复用 B5
> 鉴权 + 手术式 manifest 写回 + kernel 回读校验。`.github/workflows/ci.yml` 补齐八门自动化；
> `tools/sandcastle/build.sh`+README 记录手动构建/发布步骤（registry 选择留给仓库所有者）。
> 八门全绿，无新增诚实缺口。详见 docs/TEST-REALITY.md 对应条目 + progress.md iteration-33。

---

## 清单 A · 功能完备（迁移面 → BACKLOG M1–M6）

- [x] **A1 内核深度（M1）✅ 收官 iteration-15**：guard 全量校验面(#12)、transition 全副作用(#14)、
      task lifecycle(#15)、living-spec(#16)、session(#17)、manifest 全派生面(#18)、门 TTL 分级(#13)——
      七项全收编，均带真 fs e2e + oracle 双跑 0 不一致
- [x] **A2 hooks/插件全保真（M2）✅ 收官 iteration-17**：router Track 识别 + breadcrumb(#19)、
      SessionStart 三注入(#20)、PostToolUse 全套(#21)、7 相位 SKILL + openspec 四命令 + learn-record(#22)、
      4 agents(#23)、sync/uninstall scrubber(#24)——全收编，热路径纯 bash 红线 + 真 fs/真 hook e2e
- [x] **A3 dashboard（M3）**：server(#25) + 前端(#26) + SPA 服务(#26c) + doctor(#26b) + transition 单源(#25b) + config 写端点（iteration-33，复用 B5 token 鉴权）——全收编
- [x] **A4 channel + mem（M4）✅**：mem 跨 runtime 检索(#28) + channel 事件模型(#27) + channel 进程层 supervisor/真fork/SIGTERM/OS-liveness(#27b)
      **v3.0 后续处置（2026-07-16，codex 独立裁决"方案 D"）**：A4 的 v1 迁移与测试证据继续有效
      （3,002 行真实实现，非伪代码）；v3 根据消费关系复核——`server.ts` 零引用 channel、
      dashboard 仅 1 条"待 M4"占位字符串（`translations.ts`），从未真正接入产品——将 channel
      提取为非核心兼容包（`packages/channel`）并冻结 adapter/dashboard 扩建；loop 执行主链
      改由 A5 automation/AFK 承担。详见「终态 v3.0」清单 G4、非目标。这不是篡改历史：GOAL 本身
      已说明进入新阶段后"与老仓行为等价"不再是新功能验收约束，A4 原记录原样保留。
- [x] **A5 automation / AFK Sandcastle（M5）✅**：队列+scheduler+lifecycle+L1→L3(#29) + server afk 数据端(#29d) + docker 全链真实现+真 git worktree/merge-back 冲突留现场(#29c) + **#29-wire 部署接线真跑**（iteration-30：`tenon afk run` 真调 automation.runRound(createDockerRunChange) + 真容器 + 真 merge-back，sandcastle:test 镜像 e2e 验证）；full agent-in-sandbox 支线（含 CLAUDE_CODE_OAUTH_TOKEN 门控）已用有效凭证真跑验证通过（iteration-32）
- [x] **A6 工作流能力补强（M6）✅**：上下文压缩(B13)+auto-transition(B14)+Cursor 转正(B15)+scaffold 契约收尾(B16)+npx 上手(B17) 全收编
- [x] **A7 tap 流量代理（M8）✅**：daemon+proxy+trace_store+护栏(#34) + traffic 数据端(#34d) + ws 重组/bedrock/本地 CA·TLS MITM(#34b，node v24 真跑) + 13 runtime clients(#34c) + **#34-wire 部署接线真跑**（iteration-30：daemon 接 CertificateAuthority.fromDir、launch.ts 真装配 detectTarget+env 注入、record 路径真接 bedrock 解码 + 全新 ws-proxy.ts 中继首次接活 ws-reconstruct、`tenon tap start` 全新 CLI 入口）
- [x] **A0 7-phase 状态机 + 三门 + CLI + 单文件分发 + 导入工具**（v0.1，iteration-0~9，oracle 0 不一致）

## 清单 B · 修改与优化点（迁移 ≠ 平移——每条都是对老仓的改进承诺）

**架构**
- [x] B1 单语言 TS 内核：三读取器契约构造性消灭（iteration-1）
- [x] B2 manifest 单一真相源：引擎真读 review_phases，修老仓半接线欠账（flow.test 回归锚）
- [x] B3 历史存储去变形：JSONL 侧文件替代 base64 塞 YAML + `tenon import` 迁移（iteration-2/8）
- [x] B4 全局 server 版本抢占（#25）：旧版本 SIGTERM 让位，真进程 e2e（修老仓欠账 #3）
- [x] B5 dashboard 写端点 token 鉴权（#25）：crypto 256-bit + 0600 握手 + 常量时间比较，POST 无 token 401（修老仓欠账 #4）
- [x] B6 构造级模块化（#25~#39）：kernel/server/dashboard/tap/automation 独立 workspace 包 + snapshot capability 声明、前端按声明渲染
- [x] B7 hook 热路径纯 bash 红线：制度化为测试自证（grep -c node = 0，iteration-1/7）
- [x] B8 降级可见（#26b/#34e）：`tenon doctor` 11 项保障生效清单 + tap 敏感能力明示（补老仓 _pipeline_health 无统一面）
- [x] B9 注释考古不入代码：历史入 docs/进度流水，代码只留当前约束（全仓执行中）

**UI（老仓四病灶的解法）**
- [x] B10 收件箱：`tenon inbox`/`--html`——默认回答"在等我什么决定"（iteration-5/6）；M3 里升级为 dashboard 默认落地页
- [x] B11 statusline：终端内零开销状态（iteration-7）
- [x] B12 操作与配置分离 + debug 降级（#26）：收件箱/看板/设置三视图 + Advanced 折叠，一级导航恰 3 项

**工作流能力补强**
- [x] B13 上下文压缩（#30 iteration-21）：phase handoff 确定性压缩（实测 45.4%，门槛 ≥25%），零 LLM 可 oracle
- [x] B14 auto-transition 中间档（#31 iteration-21）：`tenon advance` guard 全绿自动推进、复核相位+三门必停（HITL 红线三重证明）
- [x] B15 Cursor 适配器转正（#39 iteration-22）：spike→可发布，veto/track native + inject 降级 .cursor/rules，修「声明 track 却不写 history」病灶
- [x] B16 scaffold 契约收尾（#33 iteration-23）：8 partial + 1 missing 全处置（3 实现 + 1 忠实占位 + 5 诚实 N-A）
- [x] B17 npx 一行上手：5 分钟心智模型路径（iteration-4）

**loop-engineering 思想内建（2026-07-06 用户指令，对标 cobusgreyling/loop-engineering + 老仓 loops 子系统）**
- [x] B18 loop 治理子系统（#35 iteration-19）：loops registry（schema 校验的登记表）+ enforce 裁决
      （R1-R11 规则面 + budget/kill 判据）+ L1→L3 分级放权入 schema；执行流水审计 run-log 就绪
- [x] B19 分级放权 L1→L3（#38 iteration-24）：毕业制 report→人工门→allowlist，逐级升(准入=就绪分)不跨级、降档安全优先，消费 #36/#37 零改核心
- [x] B20 token 预算与熔断（#36 iteration-22）：loop 级 token budget + circuit breaker（超阈值 tripped）
      + 成本估算（cadence×pattern），扩展 #35 loops、enforce 零改动
- [x] B21 漂移检测与就绪审计（#37）：7 维 drift 对账 + 0-100 loop-ready 评分

## 清单 D · 核心能力验收判据

每个核心维度都必须有可复现的实现、契约与验证证据：

**规范与交付**
- [x] D1 规范持久化与自动注入（#20/#18）：SessionStart 三注入 + manifest 单源
- [x] D2 任务/状态结构化：`.pipeline.yaml` 37 字段 + 7 相位（v0.1）
- [x] D3 会话记忆/journal（#28/#7）：mem 跨 3 runtime 检索 + history JSONL
- [x] D4 真实工具链验证（#12/#29c）：check/guard 46 规则全量面 + automation docker 沙箱 verify
- [x] D5 学习回写闭环（#22）：learn-record 三层回写
- [x] D6 简单性：npx 一行上手 + 5 分钟心智模型（iteration-4）
- [x] D7 多平台策略面（#39/#40/iteration-33）：适配器框架 + 224 conformance 断言 + 分档降级 A/B/C，active 12（claude/codex/cursor/gemini/copilot/pi/devin/aider/continue/cline/amp/zed，longtail 已清零）
**运行与运维**
- [x] D8 脚本守门状态机：三门 hook 硬拦 + guard 46 规则 + CAS/锁（#12）
- [x] D9 dashboard（#25/#26/#26c）：全局 server + 收件箱默认视图 + token 鉴权 + 版本抢占
- [x] D10 doctor 健康面（#26b/#34e）：11 项保障生效清单 + tap 敏感能力明示
- [x] D11 上下文压缩（#30）：确定性压缩 45.4%（且可 oracle）
- [x] D12 auto-transition（#31）：中间档 + HITL 红线三重证明
- [x] D13 可恢复工作流：断点恢复不依赖对话历史（.pipeline.yaml 真相源，v0.1 oracle 验证）
- [x] D14 平台广度（#39/#40/iteration-33）：可移植内核 + 填表式扩展经 9 平台实证（一次转 active 跨 A/B/C 档，含长尾 5 平台真实现，2 项经查证由目标档升级）；conformance 保证等价性
**vs 两者皆无（差异化护城河）**
- [x] D15 golden-oracle 行为等价迁移法（双跑逐字 diff——两家都没有的质量证据链）
- [x] D16 loop-engineering 治理（#35/#36/#37/#38）✅闭环：registry+enforce R1-R11+L1→L3 毕业制+budget/circuit-breaker+drift/loop-ready 审计+graduation 执行面——两竞品都无此面（独有护城河）

## 清单 C · 质量保障（过程约束——任何一轮违反即不收编，没有例外）

- [x] C1 **五门全绿**方可收编：build / vitest / test-hooks / verify-skills / oracle 双跑
- [x] C2 **golden-oracle 行为等价**：与老内核逐字对齐，差异必须白名单化并文档说明（CONTRACT §3）
- [x] C3 **TDD 先红**：先红测试后实现（iteration-5 的瑕疵已记录在案，此后每轮流水注明先红证据）
- [x] C4 **skill/资产零悬空引用**：verify-skills 安装期硬校验（用户硬要求，CONTRACT §5.7）
- [x] C5 **热路径性能预算**：PreToolUse/statusline 纯 bash、零解释器 spawn（测试自证）
- [x] C6 **复杂度预算**：核心 kernel+cli 独立 workspace 包，channel/mem/automation/tap/server/dashboard 各自独立可选装（npm workspaces 分包）；npx 一行上手路径全程保持
- [x] C7 **契约实测回写**：文档口径与实测冲突时以实测为准并回写 CONTRACT，留审计记录
- [x] C8 **流水可审计**：每轮 progress.md 记录证据（测试计数/oracle 结果/commit hash），诚实记录瑕疵
- [x] **C9 无伪测试 · 真实且全量（2026-07-07 用户指令）✅**：任何功能不得
      仅以 mock 单测收编——每条 CLI 命令 / 每个子系统必须有**驱动真实实现、真实文件系统、
      真实子进程**的端到端测试（真跑 kernel createStateStore/createFlowEngine、真跑编译产物、
      真跑 hooks 脚本）。mock 单测可留作快速回归，但**收编门以真实 e2e 绿为准**。
      伪测试判据（命中即不算真测试）：① 断言的是 mock 的返回而非真实副作用；② 测试通过但
      真实路径从未执行；③ 跳过/伪造 pass 冒充绿（延续老仓「任何路径不为绿伪造」诚实门）。
      落地：packages/cli/src/integration.test.ts（真 fs 全命令）+ oracle 双跑 + bundle 冒烟，
      三者构成真实证据链；每新增命令/子系统必须进真实 e2e 面，audit 见 docs/TEST-REALITY.md。
- [x] **C10 覆盖全量 ✅**：真实 e2e 覆盖每条命令 happy path + 关键错误路径 + 跨命令串联
      （init→…→archive 全程），不许只测子集；覆盖缺口在 TEST-REALITY.md 显式登记，不静默留白。

---

## 历史

**v0.1（轻量内核切片）**：四项判据 2026-07-06 iteration-9 收敛检查全部达成 ✅——
oracle 双跑 0 不一致；lite 写 → 老内核读交叉验证通过；vitest 232/232 + kernel 零运行时
依赖；单文件 bundle 全程 open→archive 七相位跑通。原范围定义见 git 历史（`0820771` 前）。

## 为什么（动机，2026-07-06 架构评审结论，保留）

1. 老内核 bash 7.2 万行已过维护经济性拐点，python3 已是关键路径硬依赖——"纯 bash 可移植"前提不再成立。
2. 三读取器契约靠纪律防漂移，单语言构造性消灭。
3. 赢用户靠"5 分钟建立心智模型"，不是功能数量。
4. base64 历史塞 YAML 的存储变形 → JSONL 侧文件。
