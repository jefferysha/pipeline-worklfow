# `fix-tenon-entry-skill-contract` 验证报告

## 第 10 轮 Verify（冻结工作区 `b5f80904…e4f6db7e`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:b5f80904b3115633f6c825a35c65ee3ba4312c2766a21b9218bb42a0e4f6db7e`
的全量自动化、真实浏览器、移动端布局、持续授权路由和 OpenSpec 隔离应用均通过；第九轮的
snapshot、重复 event、超长项目名和 convergence receipt 问题也已关闭。但独立 Reviewer 仍确定性
复现两条 High 级事务窗口，并发现正式规格、ADR 与实施计划没有覆盖本轮新增的恢复契约。因此不能
进入 Ship，必须经 `verify-fail → build → requirements-changed → spec` 回到设计边界修订。

### 已确认通过

- `npm run test:all`：后端/CLI/kernel 共 312 个测试文件、5315 项通过，5 项真实外部环境测试诚实
  跳过；Dashboard 50 个测试文件、962 项通过，0 项失败。存在既有 React `act(...)` 警告，不影响
  退出码。
- `npm run build`、`npm run check:identity`、`npm run check:architecture`（600 个生产文件）、
  `npm run check:repository-hygiene` 与 `git diff --check` 全部通过。
- `bash tools/test-hooks.sh`：460/460 通过；持续授权自然语句会创建 Change-bound authority，
  “不可以”“不同意”“继续，但先别改代码”优先保留交互门，授权不跨 Change，撤回后恢复逐步确认。
- `openspec 1.6.0` 对当前 Change 的 strict validate 通过。隔离副本成功 archive/apply 8 条
  delta；应用后的 `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 四项主规格逐项 strict valid。真实主规格前后 SHA-256 清单完全一致。
- 隔离副本的全仓 strict validate 如实暴露 13 项既有基线债务：8 个旧主规格缺 Purpose，5 个旧
  Change 没有 delta。它们不伪装成本 Change 的失败，但属于全项目治理债务，当前 Change 完成后
  另建独立 Change 修复。
- 第十轮真实 Chromium 候选为 Tenon `1.0.1`、Dashboard `18771`。无 root URL 回到
  `?view=projects`，没有隐式项目选择，per-root API 请求为 0；选择、Back/Forward、终端与
  automation 来源分流、canonical readiness、能力不可用、多出口和 decoder 漂移失败关闭全部通过。
- E2E 聚焦回归：canonical readiness 75/75、Dashboard 边界 198/198；console error 与 HTTP
  4xx/5xx 均为 0。候选进程、浏览器和隔离 runtime 已清理。
- 视觉轨 `PASS`，Critical/High/Medium/Low 全部为 0。390px 下超长不可达名称与“读不到”间距
  14px；390/1280 的 Projects、Progress、AFK、Workbench 均无页面级横向溢出或全局裁切兜底。
  视觉报告为 `/tmp/tenon-verify10-visual-REVIEW.md`。

### 独立审查阻断

1. **High：host mutation 的 `started → completed` 窗口仍会重放已成功命令。**
   `release-coordinator.ts` 在写入 `started` 后执行宿主命令，再写 `completed`。命令成功后若进程
   崩溃或 completed journal 写失败，恢复只看到 `started` 并再次执行 `action()`。
   `managed-host-command.ts` 没有每个命令的权威 postcondition/reconcile 策略；现有故障注入只覆盖
   candidate journal 提交失败，没有覆盖“宿主 action 已成功、completed 未落盘”。必须把宿主
   mutation 改为 desired-state reconciliation：每个步骤声明 before/after inventory、可观察
   postcondition 与 replay policy；恢复先对账，已达成则补 checkpoint，未达成才执行，宿主状态
   出现第三种漂移时失败关闭。
2. **High：Dashboard 身份没有 transaction id，前后快照不能证明事务所有权。**
   当前 coordinator 只用 port/PID/release/state-scope 比较 before/current；另一个用户命令可以在
   两次探测之间启动同 release Dashboard，被当前事务误判为 `transaction`，随后 evidence 失败时
   可能被停止。必须把 managed transaction id 贯穿启动环境、pidfile/health、durable identity、
   inspect/adopt/stop，并且事务只能认领 exact transaction；普通 Dashboard 没有该 id，不能被收养
   或补偿。
3. **High：新增恢复与持续授权契约尚未进入正式规格链。**
   `tasks.md` 已声称 WAL、Dashboard ownership、readiness 和持续授权完成，但 delta spec 没有
   host-step reconciliation、transaction-bound Dashboard ownership、delegated review/持续授权
   要求；技术设计、ADR 和实施计划仍停留在最初入口身份与项目选择方案。必须先回 Spec 更新
   `plugin-distribution`、`normal-chat-routing`（必要时新增 runtime capability）、设计、ADR 和计划，
   补齐故障矩阵与验收场景，再重新 Build。

### 独立验证轨

- Reviewer Agent：`FAIL`，冻结指纹精确匹配；发现上述 3 个 High。后端聚焦 146 项、前端聚焦
  176 项、项目选择模型、Hook 460 项、Web TypeScript、架构和 diff 检查均通过。
- E2E Agent：`PASS`，真实浏览器、持续授权、390px 与 273 项聚焦回归通过；不覆盖代码事务审查。
- 视觉 Agent：`PASS`，四个页面、两个断点、来源标签、键盘焦点和 console 全部通过。
- Codex CLI：已启动只读 `codex exec review --uncommitted`，但该版本在加载项目 review Skill 后
  再递归启动第二个 Codex review，9 分钟仍无最终结论；主进程和子进程均由本轮显式终止，退出码
  143。此轨记为 `INCONCLUSIVE`，不得写成通过；Reviewer 的确定性 High 已足以判定本轮失败。

### 第 10 轮返工范围

1. 先走受控 `requirements-changed`，把 desired-state host reconciliation、transaction-bound
   Dashboard identity、持续授权/delegated review 和逐崩溃点验收写入 delta spec、design、ADR、
   plan 与 tasks。
2. 以红测覆盖每个 host action 成功后、completed checkpoint 前崩溃；恢复时证明“已达成则零命令、
   未达成才执行、宿主漂移则失败关闭”。
3. 把 transaction id 注入 managed Dashboard 的启动、健康响应和持久身份；证明并发普通 Dashboard
   不会被认领或停止，崩溃恢复只收养 exact transaction。
4. 重新运行完整 Build 门禁并冻结新的 workspace SHA，再执行第十一轮 Reviewer、Codex、E2E 与
   视觉验收。

## 第 9 轮 Verify（冻结工作区 `e11247c…8af586`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:e11247c0e37d6a67cae55e8a0492aeb3a7a9387c0c6f4ad7c5ddd10a938af586`
已经修复第八轮的 canonical guard readiness、单一跨进程锁和基础 WAL；真实浏览器中的项目选择、
终端/自动运行来源分流、逐 event readiness 与移动端布局也全部通过。但两条独立代码审查继续发现
五个 P1 级架构缺口：宿主 mutation 与 Dashboard 所有权尚未完整进入可恢复事务，收据重放不幂等，
snapshot 升级契约会让旧页面离线，且每次轮询会对全部 Change/全部 phase 重算工作区摘要。另有一个
自定义 workflow 重复 event 的校验边界 P2。因此不得进入 Ship。

