# 设计

## 审查基线

- 唯一代码基线为 `origin/main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`。
- 该 SHA 已包含 PR #8、#14、#13、#11、#12、#9、#15、#16、#17、#18、#19、#21、#23、#27、#28；冻结前再次查询以 `main`
  为 base 的开放非 Draft PR，结果为空。
- PR #16 的 exact-head GitHub Actions run `30452978039` 在
  `55b13b50ad8523b33773fe6b23337a2d7afc658a` 成功后才正常合并。最终 `main` push CI
  仍必须在 Verify/Ship 绑定精确 merge SHA，不在 Spec 阶段预先宣称通过。
- PR #17 的 exact-head GitHub Actions run `30454247261` 在
  `e4a07718b71d4ee080da57c072a8a35d185dbb82` 以 8m20s 完整通过后才正常合并；独立只读审查
  覆盖 174 个文件并得到 C0/H0/M0/L0。
- PR #18 的 exact-head GitHub Actions run `30455424146` 在
  `fcadf8a35f454290fce68941812c814243cef1ca` 通过后合并；独立只读审查验证 66 条 revision、
  19 条 transition、66 个 pre-Verify anchor 和 10 份 document ledger hash，结果 C0/H0/M0/L0。
- PR #19 的 exact-head GitHub Actions run `30462600156` 在
  `bda3b07632786a42da52283518a6875455918a98` 通过后合并；独立复核验证其 39 条 revision、
  11 条 transition 与 10 份 document ledger hash，结果 C0/H0/M0/L0。其 merge commit
  `445aa1411d45a2c112d296a9fc3530db0f62e31e` 是本次统一审查的新最终主干。
- PR #21 的 merge commit `34816a0c79b97bf30b823d0b83d84e2da7a72021` 将 Codex
  `custom_tool_call`/completion ABI、current-turn transcript discovery、sibling worktree identity
  与 fail-closed Skill receipt 边界纳入主干；其 Change 已通过 Verify，但仍处于 Ship pending，
  必须在统一交付中完成官方治理收尾。
- PR #23 的 merge commit `ef728bf63f6902251e87fb9495a3dfafe10e42b7` 增加 canonical
  review-handshake projector、Server snapshot/SSE、严格 Dashboard decoder 与 Progress 只读状态卡；
  原 Change 已完整归档。
- PR #27 的 merge commit `b1048b1248dee93c17818f779b596c414680bae0` 增加 canonical state
  version compatibility 的 kernel/server/Dashboard 状态闭环；原 Change 已完整归档。
- PR #28 的 merge commit `a86dabb481a8d20e0c50ce8c1b421fac45f886f9` 增加 frozen Workflow
  definition status 与 governed orchestration graph 的共享契约、Server endpoint 和 Dashboard 视图；
  原 Change 已完整归档。该 SHA 是本统一审查的最新最终主干。
- 干净 worktree 执行 `npm ci` 后，必须先运行仓库正式 `npm run build` 生成
  `@tenon/kernel`/`@tenon/server` 产物；随后 architecture、comments、repository hygiene、
  docs 与 Dashboard typecheck 均通过。
- 审查修复位于独立 worktree、唯一 Change 和 `codex/unified-main-review-20260729` 分支；
  版本发布仍由后续独立 release Change 承担。

## 批次覆盖矩阵

