# 任务

## 立项

- [x] 建立独立 Change、固定目标/边界并登记 Open 文档。

## 调研

- [x] 固定上游参考 A/B 的版本、审计 Tenon 现状与在途工作，形成研究、设计和 ADR；精确仓库 URL 记录在 PR 与自动化记忆中。

## 规格

- [x] 定义 API、持久化、Hook 匹配、Dashboard 状态与兼容性规格及实现计划。

## 实现

- [x] 先写 server config/API、Dashboard 表单与 UserPromptSubmit hook 的失败测试，打通默认词读取、保存和单轮抑制的 tracer bullet。
- [x] 完成 canonical 配置互保、DTO/路由错误、ASCII token 边界和空字符串禁用实现。
- [x] 完成 Workbench loading/empty/error/success/键盘交互、中英文 i18n 与回归测试。
- [x] 更新受影响的契约说明和生成产物，确保旧配置与既有 Hook 行为兼容。
- [x] 用有界 canonical header reader 取代 Bash JSON/matrix codec，拒绝 symlink、特殊文件与超限输入。
- [x] 在 kernel 跨进程锁内完成两类 Hook 配置写回，并用真实双进程 barrier 证明字段互保。
- [x] 本地化英文读取/保存/network/malformed-response 错误路径，修正验证计数并补回归测试。

## 验证

- [x] 运行 hooks、server、web 定向测试与 typecheck/build。
- [x] 运行 npm test、bundle/adapters/skills/oracle 等受影响门禁。
- [x] 在真实 Tenon Dashboard 验收成功、禁用、校验失败、保存失败与键盘路径，并登记验证报告。
- [x] 重跑安全/并发/i18n 修复后的全量门禁、浏览器验收与四轨冻结 Verify。

## 交付

- [x] 应用规格、提交推送、创建非草稿 PR 并核对 CI。

## 归档

- [x] 归档 Change、登记最终任务状态并更新自动化记忆。
