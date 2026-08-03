# Dashboard 操作清晰度 Verify 失败报告

## 冻结基线

- Change：`dashboard-operations-clarity-20260803`
- build SHA：`8aea6b882d4b0e4cb4cdefbd604648aa6db7932a`
- 结论：`FAIL`，回到 Build 修复；不接受偏差。

## 全量并行验证轨

- Reviewer Agent：`FAIL`，C/H/M/L=`0/0/1/0`。
- Codex CLI：`FAIL`，确认同一个 P2/Medium；本机模型缓存警告未影响审查与定向测试执行。
- 规格轨：`PASS`，149/149 个变更文件映射到四个 capability 或交叉治理层，未映射 0。
- E2E + 视觉轨：`PASS`，21/21 场景；C/H/M/L=`0/0/0/1`；370 个请求全部为 GET，page error 0。
- 浏览器证据：`/tmp/tenon-verify-8aea6b88-track2/`，`report.json` SHA-256
  `d455968d545fb30d441c3d2d2c6281636bab08cbe741e6ca772538a853068d75`。

## 硬门失败

`packages/server/src/snapshotFingerprint.ts` 将 `readdir(openspec/changes)` 的所有错误都折叠成空数组。
当合法空目录与 `EACCES`、`EIO`、`EMFILE` 等不可读状态互相转换时，SSE fingerprint 可能完全不变；
已连接 Dashboard 因而不会重建 Snapshot，会继续展示旧的健康或错误状态。实际 Snapshot 已只将
`ENOENT` 解释为合法空项目，两处语义不一致。必须为非 `ENOENT` 错误保留稳定错误标记，并补齐
fingerprint → SSE 刷新的回归测试。

## 已通过但不足以覆盖失败的证据

- Server 定向：4 files / 160 tests；Web 定向：9 files / 256 tests。
- 冻结前 Repository 全量：332 files / 5947 passed / 26 个诚实 skip；Web 全量：87 files / 1631 tests。
- OpenSpec 隔离演练：show、strict validate、archive、archive 后全量 strict validate 全部 exit 0；
  8 added / 3 modified，真实主规格 digest 未变。
- 当前项目注册表 21 个 root 全部可达，0 个无效项；五个用户目标均通过 1024/1200/1440/1920、
  light/dark/system、键盘、reduced-motion 与无根级横向溢出验收。
- 唯一 Low：macOS Context Bundle trusted reader 的预期 501 会产生 failed-resource console noise；
  UI 已显示 Linux 恢复指引，无 JS/page exception，不属于本 Change 阻断。

## 决策

持续自主模式采用安全默认值“修复”。下一轮重新冻结 build SHA，回归该 SSE finding，并重新执行
完整 Reviewer、Codex、E2E、视觉和 OpenSpec 隔离演练。
