# 最终主干统一审查 — Verify 失败报告（2026-08-03，`c4f0cb58`）

## 冻结身份

- 产品 Git HEAD / Tenon `build_sha`：`c4f0cb584258572e99c01aa48c895613f967951e`
- Git tree：`0f165e83a3e7d1b0ecbdbdfb3b9b42857f27097d`
- Git 基线 / merge-base：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 冻结 workspace fingerprint：`workspace:sha256:ebf93da97da08df012931c8721db77b956a73ce61dbce67844fc1353c776eb97`
- 完整产品与证据范围：698 files，22,389 additions，3,751 deletions
- binary diff SHA-256：`2c9e4d903243ac31cba9e77c713fc23594c2a7ebd87e027852b92ee1b6df0d72`

四个 Verify 轨与 GitHub CI 均从这个精确提交重新开始；上一轮 `8293b53a` 的证据没有复用。
隔离构建、测试、OpenSpec archive/apply、浏览器运行与 Codex 审查均未写真实产品工作区。

## 聚合结论

Verify：**FAIL — C0 / H0 / M2 / L0**。

完整 reviewer 与隔离 E2E/API/OpenSpec 均为 C0/H0/M0/L0，精确 head GitHub CI 通过；生产浏览器
完成 11 个核心场景且未发现新增缺陷，但在总轨失败后停止剩余 1920 英文浅色收口，因此不声明完整
PASS。隔离 Codex 全范围审查确认两个新的 P2 可达边界；PR #20 不得合并，必须通过官方
`verify-fail` 回到 Build，建立确定性 RED、修复、冻结新提交并重跑全部 Verify。

### Medium — root 失权会覆盖已经阻断的历史导航请求

dirty Workbench 已经阻断 Back/Forward 时，若随后 SSE 让当前 root 失权，`App.tsx` 的失权 effect
会无条件写入 `{ kind: 'view', view: 'projects' }`，覆盖原先 `{ kind: 'pop' }` 请求。用户此时选择
“丢弃并离开”，`discardAndNavigate` 不再调用 `confirmPopNavigation()`，原本请求的历史目标被取消，
界面错误落到 Projects。

修复必须保留已经存在的 pop 请求或显式重放它。确定性回归需覆盖：dirty Workbench 阻断 Back 和
Forward、在确认前 root 失权、继续编辑保持原 URL/草稿、丢弃后精确到达原历史目标。

### Medium — portal 对话框失权恢复后没有恢复焦点

共享 Dialog 中的控件持有焦点时，root 失权会按设计让 portal `inert` 并 blur。若用户选择继续编辑、
root 随后恢复，代码只移除 `inert`；App 的 unsaved dialog 关闭后，焦点留在 `document.body`，而仍然
打开的 `aria-modal` Track Settings dialog 没有活动焦点，破坏键盘和无障碍语义。

修复必须在该 dialog 重新取得交互权且仍为栈顶时，将焦点恢复到合适的可聚焦控件或容器；不得抢占
外层仍活跃的 App unsaved dialog。回归需覆盖失权 blur、外层确认期间不抢焦点、恢复并关闭外层后
焦点进入仍打开的 portal dialog。

## 四轨与远端证据

| 轨道 | 结论 | 新鲜证据 |
| --- | --- | --- |
| 完整 reviewer | PASS，C0/H0/M0/L0 | 实际 Git range 698 paths 全覆盖；root 5,883、Dashboard 1,559；重建产物逐字节一致；真实 HEAD/fingerprint 前后相同 |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-track2-c4f0cb5.Lah6Zq/logs/`；root 5,883、Dashboard 1,559、hooks 512、adapters 272、migration 13、隔离 archive/apply 全通过 |
| 生产浏览器/视觉 | historical only，新增 C0/H0/M0/L0 | `/tmp/tenon-visual-c4f0cb-9YNa0L/evidence/`；11 个核心生产交互通过，1920 en/light 收口因总轨失败中止 |
| Codex CLI | FAIL，C0/H0/M2/L0 | `/tmp/tenon-pr20-codex-c4f0cb58.2nzSXF/repo/codex-review.md`，SHA-256 `5cd051f685db7009e0887e5e57e738ecd7a1d97966f815c5facac509f7d5c407` |

GitHub exact-head CI run `30768544631` 为 success；Documentation Pages build 为 success、deploy 按
PR 规则 skipped。PR 为 CLEAN / MERGEABLE，但治理 Verify 结论优先阻止合并。

## 已通过但不能覆盖失败结论的验证

- `npm ci`：486 packages，0 vulnerabilities；完整 production build 和 Dashboard typecheck 通过。
- Root Vitest：330 files，5,883 passed，26 honest skips。
- Dashboard Vitest：85 files，1,559 passed；App/Dialog 定向 68/68；receipt/transcript 120/120。
- Hooks 512/512；adapters 272/272；migration CAS 13/13；clean install `ok:true`。
- Architecture 719、comments、dependencies、release workflows 24/24、identity、interaction contract、
  repository hygiene、default workflow freshness、docs、document templates 全部通过。
- OpenSpec change strict 1/1、全仓 38/38；隔离 archive 应用 6 项，archive 后主规格 32/32。
- 浏览器已覆盖 1440 root missing/recovery/portal/history 关键链路和 1024 zh/dark/reduced-motion/
  keyboard/focus/overflow；console warning/error、page error、request failure 均为 0。

26 个 honest skips 为 Docker-dependent 16 项、macOS 上 Linux-only 9 项、PR 环境 real-Codex H14
1 项；受信 main push 才能执行最后一项。本次 findings 与这些 skip 无关。

## OpenSpec 隔离演练

真实主规格前后 digest 均为
`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`。隔离 archive/apply 后
digest 为 `e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`，
`specsUpdated=true`、added 6、archive 后 strict 32/32；真实 `openspec/specs` 未写入。

## 后续动作

1. 通过官方 `verify-fail` 回 Build，保持最终 Verify 任务未勾选。
2. 为“被阻断 pop + 随后 root 失权”以及“portal 恢复权威后的焦点”建立确定性 RED。
3. 保留原 pop 请求并精确重放；只在 portal 重新取得权威且可安全聚焦时恢复焦点。
4. 重跑定向、全量、构建、静态门和独立 pre-Verify，提交并冻结新 SHA。
5. 在新 SHA 上重新执行四个 Verify 轨与 exact-head CI；不得复用本轮任何 PASS 证据。
