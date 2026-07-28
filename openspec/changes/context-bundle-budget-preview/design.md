# 设计

## 已验证设计

- 把 CLI 内的 ledger→bundle 组装提升为 kernel 共享应用服务，使 CLI 与 server 复用同一
  fail-closed 规则和 typed domain errors。
- 在进度页 Change 抽屉内挂载独立预览组件，避免新增顶层导航；按需请求并呈现 loading、success、
  policy-empty、budget-error 和其他 error。
- 预算只影响一次预览请求，不写入 canonical state，也不改变真实 handoff 默认 `120_000` bytes。
- server 返回 kind/path/digest/reason/reasonCode/mode/sourceBytes/materializedBytes，不返回文档
  `content`；兼容中文 `reason` 继续与 CLI 一致，共享服务只生成 UI-neutral domain
  `reasonCode`，Dashboard 用显式映射把它转换为 zh/en i18n key。
- server 仅在 registered root 提供可遍历目录 fd 时开放预览；Darwin/Node 无 fd-relative
  traversal 时以稳定 capability error fail closed，CLI handoff 不受影响。
- 预算超限映射为 `422 + safe preview`；损坏 canonical state、缺 ledger/文档/漂移映射为稳定
  409 错误。
- UI 预选下一 canonical phase，但 API 始终接收显式 target；允许选择 `open` 呈现真实空态。

## 风险

- 服务端读取项目文档时必须保持注册 root 信任锚、Change 名校验与路径边界。
- 不能把 Darwin 上的 pathname 前后 inode 检查描述为可抵御同权限 swap-back；缺少目录
  fd-relative traversal 时必须在任何 Change 内容读取前拒绝。
- API 错误不得退化为模糊 500 或靠中文文本解析；canonical state 损坏、文档缺失、漂移和预算
  不足使用共享机器码。
- 进度抽屉正在被其他独立工作树改造时，本轮必须保持组件边界窄并避免视觉重构。

## Explore 结论

- Trellis/Comet 的可追溯设计依据、Tenon 当前差异、方案比较、红队自检、状态机、错误边界和
  Decision Log 见
  `docs/superpowers/specs/2026-07-28-context-bundle-budget-preview-design.md`。
- 采用“kernel 共享应用服务 + server 安全 preview DTO + Dashboard 抽屉组件”；拒绝 server
  子进程调用 CLI 和复制 CLI policy。
- ADR：`docs/adr/2026-07-28-context-bundle-budget-preview-explore.md`。