### 已确认通过

- `npm run test:all`：后端/CLI/kernel 共 312 个文件、5308 项通过，5 项因真实外部凭据诚实跳过；
  Dashboard 共 50 个文件、961 项通过；0 项失败。
- `npm run build`、`npm run typecheck:web`、`npm run check:identity`、
  `npm run check:architecture`（597 个生产文件）、`npm run check:repository-hygiene`、
  `npm run check:comments` 与 `git diff --check` 全部通过。
- hooks 457/457、adapters 272/272、bundle 23/23、Skill inventory 65 个引用/62 个 Skill、
  golden oracle 0 mismatch、文档、中文模板、npx 薄包与旧桥接门禁全部通过。
- `openspec validate fix-tenon-entry-skill-contract --strict` 通过。隔离目录
  `/tmp/tenon-verify9-openspec.I6yl2I` 成功 archive/apply 8 条 delta；应用后的
  `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 四项主规格逐项 strict valid。真实主规格摘要仍为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`，没有被演练修改。
- 第九轮真实 Chromium 候选为 Tenon `1.0.1`、Dashboard `http://127.0.0.1:18770`。无项目选择
  时 URL 规范化为 `?view=projects`，项目级 API 请求数为 0；显式选择后才绑定精确 root，
  Back/Forward 正确，隔离 registry 只有当前 `pipeline-worklfow`。
- 普通 heartbeat 只在进度页显示“终端运行中”，AFK 不收录；automation 状态在进度页显示
  “自动运行中”且只在 AFK 出现。`field-equals`、`field-in`、`file-exists`、
  `tasks-at-least`、`build-head-unchanged`、能力不可用、ready case 与自定义多出口最小 blocker
  选择全部符合 canonical 语义；event key 漂移被 decoder 失败关闭。
- 390px 项目页和进度页均为 `scrollWidth=clientWidth=390`，无页面级横向裁切；浏览器 console
  error 和观察到的 HTTP 4xx/5xx 均为 0。E2E 独立轨聚焦回归 357/357 通过，视觉轨功能与布局
  PASS。候选服务、浏览器 profile 与隔离 runtime 均已清理。

### 独立审查阻断

1. **P1：host mutation 在 `preparing-host` → `candidate-resolved` 之间仍不可恢复。**
   marketplace upgrade/add/list 已改变宿主 inventory，但 journal 写入 candidate 前崩溃时，
   磁盘仍停在 `preparing-host`，重跑会重复完整宿主更新。当前 WAL 没有命令子阶段、操作
   idempotency key、前后 inventory checkpoint 或恢复对账，无法区分未开始、部分完成与已完成但
   commit 丢失。
2. **P1：Dashboard 所有权没有进入 WAL。** Dashboard 健康后、`dashboard-ready` journal 写入
   前后崩溃，恢复会复用遗留服务但只持有已退出探测子进程的内存 session。随后收据失败时，
   `stop()` 无法停止真实 Dashboard，却可能回滚 runtime，最终留下占用 18765 的新 Dashboard
   指向空或旧 runtime。必须持久化服务身份、事务所有权与 adoption，并区分本事务启动和复用。
3. **P1：ready evidence 重放不幂等。** 收据回调成功后、`evidence-committed` journal 落盘前
   崩溃，恢复会再次写收据；新时间戳和旧 inventory 可能把已完成的清理重新变成
   `cleanup-pending`。收据提交必须使用 transaction id 幂等对账，不能只靠阶段字符串。
4. **P1：snapshot 滚动升级契约不兼容。** 新 server 删除 project 级 `workflowRules` 后，升级前
   已打开的旧 Dashboard decoder 会拒绝所有 snapshot，直到人工刷新。managed runtime 的 server
   与浏览器页面不是原子替换，必须提供有版本边界的滚动兼容投影，不能把重载当作事务保证。
5. **P1：每次 snapshot 轮询对每个 Change 的全部 step 求值。** 这会在无关 phase 重算
   `workspaceFingerprint`，反复遍历整个项目；编辑过程中的瞬时文件变化还能让项目扫描整体失败，
   进而清除显式选择。应只求当前 step 的可达 transition，按 root/请求周期缓存昂贵 capability，
   并把瞬时失败表示为结构化 blocker。
6. **P2：重复 event 的 canonical 校验与 Dashboard decoder 不一致。** runtime 当前接受同一步
   重复 event 并确定性选择首条，而 decoder 会拒绝整个 snapshot。应在 workflow 验证边界拒绝该
   歧义并提供迁移诊断，或让所有消费者保持同一语义；不能只在 UI 边界突然离线。

### 独立验证轨

- Reviewer Agent：`FAIL`，冻结摘要精确匹配；聚焦后端/CLI 124 项、Dashboard 176 项、项目选择
  模型与 Web TypeScript 均通过，但精确复现 host mutation 与 Dashboard ownership 两个崩溃窗口。
- Codex CLI：`FAIL`，只读审查发现 snapshot 滚动兼容、全量工作区摘要、ready evidence 幂等性
  三个 P1，以及重复 event 边界一个 P2。其只读沙箱因无法写 Vite 临时配置而不能启动 Vitest；
  同一聚焦与全量测试已由主轨和独立 E2E 轨成功执行。
- E2E Agent：`PASS`，真实浏览器与 357 项聚焦回归通过；整体仍须服从代码审查的事务阻断。
- 视觉 Agent：`PASS`（Critical 0 / High 0 / Medium 1 / Low 0）。唯一 Medium 是不可达项目的
  超长 basename 在 390px 下会与“读不到”重叠；不产生页面级横溢出，但纳入本次返工，不留已知
  UI 缺陷。报告为 `/tmp/tenon-verify9-visual-REVIEW.md`。