| PR | 用户能力 / capability | 主要边界 | 组合验证重点 |
| --- | --- | --- | --- |
| #8 | Host Target Plan / `host-target-plan` | CLI 真相源 → loopback server → Dashboard | 严格 DTO、只读命令、缓存/取消、状态与文档 |
| #14 | Dashboard UI/UX reconcile / `dashboard-ui-ux-system` | App/Nav/Progress/Workbench/CSS/i18n | 视口、主题、语言、焦点、动效与可达性 |
| #13 | metadata-only Trace Timeline / `trace-timeline` | ledger metadata → server → Dashboard | 元数据边界、空/错/加载、长内容与脱敏 |
| #11 | Loop scope preview / `loop-scope-preview` | Loop 配置 → server → Governance UI | 项目范围、升档确认、空态和错误边界 |
| #12 | related session search / `related-session-memory` | project root → bounded search → Progress | root 隔离、空/错/加载、焦点与取消 |
| #9 | prompt routing bypass / `prompt-routing-bypass` | hook/router/stat portability | 精确路径、Linux stat、fail-closed 与 hook 测试 |
| #15 | Host Plan desktop clarity / `host-target-plan` | compact catalog → selected context → operation | 桌面密度、键盘、主题、状态和完整 Dashboard 一致性 |
| #16 | document evidence timeline / `document-evidence-timeline` | ledger receipt → snapshot DTO → disclosure | digest/路径脱敏、旧 server 降级、键盘、空/错/加载 |
| #17 | Trace session workspace / `trace-timeline` | session rail → selected identity → metadata timeline | 并发隔离、Escape/焦点、桌面响应式、长内容与状态矩阵 |
| #18 | 已完成 Trace Change 治理归档 | canonical Change tree → 日期化 archive | revision/transition/document digest、路径迁移、无 runtime drift |
| #19 | Progress triage / `dashboard-ui-ux-system` | 状态 tab → workflow context cards → 本地化筛选摘要 | 复用现有 snapshot、无 API 变化；roving keyboard、禁用/可访问性、i18n、筛选范围、全量 Dashboard/browser |
| #21 | Codex Skill receipt / `codex-skill-receipt-current-turn`（无产品 UI） | host transcript → trusted completion → Skill ledger | ABI 错型/伪造/跨轮/symlink/I/O fail-closed + hooks |
| #23 | Review handshake / `review-handshake-status` | Progress Drawer 只读 receipt 状态卡；canonical state/workflow → snapshot/SSE strict DTO | unknown/partial/old-runtime、i18n、a11y、HTTP/SSE/browser |
| #27 | Canonical state version / `canonical-state-version-status` | canonical version → server snapshot → Dashboard | future/current/legacy version、严格 DTO、只读兼容状态、i18n 与浏览器 |
| #28 | Frozen workflow + graph / `frozen-workflow-definition-status`、`orchestration-graph` | frozen definition/state → graph endpoint → Dashboard | 注册 root、未知/缺失 definition、严格 DTO、loading/empty/error、键盘与浏览器 |

`verification-evidence-composer` 与 `context-bundle-budget-preview` 已在主干上，作为相邻组合能力继续
执行回归；它们不是本批次新 requirement。

## 已确认发现

### 1. Governance 升档确认依赖对象引用

`GovernanceRail` 当前以 `[row]` 作为清理 `confirmLevel` 的 effect 依赖。服务端轮询即使返回同一
Loop、同一当前级别和同一可选目标，也会产生新的 row 对象，从而在用户打开升档确认后意外关闭。
这与中间主干 CI 曾出现“点击后找不到 `wb-gov-promote-confirm`”一致。连续 30 次定向测试与最终 CI
通过只能说明竞态不稳定，不能证明状态机正确。

修复必须先建立确定性 RED：打开确认后用逻辑等价的新对象刷新 row，确认框仍存在；当 root/loop、
当前级别、可选目标或阻断原因等决策事实变化时才关闭。禁止通过放宽超时或删除断言掩盖。

### 2. Workbench 英文模式仍混入中文

真实 production Dashboard 切换到 English 后，导航和页面标题能翻译，但 Workbench 仍显示
“当前工作流”“创建可编辑副本”“运行轨道”“立项”“运行前事实”等大量中文。该行为违反全局语言
选择的用户预期，也使屏幕阅读器可访问名称混用语言。

修复应使用现有 i18n provider 和成对 key，不引入第二套 locale 状态。Build 必须增加 English
Workbench 回归测试，并在真实浏览器中扫描可见文本；允许保留的中文仅限用户数据或明确的技术标识，
不能把硬编码产品文案当成例外。

### 3. 依赖基线包含 Critical/High

干净安装后的 `npm audit --json` 报告 7 项：5 moderate、1 high、1 critical。其中直接风险包括
Vitest `<3.2.6` 的任意文件读取/执行、Vite `<=6.4.2` 的路径边界问题，以及 AJV `<8.18.0`
的 ReDoS。即使主要位于开发/文档工具链，也会在 CI、贡献者机器和 release 构建中执行，不能把
“非生产 runtime”当作忽略理由。

隔离 worktree 的最小候选已经证明：

- root / Dashboard 将 Vitest 升至 `^3.2.6`；
- root / Dashboard 将 Vite 升至 `^6.4.3`；
- AJV 升至 `^8.20.0`；
- 对 VitePress 1.6.4 的 Vite 使用精确 `6.4.3` override。

该候选得到 `npm audit` 0、有效 `npm ls`、正式 build、docs check/build 和 101 个关键 Dashboard
测试通过。由于 VitePress 1.6.4 声明的 Vite peer 范围仍为 `^5.4.14`，override 是显式兼容风险；
Build/Verify 必须以全量 docs、全仓测试和精确 CI 证明，失败则回滚，不升级到 VitePress 2 alpha。

