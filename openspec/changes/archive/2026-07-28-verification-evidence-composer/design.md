# 设计

## 已验证架构

- 格式化规则属于 kernel 的纯领域能力，但使用独立的、不可信 `VerificationEvidenceDraft` 契约，不得复用或降级现有可信 `VerificationResult`。
- HTTP 仅负责现有 POST 守卫、registered-root 校验、DTO 映射和兼容错误封装，不保存输入或输出。
- 入口放在 Change 详情的文档区域，仅在 Verify 阶段呈现；使用现有 accessible Dialog，覆盖空、加载、错误、成功、复制和键盘路径。
- 输出由用户显式复制，不自动执行命令、不写 verification report、不改变 ledger、CAS 或 gate。

## 风险

- 新 API 若绕过现有 Host/token/content-type/root 守卫，会扩大本地控制面风险。
- Markdown 转义、输入上限或错误映射不完整会产生不可复核输出。

## 契约边界

- 请求显式携带 `zh-CN` 或 `en` locale；证据最多 12 条且不得为空，类型为 command/browser/review/other，状态为 passed/failed/skipped。
- passed/failed 必须有 result；skipped 必须有 skipReason，二者互斥；字段修剪且有上限，未知字段和控制字符失败关闭。
- 同一规范化输入与 locale 产生逐字节相同 Markdown；保留输入顺序以表达验证时序。
- Dashboard 在空态不发请求；API 拒绝空数组，不生成看似有效的空验证片段。

## 来源与方案

完整来源、旧新对比、三方案取舍、数据流、安全/性能/兼容与测试矩阵见 `docs/superpowers/specs/2026-07-28-verification-evidence-composer-design.md`；决策记录见 `docs/adr/2026-07-28-verification-evidence-composer-explore.md`。
