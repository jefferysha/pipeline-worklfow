# 设计

## Explore 结论

- Replay 修复应留在 kernel interaction 纯领域层，只调整 terminal ordering 诊断和测试，不改变 event envelope、identity、scorecard 公式或 store 写入。
- Sidecar reader 复用 kernel 已有的 bounded regular-file handle/identity fence，固定 16 KiB 上限并要求 canonical JSON bytes；通过现有 reader seam 做确定性 race 测试，不在授权路径另造无界 `readFile`。
- Compatibility 选择显式 fail-closed + fresh exact request 恢复；缺少旧 request 时刻的可信 digest，无法把 legacy approved receipt 自动迁移为授权事实。
- 实现由且仅由一个 `luna_worker` 在本 worktree 串行完成；根代理独占影响面、风险、代码 Review、验收、PR 与 CI。

## 风险

- Sidecar 参与 authorization，任何 missing/malformed/replaced/ambiguous 结果误判为可信都会让 stale 或伪造 receipt 越过 review gate。
- 仅比较 size/mtime 或仅使用 `O_NOFOLLOW` 不能同时证明路径、inode、内容和读取窗口稳定；竞态测试必须覆盖同尺寸替换、symlink、增长与消失。
- 终态后非法核心事件若只被跳过，会掩盖 projection 回退；若把允许的幂等 resume 误判为错误，则会改变既有 metric 行为。
- canonical compatibility 的语义变更若在 Build 才修改文档，会再次重演 #46 的 spec drift；必须先完成真实 Spec/review 证据。

## Spec 必须固化

- terminal 后仅允许完整已知的幂等 `resume.validated(success)`；其他 core event（含 unknown extension 包装）产生全局和 journey-local `malformed-order` 并阻止 completion。
- Sidecar 的 ordinary-file、16 KiB、path/fd identity、canonical bytes、错误脱敏与 deterministic race scenarios。
- legacy pending/approved receipt 必须 fresh `review request` 生成新时间戳和 binding；acknowledge/transition 对其他状态都 fail closed。
- 受控 dist/docs/OpenSpec 同步、exactly-one-worker 文件边界、Review hard cap=2 与稳定候选一次完整门。

## Requirements Reconciliation

首次 Spec review 后，本 Change 进入 Build，但在实现文件仍与起点相同、唯一 worker 尚未创建时，以官方 `requirements-changed` 回退本次 Spec。最终决策是：#46 的 canonical legacy compatibility 承诺不能覆盖授权安全事实；sidecar-less legacy receipt 一律 fail closed，只有 fresh exact request 能恢复。proposal、design、两个 delta spec 与实施计划共同登记此语义，后续 Build 不得再改变它；若实现证明此契约无法成立，必须再次走正式 requirements 流程，而不能在代码或文档中局部放宽。