### 4. 浏览器和静态基线

- 1200×814 与 390×844 的 Progress Change drawer 均展示正确 root、Change 和 phase；390px
  无 body 横向溢出，Escape 关闭后焦点回到原 Change 卡片。
- Workbench Governance 在当前 root 无 Loop 时正确显示空态；Escape 关闭后焦点回到
  `wb-governance-open`，无横向溢出。
- light/dark/system 主题循环生效；English 切换暴露上述混合语言缺陷。
- macOS 当前可信 context bundle reader 不可用，preview 返回定义内的 501，UI 有本地化错误与
  retry；浏览器控制台因此记录网络资源错误。它是受支持平台能力边界，不等同于本 Change 的产品
  异常，但 Verify 报告必须明确区分。
- `check:architecture`、`check:comments`、`check:repository-hygiene`、`check:docs` 和
  `typecheck:web` 均通过。

### 5. 最终组合审查新增 finding

- Workbench 的保存与新建 workflow 共用 `readSaveErrors`；其 401 分支硬编码中文，导致 English
  locale 的真实保存失败路径泄漏中文。`fetchWorkflowNames` 还会把共享 transport 的中文网络
  fallback 和 endpoint 中文非 JSON HTTP fallback 拼进英文加载错误。修复必须由调用方注入现有
  `t` 的 locale 文案，并让 Workbench 按网络/HTTP/无效响应的稳定事实渲染本地化恢复信息；以英文
  401、network 和 non-JSON HTTP 回归覆盖，不得仅替换为硬编码英文。
- #16 归档后的 `openspec/specs/document-evidence-timeline/spec.md` 缺少必需 `## Purpose`；
  目标 strict validator 实际失败。补齐 Purpose 只解释既有 requirement，不改变行为语义。
- `openspec validate --all --strict` 还扫描到 5 个历史 state-only 目录。它们的 Tenon phase 已为
  `done` 或 `escalated`，均无 proposal/design/delta，且不在 `tenon status` 活跃清单；继续留在
  `openspec/changes/` 会稳定制造假活跃 Change 和严格校验失败。隔离副本已证明
  `openspec archive --yes --skip-specs --no-validate --json` 会完整移动目录到日期化 archive，
  不更新主规格、不丢状态证据。只允许对已枚举的 5 个目录执行，执行前后逐文件计数和摘要必须一致。
- `useLoops` 的 GET effect 仍依赖 locale 翻译函数与语言；运行时切换语言会重新取得 Loop snapshot，
  新 row 对象继而触发 `LoopCard` 重置未保存的 allowlist、denylist、cadence 等草稿。修复必须让
  GET 只依赖 root/显式刷新，把 raw error 保留到渲染边界按当前 locale 格式化；回归测试必须证明
  切换语言不增加 GET 次数、不覆盖 dirty draft，并让既有错误按新语言呈现或安全清除。
- Machine blockers、Project Registration、Create Change、AFK、Progress 与 AFK log 仍有 production
  TSX/hook 直接渲染 `Error.message`，而多个 client fallback 和 server-authored detail 可为中文。
  统一修复必须保存 raw `unknown`/`ApiError`，只在当前 locale 的 render/action 边界调用
  `formatApiError`；英文默认不暴露 server detail，语言切换时不能保留旧 locale 的 toast/error 字符串。
  静态回归门还必须拒绝 production TSX 将 `.message` 直接作为用户文案输出。
- Operations/AFK 与 Workbench 的危险确认和 mutation state 未绑定 root。A 项目打开真实运行、apply、
  triage、retry 或 workflow delete/create 确认后切到 B，旧确认可与 B 的当前 root 重新组合；A 的慢
  response 也可覆盖 B。所有这类 state 必须绑定 `{root, entity, operationToken}`，root 变化原子清空，
  response/catch/finally 只有 identity 仍匹配时才能落态，按钮只在当前 root 数据完成加载后启用。
- Progress 的 Create Change 对话框在 root 切换后保留 A 项目的 `name`/`intent` 草稿，却把 router、
  workflow 和最终 POST root 切到 B，可把未经 B 项目重新确认的旧输入提交到新项目。root 变化必须
  关闭并重置对话框；提交 token 必须冻结 `{root, name, track, workflow, intent}` 并在每个异步边界
  复核。AFK settings 与 enqueue/retry 不得共享会互相推进的 generation/busy identity，否则交错操作
  会留下永久 busy 或未落地的乐观 settings。
