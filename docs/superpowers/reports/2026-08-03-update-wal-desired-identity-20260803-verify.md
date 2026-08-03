# Verify 报告：update-wal-desired-identity-20260803

## 结论

第二次冻结候选 `27affa39da71863070d113a05ef0c0ad7076ee1a` 验证失败，必须回到 Build 补齐真实 journal 持久化与重建读取回归后重新冻结。

严重度聚合：Critical 0 / High 0 / Medium 1 / Low 0。

## 冻结范围

- 基线：`origin/main` `dc53843e61f812938f13c684a41ffe1d935e48bf`
- 候选：`27affa39da71863070d113a05ef0c0ad7076ee1a`
- capability：`plugin-runtime`
- 完整冻结 diff、native desired producer、command injection、runner、journal codec、coordinator、tracked bundle 与完整 MODIFIED requirement 均已回读。

## 三轨结果

### Reviewer 轨

PASS，Critical/High/Medium/Low 为 0/0/0/0。独立隔离审查确认 canonical nested HEAD、local marketplace sentinel、pending/completed、通用 byte-exact、错误路径、并发次序、完整规格和 bundle 一致性均无 finding。

### 隔离 E2E / 发布物轨

PASS。`/tmp/tenon-verify-27affa39-track2/repo` detached checkout 冻结 SHA：

- 聚焦测试 2 files / 18 tests 全通过。
- durable desired wiring 定向 2/2；strict fail-closed 定向 6/6。
- TypeScript CLI 依赖链通过。
- bundle 重建前后 SHA256 均为 `a4d3eb14ae66be1d5db20acfa81fd96d5edebb9fca5ba69c8d1dea3f5c11a31a`。
- 发布 CLI `--help` smoke 通过；隔离 clone 与真实工作树前后 fingerprint 不变。

### Codex 独立轨

FAIL，Critical/High/Medium/Low 为 0/0/1/0。

Medium：`managed-host-command.test.ts` 中所谓 durable/process-restart 回归只对内存 record 做 JSON stringify/parse，然后直接构造内存 runner；未穿过 `createManagedReleaseJournal` 的真实文件 writer、reader/codec，也未在重建 store 后经 production coordinator/native-command 链恢复。因此测试可能在真实持久化 record 无法 decode/reload 时仍假绿。必须把 started 与 completed 都写入真实 journal，重建并读取 store，再经生产接线恢复且证明 mutation 0 次。

Codex 轨同时确认：canonical nested HEAD、所有真正身份/目标字段、local sentinel、未知 schema、第三状态和默认 byte-exact 均无其他 finding。只读 sandbox 未修改 bundle；真实 bundle mtime 仍为 Build 冻结前 `2026-08-03T22:02:02+0800`。

## 已通过但不能抵消失败的证据

- Build 全仓：332 files / 5959 passed / 26 条明确环境 skip。
- `npm run build`、OpenSpec 37/37、architecture、comments、hygiene、`git diff --check` 均通过。
- 隔离 archive rehearsal：1 个 requirement modified，归档后主规格 32/32 strict；真实主规格 digest 未变化。
- 第一轮 High/Medium 与规格缺场景 finding 已全部修复，第二轮未复发。

## 决策

按持续自主授权拒绝接受偏差，走 `verify-fail` 回 Build；增加真实文件 journal write/read 与重建 store 的 started/completed production-chain 回归，再重新运行完整 Build convergence 和冻结 Verify 三轨。
