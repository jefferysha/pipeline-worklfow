# 任务

## 立项

- [x] 核验指定 worktree、分支起点 `5f93fd84`、冻结 `build_sha` `6cf44730`、#66/#46 与 Review 2/2 失败报告。
- [x] 通过官方 CLI 创建并激活唯一 Change `issue-66-interaction-remediation`，旧 #46 Change 只读保留。
- [x] 登记 proposal/design/tasks 的真实 `openspec-propose` 证据并通过 Open 出口检查。

## 调研

- [x] 读取 replay/store/review binding/CLI 调用方、测试、旧 proposal/design/delta 和主规格，冻结影响面与不变量。
- [x] 比较 legacy receipt 迁移与 fail-closed fresh-request 恢复，记录安全、兼容和回滚决策。
- [x] 产出 remediation 技术设计与 ADR，并明确 worker 文件边界、测试矩阵和一次性完整门。

## 规格

- [x] 为 `interaction-observability` 固化 terminal 后非法核心事件的 deterministic `malformed-order` scenarios。
- [x] 为 `interaction-and-skill-provenance` 固化 sidecar schema/上限/物理稳定性、legacy fail-closed 与 fresh-request 恢复 scenarios。
- [x] 在计划中冻结 canonical compatibility 修订流程：进入 Build 后、任何实现前以官方 `requirements-changed` 回 Spec 重登记，禁止 Build 偷改。
- [x] 在实现与 worker 派发前完成真实 `requirements-changed` 回退，并将最终 compatibility 语义重登记到 proposal/design/delta/plan。
- [x] 产出可执行计划，冻结 exactly-one-luna-worker 的实现范围和根代理验收标准。

## 实现

- [x] 根代理在派发前完成 Build-readiness 与影响面冻结，并只派发一个 `agent_type=luna_worker`。
- [x] Worker 修复 replay terminal ordering，补正常/负向组合测试，保持 completion/metrics 不变量。
- [x] Worker 修复 authorization sidecar bounded stable reader，补 replacement/symlink/oversize/malformed/ambiguous/race 测试。
- [x] Worker 同步受影响 spec/docs/受控 dist，运行定向测试后停写并交接；不得自审、扩大范围或再委派。
- [x] 根代理逐文件检查 worker 交接与 Build 证据，确认候选可由 `build-complete` 冻结新的 `build_sha`。

## 验证

- [x] 根代理在正式 Review 前穷尽 diff、契约、生成物和定向测试检查。
- [x] 对同一冻结候选执行正式 Review（hard cap 2），修复发现后才允许第二次；E2E/测试不计 Review。
- [x] 在稳定产品候选上只运行一次风险匹配的完整测试/build/architecture/comments/bundle/oracle/OpenSpec 门。
- [x] 登记 verification report；若 2/2 仍失败，保留证据并以 blocked 收口。

## 交付

- [x] 应用两个 capability 的 OpenSpec 变更并同步交付证据。
- [x] 提交、推送 `codex/issue-66-interaction-remediation`，创建非 draft PR，正文包含 `Closes #66` 与 `Closes #46`。
- [x] 等待并核验 exact-head CI、mergeability 与 review threads；不 merge、不发布。

## 归档

- [x] 完成官方 Archive 证据与最终 tasks 登记，不修改本机插件。
- [x] 回报 task/worktree/branch/HEAD/PR/CI/Review 尝试、验证证据和剩余风险。
