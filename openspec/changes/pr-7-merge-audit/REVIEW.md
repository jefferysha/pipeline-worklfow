# PR #7 合并审查

## Build · Dashboard `design-taste-frontend` 第一次审查

- 时间：2026-07-29 01:33–01:36（Asia/Shanghai）
- 运行入口：`http://127.0.0.1:19767/`
- 运行产物：当前 worktree 的 `packages/dashboard-app/dist` 与
  `packages/server/dist/dashboard.mjs`
- 项目：`/Users/a1234/.codex/worktrees/fc73/pipeline-worklfow`
- 页面：Progress → `pr-7-merge-audit` → Context Bundle 预算预览
- 覆盖：
  - 1200×814 浅色中文；
  - 390×844 浅色中文；
  - Darwin 可信读取能力缺失的真实 501 错误态；
  - 抽屉初始 focus、内部滚动与无页面横向溢出。

### Findings

| Severity | Finding | 处置 |
| --- | --- | --- |
| MEDIUM | 预览提交按钮静态使用 `bg-btn-hover`，把 hover token 当成 resting token，和 Dashboard 既有 primary action 状态词汇不一致。 | 改为 `bg-btn-bg`，仅在 `hover:` 使用 `bg-btn-hover`；transition 限定为背景色与 transform。 |
| MEDIUM | 错误 code 未声明断词；当前 390 px 视口尚未溢出，但更长的资源限制 code 会成为窄屏横向溢出风险。 | 预算错误与一般错误 code 均增加 `break-all`。 |

第一次截图：

- `/tmp/pr7-dashboard-desktop-first.png`
  (`sha256:84e686b587423a338f604b8470d0a2aec26409424b521ea0f318a7a76083aa87`)
- `/tmp/pr7-dashboard-preview-mobile-first.png`
  (`sha256:d0cdaee305f5ca46b6c13b8719130c0d8c6afea84239c8b6dff9eee98c48955b`)

## Build · 修复后第二次审查

- 定向测试：
  `ContextBundlePreview.test.tsx` 与 `ProgressDrawer.test.tsx`，17/17 通过。
- 生产构建：`npm run build:web` 通过。
- 视口与主题：
  - 390×844，浅色中文；
  - 768×900，深色英文；
  - 1440×900，浅色中文。
- 交互与可访问性：
  - 三个视口均 `documentElement.scrollWidth === innerWidth`；
  - 目标阶段、预算和提交按钮键盘可达；
  - HTML `min=1` 对 `0` 触发原生 range-underflow；
  - 修正预算后重试真实返回并呈现
    `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`；
  - 普通用户点击卡片打开抽屉后，初始 focus 在关闭按钮；Escape 关闭后 focus
    回到 `prg-cv-chg-pr-7-merge-audit`；
  - `prefers-reduced-motion: reduce` 下抽屉即时呈现
    `transform: matrix(1, 0, 0, 1, 0, 0)`，关闭后仍恢复 focus；
  - 唯一 console error 是被 UI 明确处理并按合同展示的 Darwin 501 HTTP 响应。
- 修复后截图：
  - `/tmp/pr7-dashboard-preview-mobile-second.png`
    (`sha256:f13896af4df177b60a44e345aea533cfd35c280eaf8d110c49e75ba4098ff96b`)
  - `/tmp/pr7-dashboard-preview-tablet-dark-en-second.png`
    (`sha256:01f535be4d3ada807a29dd862058746d6e6b45532001d02766ed57c04f48f53f`)
  - `/tmp/pr7-dashboard-preview-wide-light-zh-second.png`
    (`sha256:30176860300bda8063795b8ff59c63cfe9aa6019b4a960cd88a5dfcaa88f9368`)

结论：第二次 `frontend-design` + `design-taste-frontend` 审查未发现剩余
CRITICAL / HIGH / MEDIUM；两个 MEDIUM 均已修复并由真实运行态复核。

## Build · pre-Verify 全量收敛审查

### 比较边界

