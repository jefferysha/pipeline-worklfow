# 设计

## 审查基线

- 唯一代码基线为 `origin/main@907dac067c17ed77fb440b91b20d64fd0f24773b`。
- 该 SHA 已包含 PR #8、#14、#13、#11、#12、#9，GitHub Actions run
  `30435051575` 在该精确 SHA 上成功。
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

## 关键业务规则与不变量

1. 同一 Loop 的逻辑等价轮询快照不得打断已开始的升档决策；决策相关事实改变后，旧确认不得继续。
2. 语言切换是整个 Dashboard 的一致状态；产品文案与可访问名称必须完整使用当前 locale。
3. 可发布主干的干净依赖树不得包含 Critical 或 High；任何无法消除的项必须在 Spec 中明确受影响
   路径、补偿控制、时限和 owner，本 Change 不预设例外。
4. 依赖 override 必须精确、可解释、由 `npm ls`、全量 tests/build/docs/CI 证明，不能用
   `--force` 自动改写或引入 pre-release 文档栈。
5. #8/#13/#11/#12 的 CLI/server/Dashboard DTO 与错误码继续保持现有向后兼容；本次不扩张 API。

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

## 术语与证据边界

- “最终主干”只指 `907dac067c17ed77fb440b91b20d64fd0f24773b` 及本 Change 后续合并 SHA。
- “逻辑等价快照”指影响当前升档决策的字段完全相同，仅对象身份或非决策展示字段变化。
- “0 vulnerabilities”只由干净安装后的 `npm audit --json` 元数据证明，不由旧 lockfile 或
  `npm audit fix --force` 声明。
- 旧 PR 报告用于风险发现，不作为本 Change 的 Verify pass。

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
