# 任务

## 立项

- [x] 读取 #42/#41 最新需求、标签、依赖与 Measurement，完成 defect triage。
- [x] 核对冻结 commit、最新 `origin/main`、独立 worktree 与任务分支。
- [x] 创建并绑定唯一 backend/full/default Change，固定七阶段治理范围。

## 调研

- [x] 查明 build revision 的产生、绑定、持久化、transition、AFK、API/SSE 与 Dashboard 投影调用链。 (explore)
- [x] 定型信任模型、兼容/并发风险、稳定 blocker code、修复语义与跨模式验收矩阵。 (explore)

## 规格

- [x] 产出三份 capability delta spec 与分段可执行计划，补齐十层 coverage。 (spec)
- [x] 明确唯一 worker 的文件所有权、非目标、定向测试、回滚与根代理验收标准。 (spec)

## 实现

- [x] 由唯一 `luna_worker` 完成 default tracer bullet：token/identity/provenance、capture/guard、CLI typed rejection 与定向测试。 (build)
- [x] 由同一 worker 完成 custom lifecycle、server HTTP/snapshot/SSE 与 privacy-safe contract tests。 (build)
- [x] 由同一 worker完成 AFK admission/settlement、Dashboard Progress/AFK 展示与定向 tests/typecheck。 (build)
- [x] 同步兼容文档和受控 dist；worker 回传证据后由根代理逐项集成检查。 (build)

## 验证

- [ ] 根代理执行最多两次 code review 尝试并逐项闭合 confirmed findings。 (verify)
- [ ] 稳定后一次性运行完整最终门，覆盖 #42 Acceptance/Measurement 与 required conformance。 (verify)

## 交付

- [ ] 同步受控 dist/docs/spec，提交并推送精确 head，创建 `Closes #42` PR。 (ship)
- [ ] 等待并核验 exact-head CI，记录兼容性和残余风险，不合并、不发布。 (ship)

## 归档

- [ ] 应用 OpenSpec、归档 Change，并向编排任务报告 thread/worktree/branch/commit/PR/CI/review 次数/阻塞项。 (archive)