- 基线：`origin/main@8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`
- 待冻结分支起点：`af34df116ba2db7785b7abfb80bf459cbd55359f`
- 范围：PR #7 原始 Context Bundle 能力、PR #6 合入后的 Verification Evidence
  共存、最终 WIP 的全部源码、测试、文档、canonical state、生成物和 oracle 兼容更新。
- 规则：根 `AGENTS.md`、`.agent-rules/COMMON.md`、`.agent-rules/FRONTEND.md`、
  `.agent-rules/BACKEND.md`。
- 规格：本 Change proposal/design/delta spec、ADR、实施计划，以及
  `context-bundle-budget-preview` 主规格。

### Standards / Rules / Architecture / Security findings

首轮独立全量审查发现并修复：

| Severity | Finding | 处置与证据 |
| --- | --- | --- |
| HIGH | `transition -> set -> set` 后 canonical head 没有 O(1) 的可信摘要锚，篡改最新 revision 可能逃过同步读取。 | 增加 opaque-tail head anchor、pre-anchor 与 N-1 stale anchor 有界兼容读取；64 revision 与 8 MiB 上限 fail-closed；篡改/缺失/伪造 stale anchor 对抗测试。 |
| HIGH | TransitionRecord 解析未完整绑定 `from/to/workflow/effects`，摘要一致但 schema 恶意漂移缺少封闭验证。 | 增加并复用 closed-schema parser，完整绑定 transition 字段；加入 digest-consistent schema corruption 测试。 |
| MEDIUM | Dashboard 在 root/change/phase 切换时可能短暂保留上一 Change 的成功预览。 | `ProgressDrawer` 以 root/change/phase 作为预览组件 identity key；rerender 测试验证同步清空、旧请求 abort 与新默认加载。 |
| MEDIUM | server 错误日志可能带出不可信 path/cause。 | 日志仅保留稳定错误 code 和 `REDACTED`；恶意 path/root 测试确认 stderr 不泄露。 |
| MEDIUM | persisted ledger path 需要在进入可信读取器前统一拒绝。 | `document-path.ts` 提供唯一 project-relative validator，ledger parser 复用；非法路径稳定映射 409 `LEDGER_MISSING`。 |
| MEDIUM | preview 成功与 422 路径在并发 canonical mutation 时可能返回旧快照。 | 成功和错误路径均复核 `revisionId + stateDigest`；状态变化统一 409，新增两个 snapshot-barrier 测试。 |
| LOW | 新 Dashboard hash assets 未跟踪时，提交态会引用不存在资源。 | 生成物已从最终源码重建；提交必须原子包含新 JS/CSS、旧 hash 删除与 `dist/index.html`。 |

规则/架构复审最终结论：

- `0 Critical / 0 High / 0 Medium / 1 Low`；
- 唯一 Low 是提交原子性提醒，不是剩余产品缺陷；
- 新 hash assets、旧 hash 删除和 `dist/index.html` 已纳入同一待提交工作树。

最终门禁运行时新增的 oracle compatibility diff 又经过独立增量复审。首轮正确抓到
一个 High：最初的归一正则会忽略只有 base64url 外形、但不满足产品 closed schema 的
畸形 transition-head anchor；同时 stub 对 `pre_verify_review_result` 没有限定
`pending/pass`。最终修复为：

- 独立 validator 解码 canonical base64url，要求五字段 closed schema；
- anchor 必须匹配 `runId/sequence/recordId`，并位于 state metadata 后、可选合法
  pre-Verify anchor 后的 logical opaque-tail 首行；
- pre-Verify anchor 同样验证 closed schema 及 revision/revisionId；
- validator 或 YAML 归一执行错误直接令 YAML 面 FAIL；
- stub 生成真实五字段 anchor，并封闭 pre-Verify 枚举；
- malformed、错位置、合法 anchor + 业务字段漂移三个负例都必须抓红。

