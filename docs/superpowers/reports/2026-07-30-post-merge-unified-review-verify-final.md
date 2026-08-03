# 最终主干统一审查 — Verify 失败报告（2026-08-03，`ca41261a`）

## 冻结身份

- 产品 Git HEAD / Tenon `build_sha`：`ca41261a81f3aff1af373440dddbf077d7781ae2`
- Git tree：`cfc7b0ace47b820cd7c296d3b7e66ea00b62be39`
- Git 基线 / merge-base：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 完整范围：726 files，23,359 additions，3,755 deletions
- CLI、Server、Dashboard 组合 digest：`f5937a03b92a70b6f8628128269aa1c1e5ee7b141958b2ef0879ff5970710967`
- Dashboard production entry：`index-BYlOsNDd.js`
- Verify 前后真实工作树 binary status SHA-256：`2b2bbc53219f5a45c270b4689562f2bc843e96a82ca6b3791ec4dd6e89b345d0`

四条独立 Verify 轨与 GitHub CI 都绑定这个精确提交；上一轮证据没有复用。隔离构建、测试、
OpenSpec archive、浏览器运行、独立 reviewer 与 Codex CLI 审查均未修改真实产品工作树。

## 聚合结论

Verify：**FAIL — C0 / H1 / M2 / L0**。

全量测试、构建、静态治理门、隔离 OpenSpec archive、生产浏览器矩阵和精确 head GitHub CI 均通过，
但两条独立代码审查发现 3 个新的核心正确性问题。PR #20 不得合并；必须通过官方
`verify-fail` 回到 Build，逐项建立确定性 RED、修复、冻结新提交，并从零重跑全部 Verify。

### High — 相对 Skill 路径没有按 transcript 的真实 exec workdir 解析

`packages/cli/src/codexTrustedSkillRead.ts` 对 `cat` 的相对路径使用 Tenon 进程 cwd 做 `resolve()`，
而真实 shell 会从 transcript 记录的 exec `workdir` 解析。当前 session cwd 相同时，调用 workdir 的
验证可被绕过：仓库内攻击者可放置与受信 Skill 完全同字节的副本，让 verifier 错把相对路径解析到
host-cache `SKILL.md`，从而在没有读取受信资产时铸造 `CodexSkillRead` 证据。

修复必须拒绝相对 operand，或将其严格绑定到已验证的 exec workdir；测试需证明仓库副本无法产生
receipt，同时绝对 host-cache 路径仍可通过。

### Medium — superseding navigate 会在事件派发前由旧 AbortSignal 过早消费首请求事务

`packages/dashboard-app/src/state/useProjectSelection.ts` 在旧不可取消 traversal 的 `AbortSignal`
触发时同步执行 `afterRestore`；App 回调随即清空 first-request-wins pending/dirty 并提交首个目标。
Navigation API 在派发下一次 `navigate` 前会先中止 ongoing navigation，因此后续 traversal 到达时
predicate 已为 false，无法 `preventDefault()`，最终可能覆盖第一个赢家目标。

确定性 RED 已证明：noncancelable traversal → 用户 Discard 排队 winner → 旧 signal abort → 同一任务
派发第二个 cancelable traversal；第二项预期被取消，实际未取消。修复必须让 superseding
`navigate` 先获得取消机会，并以精确 sequence 判断新的 noncancelable barrier 是否继续等待。

### Medium — 无 Navigation API 时无法可靠判断未标记 Forward，却默认按 Back 补偿

浏览器没有 Navigation API、目标又是挂载前未标记 history entry 时，`eventPosition` 与
`indexedTraversal` 都为空；实现把 traversal 默认成 `-1`。dirty Workbench 用户执行 Forward 时，
阻断器会错误调用 `history.forward()` 去“撤销”已发生的 Forward；位于栈尾时不会再产生 restoring
`popstate`，事务会永久卡住，确认重放方向也错误。

修复必须为方向未知的未标记 entry 使用不会死锁的安全降级；若无法异步判断方向，则不得用猜测方向
做历史补偿，并应覆盖无 Navigation API 的 Forward/Back 两条确定性回归。

## 四轨与远端证据

