# Loop 路径策略预检初始设计

## 已验证架构

- kernel 提供协议无关的逐路径解释；server 从已登记项目与现有 Loop registry 读取真实 allowlist/denylist，并注入 automation 生产 `matchesPathGlob`，前端不复制匹配规则。
- UI 作为现有 Loop 卡片“自主与安全”区的局部 Dialog，输入有界的项目相对路径并展示逐路径解释。
- 受保护 POST 保持本机 Host、Bearer token、JSON content-type 与 registered-root 信任锚；输入路径只作为字符串匹配，不做文件 I/O。
- 预检结果不持久化且明确不是 permit；真实运行继续 fresh 执行现有 gate。

## 风险

- 路径规范化与真实 Git 路径语义不一致，可能让预览与结算结果漂移。
- 空 allowlist、denylist 优先级与不同 autonomy level 的用户解释可能误导。
- 预检不能被描述成执行许可，实际运行仍须重新执行现有 gate。

## Explore 结论

- denylist-first 与空 allowlist fail-closed 是已有执行不变量；新增解释 API 必须保持 aggregate evaluator 的旧行为。
- DTO 只回传提交的相对路径、稳定枚举、首个命中 pattern、Loop 状态与摘要；不返回绝对路径或文件正文。
- 使用独立 `LoopScopePreviewDialog` 与 API decoder，挂入 `LoopAdvancedFields`，避免让接近长度上限的 `LoopCard` 继续承载新状态机。
- API 输入限制为 1–100 条、单条 1024 UTF-8 bytes、总计 32768 bytes；拒绝非 canonical Git 风格相对路径和未知字段。
- 详细方案与覆盖见 `docs/superpowers/specs/2026-07-28-loop-scope-preview-design.md`，架构决策见 `docs/adr/2026-07-28-loop-scope-preview-explore.md`。
