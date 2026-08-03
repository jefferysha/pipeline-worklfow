# 已应用主规格

- Change: `update-wal-desired-identity-20260803`
- 应用日期: `2026-08-03`
- 结果: `changed`

## plugin-runtime

- 增量来源: `openspec/changes/update-wal-desired-identity-20260803/specs/plugin-runtime/spec.md`
- 主规格目标: `openspec/specs/plugin-runtime/spec.md`
- 应用前 SHA-256: `6e83dfbd5216028bf84a3e844e5abed5aade754295b505f4dd36fdc4e5a77a4a`
- 应用后 SHA-256: `2d96506b15d34663da15292118067213f170f6acc7115e8253d9348708d2084c`
- 结果: `changed`

本次保留 `Managed release SHALL 以可对账 WAL 串联宿主与 runtime` 原有两个场景，并把已批准的
稳定 marketplace identity 等价边界、真正身份/目标字段严格比较、non-canonical nested HEAD
拒绝，以及 started/completed 真实 native 跨进程零重放恢复写入主规格。未修改其他 Requirement，
未放宽通用 desired 的 byte-exact 或第三状态 fail-closed 契约。

主规格已通过 `npx openspec validate --all --strict --no-interactive`。再次应用时，若该 Requirement
及六个 Scenario 已存在且语义一致，应保持字节不变并记录为 `no-op`；不得重复追加。