### 第 9 轮返工范围

本次回退不改变已评审产品需求，只补齐同一架构承诺：

1. 将 host mutation 拆成带 transaction id 的 durable 子步骤，以前后 inventory checkpoint
   对账并幂等恢复，补 `candidate-resolved` 写失败和每条宿主命令中断的故障注入。
2. 将 Dashboard 服务身份、启动/复用来源、事务 ownership/adoption 和精确 stop/restore 纳入
   WAL；收据按 transaction id 幂等提交，覆盖 Dashboard ready 与 evidence commit 前后崩溃。
3. 为 snapshot contract 增加显式协议版本与受控滚动兼容投影；只计算当前 step 的可达 event，
   在单次扫描中按 root 缓存昂贵 capability，失败投影 blocker 而不让项目整体离线。
4. 在 canonical workflow validator 拒绝同一步重复 event，并提供确定性错误；补 server、
   decoder 与迁移回归。
5. 修复不可达项目超长 basename 的 390px 排版，再执行第十轮完整自动化、独立代码审查、
   真实浏览器和视觉验收。

## 第 8 轮 Verify（冻结工作区 `22960769…f9cf8ed`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:22960769e956ba43e1240d45471d0228b89f23a87df115516eb4dacb1f9cf8ed`
已修复第七轮的 workflow 标签精确键校验和 390px 项目总览溢出，真实浏览器主路径、逐 event
基础场景、全量自动化与 OpenSpec 隔离归档演练均通过。但两条独立代码审查发现三个新的 P1
架构阻断：Dashboard readiness 丢失 canonical guard 谓词语义，宿主插件变更没有被同一个跨进程
事务覆盖，runtime 激活到 convergence receipt 之间缺少崩溃恢复日志。因此不得进入 Ship。

### 已确认通过

- `npm test`：311 个文件，5297 项通过，5 项因真实外部凭据诚实跳过，0 项失败。
- `npm run test:web`：50 个文件，960/960 通过；存在既有 React `act(...)` 警告，无测试失败。
- `npm run build`、`npm run check:architecture`、`git diff --check`、产品身份、仓库卫生、文档、
  中文文档模板、npx 薄包、bundle 与 Skill inventory 全部通过。
- hooks 457/457、adapters 272/272、golden oracle 0 mismatch、迁移 CAS 13/13 均通过。
- `openspec validate fix-tenon-entry-skill-contract --strict` 通过。隔离目录
  `/tmp/tenon-verify8-openspec.hVs2fZ` 成功 archive/apply 8 条 delta；应用后的
  `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 四项主规格逐项 strict valid。真实主规格摘要前后均为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`，未修改真实主规格。
- 第八轮真实 Chromium 候选运行于 `http://127.0.0.1:18770`，标题为 `Tenon Dashboard`，
  版本为 `1.0.1`，资源为 `index-cbTnFvjc.js` 与 `index-DNohub42.css`。未选择项目时 URL 无
  `root` 且 per-root API 请求为 0；显式选择、键盘打开、Back/Forward、终端与自动运行来源隔离、
  event/label decoder 失败关闭均通过，console error 和 HTTP 4xx/5xx 为 0。
- 390px 项目总览与进度页均为 `scrollWidth=clientWidth=390`；摘要、统计、Chevron 全部位于
  可视区内。候选进程和临时 runtime 已清理。
- E2E 独立轨运行 381 项聚焦测试，全部通过。

### 独立审查阻断

1. **P1：Dashboard readiness 丢失 canonical guard 谓词。**
   `transition-field-requirements.ts` 将 `field-equals`、`field-in`、`file-exists`、
   `build-head-unchanged` 等 guard 降格为字段名，`progressModel.ts` 只判断字段是否为空。
   反例中 edge 要求 `branch_status=handled`，实际值为非空的 `pending`；Dashboard 报 `gate`，
   runtime 返回 `guard-failed`。`tasks-at-least` 等非字段 guard 还会被静默投影为空要求。
   必须由 kernel/server 复用真实 guard 语义生成逐 event readiness，无法判定时失败关闭，前端
   只消费结构化结果。
2. **P1：setup/update 宿主插件 mutation 在跨进程事务之外。**
   `setupHost.ts`、`update.ts` 在进入 managed runtime transaction 之前执行 marketplace
   安装、升级和候选解析。两个并发进程可同时改变宿主 inventory，再各自串行激活不同候选，破坏
   “宿主收敛 + runtime 激活 + receipt”单一串行事务。
3. **P1：激活后到收据提交前没有 durable pending transaction。**
   runtime selection/launcher 已提交后，直到 Dashboard ready 与 convergence receipt 落盘之间
   没有持久化事务阶段。此窗口进程崩溃会留下新 runtime/Dashboard 而无 receipt；重跑不能识别
   该未完成事务，也可能因旧进程占用端口进入不确定状态。需要 write-ahead checkpoint、明确提交点
   和按阶段幂等恢复/补偿，不能靠端口清理兜底。

### 独立验证轨

- Reviewer Agent：`FAIL`。冻结摘要匹配；294 项聚焦测试和 web typecheck 通过；精确复现
  guard 谓词被压缩后 Dashboard 与 runtime 分歧。
- Codex CLI：`FAIL`。独立审查确认宿主 mutation 锁域不足以及 runtime 激活后缺少可恢复
  pending transaction 两项 P1。
- E2E Agent：`PASS`。真实浏览器、移动端、来源隔离、基础逐 event readiness、严格 decoder
  和 381 项聚焦回归全部通过。
- 视觉 Agent：`PASS`。390px 与 1440px、亮暗主题、hover、键盘焦点环和深链均无
  Critical/High/Medium/Low；未使用全局横向裁切，console/失败请求/HTTP 4xx/5xx 均为 0。
  报告为 `/tmp/tenon-verify8-visual-REVIEW.md`。
- 主验证轨：全量自动化、静态门禁和 OpenSpec 隔离应用通过；上述任一 P1 均足以判定本轮失败。

### 第 8 轮返工范围

本次回退不改变已评审产品需求，只修正实现契约：

1. 删除字段名式 readiness，建立 kernel 唯一 guard evaluator 的结构化逐 event 结果；服务端提供
   ready/blockers，前端不得重新解释 guard。
2. 将宿主 marketplace mutation、候选解析、runtime 激活、Dashboard readiness 与 convergence
   receipt 纳入同一逐 scope 跨进程事务。
