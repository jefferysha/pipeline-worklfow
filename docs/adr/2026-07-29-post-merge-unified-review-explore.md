# ADR：最终主干采用定向修复与安全工具链升级

## 背景

2026-07-29 批次最初的六个开放非 Draft PR 已先合入
`main@907dac067c17ed77fb440b91b20d64fd0f24773b`。第一次统一审查冻结后又出现 PR #15、#16 与 #17；
三者也按相同规则完成正常 CI、独立审查与合并，最终规格基线更新为
`main@7c59eecfba9e8652d69e25dae01058ae1df783be`，开放非 Draft PR 再查为空。组合审查仍发现三个绿色
CI 没有证明的缺口：

1. Governance 升档确认以 row 对象引用为生命周期依赖，逻辑等价轮询可关闭确认框。
2. Dashboard 切到 English 后，Workbench 仍有大量硬编码中文。
3. 干净 `npm audit` 有 1 critical、1 high、5 moderate。

## 决策

采用最小、可回滚的三部分修复：

- 用稳定的 Loop identity 与显式 decision facts 管理升档确认，不依赖对象引用；先建立逻辑等价
  row refresh 的确定性 RED，再实现。
- 使用现有 Dashboard i18n provider 为 Workbench 用户文案和可访问名称补齐 zh/en key，并以
  English 可见文本回归测试和真实浏览器扫描证明不混用语言。
- 将 Vitest 升至安全的 3.2.x、Vite 精确落在 6.4.3 或更高已验证安全版本、AJV 升至 8.20.x；
  VitePress 1.6.4 通过精确 Vite override 留在稳定版，并由全量 docs/build/tests/CI 证明兼容。

不改变现有 CLI/HTTP DTO，不升级到 VitePress 2 alpha，不重写 Workbench，不用更长 timeout 或
放宽断言处理竞态。

## 备选方案

- 只记录问题、依赖最终 CI：拒绝，因为 Critical/High 和状态机缺陷仍会进入 release。
- 只升级生产依赖、忽略 dev toolchain：拒绝，测试与 release 构建会真实执行这些工具。
- VitePress 2 alpha + Vite 8：拒绝，扩大 Node、插件、文档和发布兼容面。
- 全面重构 Workbench：拒绝，超出本次组合审查的最小修复边界。

## 后果

- `dashboard-ui-ux-system` 需要新增语言完整性和逻辑等价快照场景。
- `repository-architecture-compliance` 需要新增依赖安全门和例外证据场景。
- Verify 必须运行干净安装、`npm audit`、`npm ls`、全仓/全 Dashboard 测试、docs build、正式
  assets、真实浏览器 zh/en/light/dark/390px 与精确 head CI。
- 若 VitePress override 的任何全量证据失败，依赖组合整体回滚；不得部分保留未经证明的 lock 漂移。
