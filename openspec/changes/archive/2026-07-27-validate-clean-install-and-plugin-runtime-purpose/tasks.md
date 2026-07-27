# 任务

## 立项

- [x] 创建并绑定独立 backend/default/full Change。
- [x] 登记真实干净首装与 Purpose-only 修复的目标、边界和风险。

## 调研

- [x] 实测 Codex Marketplace、`HOME`、`CODEX_HOME` 与 `TENON_RUNTIME_HOME` 的隔离边界。
- [x] 盘点 bootstrap/setup/doctor/runtime/Dashboard/new-session 的现有覆盖与缺口。
- [x] 形成非破坏真实首装验收方案和凭据不可用时的诚实证据分层。

## 规格

- [x] 为 `plugin-distribution` 编写真实干净首装验收 delta。
- [x] 为 `plugin-runtime` 编写仅新增 Purpose、requirements 不变的变更约束。
- [x] 完成实现计划、ADR、覆盖映射与回滚策略。

## 实现

- [x] 贯穿 managed setup/update 的隔离 Dashboard 端口，并修复同 release 重跑的
  preexisting ownership。
- [x] 冻结 pre-activation Dashboard identity/空端口事实，闭合 changed-release
  evidence-fail → restore previous → fresh retry 的基本状态机。
- [x] 拒绝从已 activation 的旧 WAL 或当前 retry 环境补造 pre-activation identity/port 证据。
- [x] 将 candidate stop、activation revert、previous restore 与恢复完成证明拆成可幂等续跑的
  durable WAL phases，崩溃后不得丢失恢复责任。
- [x] 将 mismatch cleanup 收口到持有私有 child handle 的 spawn 层，并对账 child/health PID；
  coordinator/restore 对不可信 session 失败关闭且不发送信号。
- [x] 实现隔离的真实 Codex local/public 首装验收工具、新进程发现、重复执行及精确清理测试。
- [x] 让 Release public 验收绑定当前 checkout 的不可变 ref/commit，并严格解析 lock PID、
  优先保留 Dashboard 非 2xx HTTP status。
- [x] 接入强制 CI/Release 门禁并补齐中英文安装文档。
- [x] 仅为 `openspec/specs/plugin-runtime/spec.md` 补充准确 Purpose，保持 requirements-tail
  digest 不变。
- [x] 完成全量测试和 pre-Verify 收敛审查，冻结唯一候选。

## 验证

- [x] 在同一冻结候选上完成独立 Reviewer、全量回归和发布包验收。
- [x] 在隔离干净状态执行真实公网 bootstrap、Codex Marketplace、runtime、doctor 和 Dashboard 验收。
- [x] 证明 Purpose 前后 requirements 内容逐字一致，并 strict validate 相关主规格与归档演练。

## 交付

- [x] 应用 delta、登记 applied spec、提交并推送通过远端 CI 的结果。
- [x] 按授权交付所需发布/受管 runtime 更新，并记录真实外部结果。

## 归档

- [x] 完成最终文档读取、终态检查和官方 OpenSpec 归档。
