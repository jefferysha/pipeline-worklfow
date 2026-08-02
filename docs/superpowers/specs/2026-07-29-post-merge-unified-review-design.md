# 最终主干统一审查设计

## 用户结果

用户要求先把全部开放非 Draft PR 合入 `main`，再用一个统一 Review Change 审查最终组合，而不是逐 PR
重复七阶段。交付结果必须证明最终主干的前端、Dashboard、后端、共享契约、依赖、安全、文档和发布
资产能够一起工作；发现的问题必须在 release 前修复。

## 约束与非目标

- 基线固定为 `main@a86dabb481a8d20e0c50ce8c1b421fac45f886f9`；旧 `907dac06`、`c78426e5`、
  `7c59eecf`、`607c2ed9`、`445aa141`、`ef728bf6` frozen baseline 因后续出现并合并
  PR #15/#16/#17/#18/#19/#21/#23/#27/#28 已失效。
- 审查修复只使用当前独立 worktree/Change/`codex/` 分支。
- 不改变自动化的每四小时配置，不修改 canonical state 或 `.pipeline.yaml`。
- 不新增无关产品功能，不发布 npm 包或生产部署。
- 不把旧 PR 验证、单次绿色测试或放宽超时当作本 Change 的通过证据。

## 合并能力覆盖

| PR | capability | 前端 / Dashboard | 后端 / 共享契约 | 核心证据 |
| --- | --- | --- | --- | --- |
| #8 | `host-target-plan` | Host Plan 状态、复制、响应式 | CLI owner、loopback GET、严格 DTO | CLI/server/UI tests + API/browser |
| #14 | `dashboard-ui-ux-system` | App/Nav/Progress/Workbench | snapshot 与导航契约 | full Dashboard + design/browser |
| #13 | `trace-timeline` | timeline 空/错/加载/长内容 | metadata-only 解码与脱敏 | contract/API/UI tests |
| #11 | `loop-scope-preview` | Governance 空态与升档确认 | Loop scope DTO | row refresh TDD + browser |
| #12 | `related-session-memory` | Progress 搜索、焦点与取消 | root-scoped bounded search | decoder/server/UI tests |
| #9 | `prompt-routing-bypass` | 无新增 UI | hook/router/Linux stat | hook and portability gates |
| #15 | `host-target-plan` | compact desktop catalog、selected context、操作选择 | 复用既有只读 Host Plan DTO | full Dashboard design/browser + Host Plan tests |
| #16 | `document-evidence-timeline` | 文档 disclosure、旧 server unavailable | ledger receipt → snapshot optional DTO、脱敏 | kernel/server/decoder/UI/API/browser |
| #17 | `trace-timeline` | desktop session rail、selected identity、timeline detail | 复用 metadata-only session/timeline API | concurrency/keyboard/i18n/a11y/full Dashboard |
| #18 | governed archive | 无 runtime UI 变化 | #17 Change canonical archive ledger | revision/transition/document digest + OpenSpec strict |
| #19 | `dashboard-ui-ux-system` | Progress 状态 tab、context card 禁用、可见筛选摘要 | 复用 snapshot，无 API 变化 | roving keyboard/a11y/i18n/filter scope/full Dashboard |
| #21 | `codex-skill-receipt-current-turn` | 无产品 UI | Codex transcript/completion/worktree → Skill ledger | ABI/伪造/跨轮/symlink/I/O fail-closed + hooks |
| #23 | `review-handshake-status` | Progress Drawer receipt 状态卡 | canonical projector → snapshot/SSE strict DTO | unknown/partial/old-runtime、i18n/a11y/API/browser |
| #27 | `canonical-state-version-status` | canonical version compatibility 状态 | kernel → snapshot → Dashboard strict DTO | future/current/legacy、i18n/a11y/API/browser |
| #28 | `frozen-workflow-definition-status`、`orchestration-graph` | definition/graph 状态与可视化 | frozen state → graph endpoint → Dashboard | loading/empty/error、strict DTO、keyboard/browser |

`verification-evidence-composer`、`context-bundle-budget-preview`、公开文档和生成物作为相邻组合面纳入
全量回归。

冻结前的 GitHub 开放 PR 查询为空。PR #16 因全仓并发限流测试在 CI 负载下使用 2 秒线程调度窗口
而失败；将窗口改为 30 秒但保留相同强断言后，该测试连续五次、本地全仓 327 files/5741 tests、
Dashboard 68 files/1198 tests 与 exact-head CI run `30452978039` 均通过。该修复只消除测试
调度波动，不放宽产品并发门语义。

PR #17 exact head `e4a07718b71d4ee080da57c072a8a35d185dbb82` 的 68 files/1203 Dashboard tests、
完整构建、生成物重建和 GitHub Actions run `30454247261` 通过，独立全 diff 审查为
C0/H0/M0/L0。它证明该 PR 可正常合并，但统一 Change 仍须在十 PR 组合基线上重验整个 Dashboard。