3. 在事务内建立 durable write-ahead journal，覆盖 prepare、host mutated、runtime activated、
   dashboard ready、receipt committed；重跑按 journal 和官方 inventory 幂等恢复或精确补偿。
4. 为谓词不匹配、文件不存在、非字段 guard、并发 setup/update 以及每个崩溃注入点先写红测，
   修复后重新冻结并执行第九轮三轨 Verify。

## 第 7 轮 Verify（冻结工作区 `8de5b0…a73985`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:8de5b0da36c903dfe582ebebc239d1bc05f70ab06a65d66b21c7330078a73985`
上的逐 Change、逐 step、逐 event readiness 架构已经生效：default 直接消费 canonical event
policy，自定义 workflow 同时消费 step 与 edge guards，多出口按 event 独立求值，任一出口 ready
即可进入 gate；全部未 ready 时按最小缺失集和冻结声明顺序确定展示项。独立 Codex 审查和真实移动端
浏览器验收仍分别发现 1 个 P1 边界缺口与 1 个视觉阻断，因此不得进入 Ship。

### 已确认通过

- 最新聚焦回归：CLI/server 99/99，Dashboard 125/125；E2E 独立轨另跑 378 项全部通过。
- `npm test`：311 个文件，5296 项通过，5 项因真实外部凭据诚实跳过，0 项失败。
- `npm run test:web`：50 个文件，958/958 通过；存在既有 React `act(...)` 警告，无测试失败。
- `npm run typecheck:web`、身份、架构、仓库卫生、文档、中文文档模板、npx 薄包和
  `git diff --check` 全部通过。
- hooks 457/457、adapters 272/272、bundle 23/23、Skill inventory、golden oracle 与迁移 CAS
  均通过。
- OpenSpec 1.6 的 Change strict validate 通过。隔离目录
  `/tmp/tenon-verify7-openspec.a83TBg` 成功 archive/apply 8 条 delta；应用后的
  `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 四项主规格逐项 strict valid，真实主规格 digest 前后完全一致。
- 第七轮真实 Chromium 候选运行于 `http://127.0.0.1:18770`：未选择项目时 URL 无 `root`、
  不访问 per-root API；显式选择使用 pushState，Back/Forward 正确；终端与自动运行来源隔离；
  console error 与 HTTP 4xx/5xx 均为 0。验收结束后候选服务与 Chromium 已清理。
- 浏览器行为反例全部通过：default Explore 只有 `design_doc` 时为 gate；PM Spec 无 legacy
  `plan` 时为 gate；自定义 edge guard 缺 `release_notes` 时为 agent、补齐后为 gate；多出口
  任一 ready 时为 gate，全部未 ready 时选择最小缺失集，并列时保持 transition 声明顺序；
  event key 漂移会使 snapshot fail closed。

### 独立审查阻断

1. **P1：`labelByStep` 缺键未 fail closed。** `snapshotDecoder.ts` 对 `transitions`、
   `gateByStep`、`outputsByStep` 和 `requiredFieldsByTransition` 都验证精确 step/event key 集，
   但 `labelByStep` 只拒绝多余键，不拒绝缺失键。删除合法 snapshot 的
   `labelByStep.open` 后，`decodeSnapshot` 仍返回非 `null`，随后又把不完整对象断言为完整
   `Record<string, string>`。必须让 `labelByStep` 使用同一 exact-key 契约并补缺键红测。
2. **视觉阻断：390px 项目总览横向溢出。** 真实页面
   `documentElement.scrollWidth=494`、`clientWidth=390`；项目 summary、运行统计和 Chevron
   被推出视口。移动端进度页本身为 `390/390`。需从项目行响应式布局解决，不得用页面级
   `overflow-x:hidden` 掩盖。

### 独立验证轨

- Codex CLI：`FAIL`，精确重算冻结摘要并复现 `labelByStep` 缺键仍被 decoder 接受；同时确认
  逐 event readiness 的五项关键语义均通过，未发现其他 P0/P1/P2。
- E2E/视觉轨：`FAIL`，全部功能行为和 378 项回归通过，但真实 390px 项目页存在页面级横向
  溢出；截图为 `/tmp/tenon-verify7-mobile-projects.png`。仓库没有与本冻结版本、同视口和同状态
  绑定的像素基线，因此像素回归结论如实记为 `INCONCLUSIVE`，人工视觉阻断成立。
- 主验证轨：全量测试、静态门禁、OpenSpec 隔离应用和真实主规格不漂移均通过；以上两个独立
  阻断足以判定本轮失败。

### 第 7 轮返工范围

本次回退不改变已评审需求语义。Build 将以红测证明 `labelByStep` 缺键当前被接受，再把所有
workflow step 属性表统一到 exact-key decoder 契约；同时为项目总览增加 390px 响应式回归和真实
浏览器复验，重排项目行而非裁切内容。完成后重新冻结并执行第八轮 Verify。

## 第 6 轮 Verify（冻结工作区 `a67f63…a76fb`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:a67f63b027ed1055dae710b8dd15042befb100e7ef0b9e612705fafc872a76fb`
精确匹配，且第五轮的跨 Track contract 拆分已经生效；全量自动化、OpenSpec 隔离应用、真实浏览器
和 Codex 独立审查均通过。但 Reviewer Agent 复现了 1 个 P1 和 1 个 P2：default 进度仍绕开逐
Change 执行投影，自定义 workflow 的 edge guard 也没有进入逐 event readiness。因此本轮不得进入
Ship。

### 已确认通过

- `npm run build`：通过；Dashboard、server 和 CLI bundle 成功生成。Vite 仍有单块 JavaScript
  超过 500 kB 的非阻断提示。
- `npm test`：311 个文件，5295 项通过，5 项凭证相关诚实跳过，0 项失败。
- `npm run test:web`：50 个文件，956/956 通过；存在既有 React `act(...)` 警告，无失败。
- hooks 457/457、adapters 272/272、bundle 23/23、Skill inventory、golden oracle、身份、架构、
  仓库卫生、文档、中文模板、npx 薄包、迁移 CAS 与 `git diff --check` 全部通过。
- `openspec show ... --deltas-only` 与 Change strict validate 通过；隔离目录
  `/tmp/tenon-openspec-verify6.JCgwAf` 成功 archive/apply 8 条 delta。应用后的
  `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 四项主规格逐项 strict valid，真实主规格摘要前后不变。
- 第六轮真实 Chromium 候选运行于 `http://127.0.0.1:18770`：未选择项目时 URL 无 `root` 且无
  per-root API；显式点击后才写入精确 root；Back/Forward 正确；终端与自动运行来源隔离；跨 Track
  的同 fingerprint snapshot 被同时接受并分别显示 `backend_schema` / `pm_brief` 缺失项；
  console error 和 HTTP 4xx/5xx 均为 0。验收后 Chromium 与候选服务已关闭。

