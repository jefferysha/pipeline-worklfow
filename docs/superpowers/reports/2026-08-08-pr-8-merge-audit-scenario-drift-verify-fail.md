# pr-8-merge-audit 场景漂移 Verify 失败报告

## 冻结对象

- Change：`pr-8-merge-audit`
- build SHA：`e258856111825ff600558839c79ade8303d89fc8`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`（`origin/main`）
- 分支：`codex/openspec-scenario-drift-20260808`
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 已通过证据

- `@fission-ai/openspec` 1.8.0 对 pr7、pr8 的 `validate --strict` 均通过。
- Node 22.23.2 运行仓库 `npm run check:openspec`：42/42 通过。
- 场景集合解析：5 条 `MODIFIED` requirement 均无主 spec 场景标题缺失；
  `用户首次进入 Host Plan` 已按当前主 spec 原文恢复；8 个既有 delta 增强场景仍在。
- 独立 reviewer：C0/H0/M0/L0；确认场景集合完整、ledger SHA 与冻结提交一致。
- 隔离 clone 中真实运行 OpenSpec 1.8.0 archive：33 个主 spec 既有场景全部保留，
  归档后 41 个场景，8 个新增场景全部可追溯到既有 delta。

## 阻断发现

**M1 — `MODIFIED` requirement 仍可能弱化当前主 spec 的非标题语义。**

隔离 archive 证明 pr8 并非 canonical no-op：它会替换 5 条 requirement 的 narrative 和 18 个
既有场景正文。逐段比较发现 `Dashboard 宿主计划中心` 的 delta narrative 未完整保留当前主 spec
已明确的全部用户可见文本中英翻译、目标卡/native-adapter/scope/capability 展示、只读预览的
副作用说明，以及推荐候选与手动候选一致的 master-detail 层级。最新版 strict validator 只阻止
场景标题丢失，不能证明这些正文语义不被弱化。

这违反本轮验收的“MODIFIED requirement 保留当前主 spec 完整场景集合且不得删除、改名或弱化
既有语义”。因此不得以当前冻结 SHA 进入 Ship。

## 决策与恢复路径

1. 对确切 `verify-fail` 生成 review receipt，并按用户持续授权 delegated acknowledge。
2. 官方 transition 回到 Build，再以 `requirements-changed` 返回 Spec。
3. 在现有 pr8 delta 内将 5 条 `MODIFIED` requirement 调整为 current main 与既有 delta 语义并集：
   保留全部主 spec 正文/场景，也保留 delta 已有加强项；不新增产品功能范围。
4. 重新登记、读取、review、冻结新 SHA，并重跑最新版 strict、官方门禁、隔离 archive/apply、
   Reviewer、Codex CLI 与精确 head CI。

## 不适用证据

冻结 diff 不包含 UI、API、运行时或产品源码变化，因此本轮真实浏览器/API 行为验收不适用；
这不是浏览器通过声明。语义修复后仍以 OpenSpec 实际 apply/archive 重放作为本次运行时入口证据。