- `buildDefaultDef()` 把 canonical 阶段标签固定为中文，English 下创建/复制 default 会持久化中文；
  多个 async handler 与 editor 又把旧 locale 的格式化 string 存进 state。系统默认标签必须从当前
  locale 生成但已有用户自定义 label 保持原值；在途结果用当前 locale 格式化，或在 locale 变化时
  安全失效且保留用户草稿。
- 成功响应 JSON 解析失败当前穿透为原生 `SyntaxError`，最终被误报为网络错误。transport 必须把
  已到达响应的 parse/schema failure 映射为带 status 的结构化 `ApiError`，200 malformed 显示
  invalid-response，HTTP 非 2xx 仍显示 HTTP 事实；未选择项目使用本地稳定状态而非伪造网络错误。

### 6. 2026-08-03 Verify 回退 finding

- `WorkbenchView` 向 `TrackSelector` 传入每次 render 都重新创建的 dirty callback；`TrackSettings`
  又把该 callback 放入上报和 cleanup effect 依赖。Track 草稿首次变脏后，cleanup/setup 交替上报
  `false/true` 并继续触发父层更新，可能形成无限 render/effect 循环。修复必须使用稳定 callback
  identity，并以从 Workbench 打开 Track editor、修改字段的组件测试证明循环不再发生。
- Track save 在请求开始时冻结 payload，但 `TrackEditorFields` 与 route preview 输入仍可在 busy
  期间修改；成功响应随后关闭 editor，静默丢弃请求发出后的输入。保存期间必须禁用全部会改变已提交
  草稿或 preview identity 的控件，并覆盖鼠标、键盘、删除与列表切换路径。
- 上述实现修复不改变 HTTP DTO 或 capability 范围；但本轮 Build 已把审查基线扩展到 PR #27/#28，
  因此 proposal/design/plan/coverage 必须先经本次 `requirements-changed` 回到 Spec 重新登记与评审。

## 关键业务规则与不变量

1. 同一 Loop 的逻辑等价轮询快照不得打断已开始的升档决策；决策相关事实改变后，旧确认不得继续。
2. 语言切换是整个 Dashboard 的一致状态；产品文案与可访问名称必须完整使用当前 locale。
3. 可发布主干的干净依赖树不得包含 Critical 或 High；任何无法消除的项必须在 Spec 中明确受影响
   路径、补偿控制、时限和 owner，本 Change 不预设例外。
4. 依赖 override 必须精确、可解释、由 `npm ls`、全量 tests/build/docs/CI 证明，不能用
   `--force` 自动改写或引入 pre-release 文档栈。
5. #8/#13/#11/#12/#16/#17 的 CLI/server/Dashboard DTO 与错误码继续保持现有向后兼容；本次不扩张 API。
6. #15 的 Host Plan 桌面优化不能成为 Dashboard 其余视图的设计豁免；统一视觉轨仍覆盖整个
   Dashboard 的响应式、主题、语言、状态、键盘和焦点边界。
7. #17 的 desktop-only Trace workspace 验证不能替代整个 Dashboard 的视觉与浏览器验收；其
   metadata-only、无隐式 timeline 请求、请求 identity 隔离和 Escape 焦点恢复语义必须保持。
8. Active OpenSpec change tree 必须只包含可验证的真实 Change；历史 state-only 证据必须完整归档，
   不得删除、补写虚假 delta 或手改 canonical state。
9. #18 的归档只改变治理证据位置；66 条 revision、19 条 transition、66 个 pre-Verify anchor
   与 10 份 document ledger 的 identity/digest 链必须保持可验证，不能把 rename 当作内容重写。
10. #19 状态筛选仍显示当前 Workflow 的上下文，但非匹配卡片不得可点击、可聚焦或暴露为可交互控件；
    可见摘要按当前 Workflow 计数，状态 badge 保持全局计数，语言切换不得触发重取或丢失 tab/canvas 状态。
11. Dashboard 语言切换是纯表现层状态变化；Loop 的未保存编辑草稿也必须保持，且不得隐式触发
    snapshot GET。错误信息只能在渲染边界依据当前 locale 格式化，不能把 locale 作为数据获取依赖。
12. 所有 Dashboard 可达错误状态遵守同一 locale/error policy：状态保存结构化错误，英文隐藏
    server-authored 非英文 detail，中文仅在明确允许时展示；production TSX 不得直接输出 `.message`。
13. 危险确认与在途 mutation 的授权范围是 exact root + entity + operation token；root、entity 或
    operation identity 任一变化都使旧确认失效，迟到的 response/catch/finally 不得污染新上下文。
