# Loop 路径作用域预检验证报告

## 结论

PASS。冻结构建 `23d69fee5bba42326d7c332c6ff251c0927c9605` 的正式四轨验证均为
Critical 0 / High 0 / Medium 0 / Low 0。完整 207/207 changed files 已由 Standards、
Spec/E2E、独立 Codex CLI 与真实浏览器/视觉轨覆盖；上一轮发现的跨 Loop 结果串线已通过
completed 与 in-flight 两条身份回归关闭。

## 冻结坐标与零输出边界

- base / merge-base：`2394ac71efc87193350d476266a3219c320bb5b1`
- build SHA：`23d69fee5bba42326d7c332c6ff251c0927c9605`
- tree：`7023803e911e12a5be4dcf3676187c5682c577b7`
- diff：207 files，+4273 / -460；10 个生产源码、7 个测试、7 个生成/分发资产、
  15 个规格与治理文档、168 个 pipeline revision/review/transition artifact。
- 所有 clean build、测试、浏览器证据和 OpenSpec archive/apply 均在精确 `git archive`
  的仓库外隔离目录执行；共享实现树保持冻结，正式报告是聚合后唯一写入的治理产物。

## 四轨结果

| 轨道 | 结论 | 证据与边界 |
| --- | --- | --- |
| Reviewer / Standards | PASS · C0/H0/M0/L0 | 207/207 文件内容覆盖；核对 kernel、server、Dashboard、生成 bundle、调用方、安全边界和全部治理链。新增 revision 71 与 pre-Verify receipt 的 revision id、state digest、previous revision、payload digest 和 current projection 一致，无 secret。 |
| E2E / Spec | PASS · C0/H0/M0/L0 | 207/207 文件映射、5 requirements / 21 scenarios；隔离 clean build 与 `npm run test:all` 通过，OpenSpec show/strict/archive/apply 成功，真实主规格 digest 未变化。 |
| Codex CLI | PASS · C0/H0/M0/L0 | 只读审查完整冻结 diff；覆盖 correctness、security、API compatibility、concurrency、abort/error、a11y、spec 和生成资产。 |
| 浏览器 / 视觉 | PASS · C0/H0/M0/L0 | 确认目标 Tenon Dashboard 与冻结资产；覆盖成功、空、invalid、loading、403/409/500、异常 200、network drop/retry、abort、revalidation、dirty/save、双语、键盘、焦点、响应式、明暗主题和对比度。 |

## 规格与逐文件回读

- 逐文件映射：`/tmp/loop-scope-23d-file-map.tsv`，207 rows，0 unmapped。
- R1 kernel 逐路径解释：3 scenarios；R2 protected API：9；R3 fresh/no-permit：2；
  R4 typed client/UI：6；R5 aggregate compatibility：1。
- Delta spec、ADR、plan、详细设计与实现一致；无 missing、partial、scope creep 或错误映射。
- OpenSpec `1.6` 隔离演练：show 5/21；change strict 1/1；archive
  `specsUpdated=true`、added 5；applied strict 1/1。delta/applied normalized SHA-256
  均为 `addce34b…`。真实 `openspec/specs` digest 前后均为
  `9cf77c8354822b949ccfaa3ee75eef236a13e85f566ccf4d16529a938f5391d1`。

## 测试、构建与分发资产

- Node `v22.23.1` / npm `11.16.0`；隔离 `npm ci`、`npm run build` 通过。
- Root：317/317 files，5462 passed，5 honest skipped；Web：56/56 files，
  1008/1008。
- focused server/API：286/286；focused client/UI 与 identity 专项通过。
- repository hygiene、architecture（622 production files）、comments、
  default-workflow freshness、bundle 31/31、hooks 482/482、adapters 272/272、
  skills、oracle、OpenSpec 和 `git diff --check` 通过。
- Dashboard JS `index-sS78pN8a.js` SHA-256
  `5074b0b8f20f98b6e1e6eccb32ea731362ccf1962b460acb2c87a850ef01f876`；
  CSS `index-EnliBiGT.css` SHA-256
  `c04ba7a1885866622f632f7ea09d60fd0947b0147c988668566813afadc646fc`；
  server `be57d276671203669606ec09cc963ab69e3e3e6c0d17b546c2bf4b2e3abe6b60`；
  CLI `c533963501ccc1ab7b6bee29d857d8fcac84c016167277e36f4deb810fcdd802`；
  index HTML `3ab74b0fc64c43c7eaff95f9126d21d43145ac81adf2974d04908db068ae7560`。
  全部与 clean build 逐字节一致。

## 浏览器证据

- 报告：`/tmp/loop-scope-verify-23d69f-visual.md`，SHA-256
  `946a074e4007db6d67294bb2df2a5cd3a475c34396a261ed0c8f72e43564eec1`。
- 结构化证据：`/tmp/loop-scope-verify-23d69f-browser/browser-evidence.json`，
  SHA-256 `1de1c9cf70b2aab6fd1eefecb6acc3c84a7f72f3ba1b40ca0b750be692f42ea5`。
- 浏览器网络层 `connectionreset` 显示本地化错误、保留输入，真实 retry 返回 HTTP 200，
  page errors 为 0。
- completed 的受控 Loop 切换清除旧结果；in-flight 切换观测
  `clientAborted=true`，迟到响应未送达新 Loop。该专项使用真实生产 `<select>` 的受控
  `change` 验证 identity 链，不宣称用户可以点击穿透 Dialog scrim。
- 375 / 768 / 1440、light/dark、Tab/Shift+Tab/Escape、Ctrl/Cmd+Enter、焦点返回与
  placeholder 对比度通过。无 committed pixel baseline，pixel diff 如实记为
  INCONCLUSIVE；实时视觉验收通过。
- 冻结副本 3486 文件的前后 aggregate fingerprint 均为
  `767e1a62df4ff360a3a3236e111d571fa1ae2dd8e9b0af54b8d408f073bb2c1c`。

## 已知基线与剩余风险

- clean install 报告 7 个既有依赖漏洞；本 Change 未修改 package manifest 或 lockfile。
- 主工作树高负载 `npm test` 曾出现 tap SIGINT 与 ledger-store 30ms ordering 两个既有时序噪声；
  定向复跑 51/51 通过，隔离 `npm run test:all` 一次完整通过。
- 浏览器矩阵首轮 mobile keyboard harness 单次 timeout；完整重跑通过且不可复现。
- 5 个条件跳过来自未开启真实 Codex 门和缺少外部 Claude OAuth secret，与代码失败分开记录。
- 无 `openat` 平台仍沿用项目既有同-principal-writer 信任边界；预检不产生 permit，执行 gate
  继续 fresh 重检。

## 决策

四轨全部零 finding，设置 reviewer / Codex / branch 状态为 pass/handled，登记本报告 exact digest，
请求确切 `verify-pass` review event。持续自主授权只用于留下 Change 与 host session 绑定的
delegated receipt，不删除 marker、不复用 `verify-fail` receipt。
