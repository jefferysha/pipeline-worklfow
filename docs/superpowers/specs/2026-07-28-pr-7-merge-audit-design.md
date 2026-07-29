# PR #7 合并审计技术设计

## 用户结果

用户在 Dashboard 的 Change 进度抽屉中，可以在执行 handoff 前只读预览目标 canonical phase 的
Context Bundle 输入、物化模式、源/物化字节和预算是否足够。这个预览必须与 CLI
`tenon handoff --bundle` 使用同一规则源，不返回文档正文、不修改 Change，并与最新 `main` 已有的
Verify evidence composer 共存。

## 当前证据基线

- 审计 Change：`pr-7-merge-audit`；原 PR：[#7](https://github.com/jefferysha/tenon/pull/7)。
- 当前主线：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`。
- PR head：`c52a2bce2abb71f8c12c03748fec2d31c4474450`。
- merge base：`15fe619b2885b928dd27be9668cca6b0ee903c57`；GitHub 当前报告
  `MERGEABLE=CONFLICTING`、`mergeStateStatus=DIRTY`。
- PR 基线包含 232 个路径，其中大量是原 Change 的治理/归档记录和生成资产；产品源码横跨
  kernel、CLI、server、Dashboard。
- 只读 `git merge-tree --write-tree origin/main HEAD` 报告三个内容冲突：
  `packages/dashboard-app/src/api/client.ts`、`packages/dashboard-app/dist/index.html`、
  `packages/server/dist/dashboard.mjs`。后两个必须由当前源码重新生成，不能手工选边。
- 同一合并模拟对 `ProgressDrawer.tsx` 自动合并后同时保留
  `ContextBundlePreview` 的 `curStageExtra` 和 PR #6 的
  `VerificationEvidenceComposer` `documentsExtra`。Build 必须把这个组合变成显式回归测试，
  不能只相信一次自动合并结果。

原 PR 的归档 Change、验证报告和通过结论只作为待核材料；它们不替代本 Change 在最新 main 上的
设计、Build、冻结 Verify 和 CI 证据。

## 现有能力与复用结论

`search-first` 与 `openspec-explore` 找到：

- `openspec/specs/context-bundle-handoff/spec.md` 已定义确定性
  `context-bundle/v1`、ledger-bound 输入、hard budget 和 drift 检测。
- `packages/kernel/src/compress/context-bundle.ts` 已是最终 bundle 编译器。
- PR #7 的合理新增点是把 CLI 私有 ledger→bundle 编排提取为可注入 ports 的共享服务，并增加
  不含正文的 preview metadata；不是创建第二套 bundle 格式。
- 最新 main 已增加 verification evidence API、Dashboard composer、body portal/modal ownership
  与更严格 canonical revision 验证。#7 的集成不得删除或降级这些能力。
- 没有新增运行时依赖；无需外部库或包注册表方案。

因此保留“kernel 单一规则源 + CLI/server adapter + Dashboard DTO/view”的方向，但所有旧基线的
自动合并结果都要通过当前规则、组合测试和真实浏览器重新证明。

## 边界与数据流

```text
ProgressDrawer
  ├─ curStageExtra -> ContextBundlePreview
  └─ documentsExtra(Verify) -> VerificationEvidenceComposer

ContextBundlePreview
  -> dashboard contextBundleClient (strict decoder + AbortSignal)
  -> GET /api/context-bundle/preview
  -> Host guard
  -> registered WorkflowRootAnchor
  -> fd-relative trusted Change/state/ledger/source reader
  -> kernel compileLedgerContextBundleWithPorts
     -> document policy
     -> ledger/digest validation
     -> materialization + resource limits + hard budget
     -> ContextBundle v1
  -> safe preview DTO (no content)
```

### 所有权

- kernel 拥有 document policy、reason/reasonCode、materialization mode、预算与 typed domain errors。
- CLI adapter 拥有可信本地 workspace 的 Node 文件读取，并保持旧 handoff 输出兼容。
- server adapter 拥有 Host/root/Change 信任锚、fd-relative traversal、HTTP 参数与状态码映射。
- Dashboard API 层拥有未知 JSON 的闭集解码；组件只拥有一次性 target/budget 和请求状态。
- `ProgressDrawer` 只装配两个独立功能，不复制任一领域规则。

## 关键业务规则

1. CLI 与 API 必须调用同一个 ledger compiler；server/前端不得复制 policy、reason 或 mode 决策。
2. preview target 必须是 canonical phase；current `from` 可以是安全 custom step id。
3. ledger 缺失、required kind 缺失、源文件缺失、digest 漂移、canonical revision 损坏均 fail closed。
4. server 预览固定最多 64 个 required records、单文件 262144 source bytes、总计 1048576
   source bytes；用户的 materialized budget 不得替代资源上限。
5. 只有可遍历的目录 fd path 才允许 server 读取 Change；Darwin/不支持平台在读状态前返回稳定 501。
6. 成功 DTO 只含相对 path、digest、reasonCode、mode 与 byte metadata；绝不含 `content`。
7. 预算不足返回 422 和无 aggregate digest 的 safe preview；不能伪装成成功 bundle。
8. Dashboard 的 target/budget 仅存在于抽屉生命周期；切 Change、关闭抽屉或输入变化必须中止/失效旧请求。
9. Verify phase 中预算预览和 evidence composer 必须同时可达，且两者的 focus/portal/keyboard ownership
   不互相破坏。
10. `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs` 和 Dashboard `dist/`
    只能从最终源码生成。
11. 默认七阶段 workflow 的当前阶段、前进和回退标签必须通过 `phases.*` 按 Dashboard locale
    显示；custom workflow 必须保留作者标签，不能用中文/英文字符启发式判断。

## 状态机

```text
idle -- submit/target --> loading
loading --> success
loading --> policy-empty
loading --> budget-error
loading --> error
success | policy-empty | budget-error | error
  -- submit/target/retry --> loading
any -- budget edit/change close/unmount --> idle or disposed
```

每次请求由 generation 与 `AbortController` 双重拥有；只有最后一次、仍属于当前 Change/target/budget
的响应可以提交 UI 状态。

## API 契约

`GET /api/context-bundle/preview` 显式接收 registered `root`、安全 `change`、canonical `target`
和正安全整数 `budgetBytes`。200 返回 `context-bundle-preview/v1` 与有效 aggregate digest；完整性
错误为 409，资源上限为 413，预算不足为 422 + 无 aggregate 的 safe preview，平台 capability
failure 为 501。所有响应都不含文档正文或绝对路径。

## 架构与长度审查

### 必须在 Build 处理

- `packages/dashboard-app/src/progress/ContextBundlePreview.tsx` 为 369 行，超过普通组件 250 行建议
  拆分线。将协议无关的展示块与状态/请求 hook 分离，保持同一功能域，不上移到 `shared/`。
- `packages/server/src/contextBundlePreview.ts` 为 396 行，接近 handler 400 行硬上限。将安全 HTTP
  DTO/error mapping 与 Change path-anchor/helper 分离，handler 只保留参数校验、用例调用和响应编排。
- 为 `ProgressDrawer` 增加组合测试，明确 Verify 中同时渲染 composer 和 preview。
- `packages/dashboard-app/src/api/client.ts` 冲突必须同时导出 context bundle 与 verification evidence
  facade/type；不得删任一组。

### 保留并记录理由

- kernel `ledger-context-bundle.ts` 为 333 行，超过 application use case 300 行建议线但低于 500
  硬上限；其循环是一个原子 policy→read→verify→materialize 用例。Build 先用审查与测试判断；
  若拆分会导致预算/顺序规则分散，则保留单文件并在交付说明凝聚性理由。
- `contextBundleTrustedReader.ts` 当前为 323 行，超过 storage adapter 300 行建议线但低于 500 行
  硬上限；新增行用于同一 fd-relative file/ledger/state 完整性边界。继续保留单文件，避免把
  `O_NOFOLLOW`、有界读取和 canonical continuity 拆到多个可漂移适配器。
- Dashboard `contextBundleClient.ts` 是单一协议 decoder + request facade。若无需修改其公共 contract，
  不为行数做无收益重构。

## 安全审查

### 信任边界

| 边界 | 不可信输入 | 必须的防线 |
| --- | --- | --- |
| Browser → GET API | root/change/target/budget/Host | Host guard、registered root、闭集 id/phase、正安全整数 |
| root path → Change | symlink、rename/swap、path escape | root fd/inode/realpath、逐层 `O_NOFOLLOW`、Change identity |
| ledger/source | 损坏 JSON、非法 UTF-8、FIFO/device、symlink、超大文件 | regular-file fd、fatal UTF-8、bounded read、resource caps |
| kernel ports | 恶意/损坏 record/path/digest | relative path validator、闭集 kind、SHA-256、fail-closed typed error |
| server → Browser | absolute path、正文、底层 errno/message | safe DTO/error mapper；内部 cause 只进入本机诊断 |
| API → React | 未知/篡改 JSON、旧响应 | strict decoder、响应 identity/预算校验、abort + generation |

### Build/Verify 负面路径

- 非本地 Host、未注册/换位 root、Change 目录 symlink/普通换位。
- canonical current/immutable/previous/TransitionRecord 损坏或缺失、非法 UTF-8。
- ledger 缺失/畸形/非法 UTF-8/超 transport cap。
- source symlink/FIFO/non-regular、单文件/累计超限、读取中增长、stale digest。
- 预算 0/小数/超 safe integer、低预算不能绕过 source cap。
- 422 不含 content/aggregate；其他完整性错误不返回 partial preview。
- client 拒绝未知 code、错误状态码、绝对/穿越 path、bytes 求和不一致、`content` 字段和请求 identity 不匹配。

## Dashboard `design-taste-frontend` 决策

该能力是诊断工具，不应成为又一个通用“卡片 + 渐变 + 徽章”堆叠：

- 视觉层级只保留标题/一句用途、两个明确控件、单个主要动作和结果区。
- 成功、空、预算警告、完整性错误要靠语义、文案和少量现有 token 区分，不引入新装饰体系。
- 输入列表优先显示 path、mode、source/materialized bytes；reason 为次级解释。
- 不使用无意义 icon、全大写标题、夸张 hero 或新渐变。
- 明/暗主题、zh/en、1440/1024/390、长 path/大数字、reduced-motion、hover/active/focus-visible、
  Tab/Enter/Escape 和抽屉滚动均要真实浏览器复核。
- 第一次视觉审查发现的问题必须在 Build 修复，再进行第二次审查；只给评论不算完成。

## 方案取舍

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| server 调 CLI 子进程 | 拒绝 | cwd/root 隐式、错误文本不稳定、额外进程与取消边界 |
| server/前端复制 policy | 拒绝 | 形成多个规则源，必然与 CLI/ledger 漂移 |
| kernel 共享 compiler + ports | 采用 | 领域规则单源、I/O 可替换、typed error、CLI 兼容 |
| 直接接受原 PR 的归档/CI | 拒绝 | 基线过时且与最新 main 冲突，不是本 Change 的冻结证据 |
| Build 合并最新 main 并重生成 | 采用 | 非强制、保留历史、能显式处理两个 Dashboard 功能的共存 |

## Assumptions / Decision Log

- 用户已对 exact Change 授予持续执行；低风险取舍采用最保守、可逆默认并记录，不伪造成用户再次选择。
- capability 仍为新增 `context-bundle-budget-preview`；对既有
  `context-bundle-handoff` 的抽取必须保持语义兼容。
- Build 使用普通 merge 集成 `origin/main`，不 rebase/force-push。
- 冲突产物不手改：源冲突显式合并后运行官方 build/bundle 生成。
- 任一安全、架构、组合 UI 或真实浏览器问题都默认修复；若改变需求语义，走
  `requirements-changed` 回退 Spec。
- 不新增依赖、缓存、持久化字段或写端点。

## 术语

- **source bytes**：ledger 路径当前 UTF-8 文件字节数。
- **materialized bytes**：按 full/summary/reference 后实际参与 hard budget 的字节数。
- **policy-empty**：目标 document policy 没有 required reads，不等同于证据缺失。
- **safe preview**：不含正文、只含相对路径/digest/reason/mode/bytes 的 DTO。
- **trusted reader unavailable**：平台不能从打开的目录 fd 做相对遍历，读取前明确 501。

## 验证策略

- 定向：kernel compiler、run revision continuity、CLI handoff、trusted reader、server preview、
  Dashboard decoder/component/ProgressDrawer 组合。
- 全量：`npm run typecheck:web`、`npm run test:web`、`npm test`、`npm run build`、
  `npm run check:comments`、`npm run check:default-workflow-freshness`、hooks、adapters、skills、
  bundle、migration CAS 与 golden oracle。
- 真实 API/浏览器：隔离端口与正确 Tenon title/root；Linux 覆盖 success/empty/422/missing/retry，
  Darwin 覆盖安全 501；Dashboard 覆盖三视口、双主题、双语言、键盘/focus/reduced-motion 及 Verify
  composer 共存。
- GitHub：最终 PR head 精确 CI 全绿、无未解决 review/comment/thread 后才合并；合并后等待 main CI。

```coverage
touches:
L1_api:      filled -> #API-契约
L2_data:     filled -> #边界与数据流
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机
L5_errors:   filled -> #安全审查
L6_security: filled -> #安全审查
L7_perf:     filled -> #关键业务规则
L8_deps:     filled -> #现有能力与复用结论
L10_terms:   filled -> #术语
```