### 独立审查阻断

1. `phase-manifest` 进度仍走前端 `gateEvidence` 硬编码，而没有消费每个 Change 的
   `workflowExecution`。它把 Explore 和 Spec 都当成同时需要 `design_doc + plan`；实际 Explore
   只需要 `design_doc`，PM Spec 也不要求 legacy `plan`。只读反例得到
   `explore={state:"agent",missing:["plan"]}` 和
   `pmSpec={state:"agent",missing:["plan"]}`，两者本应已可进入 review gate。
2. 服务端执行投影只扫描 `step.guards`，但引擎实际执行 `step.guards + edge.guards`。自定义
   workflow 的 transition edge 上合法 `nonempty-output` guard 因此不会进入 Dashboard readiness；
   单边 review step 可能显示可确认，但实际 transition 必然失败。多边 step 还需要按 event 分开，
   不能把各边 guard 粗暴求并集。

### 独立验证轨

- Reviewer Agent：`FAIL`，冻结摘要精确匹配；320 项后端/CLI/kernel 聚焦测试、138 项 Dashboard
  聚焦测试和项目选择测试均通过，但上述两个运行时反例成立。
- E2E Agent：`PASS`，真实浏览器、跨 Track synthetic contract 与 306 项聚焦测试通过。
- Codex CLI：`PASS`，独立重算冻结摘要一致，未发现 P0–P3；只读沙箱无法创建部分临时测试文件，
  但主流程已在当前宿主全量执行这些测试并通过。

### 第 6 轮返工范围

本次回退不改变已评审需求语义。Build 将把 readiness 建模为逐 Change、逐 step、逐 transition/event
的 canonical 执行投影：default 与 custom workflow 由同一 server contract 生成，前端不再维护
`phase-manifest` 专用字段表；step guard 与 edge guard 均按真实 event 求值。完成后新增
Explore、PM Spec、单边 edge guard 和多边不同 guard 的 server→decoder→progress 回归，再冻结并
执行第七轮三轨 Verify。

## 第 5 轮 Verify（冻结工作区 `31ffe2…c506`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:31ffe2dc9288d63ab17d0866042baa12b04434a3e17b30f3ceed0bdd4a9cc506`
已通过全量自动化、受影响 OpenSpec 的隔离归档演练和真实浏览器验收；第四轮的 default 执行模型、
Dashboard 可补偿进程、严格 decoder 与 conditional guard 求值也已生效。但独立 Reviewer 复现了
1 个新的 P1：不可变 workflow plan 身份与按 Change/Track 求值的执行投影仍被混为同一层，当前
实现会拒绝合法跨 Track snapshot，且即使跳过拒绝也会用组内第一条规则误算其他 Change。本轮不得
进入 Ship。

### 已确认通过

- `npm test`：311 个文件，5295 项通过，5 项按环境诚实跳过，0 项失败。
- `npm run test:web`：50 个文件，954/954 通过；存在既有 React `act(...)` 警告，无测试失败。
- `npm run build`：通过；生产 Dashboard、server 与 CLI bundle 均成功生成。Vite 仍报告单块
  JavaScript 超过 500 kB 的非阻断性能提示。
- 产品身份、架构、仓库卫生、文档、中文文档模板、npx 薄包、迁移 CAS、hooks 457/457、
  adapters 272/272、bundle 23/23 与 `git diff --check` 全部通过。
- `openspec show fix-tenon-entry-skill-contract --json --deltas-only` 与 Change strict validate 通过。
  隔离目录
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/tenon-openspec-verify.PbvjKffWVM`
  成功 archive/apply 8 条 delta；应用后的 `dashboard-project-selection`、
  `normal-chat-routing`、`plugin-distribution`、`tenon-product-identity` 四项主规格均 strict
  validate 通过，真实工作区主规格摘要前后完全一致。
- 第五轮真实 Chromium 候选运行于 `http://127.0.0.1:18769`：裸 `/?view=progress` 自动规范化为
  无 `root` 的项目总览且不请求 per-root API；点击项目后才写入精确 root；Back/Forward 正确恢复；
  终端任务只显示为“终端运行中”，不进入自动运行队列；缺 Verify 三轨证据时显示“等产出”并列出
  缺失字段；控制台错误和 HTTP 4xx/5xx 均为 0。验收后候选进程与 Chromium 已关闭。

### 独立审查阻断

1. 服务端会按 Change 的 Track 对 conditional guard 求值，所以同一冻结 workflow plan 下，
   backend Change 的 `requiredOutputsByStep` 可以是 `['plan', 'scope']`，pm Change 可以合法地为
   `[]`。但 `workflowPlanFingerprint` 不包含 Track，前端 decoder 却把
   `requiredOutputsByStep` 纳入同 fingerprint 的完整语义唯一性比较，导致合法跨 Track snapshot
   被整体拒绝。
2. 即使取消 decoder 的过度拒绝，进度分组仍按 plan fingerprint 只保存组内第一条
   `workflowRules`，随后用它计算所有行；不同 Track 的 Change 会继续被第一条规则误算。不能靠放宽
   decoder 兜底，必须把不可变 plan 结构规则与逐 Change 有效执行投影拆成两个契约。

### 独立验证轨

- Reviewer Agent：`FAIL`，用只读反例确认合法跨 Track snapshot 被 decoder 拒绝；同时确认第四轮
  的 ready evidence 时序、managed transaction、逐 Change server 投影、图结构校验与
  `executionModel` 已正确修复。
- E2E Agent：`PASS`，真实浏览器项目选择、URL history、终端/自动运行来源隔离、缺证据状态与
  console/HTTP 健康全部通过。
- Codex Review：在容量中断前独立构造同一 fingerprint、不同 Track 有效输出的反例，确认 decoder
  返回 `REJECTED`；继续绕过 decoder 检查时，`selectProgress` 把 backend 与 pm 两行都误算成
  `gate`。因模型容量中断未生成最终评审文本，按失败轨记录，不伪装成完整 PASS。

### 第 5 轮返工范围