PR #18 exact head `fcadf8a35f454290fce68941812c814243cef1ca` 的 CI run `30455424146`
通过；独立只读审查对 66 条 revision、19 条 transition、66 个 pre-Verify anchor 与 10 份
document ledger hash 完成验证，C0/H0/M0/L0。该 PR 仅移动已完成 Change 的治理证据，不改变
runtime，但它的路径、摘要链和 OpenSpec 完整性属于统一基线的一部分。

PR #19 exact head `bda3b07632786a42da52283518a6875455918a98` 的 GitHub Actions run
`30462600156` 通过；独立复核其 39 条 revision、11 条 transition 与 10 份 document ledger hash，
C0/H0/M0/L0。它的 merge commit `445aa1411d45a2c112d296a9fc3530db0f62e31e` 是本统一 Change 的
旧最终主干；原 PR 的通过不替代十三 PR 组合后的完整 Dashboard 验证。

PR #21 merge commit `34816a0c79b97bf30b823d0b83d84e2da7a72021` 与 PR #23 merge commit
`ef728bf63f6902251e87fb9495a3dfafe10e42b7` 已进入 `main`。#21 扩大 CLI/Hook 的 Skill receipt
信任边界，#23 同时改变 Server snapshot/SSE 与 Dashboard Progress 状态；二者必须在最新组合基线上
重新执行定向、全量和浏览器验证，不能沿用各自原 Change 的 PASS。

PR #27 merge commit `b1048b1248dee93c17818f779b596c414680bae0` 与 PR #28 merge commit
`a86dabb481a8d20e0c50ce8c1b421fac45f886f9` 已进入 `main`。#27 增加 canonical state version
compatibility，#28 增加 frozen Workflow definition status 与 governed orchestration graph；三个
capability 必须纳入最终组合的 API/shared-contract/Dashboard/浏览器验收。

## 调研结果

### 已通过

- 最终 main 的 GitHub Actions run `30435051575` 成功。
- 正式 root build 成功；GovernanceRail 30 轮、ProgressView 20 轮、Dashboard 全量 4 轮连续通过。
- architecture、comment honesty、repository hygiene、docs 与 Dashboard typecheck 通过。
- 390×844 Progress drawer 与 Governance 空态无横向溢出；Escape 关闭与焦点回归正确。
- light/dark/system 主题循环正确。

### 必须修复

1. Governance 确认清理依赖 `[row]`，逻辑等价新对象会关闭当前确认。
2. English Workbench 仍有非技术性中文产品文案和可访问名称。
3. `npm audit` 为 5 moderate / 1 high / 1 critical。
4. 最终组合审查发现 Workbench 401、workflow list 网络失败与非 JSON HTTP fallback 仍会在
   English locale 泄漏中文，#16 主规格缺少 Purpose。
5. 5 个 phase 已结束的 state-only 历史目录仍滞留 active OpenSpec tree，使全仓 strict validation
   稳定失败；必须通过官方 archive 完整保留证据，不能删除或伪造 delta。
6. Loop snapshot GET 仍把 locale 作为 effect 依赖；切换语言会产生新 row 并覆盖用户尚未保存的
   allowlist/denylist/cadence 草稿，违反运行时切换语言的状态保持要求。
7. Machine、Project Registration、Create Change、AFK、Progress 等仍有 production TSX/hook
   直接显示 `Error.message`；client fallback 或 server detail 为中文时会污染英文错误状态。
8. Operations/AFK 与 Workbench 的危险确认、选择和 mutation 未绑定 exact root；项目 A 的确认或
   迟到结果可复用/覆盖到项目 B，同名 Loop/Change/Workflow 时可误操作。
9. default Workflow 系统阶段标签固定中文；async locale 切换和 malformed JSON 分类仍会留下旧
   locale 文案或把 invalid response 谎报为 network。
10. Progress Create Change 在 root 切换后保留 A 的草稿并用 B 的 router/workflow/root 提交；
    AFK settings 与 enqueue/retry 共享 generation 又会在交错请求时留下永久 busy 或失败乐观值。
11. Workbench 的 Track dirty callback identity 不稳定，草稿变脏后 cleanup/setup effect 可反复切换
    dirty 状态并形成无限 render 循环。
12. Track save 请求在途期间字段和 route preview 仍可编辑，成功响应关闭 editor 时会静默丢弃请求
    发出后的输入；提交 surface 必须在 busy 期间保持一致。

### 已验证的依赖候选

隔离原型以 Vitest `^3.2.6`、Vite `^6.4.3`、AJV `^8.20.0` 和 VitePress→Vite `6.4.3`
override 得到 audit 0、有效依赖树、正式 build、docs check/build 和 101 个关键 Dashboard 测试通过。
由于 override 越过 VitePress 1.6.4 声明范围，它只能在全量 Verify 后保留。

## 关键业务规则与不变量