| 轨道 | 结论 | 新鲜证据 |
| --- | --- | --- |
| 独立完整 reviewer | FAIL，C0/H0/M1/L0 | `/tmp/tenon-pr20-verify-track1-ENU4Un/`；726 paths 全覆盖；确定性 superseding navigate RED |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-track2-ca41261.44QyBi/track2-summary.md`；root 5883、Dashboard 1572、focused 78、API security 32、hooks 512、adapters 272、migration 13 |
| 生产浏览器/视觉 | PASS，C0/H0/M0/L0 | `/tmp/pr20-verify-visual-ca4.C2uBEQ/evidence/REVIEW.md`；36/36 矩阵、51 screenshots、116/116 focused、console/page/HTTP errors 0 |
| Codex CLI exact diff | FAIL，C0/H1/M1/L0 | `/tmp/pr20-codex-exact.VcmM5T/final.md`；relative Skill workdir bypass 与 no-Navigation-API Forward deadlock |

GitHub exact-head CI run `30774790776` 在 `ca41261a81f3aff1af373440dddbf077d7781ae2` 上为
success；Documentation Pages build 为 success、deploy 按 PR 规则 skipped。远端绿灯不能覆盖上述
代码审查 finding。

## 已通过但不能覆盖失败结论的验证

- Root Vitest：330 files，5,883 passed，26 honest skips；Dashboard：85 files，1,572 passed。
- Navigation focused 78/78；API security 32/32；visual focused 116/116。
- Hooks 512/512；adapters 272/272；migration CAS 13/13；静态/治理门 12/12。
- 连续构建与 tracked runtime freshness 通过，`npm audit` 为 0，clean install 通过。
- OpenSpec change strict 1/1；隔离官方 archive 合并 6 个 delta，archive 后 37/37 strict。
- 浏览器 1024/1440/1920、zh/en、light/dark/system、normal/reduce 共 36/36；无 document overflow。
- GitHub CI 的 build、full tests、hooks、adapters、skills、migration、bundle 和 golden oracle 全部通过。

26 个 honest skips 为 Docker-dependent 16 项、macOS 上 Linux-only 9 项、PR 环境 real-Codex H14
1 项；受信 main push 才能执行最后一项。本次 3 个 finding 与这些 skip 无关。

## OpenSpec 隔离演练

真实主规格 digest 为 `fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`；
隔离 archive 后 digest 为 `e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`，
6 个 delta 已应用且 37/37 strict 通过。真实 `openspec/specs` 未写入。

## 后续动作

1. 通过官方 `verify-fail` 回 Build，保持最终 Verify 任务未勾选。
2. 修复受信 Skill 相对路径/workdir 证据绕过并补 fail-closed RED。
3. 修复 AbortSignal 与 superseding navigate 的 first-request-wins 竞态。
4. 为无 Navigation API 的未标记 Forward/Back 建立方向安全降级与回归。
5. 重跑定向、全量、构建、静态门和独立 pre-Verify，冻结新 SHA。
6. 在新 SHA 上重新执行全部 Verify 轨与 exact-head CI；不得复用本轮 PASS 证据。

## Build 回退修复收敛（2026-08-03，待重新冻结）

本节记录 `verify-fail` 回到 Build 后的新鲜实现与 pre-Verify 证据；它不会把上面的
`ca41261a` Verify FAIL 改写为 PASS，也不能替代新冻结 SHA 上必须重新执行的 Verify。

- Codex Skill receipt reader 现在拒绝相对 `cat` operand、绝对父目录逃逸和不受信 sibling 路径；
  定向测试 122/122 通过。
- Navigation API 的旧 AbortSignal 结算延迟到 microtask，并以 settlement sequence 与新 barrier
  身份保护 first-request-wins；无 Navigation API 的未知方向 traversal 改为同步确认和完整历史快照恢复，
  取消后进入无 marker epoch，后续 Back/Forward 不再猜方向或死锁。
- Dashboard `App.test.tsx` 85/85、Web 85 files / 1,579 tests、root 330 files /
  5,885 tests（26 honest skips）通过；Web typecheck 与完整生产构建通过。
- `git diff --check`、comment honesty、architecture、OpenSpec 38/38、identity、repository hygiene、
  dependency audit（0 vulnerabilities）全部通过。
- 干净本地安装通过，release id 为
  `sha256-0f85ba0b19dd25699a5a3b1d90627d7234a99fcda9a3554c7f9224078420fd09`。
- 独立最终代码复核 PASS：C0/H0/M0/L0；最新 production entry `index-C0HsuyWL.js` 已包含完整
  history snapshot、unmarked epoch、blocked-target fallback 与 Navigation API abort 修复。
- 真实 Chromium 1440×1000 验收同时覆盖 Navigation API 和显式禁用 Navigation API 两条路径：
  取消保留 URL/草稿，第二次 traversal 确认离开，无 pageerror/console error；证据位于
  `/tmp/pr20-build-browser.idg6uH/evidence/REVIEW.md`。

下一步仅可通过官方 `build-complete` 冻结新 SHA，随后从零执行四轨 Verify 和 exact-head CI。