本次回退不改变需求语义。Build 将把冻结 plan 的结构规则（步骤、边、门、标签、声明输出）与逐
Change/Track 的有效执行投影（当前真正需要的输出）拆成两个显式契约；decoder 只对同 plan
fingerprint 的不可变结构做一致性校验，并逐 Change 校验有效输出是声明输出的子集；进度、收件箱、
自动运行和证据计算必须逐行消费对应 Change 的有效投影。随后补同一 workflow、同一 fingerprint、
不同 Track 的 server→decoder→progress 全链回归，再重新冻结并执行第六轮三轨 Verify。

### 非本 Change 的 OpenSpec 基线债务

隔离副本额外执行 `openspec validate --all --strict` 时，仓库历史 change/spec 中有 13 项失败；
本 Change 应用后的四项受影响主规格均单独 strict validate 通过。该全仓历史债务未被本轮修改，也
不能在报告中伪装为通过；若要统一治理，须建立独立 Change，避免在 Verify 中扩大已评审需求范围。

## 第 4 轮 Verify（冻结工作区 `9f0837…a644`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:9f0837a1d65c9773048bb4d29afe3328bc6ea45813dd13ac956ba286e4b4a644`
通过全量自动化、OpenSpec 隔离应用演练和真实浏览器历史验收；第三轮的宿主事务、逐 Change
workflow 投影、严格 decoder 与 URL history 整改方向也已生效。但独立 Reviewer 仍复现 2 个 P1
和 2 个 P2 架构反例，本轮不得进入 Ship。

### 已确认通过

- `npm test`：311 个文件，5292 项通过，5 项按环境诚实跳过，0 项失败。
- `npm run test:web`：50 个文件，951/951 通过。
- 第四轮聚焦回归：CLI 120/120、Server snapshot 19/19、Dashboard 110/110。
- `npm run build`、`check:identity`、`check:architecture`、`check:repository-hygiene`、
  `check:npx-package`、文档检查/构建/smoke、migration CAS 和 `git diff --check` 全部通过。
- OpenSpec 1.6：Change strict validate 通过；隔离目录
  `/private/tmp/tenon-v101-openspec.PwPWdl` 成功 archive/apply，受影响的
  `plugin-distribution`、`normal-chat-routing`、`tenon-product-identity`、
  `dashboard-project-selection` 四项主规格均 strict validate 通过。真实主规格聚合摘要前后同为
  `bb634a3ea274f81ad54f16e341fd1981889f7292713de6f6fbd0d48261272562`。
- 真实 Chromium：裸 `/?view=progress` 收敛为无 root 的项目总览且无 per-root 请求；点击项目使
  history 长度从 2 增为 3；Back 返回项目总览，Forward 恢复精确 root；进度页显示“终端运行中”，
  自动运行页不含本 Change；控制台错误和 HTTP 4xx/5xx 均为 0。

### 独立审查阻断

1. default 冻结规则虽然已识别为 default 形状，但 `gateEvidence` 仍用
   `rules === DEFAULT_RULES` 判断；反序列化快照永远不与本地常量引用相等，导致三轨字段全空时
   `missing=[]`，UI 误显示“等你确认”而不是“等 agent 补证据”。
2. 候选 Dashboard 已 ready 后，若 ready evidence/receipt 提交失败，release coordinator 会回滚
   runtime，却没有候选 Dashboard 的停止句柄；旧 Dashboard 无法在同一补偿事务内可靠恢复，
   `previousRelease=null` 时还可能把候选进程残留误报为恢复成功。
3. aggregate decoder 未验证 `change.phase` 属于冻结 `workflowRules.steps`，也未拒绝同一项目中
   相同 fingerprint 对应不同规则；畸形响应会被接受并在 Map 中后写覆盖。
4. `requiredOutputsByStep` 直接投影 `field-nonempty/output-present`，忽略 guard 的 `when` 条件；
   条件不成立的 guard 仍会被 Dashboard 误报为必需输出。

### 独立验证轨

- Reviewer Agent：`FAIL`，复现上述 4 个反例；同时确认 managed 跨进程事务、逐 scope checkpoint、
  managed/same-scope fail closed、逐 Change fingerprint 和 Doctor 来源判别已修复。
- E2E Agent：`PASS`，真实浏览器 URL/history、项目来源和终端/自动运行隔离全部通过。
- Codex/静态门禁：`PASS`，聚焦测试、全量测试、构建、身份、架构、文档和仓库卫生均通过。

### 第 4 轮返工范围

本次回退不改变需求语义。Build 将统一 default 形状与证据计算语义；让 released Dashboard readiness
返回可补偿句柄并覆盖 ready-evidence 失败；把 phase/fingerprint 一致性放进 HTTP decoder；按实际
Change 上下文求值条件 guard 后再投影 required outputs。完成后重新冻结并执行第五轮验证。

### 非本 Change 历史债务

对仓库全部历史主规格做额外 strict validate 时，`automation-loop-init` 因缺少 `## Purpose` 失败。
它不在本 Change 的四项 delta 影响集内，也未被本次 archive/apply 修改；作为后续独立规格治理项记录，
不把它伪装成本轮通过项。

## 第 3 轮 Verify（冻结提交 `83c1cc2`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:d30240786bbae37bac4e81ee28ee896b358723bcc36c9221efa431cd657876db`
已通过全量自动化、OpenSpec 隔离应用演练和 Dashboard 主要浏览器路径，但独立 Reviewer、Codex
Review 与真实浏览器历史验收共同确认：发布事务、宿主 scope 收敛、Doctor 来源建模、冻结工作流投影
以及 URL history 仍存在架构级反例。本轮不得进入 Ship，必须经 `verify-fail` 返回 Build。

### 已确认通过

- `npm test`：1372 个 suite，5289 项通过，5 项按环境诚实跳过，0 项失败。
- `npm run test:web`：275 个 suite，947/947 通过。
- hooks：457/457；adapters：272/272；Skill inventory：65 个引用、62 个目录、62 个 registry
  token 完整。
- 产品身份、架构、仓库卫生、注释、npx/bootstrap、迁移 CAS、默认 workflow freshness 和 release
  bundle smoke 全部通过。
- `npm run build`、文档检查/构建/smoke 和 OpenSpec 1.6 strict validate 全部通过。
- 隔离目录 `/private/tmp/tenon-openspec-archive-v3.hLFcYV` 成功执行 archive/apply；4 个应用后主
  spec 均 strict validate 通过，真实工作区主规格 digest 前后未变化。
- 1.0.1 候选 Dashboard（18767）健康检查通过。无项目选择、缺失 root、不可达 root 均收敛到
  `/?view=projects`，不会发起 per-root 请求；显式点击后才写入精确 root；进度页显示
  “终端运行中”，自动运行页没有该终端任务；控制台错误和 HTTP 4xx/5xx 均为 0。