14. Progress Create Change 的授权 identity 是
    `{root, name, track, workflow, intent, operationToken}`；root 变化立即关闭并清空旧草稿，任一字段
    与冻结 identity 不一致时不得提交或落态。
15. AFK settings 与 enqueue/retry 使用独立 generation 与 busy/error 状态；一个通道的交错请求不得
    取消另一个通道的 finally，也不得静默保留服务端未接受的乐观值。
16. 系统生成的默认 Workflow 标签使用创建时当前 locale；已有用户自定义 label 不自动翻译。
17. HTTP 已到达、JSON/schema 无效与网络不可达是三个不同事实，错误恢复文案不得互相冒充。
18. Codex Skill receipt 只接受当前 host transcript 中完成且 ABI/调用/输出严格配对的真实调用；
    枚举、I/O、session/turn/worktree identity 无法证明时必须失败关闭。
19. Review handshake 只投影 canonical exact-event receipt；unknown、partial、旧 runtime 和
    review→review 消费旧 receipt 均不得被合成为“已确认”或 readiness。
20. Track editor 的 dirty 上报 callback 必须保持稳定 identity；effect cleanup 只用于真实卸载或
    callback 所有者变化，不能在每次父层 render 时制造 `false/true` 抖动。
21. Track save 的 request payload 与可编辑 surface 必须一致：请求在途期间禁止修改将被成功响应关闭
    或覆盖的草稿字段，确保不存在“已输入但未提交却静默消失”的状态。

## 升档确认状态机

```text
idle
  └─ choose(target) ──> confirming(logical-loop, decision-facts, target)
                           ├─ equivalent snapshot ──> confirming
                           ├─ decision facts changed ──> idle
                           ├─ cancel / Escape ──> idle + focus restore
                           └─ confirm ──> submitting ──> success | error
```

`decision-facts` 至少包含 root、loop identity、当前 autonomy、可用目标和阻断状态。实现可以使用稳定
key 或显式字段比较，但不得依赖 React row 对象引用。

## 方案比较

| 方案 | 优点 | 风险 | 决策 |
| --- | --- | --- | --- |
| A. 只报告，依赖绿色 CI | 变更最少 | 保留确定性状态缺陷、混合语言和 Critical/High | 拒绝 |
| B. 定向修复状态/i18n，并采用已验证的安全依赖组合 | 边界小、可 TDD、能清零审计 | 需要全量证明 VitePress override | 采用 |
| C. 重写 Workbench、升级 VitePress 2 alpha | 可一次重塑技术栈 | 大幅扩大 UI、Node 与发布风险 | 拒绝 |

## 兼容与回滚

- UI 修复不改变 HTTP/CLI DTO；locale key 缺失在测试中失败，而不是回退到另一语言。
- 依赖升级保持 Node `>=22`、npm workspace 和现有脚本名称。若全量测试、docs build 或正式资产
  freshness 失败，整组依赖变更回滚，不保留部分漂移。
- 不修改 automation schedule，不发布 npm 包，不执行生产部署。
- 历史 state-only 目录使用 OpenSpec 官方 archive 操作迁移；若文件集合或内容摘要变化，立即回滚
  该迁移并阻止发布。

## 术语与证据边界

- “最终主干”只指 `a86dabb481a8d20e0c50ce8c1b421fac45f886f9` 及本 Change 后续合并 SHA。
- “逻辑等价快照”指影响当前升档决策的字段完全相同，仅对象身份或非决策展示字段变化。
- “0 vulnerabilities”只由干净安装后的 `npm audit --json` 元数据证明，不由旧 lockfile 或
  `npm audit fix --force` 声明。
- 旧 PR 报告用于风险发现，不作为本 Change 的 Verify pass。

新增文件安全不变量：聚合 snapshot 读取 `tasks.md` 时必须同时冻结 opened fd 与 pathname 的
dev/ino/size/mtime/ctime；fd 读前/读后和 pathname 前/后任一元数据变化均 fail closed，包括
同 inode、同长度原地覆写。

```coverage
touches:
L1_api:      waived -> 不新增或改变公开 API；现有跨端 DTO 仅做组合回归
L2_data:     waived -> 不新增持久化 schema
L3_rules:    filled -> #关键业务规则与不变量
L4_state:    filled -> #升档确认状态机
L5_errors:   filled -> #兼容与回滚
L6_security: filled -> #已确认发现
L7_perf:     waived -> 不改变运行时性能边界；轮询只比较有界字段
L8_deps:     filled -> #已确认发现
L10_terms:   filled -> #术语与证据边界
```
