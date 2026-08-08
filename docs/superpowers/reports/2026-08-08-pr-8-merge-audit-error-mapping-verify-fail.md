# pr-8-merge-audit 错误映射语义 Verify 失败报告

## 冻结对象

- Change：`pr-8-merge-audit`
- build SHA：`bdf78f22773bf60b9c1e2005ddb8337336756e28`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 三轨证据

- Reviewer：发现下述 M1；其余 C0/H0/L0。33/33 个 current main 场景全部保留，8 个 delta-only
  场景全部可追溯，`用户首次进入 Host Plan` 正文一致，canonical ledger/transition/revision 一致。
- E2E：OpenSpec 1.6.0 与 1.8.0 strict、真实 archive、archive 后 41/41 all-strict 全部 exit 0；
  两版输出字节一致，8 requirements、33 current scenarios 和 8 个 delta-only scenarios 均保留。
- Codex CLI：read-only 审查独立定位到同一错误映射放宽；随后完整分支审查长时间未收敛，由主线程
  中止，exit 130。该轨用于佐证 finding，不伪报为最终 PASS。
- Node 22.23.2 官方 OpenSpec checker：42/42 通过。
- 浏览器/UI：冻结差异不含产品源码或 UI 变更，不适用；这不是浏览器通过声明。

## 阻断发现

**M1 — `CLI stdout 或 DTO 无效` 放宽 current main 的确定性 `502` 映射。**

current main 明确规定 CLI 非零退出、stdout 不是完整 JSON 或 DTO 无效时返回
`502 HOST_TARGET_PLAN_INVALID`。冻结 delta 把结果写成“`502 HOST_TARGET_PLAN_INVALID` 或已声明的
unavailable code”，允许同一错误退化为其他状态。现有实现/测试把 `503 HOST_TARGET_PLAN_UNAVAILABLE`
限定在 CLI 未配置或调度 deadline/timeout；strict validator 不检查这类正文弱化。

## 恢复路径

1. 对确切 `verify-fail` 留下 review request 与 delegated acknowledge。
2. 回到 Build 后以 `requirements-changed` 返回 Spec。
3. 将该场景恢复为确定的 `502 HOST_TARGET_PLAN_INVALID`；unavailable 仅保留在各自明确场景中。
4. 不改场景名、不删任何 current main 或 delta-only 场景，不扩大产品范围。
5. 重新登记、全文读取、review、冻结，并重跑两版 strict/archive、Reviewer、E2E、Codex 与精确 head CI。
