# Canonical State Version Status Verify Report

- Change: `canonical-state-version-status-20260730`
- Result: **PASS**
- Track: `frontend`（共享契约、Server、Dashboard 纵向切片）
- Base: `ef728bf63f6902251e87fb9495a3dfafe10e42b7`
- Frozen build SHA: `7d96ac84af1196c1059e633c84c6937b47c6cddf`
- Frozen tree: `ad0afbf773798714c4404a423592d0a9d7d6dffd`
- Workspace fingerprint: `workspace:sha256:eab016f14c3b1def8f7f3ecfb4089c235f45efdd366b6aa0e6f5f59b66b8ffe1`（验证前后相同）
- Verified at: 2026-07-30

## 结论

未来 canonical schema version 现在会以 typed、fail-closed 结果进入有界 Server compatibility issue，并在 Dashboard 提供中英文升级与刷新交互；可读 sibling 保持可导航，mutation 继续 fail closed。Reviewer、E2E 与真实浏览器视觉/交互轨均覆盖冻结的同一 SHA 和 tree，未发现 Critical、High 或 Medium finding。一个已接受的 Low 风险焦点行为记录在下方，不阻塞交付。

## 三轨验证

| 轨道 | 结果 | 覆盖与证据 |
| --- | --- | --- |
| Reviewer | PASS，C/H/M/L = 0/0/0/0 | 独立审查 `origin/main...7d96ac84` 的 149 个路径、实现、测试、规格、治理与生成产物；构建、Dashboard 1240、kernel/server 64、Dashboard 定向 119、typecheck、architecture、hygiene、OpenSpec strict 与 diff check 均通过。日志：`/tmp/tenon-verify-reviewer.p06v3h/logs/`。 |
| E2E | PASS，C/H/M/L = 0/0/0/0 | 在隔离 clone `/tmp/tenon-verify-e2e-final.oLNqJ1/repo` 安装、构建并验证真实 HTTP fixture：health、单个 future-state issue、readable sibling、无 root/path 泄漏、普通 error 为空、未授权 write API 返回 401；Dashboard feature-focused 347/347、全量 1240/1240，repo 单 worker 收敛为 326 files / 5790 passed / 14 honest skips。OpenSpec 1.6 strict 与隔离 archive rehearsal 通过。 |
| Visual + Browser | PASS，C/H/M/L = 0/0/0/1 | 生产构建 `index-DFk9L5Z3.js`，在 1440×900 与 1024×768 验收 zh/en、baseline、恰好 100 + truncated、长名称、Machine readable failed sibling、503、invalid 200、pending disabled/recovery、loading/empty/error、Tab/focus/Enter、reduced motion、contrast；23 个请求全部为 GET，console/page errors 为空。证据：`/tmp/tenon-version-status-verify-final-visual/browser-evidence.json` 与 16 张 PNG。 |

Codex CLI 第三方复核做了两次真实尝试，但按 Verify 规则降级：首次将完整 diff 传入时超过 1 MiB 输入上限（实际 2,406,156 字符）；随后改为只读直接仓库审查时命中 Codex 用量上限，提示 `You've hit your usage limit; try again at Aug 5th, 2026 12:09 PM`。同时观察到本机 `logs_2.sqlite` malformed 和 model cache 缺少 `supports_reasoning_summaries` 警告。该外部工具降级未被伪报为成功，Reviewer 与独立 E2E 两条权威轨已经覆盖同一冻结基线。

## 自动化与测试

- Focused server：31/31；最终 kernel/server：64/64。
- Focused Dashboard：86/86、116/116、85/85、89/89；最终 feature-focused：347/347。
- Dashboard full：71 files，1240/1240。
- Repository full：326 files，5790 passed，14 个 credential/real-agent honest skips。
- `typecheck:web`、`test:web`、`build:web`、repo build、architecture、hygiene 与 diff checks：PASS。
- 一次未修改的 Progress drawer timing case 在套件负载下失败；隔离重跑 64/64、立即全量重跑 1240/1240。并发 Verify job 曾造成 24 个无关的 5 秒 timeout/port resource failure；隔离 single-worker 重跑相关集合 139/139，最终全仓无剩余失败。
- `npm ci` 报告现有依赖审计 7 项（5 moderate、1 high、1 critical）；这是基线依赖风险，不由本 Change 引入或在本 Change 内扩展修复。
- Vite 仅保留既有 `>500 kB` chunk warning。

## 规格质量映射

`git diff --name-only origin/main...7d96ac84` 共 149/149 个路径已逐组映射，Reviewer 独立复核同一清单，无未匹配文件：

| 路径组 | 数量 | 适用主规格 / delta |
| --- | ---: | --- |
| `docs/**` | 6 | `canonical-state-version-status` delta、`document-evidence-contract` |
| `openspec/changes/canonical-state-version-status-20260730/**`（proposal/design/spec/tasks、ledger、36 次 pre-verify/revision 证据与 transitions） | 95 | delta、`document-evidence-contract`、`workspace-verification-integrity` |
| `packages/kernel/**` | 9 | delta、`workspace-verification-integrity` |
| `packages/server/**` | 4 | delta、`repository-architecture-compliance` |
| `packages/dashboard-app/**` | 32 | delta、`dashboard-project-selection`、`dashboard-ui-ux-system` |
| `tools/**` | 2 | `repository-architecture-compliance` |
| `packages/cli/dist/tenon.mjs` | 1 | `plugin-distribution`、`repository-architecture-compliance`、delta |

Kernel、Server、Dashboard 与 CLI 组均包含其受影响的生成 bundle；生成文件与来源经过 build/diff gate 对齐。Dashboard 的 notice、Machine 风险分流、strict decoder、retry/loading/empty/error 与 i18n 需求同时由 delta 和现有 Dashboard 系统规格约束。

## OpenSpec 与冻结完整性

- `openspec show`：4 个 ADDED requirements。
- change strict validation：PASS。
- 隔离 archive rehearsal：PASS，`specsUpdated=true`，`added=4`。
- applied spec strict validation：PASS。
- 真实主规格 digest 在演练前后保持 `ee9ec373b59cc4648f05e744fe1a53c9a48612cbdbce099f0979c7f254c9b2f8`，演练未污染工作树。
- 最终真实浏览器前后 fingerprint、E2E 前后 HEAD/tree/status/diff/spec digest 均未变化。

## Finding 与剩余风险

| 严重度 | 数量 | 处理 |
| --- | ---: | --- |
| Critical | 0 | 无 |
| High | 0 | 无 |
| Medium | 0 | 无 |
| Low | 1 | 当 refresh 按钮在请求开始后动态变为 disabled 时，Chrome 会把焦点移到 `body`；若状态长期保持，键盘用户需要再次 Tab 回按钮。按钮仍保持可见、disabled 与 pending 状态，成功/失败恢复及键盘激活已通过。作为非阻断的浏览器原生焦点残余接受并在 PR 中披露。 |

没有剩余可行动的代码 finding。依赖审计、honest skips、Vite warning、Codex CLI 用量/本机缓存问题均与功能结果分开记录，不声称其已消失。