1. 逻辑等价 Loop 快照不打断用户已开始的升档确认。
2. root、Loop identity、当前级别、可选目标或阻断事实变化时，旧确认必须失效。
3. Dashboard 当前 locale 控制所有产品文案与可访问名称；技术标识和用户数据不翻译。
4. 干净可发布依赖树不允许 Critical/High；本 Change 的目标是 audit 0。
5. 依赖升级不改变 Node `>=22`、workspace 脚本或 CLI/HTTP 公共契约。
6. 所有生成物从冻结的最终源码重建，禁止手工拼接 hashed assets 或 bundle。
7. Active OpenSpec tree 只保留真实可验证 Change；历史 state-only 目录的文件集合与摘要在归档前后
   必须一致。
8. Progress 状态筛选的 tab/canvas 状态在语言切换时保持；非匹配 context card 不可交互或聚焦，
   可见摘要使用当前 locale 且按当前 Workflow 计数，状态 badge 保持全局计数。
9. 语言切换不得成为 Loop 数据重取条件；未保存草稿必须保持，raw load error 在渲染边界按当前
   locale 格式化或安全清除。
10. Dashboard 错误 state 保存结构化原始错误，只在当前 locale 的 render/action 边界格式化；
    英文默认隐藏 server-authored 非英文 detail，production TSX 不得把 `.message` 直接作为产品文案。
11. 危险确认和 mutation 必须绑定 exact root+entity+operation token；root 变化立即失效，迟到
    response/catch/finally 不得污染新项目。
12. Progress Create Change 必须冻结 `{root,name,track,workflow,intent,operationToken}`；root
    变化关闭并清空旧对话框。AFK settings 与 actions 使用独立 generation/busy/error identity。
13. 系统 default label 按创建时 locale 生成，已有用户 label 不翻译；网络、HTTP、invalid-response
    与 no-project 本地状态保持事实准确。
14. Codex Skill receipt 的调用 ABI、完成输出、session、turn 与 worktree identity 必须同一可信链；
    任何枚举/I/O/类型/时序不确定性失败关闭。
15. Review handshake 仅展示 canonical exact-event receipt；未知/缺字段/旧 runtime 不得被合成为
    已确认，review→review transition 必须消费旧 receipt。
16. Track dirty callback 必须具有稳定 identity，父层 render 不得触发 cleanup/setup 的伪状态变更。
17. Track save 在途期间不得允许修改会被成功响应关闭或覆盖的草稿与 preview 输入。
18. snapshot tasks reader 必须以 opened fd 和 pathname 的 dev/ino/size/mtime/ctime 读前读后 fence
    证明内容稳定；同 inode、同长度原地覆写也必须 fail closed。

## 升档确认状态机

```text
idle
  -> select promotion
confirming(snapshot-key)
  -> equivalent snapshot: stay confirming
  -> decision facts changed: idle
  -> Escape/cancel: idle and restore focus
  -> submit: submitting -> success/error
```

## 设计选项

| 方案 | 取舍 | 结论 |
| --- | --- | --- |
| 仅报告，等 CI | 快，但保留安全与状态缺陷 | 拒绝 |
| 定向状态/i18n 修复 + 已验证安全依赖组合 | 范围最小，可 TDD 与回滚 | 采用 |
| Workbench 重写 + VitePress 2 alpha | 变更面和兼容风险过大 | 拒绝 |

## 验证和回滚

- Build 先建立三个 RED：等价 row refresh、English Workbench 不含硬编码中文、依赖审计门。
- 运行 root/full Dashboard/full server/CLI/hook tests、typecheck、build、docs build、资产 freshness、
  OpenSpec、architecture/comments/hygiene 和 `npm audit`/`npm ls`。
- 真实 production Dashboard 最终交付覆盖 1024/1440/1920、zh/en、light/dark、focus、Escape、
  loading/empty/error/success/disabled 与 reduced-motion。
- 若依赖 override 触发任何 docs/build/test/CI 失败，整组回滚并重新选稳定组合。
- 若 OpenSpec archive 前后任一状态证据摘要变化，停止发布并恢复该目录；全仓 strict validation
  必须零失败。

## 术语与证据边界

- 最终 main：批次全部合并后的精确 SHA，不是任一旧 PR head。
- 逻辑等价：决策相关字段相同，仅对象 identity 或非决策展示字段变化。
- audit 0：干净安装后的 npm 审计结果，不是人工忽略列表。
- 浏览器通过：当前 worktree 正式 assets 和真实 root/Change identity，不是其他端口进程。

```coverage
touches:
L1_api:      waived -> 不改变公开 API；只做现有 DTO 组合回归
L2_data:     waived -> 不新增持久化 schema
L3_rules:    filled -> #关键业务规则与不变量
L4_state:    filled -> #升档确认状态机
L5_errors:   filled -> #验证和回滚
L6_security: filled -> #调研结果
L7_perf:     waived -> 不改变运行时性能边界
L8_deps:     filled -> #已验证的依赖候选
L10_terms:   filled -> #术语与证据边界
```
