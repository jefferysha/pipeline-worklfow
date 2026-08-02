# 最终主干统一审查 — Verify 失败报告（2026-08-03，`8293b53a`）

## 冻结身份

- 产品 Git HEAD / Tenon `build_sha`：`8293b53abc19be86fc73599478ef7282846d53c5`
- Git tree：`8cd39f7253b6ae548498198eb07f2a567a59d63d`
- Git 基线 / merge-base：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 冻结 workspace fingerprint：`workspace:sha256:4d06919d672a39f4cc1e5202260d9aa858a6682b5bc0c426ee5eabe443344f54`
- 完整产品与证据范围：646 files，21,644 additions，3,701 deletions
- binary diff SHA-256：`5c20fb6bfd353e63e0a40b16e02aece5b52cb0918eb5c2664409002c5e9d29b1`

四个独立轨道均从这个精确提交重新开始；上一轮 `796faf62` 的绿色证据没有复用。
隔离构建、测试、OpenSpec archive/apply、浏览器运行与 Codex 审查均未写真实产品工作区。

## 聚合结论

Verify：**FAIL — C0 / H1 / M1 / L0**。

完整 reviewer、隔离 E2E/API/OpenSpec、生产浏览器矩阵以及精确 head GitHub CI 均通过，
但 Codex 全范围审查确认两个新的可达状态完整性问题。绿色测试不能覆盖尚未建模的
snapshot-health 与未标记 Forward 历史边界；PR #20 不得合并，必须通过官方
`verify-fail` 回到 Build，建立确定性 RED、修复、冻结新提交并重跑全部 Verify。

### High — snapshot 健康变化可在未确认时卸载并丢失 Workbench 草稿

`packages/dashboard-app/src/App.tsx` 只在 `workbenchRoot !== ''` 时挂载 `WorkbenchView`。
当 SSE snapshot 临时移除当前项目，或把它从 writable 变为 unreachable / compatibility-only 时，
`workbenchRoot` 会立即变空，条件渲染在导航确认前卸载 Workbench。卸载 cleanup 随即通过
`onDirtyChange(false)` 清除顶层 dirty 状态，内存草稿已经消失，用户没有机会选择“留在此处”。

修复必须在项目健康状态变化期间保留草稿宿主，并禁止对失效项目继续写入；只有用户明确
丢弃或项目恢复权威可写状态后才能解除保留。需要覆盖“dirty Workbench → 同 root snapshot
变为不可写/缺失 → Stay 保留草稿 → 恢复后草稿仍在”和“Discard 后才卸载”的确定性回归。

### Medium — 未标记的 Forward 历史项会被错误当成 Back

`packages/dashboard-app/src/state/useProjectSelection.ts` 对没有
`__tenonDashboardPosition` 的目标一律使用 `previousPosition - 1`。若 Dashboard 挂载时浏览器
已经存在未标记的 forward entry，用户在 dirty Workbench 执行 Forward，代码会把它误判为
Back：取消时调用 `forward()` 而不是 `back()`，确认时又重放 Back，可能留下不一致的 URL/UI，
或沿相反方向导航。

修复必须保存真实 session-history 方向；不能继续把未知方向默认成 Back。需要用真实的未标记
三项历史建立 Forward 的取消与确认回归，同时保留现有已标记 Back/Forward 行为。

## 四轨与远端证据

| 轨道 | 结论 | 新鲜证据 |
| --- | --- | --- |
| 完整 reviewer | PASS，C0/H0/M0/L0 | 实际 Git range 680 paths 全覆盖；root 5881、Dashboard 1555；构建产物逐字节一致；真实 HEAD/fingerprint 前后相同 |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-track2-8293b53.1xZGvI/logs/`；root 5881、Dashboard 1555、hooks 512、adapters 272、migration 13、隔离 archive/apply 全通过 |
| 生产浏览器/视觉 | PASS，C0/H0/M0/L0 | `/tmp/tenon-pr20-verify-track4-8293b53/audit.json`；determinism audit PASS；9 张复核截图；所有 8 次合成写均拦截 |
| Codex CLI | FAIL，C0/H1/M1/L0 | `/tmp/tenon-pr20-codex-review-8293b53a.md`，SHA-256 `4241bdedf776d937cd97ceb00408553e9af8d3f99728f71e7a137670f6a32a39` |

GitHub exact-head CI run `30765836913` 为 success；Documentation Pages run
`30765836924` 的 build 为 success、deploy 按 PR 规则 skipped。PR 为 MERGEABLE，但治理
Verify 结论优先阻止合并。

## 已通过但不能覆盖失败结论的验证

- `npm ci`：486 packages，0 vulnerabilities；`npm ls --all` 无问题。
- Root Vitest：330 files，5,881 passed，26 honest skips。
- Dashboard Vitest：85 files，1,555 passed；本轮配置/治理定向 253/253。
- 完整 production build、Dashboard typecheck 与 committed CLI/server/Dashboard runtime freshness：通过。
- Hooks 512/512；adapters 272/272；migration CAS 13/13；clean install `ok:true`。
- Architecture 719、comments、dependencies、release workflows 24/24、identity、interaction
  contract、repository hygiene、default workflow freshness、docs、document templates：通过。
- OpenSpec change strict 1/1、全仓 38/38；隔离 archive 应用 6 项，archive 后主规格 32/32。
- 浏览器覆盖 1024/1440/1920、zh/en、light/dark、reduced motion、loading/empty/error/busy、
  键盘与焦点；Mandatory partial/full authority 与 Governance debounce 两个新增竞态场景均通过。

26 个 honest skips 为 Docker-dependent 16 项、macOS 上 Linux-only 9 项、PR 环境 real-Codex
H14 1 项；受信 main push 才能执行最后一项。本次 findings 与这些 skip 无关。

## 逐文件规范回读与 OpenSpec 隔离演练

冻结产品/证据 diff 的 646 个文件全部映射并回读：191 个 Dashboard/Server 文件对照
`openspec/specs/dashboard-ui-ux-system/spec.md`，其余 455 个实现、治理、发布、文档与生成物
对照 `openspec/specs/repository-architecture-compliance/spec.md`；未映射 0。逐文件映射
SHA-256 为 `3545ec52c23d3f6ef24bb24f7bd9957cb5e628cb19f28517ac30eb6273d22e11`。

真实主规格前后 digest 均为
`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`。隔离 archive/apply 后
digest 为 `e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`，
`specsUpdated=true`、added 6、archive 后 strict 32/32；真实 `openspec/specs` 未写入。

## 后续动作

1. 通过官方 `verify-fail` 回 Build，保持最终 Verify 任务未勾选。
2. 为 snapshot-health 卸载草稿与未标记 Forward 方向建立确定性 RED。
3. 保留失效期间的 dirty Workbench 但禁止写入；使用真实历史位置恢复未知 entry 方向。
4. 运行定向、全量、构建、静态门、独立 pre-Verify，提交并冻结新基线。
5. 在新基线上重新执行四个 Verify 轨与 exact-head CI；不得复用本轮任何 PASS 证据。