增量复审最终结论：Standards 与 Spec 均为
`0 Critical / 0 High / 0 Medium / 0 Low`；新增 validator 已列入待提交文件集合。

### Spec / compatibility findings

首轮独立规格复审发现的 anchor 构建、pre-anchor/N-1、生成物、严格预算解析和
规格 EOF 问题均已关闭。最终结论：

- `0 Critical / 0 High / 0 Medium / 0 Low`；
- `--budget-bytes` 真实 CLI 拒绝 `1.5`、`12bytes`、`0` 和超安全整数；
- Dashboard 产物与隔离重建逐字一致；server/CLI 产物归一化绝对 source path 后一致；
- success 与 422/error 均执行 canonical snapshot barrier；
- Linux-only fd-relative HTTP 验证明确交给必需 CI，不把 Darwin skip 伪报为通过。

### Dashboard visual 复审

- 独立 visual reviewer 最终结论：`0 Critical / 0 High / 0 Medium / 0 Low`。
- identity key 修复后重跑三个 Dashboard 测试文件：75/75 通过。
- 第二轮 `frontend-design` + `design-taste-frontend` 覆盖浅/深主题、中/英文、
  390/768/1440 三视口、键盘、focus restore、Escape、reduced motion 与错误重试。

### 最终机器门禁

| Gate | 结果 |
| --- | --- |
| `npm run build` | PASS；CLI/server/Dashboard 生成物来自最终源码。 |
| `npm test` | 320 files，5520 passed，14 honest skips，0 failed。首次高并发暴露镜像 attestation 和 5 秒 hook timeout 后，先重建 `sandcastle:test` 并隔离复跑，再次完整全量转绿。 |
| `npm run test:web` | 59 files，1052 passed，0 failed；仅既有 React `act` / GSAP warning。 |
| `npm run typecheck:web` | PASS。 |
| `npm run check:architecture` | PASS；639 production files，5 个既有 size-only exceptions。 |
| `npm run check:comments` | PASS。 |
| `bash tools/test-bundle.sh` | 31 passed，0 failed，含真实 N-1 双向兼容。 |
| `bash tools/test-hooks.sh` | 482 passed，0 failed。 |
| `bash tools/test-adapters.sh` | 272 passed，0 failed。 |
| `bash tools/verify-skills.sh` | PASS；65 路径引用、62 skill 目录、62 registry token。 |
| `npm run oracle` | 五组 legacy/new 双跑全部一致，0 差异。新增 transition-head anchor 仅按精确合法内部行归一，全部业务字段继续逐字比较。 |
| oracle harness | 16/16 PASS；合法 anchor、malformed/错位置/业务漂移抓红、mirror、corrupt 抓红、PM 声明演进、degraded 与 fixture staging 全覆盖。 |
| `npm run check:docs` | 9 node tests + 39 canonical Markdown 检查通过。 |
| `npm run docs:check` | 44 个公开源产物确定性、16 个双语页面/32 路由通过。 |
| `npm run docs:build` / `npm run docs:smoke` | PASS。 |
| `tenon document status pr-7-merge-audit` | 截至 Build 的全部文档和读取证据完整。 |
| `git diff origin/main --check` | PASS。 |

14 个全仓 skip 的边界：

- 缺 `CLAUDE_CODE_OAUTH_TOKEN` 的真 agent-in-sandbox 路径；
- `TENON_REQUIRE_REAL_CODEX!=1` 的 canonical CI 专属真实 Codex 路径；
- Darwin 上 Linux-only `openat2`/fd-relative server 路径。

这些均有显式 `[HONEST SKIP]`，并要求由 GitHub 必需 Linux CI 覆盖；不计为本地通过。

### pre-Verify 决策

完整 diff 的 Standards、Spec、Rules、Architecture、Security 与 Dashboard visual
Critical/High/Medium 已全部清零。生成物已稳定，未运行 writer 已退出，Build 可登记
`pre_verify_review_result=pass`；登记后若产品源码、配置、迁移或生成物再变化，必须重置并重跑本节。
