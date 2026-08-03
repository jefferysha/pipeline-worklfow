# 最终主干统一审查 — Verify 失败报告（2026-08-03，`425b3195`）

## 冻结身份

- 产品 Git HEAD / Tenon `build_sha`：`425b31955b988620642c1443166e03dd112c73b3`
- Git tree：`32afcf669c44832bb7ae032478449844056ef946`
- Git 基线 / merge-base：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- workspace fingerprint：`workspace:sha256:86732ae923140e88a5d379379656a9adc0c612c6e9833f3456f05d728896345c`
- 完整范围：714 files，22,691 additions，3,754 deletions
- binary diff SHA-256：`a8a248bd16a80a3a3a8a86fa1734ace0d316b72ede81c405baa3651815345a35`

四个 Verify 轨与 GitHub CI 都从这个精确提交重新开始；上一轮 `c4f0cb58` 的证据没有复用。
隔离构建、测试、OpenSpec archive/apply、浏览器运行与 Codex 审查均未写真实产品工作区。

## 聚合结论

Verify：**FAIL — C0 / H0 / M1 / L0**。

完整 reviewer、两次隔离 E2E/API/OpenSpec、生产浏览器与精确 head GitHub CI 均通过。隔离 Codex
全范围审查确认 1 个新的 P2 可达边界：普通 `view` 导航请求仍会在 root 失权时被 Projects fallback
覆盖。PR #20 不得合并；必须通过官方 `verify-fail` 回到 Build，建立确定性 RED、修复、冻结新提交，
并从零重跑全部 Verify。

### Medium — root 失权会覆盖已经阻断的普通页面导航请求

dirty Workbench 用户先点击 Overview、Progress 等普通一级目标时，`pendingNavigation` 为
`{ kind: 'view' }`。若确认对话框仍打开时 SSE 让当前 root 失权，失权 effect 会调用
`setView('projects')`；当前 functional update 只保留 `{ kind: 'pop' }`，因此仍把原普通目标覆盖为
Projects。用户选择“丢弃并离开”后会到达错误页面。

修复必须保留任意已经存在的 pending 请求，只能在 `current === null` 时合成 Projects fallback。
确定性回归需覆盖：dirty Workbench 点击 Overview、确认前 root 失权、继续编辑保持原 URL/草稿、
丢弃后精确到达最初的 Overview，而不是 Projects。

## 四轨与远端证据

| 轨道 | 结论 | 新鲜证据 |
| --- | --- | --- |
| 完整 reviewer | PASS，C0/H0/M0/L0 | 714 paths 全覆盖；root 5,883、Dashboard 1,562、定向 71/71；重建产物逐字节一致；真实产品身份不变 |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-track2-425b319-status-rerun.uJVxH3/`；完整重跑；status 701 bytes 前后 SHA-256 均为 `ca22e9351da7f3321a924dd13c224d8c296af221d162a16d266cce891c092a46` |
| 生产浏览器/视觉 | PASS，C0/H0/M0/L0 | `/tmp/tenon-verify-425b319-GS8GO3/evidence/`；7/7，1024/1440/1920，zh/en，light/dark，reduced-motion，Back/Forward 与两种焦点顺序 |
| Codex CLI | FAIL，C0/H0/M1/L0 | `/tmp/tenon-pr20-codex-425b.H8F4nI/repo/codex-review.md`，SHA-256 `4fa7b5d48991cc8476c9a88fee9053d1896cd401f98313e2bfdb7262274387a0` |

GitHub exact-head CI run `30769989090` 在 `425b31955b988620642c1443166e03dd112c73b3` 上为 success；
Documentation Pages build 为 success、deploy 按 PR 规则 skipped。PR 为 CLEAN / MERGEABLE，但治理
Verify 结论优先阻止合并。

## 已通过但不能覆盖失败结论的验证

- `npm ci`：486 packages，0 vulnerabilities；完整 production build、Dashboard typecheck 和 committed runtime freshness 通过。
- Root Vitest：330 files，5,883 passed，26 honest skips。
- Dashboard Vitest：85 files，1,562 passed；App/Dialog 定向 71/71；API/安全 32/32。
- Hooks 512/512；adapters 272/272；migration CAS 13/13；clean install `ok:true`。
- Architecture 719、comments、dependencies、release workflows 24/24、identity、repository hygiene、
  default workflow freshness、docs、document templates、skill references 全部通过。
- OpenSpec change strict 1/1、repository gate 38/38；隔离 archive 应用 6 项，archive 后主规格 32/32。
- 浏览器 loading/empty/error、键盘、焦点、历史导航、root authority、三档桌面宽度和视觉质量通过；
  非预期 console/page/network 错误为 0。

26 个 honest skips 为 Docker-dependent 16 项、macOS 上 Linux-only 9 项、PR 环境 real-Codex H14
1 项；受信 main push 才能执行最后一项。本次 finding 与这些 skip 无关。

## OpenSpec 隔离演练

真实主规格前后 digest 均为
`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`。隔离 archive/apply 后
digest 为 `e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`，
`specsUpdated=true`、added 6、archive 后 strict 32/32；真实 `openspec/specs` 未写入。

## 后续动作

1. 通过官方 `verify-fail` 回 Build，保持最终 Verify 任务未勾选。
2. 为“普通 view 已阻断 + 随后 root 失权”建立确定性 RED。
3. 只在没有 pending 请求时合成 Projects fallback；任意既有 view/pop 请求都保持原目标。
4. 重跑定向、全量、构建、静态门和独立 pre-Verify，提交并冻结新 SHA。
5. 在新 SHA 上重新执行全部 Verify 轨与 exact-head CI；不得复用本轮任何 PASS 证据。