### 独立审查阻断

1. 收敛 receipt 在 Dashboard readiness 前提交。若 readiness 失败，runtime 虽回滚到旧 release，
   receipt 仍绑定已撤销 release，后续 setup/update 会永久 fail closed。持久证据必须和完整激活
   readiness 共用同一补偿事务。
2. Claude scope 模型不完整：`managed` scope 被误判为畸形；清理 project/local 前没有证明同 scope
   Tenon 替代；部分 scope 删除成功、后续删除失败时没有可恢复进度，下一次运行会被旧 receipt 锁死。
3. inventory → remove → verify → receipt 没有覆盖整个流程的跨进程互斥/CAS；单文件 rename 锁不能
   防止两个 setup/update 同时根据旧库存重复删除。
4. Doctor 用 `null` 同时表达 native inventory、静态 adapter/manual 发现和库存不可用，导致非 native
   安装永远误报，或库存故障被错误降级。必须使用可判别来源状态并分别 fail closed。
5. 聚合 workflow 规则按 workflow 名 first-wins，同名 workflow 的不同冻结计划会互相覆盖；前端还以
   当前 `DEFAULT_RULES` 覆盖冻结 default。`nonempty-output` 的 lowered guard 也被错误投影为无需非空。
   每个 Change 必须携带自己的精确冻结规则。
6. aggregate snapshot decoder 只校验类型容器，没有验证 step 唯一性、属性键全集、transition
   source/target 和非空 workflow 名；畸形规则可穿过 HTTP 边界并静默误分类。
7. 用户从项目总览点击项目时使用 `replaceState`，没有建立历史项；真实浏览器 Back 会离开 Dashboard
   到 `about:blank`，而不是返回项目总览。自动规范化应 replace，用户导航必须 push。

### 独立验证轨

- Reviewer Agent：`FAIL`，确认发布/收敛事务、Doctor、逐 Change workflow contract 与 decoder
  的上述反例。
- E2E Agent：`FAIL`，主要路径均通过，但真实点击项目后的 browser Back 历史失败。
- Codex Review：`FAIL`，独立确认 readiness receipt、Claude managed/same-scope、冻结 workflow
  identity 和 `nonempty-output` 投影问题。

### 第 3 轮返工范围

本次回退不改变需求语义。Build 将把 release evidence 放进完整 readiness 补偿事务；为宿主收敛增加
跨进程锁和逐 scope 可恢复状态；把 Doctor 改为来源可判别模型；把规则改为逐 Change 冻结投影并严格
解码；区分 Dashboard 的用户 `pushState` 与规范化 `replaceState`。完成后重新冻结并执行全量自动化、
三轨审查、OpenSpec 隔离演练和真实浏览器历史验收。

## 第 2 轮 Verify（冻结提交 `6604ff4`）

### 结论

`FAIL`。冻结工作区
`workspace:sha256:7fa425a620a33a49197abda705fb282092cfbc5a0d04ae71b743b9fba994ab05`
已修复第 1 轮六项阻断，并通过全量自动化与真实浏览器主路径验收；但独立代码审查发现新的状态模型、
宿主库存和迁移事务反例，必须经 `verify-fail` 返回 Build，不能进入 Ship。

### 已确认通过

- `npm test`：310 个文件，5280 项通过，5 项按环境诚实跳过。
- `npm run test:web`：50 个文件，945 项通过。
- setup/update/doctor 聚焦测试：106/106 通过。
- Dashboard URL、项目选择、进度与自动运行聚焦测试：90/90 通过。
- hooks：457/457；adapters：271/271；Skill 引用：65/65，62 个 Skill 与 62 个 token 完整。
- 产品身份：6/6；仓库卫生：5/5；npx 薄包：4/4。
- `npm run build`、CLI TypeScript、Dashboard 生产构建、文档站构建和全部架构门禁通过。
- OpenSpec 1.6 严格校验通过；隔离目录
  `/private/tmp/tenon-openspec-archive.Ee8z4s` 完成真实 archive/apply 演练，主规格未被演练污染。
- 隔离 1.0.1 Dashboard（18766）真实 Chromium 验收通过：无 `root` 时停留项目总览且不请求
  per-root API；显式选择后才写入精确 `root`；终端任务只显示在进度页，不进入自动运行队列。

### 独立审查阻断

1. doctor 将宿主库存硬编码为 Codex，Claude managed runtime 可能被误报或漏报冲突；库存非零退出也
   不能被解释为“未安装”后继续变更。
2. inventory 解析会从 `enabled:false` 项提取 Tenon 根，并接受非布尔 `enabled`；Claude 冲突清理
   固定 `user` scope，不能清理 inventory 报告的 `project/local` scope。
3. 收敛 receipt 的“缺失”和“I/O 不可读”未区分，写入也不是原子、受锁事务；同 release 的旧
   session proof 可被复用，未证明 proof 新于 receipt 且 release root 精确匹配。
4. Codex adapter 只检查 START/END 数量，反序 marker 会让 awk 删除 END 后的用户内容。
5. `entrySkill` 门禁没有枚举全部 first-party Skill frontmatter，未机械证明只有一个 `name: tenon`。
6. Dashboard 使用全部注册 root 校验 URL，未排除 `ok=false` 的不可达项目。
7. 无项目选择时不加载 workflow 规则，项目总览会丢失 default/custom review gate 的真实摘要；
   正确边界应由跨项目 snapshot/聚合契约提供摘要，而不是由项目总览发 per-root 请求或降级猜测。
8. 项目选择状态仍分散在 `App.tsx` 的 URL、effect 和视图装配中，应抽成独立状态模型，避免再次出现
   隐式选择和失效迁移分叉。

### 独立验证轨

- E2E Agent：`PASS`，主路径、动态移除项目、浏览器返回、来源隔离及控制台均通过；未修改仓库。
- Reviewer Agent：`FAIL`，确认上述 receipt、proof、inventory、adapter、身份唯一性和 Dashboard
  状态/摘要缺口；未修改仓库。
- Codex Review：`FAIL`，独立确认 active-host doctor、项目总览规则、不可达 root 和 Claude scope
  四项行为问题。

### 第 2 轮返工范围

本次回退只修复上述反例，不改变已评审需求语义：建立 host-aware inventory/doctor 契约、原子且带
新鲜 session proof 的收敛事务、结构化 marker/Skill 唯一性校验，以及 Dashboard 独立选择模型和
跨项目 workflow 摘要契约。修复后重新冻结并完整执行三轨 Verify。

