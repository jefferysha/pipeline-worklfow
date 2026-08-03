# 2026-07-29 合并后统一审查：Verify 第四次尝试

## 结论

- Change：`post-merge-unified-review-20260729`
- 最终主干基线：`445aa1411d45a2c112d296a9fc3530db0f62e31e`
- frozen Build SHA：`f4c79a377e9dc986271778452675d80f9adde718`
- PR：[jefferysha/tenon#20](https://github.com/jefferysha/tenon/pull/20)
- 四轨聚合：**Critical 0 / High 0 / Medium 7 / Low 2**
- 结论：**FAIL，必须以 `verify-fail` 返回 Build；不得合并或发布**

GitHub CI、独立 E2E/API、OpenSpec 隔离应用和大规模视觉矩阵均已通过，但静态 Reviewer 与
Codex 发现了可复现的 workflow schema 兼容、异步 identity、runtime decode、i18n 和
accessible-name 缺口。绿色执行门不能覆盖这些 finding。

## 冻结基线与零输出

四轨均读取同一 Git SHA。Reviewer clone
`/tmp/tenon-final-review.ogd2dB/repo`、Codex clone
`/tmp/tenon-codex-review.CvOwRT/repo`、E2E clone
`/tmp/tenon-final-e2e.faKGbJ/repo` 与视觉 clone 均以 detached
`f4c79a377e9dc986271778452675d80f9adde718` 结束，工作树、index 和冻结源码 diff 为 clean。

共享工作树只存在主流程通过 Tenon CLI 生成的 phase、document-read 和 transition canonical
状态；各验证轨没有写入 `packages/`、构建资产或 Change state。E2E/视觉分别证明其关注范围
unstaged/cached diff 为零。OpenSpec 演练前后共享 diff/status/spec digest 完全一致。

## 四轨结果

| 轨道 | 结论 | 证据 |
| --- | --- | --- |
| Reviewer | C0/H0/M4/L1，FAIL | 独立完整 diff、规格和调用链审查；clean install 静止窗口复跑通过 |
| Codex CLI | C0/H0/M4/L0，FAIL | `codex exec review --base 445aa141...`；其中 mandatory locale 与 Reviewer M4 去重 |
| E2E/API | C0/H0/M0/L0，PASS | clean `npm ci`/build/typecheck/test:all、真实 API 安全正负路径、7 个 Dashboard 页面 |
| Dashboard visual | C0/H0/M0/L1，PASS | 144 个基础矩阵、状态/弹窗/键盘/焦点、24 reduced-motion、42 contrast、108 截图 |

## 去重 findings

### M1：空 custom Workflow 被错误标记为可创建

`CreateChangeDialog.tsx` 将零 step 响应替换成 `__workflow_empty__` 后仍设置 `ready`，
`canCreate` 没有排除 sentinel；后端明确拒绝零 step，因此 UI 会启用一个必然 400 的动作。

修复要求：

- 零 step 必须进入不可创建的 invalid/error 状态。
- 增加空 Workflow 回归，证明按钮禁用且不会发送 create 请求。

### M2：Dashboard 产品文案与 accessible name 本地化不完整

`TrackSettings.tsx` 的 `Track ID`、`reviewSeed`、`coverageProfile`、
`automationEligible`、`skills.*`、`routing.*` 等硬编码 `aria-label` 覆盖本地化 label；
`Nav.tsx` 仍使用 `aria-label="primary"`。中文字典还包含 `Workflow Run`、
`Canonical Revision`、`Policy`、`Reservation owner identity`、`Provider Usage`、
`Structured Verification`、`Legacy projection health` 等产品标签。

修复要求：

- 所有产品 label、按钮、状态和 ARIA 名称使用当前 locale。
- 技术 token 建立显式 allowlist；增加 zh/en 相同值的语义门，避免用“只扫描汉字”的门漏掉
  中文资源中的英文产品文案。

### M3：mutation error envelope 未做 runtime decode，可使 React 崩溃

`mandatoryState.ts` 与 Workbench delete 路径把任意 JSON 直接断言为接口，再把
`error/references/blockers` 原值写入 state 并渲染。`{error:{}}` 或嵌套字段为对象时会触发
`Objects are not valid as a React child`，而不是当前语言的 invalid-response 恢复态。

修复要求：

- 在 API/边界层完整解码 envelope；每个字符串和数组元素逐字段验证。
- malformed body 归类为 invalid-response，不泄漏或渲染任意对象。
- 覆盖 mandatory 与 workflow delete 的畸形 error/reference/blocker。

### M4：mandatory matrix 在途保存会迟到写入旧 locale

语言切换只清空当时的错误；pending callback 仍闭包捕获请求发起时的 `lang/t`。旧请求在切换后
失败会重新写入旧语言 fallback，或在英文界面泄漏中文 server detail。

修复要求：保存结构化错误并在当前 render 翻译，或使用实时 locale identity；增加 deferred
response + locale switch 回归。

### M5：Workflow decoder 漏支持 canonical guard/action

Dashboard `governanceSchema` 没有解码 kernel/server 支持的
`spec-migration-applied` guard 和 `reset-pre-verify-review` action。包含这些合法 variant 的
Workflow 会被误报为 invalid response，无法在 Workbench 打开或编辑。

修复要求：前端类型与 runtime decoder 同 canonical kernel 闭集同步，并用完整 default
Workflow round-trip 回归。

### M6：Workbench save completion 未绑定 exact Workflow identity

保存 A 时切换到 B，完成守卫只比对 root/generation；切换本身不使 save identity 失效。A 的迟到
success/error 可覆盖 B 的 `defSnapshotRef` 和 save status，使 B 被误判 dirty 或显示 A 的错误。

修复要求：save token 必须包含 root + Workflow identity；切换时失效并清理旧 busy，所有
response/catch/finally 都比对完整 identity。

### M7：Workbench 不同 mutation 共用 generation 会永久遗留 busy

save 在途时启动 create/delete 会推进同一个 generation；旧 save 的 `finally` 随后跳过
`setSaving(false)`，使当前 Workflow 的 Save 持续禁用。

修复要求：save/create/delete 使用独立 operation identity，或显式阻止互相重叠；回归必须覆盖
交错完成顺序和所有 finally。

### L1：Clipboard 完成回调可能使用旧 locale

`VerificationEvidenceComposer.tsx`、`ProgressActions.tsx` 与 `TaskDetail.tsx` 的
`clipboard.writeText()` 完成回调闭包捕获点击时的 `t`。语言切换后迟到 resolve/reject 会显示旧语言
toast/error。

修复要求：按 `AfkView` 的实时 locale identity 范式统一，并覆盖 deferred clipboard +
locale switch。

### L2：390px 英文底部导航标签使用省略号

视觉轨确认没有根级横向溢出，完整 accessible name/title 仍存在，因此为 Low；但用户要求统一消除
问题，下一轮 Build 应让 390px 英文标签在不越界的前提下可完整阅读。

## 真实执行证据

### GitHub exact-head CI

PR #20 head 精确为 frozen SHA。`CI / verify` 完成 36 个成功步骤，包含：

- clean install、依赖审计/tree、release anti-bypass、architecture、comments、identity、
  repository hygiene、default workflow freshness；
- 完整 build 与 tracked runtime freshness；
- clean Codex install、双语 docs check/build/smoke；
- kernel/cli/server/automation/tap Vitest、Dashboard tests、hooks、adapters、skills、migration CAS、
  N-1 bundle、bundle smoke 与 golden oracle。

`Documentation Pages / build` 也通过；deploy 在 PR 上按设计 skipped。PR head/base 未漂移，
merge state 在本报告生成前为 `CLEAN`。

### E2E/API

独立环境使用 Node `24.18.0`、npm `11.16.0`、server `127.0.0.1:18859`：

- `npm ci`：418 packages，0 vulnerabilities；
- `npm run build`、`npm run typecheck:web`、`npm run test:all`：exit 0；
- 后端 327 files / 5728 passed / 27 environment-conditioned skips；
- Dashboard 69 files / 1263 passed；
- health/index/register/snapshot/config/Host Plan/trace/evidence/related/router 正路径通过；
- malformed evidence/query/path 400，无/错 token 401，content-type 400，未知 root 404，
  duplicate registration 409，恶意 Host 403；
- 负向请求前后 `templates/manifest.yaml` 字节一致。

### Dashboard browser 与 design-taste

视觉证据目录：`/tmp/tenon-visual-verify-r5.cilNLS/`。

- 144/144：
  `390/1024/1440/1920 × zh/en × system/light/dark × 6 views`；
- Snapshot、Workbench、Host Plan 的 loading/empty/error/retry/success；
- Automation 三个工具 Dialog、Workbench 四类 Dialog、菜单/radio/输入焦点、Tab 困笼、
  Escape 与焦点归还；
- reduced-motion 24/24，`document.getAnimations() === 0`；
- 42 个页面/弹窗 contrast 扫描 0 fail；
- 正常路径 console/pageerror/HTTP/requestfailed 为 0；
- 108 张截图；浏览器关闭后端口监听为 0。

### OpenSpec 隔离应用演练

隔离副本：`/tmp/tenon-openspec-verify.9FQXVd/repo`。

- `openspec show post-merge-unified-review-20260729 --json --deltas-only`：5 deltas；
- `openspec validate post-merge-unified-review-20260729 --strict --no-interactive`：PASS；
- `openspec archive post-merge-unified-review-20260729 --yes --json`：PASS，
  `specsUpdated=true`；
- `openspec validate --all --strict --no-interactive`：31/31 PASS。

副本主规格摘要按预期由 apply 改变；真实共享主规格摘要前后均为
`9abfd0a106a90d42e0874016d95341e4235bd5f4365b37732e800ed9e706fbe3`。共享 diff/status
fingerprint 也逐字一致。

## 逐文件 spec 回读

精确 inventory：

```bash
git diff --name-only \
  445aa1411d45a2c112d296a9fc3530db0f62e31e..\
  f4c79a377e9dc986271778452675d80f9adde718
```

共 375 个文件。以下为该 inventory 的互斥穷尽分组；每组已逐文件回读对应主规格和本 Change
delta，计数合计 375。

| 文件集合 | 数量 | 回读 capability spec | 结果 |
| --- | ---: | --- | --- |
| `packages/dashboard-app/src/**` | 100 | `dashboard-ui-ux-system`、`dashboard-project-selection`、`live-dashboard-project-anchor` 及对应 Host/Trace/Loop/Related/Evidence specs | 已比对；本轮发现 M1–M7/L1 |
| `packages/dashboard-app/dist/**` | 5 | `dashboard-ui-ux-system`、`plugin-distribution` | 生成物 fresh；视觉发现 L2 |
| `packages/dashboard-app/package.json` | 1 | `repository-architecture-compliance` | 已比对 |
| `.github/workflows/**` | 3 | `repository-architecture-compliance`、`plugin-distribution` | exact-head CI 通过 |
| `package.json`、`package-lock.json` | 2 | `repository-architecture-compliance` | audit/tree 通过 |
| `tools/**` | 1 | `repository-architecture-compliance` | 门禁通过 |
| `README*`、`docs/**` | 12 | `open-source-documentation-experience`、`repository-architecture-compliance` | docs check/build/smoke 通过 |
| `openspec/changes/archive/**` | 47 | `repository-architecture-compliance`、`declarative-document-governance` | 内容保留与 strict validation 通过 |
| `openspec/changes/post-merge-unified-review-20260729/**` | 196 | 本 Change 两份 delta + document governance | identity/digest ledger 已回读 |
| `openspec/specs/**` | 8 | 对应同名 capability 主规格 | strict validation 通过 |

## 下一轮 Build 出口

1. 使用 `verify-fail` 返回 Build，不接受偏差。
2. 为 7 个 Medium 和 2 个 Low 先增加确定性 RED，再完成最小修复。
3. 重建 tracked Dashboard assets，重跑完整 Build 门。
4. 冻结新 SHA 后重新执行 Reviewer、Codex、E2E/API、全 Dashboard visual 四轨；旧 SHA 的
   绿色证据不得外推。
