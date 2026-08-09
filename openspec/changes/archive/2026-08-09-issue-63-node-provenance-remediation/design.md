# 设计

## 已确认架构

- 复用现有 `TrustedExecutable` 与 native lifecycle freeze，增加 Bash+Node 复合 provenance spawn binding；同步顺序固定为 `bash-proof → node-proof → spawn`。
- native setup/update 贯穿使用首个 mutation 前冻结的 lifecycle environment；release-store runner 对 provenance Bash 同时 replay Node，Doctor 使用物理 binding。
- `setupSkills` 收敛到完整 Bash verifier gate，不再使用未绑定的 `process.execPath`。
- Doctor production probe 从过长的 `main.ts` 提取为独立可测试 adapter；kernel、automation、registry schema 与 public CLI contract 不变。

## 风险

- 任一复验与 spawn 之间夹入异步工作、child process 或 host mutation，都会重新打开 TOCTOU 窗口。
- 不同入口可能通过 wrapper 或依赖注入间接 spawn，若只修补显眼调用点会遗漏 setup/doctor/release-store。
- 源码与 tracked CLI bundle 若未同步，会造成 clean install 与本地测试结论分裂。

## 方案与证据

完整调用链、替代方案、失败不变量、文件边界和验收矩阵见 `docs/superpowers/specs/issue-63-node-provenance-remediation-design.md`；架构决策见 `docs/adr/issue-63-node-provenance-remediation.md`。

## 兼容与边界

- 不改变 public CLI、`DoctorProbes`、registry schema、runtime manifest、selection、launcher、audit 或 error category；v1.0.1/v1.0.2 与 fully verified previous release rollback 保持。
- `TrustedExecutable` 是唯一物理信任原语；不新增依赖，不把 pathname-only resolver 提升为 production trust，不跨 spawn 缓存 replay。
- 无范围或公共契约歧义；delta spec 与实施计划已把复合 proof、零 child/零 mutation、兼容和一次完整最终门转为可执行约束。