## 结论

`FAIL`。冻结工作区基线
`workspace:sha256:a1f106492ec68e50f2e2e09598bfc63ef095b4b56b1f7e1eecd757d54295a66a`
不得进入 Ship。实现需要经 `verify-fail` 返回 Build，修复安装/更新事务、宿主库存失败语义、
生成边界和 OpenSpec 主规格结构后重新冻结。

## 验证范围

- 产品身份真相源、生成投影、Codex Agent 入口和插件 Skill 入口；
- `setup --codex`、自动更新、doctor 与宿主插件库存收敛；
- npx/Marketplace 打包、CLI 发行 bundle 和版本矩阵；
- 仓库卫生与外部参考项目身份零残留；
- OpenSpec delta 严格校验和隔离 archive/apply 演练；
- 冻结工作区的独立 Reviewer 与 E2E 审查。

## 已通过验证

- `node tools/check-product-identity.mjs`：通过。
- 产品身份 Node 测试：5/5 通过。
- `doctor.test.ts`、`setup.test.ts`、`update.test.ts`：101/101 通过。
- `bash tools/test-adapters.sh`：270/270 通过。
- 仓库卫生测试：5/5 通过，当前工作区外部参考项目名称扫描无命中。
- npx/bootstrap：4/4 通过；临时 `npm pack` 中版本、固定 tag、入口 Skill 均为 `1.0.1`、
  `v1.0.1`、`tenon`。
- `openspec validate fix-tenon-entry-skill-contract --strict`：通过。
- OpenSpec CLI：`1.6.0`。

## 发布阻断项

### 1. 公开 CLI bundle 泄漏退役身份

`npm run check:identity` 返回 1：

```text
current product contains retired identity residues:
packages/cli/dist/tenon.mjs:31532: retired identity slug
```

迁移常量被打入公开 CLI bundle，违反当前产品和发行资产只暴露 Tenon 的身份门禁。

### 2. setup 删除旧登记的时序可能锁死用户

`packages/cli/src/commands/setupHost.ts` 在 Tenon 候选、managed runtime 和新会话入口完成验证前，
先调用官方宿主管理器删除旧登记；后续验证、安装或发布失败时，用户可能失去可用入口。删除后仍复用
删除前库存快照。必须采用“激活候选 → 验证 launcher/新会话 → 最终清理”的单一迁移事务。

### 3. update 未收敛宿主插件冲突

`packages/cli/src/commands/update.ts` 的 native update 没有检查或移除冲突宿主插件，和
OpenSpec 中 setup/update 均须收敛为单一 Tenon 入口的要求不一致。自动更新后旧 hook 仍可能劫持
正常对话。

### 4. doctor 把库存不可用误当成可跳过

宿主库存命令不可用或返回畸形 JSON 时，当前实现把结果折叠成 `null` 或空集合，doctor 随后跳过
唯一宿主身份检查并可能整体报绿。库存不可用、畸形和合法空库存必须是三个不同状态；前两者必须
fail closed。

### 5. 生成和安装边界校验不足

- 产品身份检查对 `AGENTS.md` 使用包含关系，未证明哨兵块唯一且逐字等于生成模板；
- Codex adapter 只检测起始 marker，缺失结束 marker 时可能删除 marker 后全部用户内容；
- `entrySkill` 缺少安全 slug、路径根边界和唯一 first-party Skill 校验。

这些问题需要通过结构化解析和行为测试修复，不能添加字符串兜底。

### 6. OpenSpec 主规格结构无效

真实主规格 `openspec/specs/normal-chat-routing/spec.md` 缺少 OpenSpec 1.6 必需的
`## Purpose`。因此：

- `openspec validate normal-chat-routing --strict` 返回 1；
- 隔离副本中的 `openspec archive fix-tenon-entry-skill-contract --yes --json` 返回
  `archive_spec_validation_failed`；
- Change delta 本身严格校验通过，但不能在 Ship 可靠应用。

真实主规格演练前后摘要保持
`cac4fc5b6de55aa9c3927d330a43d8285fa8e81d9822dead3c8cc3810b00e496`，Verify 未写入
真实 `openspec/specs/`。

## 独立验证轨

### Reviewer Agent

`FAIL`。发现上述 setup 时序、update 冲突收敛、doctor fail-closed、bundle 身份泄漏及三个生成边界
问题；没有修改工作区。

### E2E Agent

`FAIL`。确定性复现 `npm run check:identity` 的发行阻断。其余身份链路、101 项定向测试、
270 项 adapter 测试、仓库卫生和 npx tarball 验证通过。临时失败注入证明当前 setup 在官方
plugin remove 返回失败时不会发布 runtime，但该断言尚未进入持久测试套件。

### Codex Skill 证据

本阶段已由真实 Codex 插件会话完整加载 `tenon:tenon-verify` 与
`tenon:verification-before-completion`；报告只记录实际运行结果，不把未运行项写成通过。

## 逐文件规范回读

本轮按 `git status --short` 回读全部冻结改动，并按责任归入：

- `tenon-product-identity`：身份 JSON、生成器、生成投影、CLI 入口、版本和身份门禁；
- `plugin-distribution`：setup/update/doctor、宿主库存、adapter、npx 与插件 manifest；
- `normal-chat-routing`：Codex Agent managed block 和正常对话唯一入口。

对照结果不是通过：上述六类阻断分别违反这些 capability 的单一身份、失败关闭、原子迁移和
可归档规范要求。

## 必须返工

1. 让迁移识别不进入公开 bundle，同时保留受控旧安装识别能力。
2. 把 setup/update 统一到可回滚的宿主迁移事务，并新增 remove、验证、发布各阶段失败注入。
3. 让 doctor 对库存不可用和畸形响应明确报红。
4. 对 Agent 哨兵块、adapter marker 和 `entrySkill` 实施唯一性、成对性、slug 与路径边界校验。
5. 规范化 `normal-chat-routing` 的 `## Purpose`，严格校验后重跑隔离 archive/apply。
6. 重新 build、冻结、三轨验证和真实浏览器验收。

## 剩余风险

- 本轮没有发布、推送或修改真实宿主安装；
- 尚未执行最终 18765 Dashboard 与 GitHub Pages 的发布后浏览器验收；
- npm 公网发布能力取决于仓库发布凭证，未获得真实发布结果前不得宣称可公网 npx 安装。
