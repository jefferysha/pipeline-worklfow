# 提案

## Why

2026-07-29 批次的开放非 Draft PR 已按用户最新授权先全部合入 `main`。统一审查第一次冻结后又出现
PR #15、#16、#17、治理归档 PR #18 与 Progress triage PR #19，因此旧 `907dac06`、`c78426e5`、
`7c59eecf`、`607c2ed9` 基线均已通过
`requirements-changed` 作废；最终审查基线改为
`main@445aa1411d45a2c112d296a9fc3530db0f62e31e`，且再次查询开放 PR 为空。这些 PR 同时改变了
Dashboard 交互、CLI、Server 路由、共享解码契约、生成物和 OpenSpec 能力；单个 PR 的绿色检查不能
替代最终组合状态的系统审查。主干中已经观察到 Dashboard 焦点恢复和 GovernanceRail 确认控件的
时序波动，因此必须在发布前基于最终 `main` 做一次统一、可追溯、前后端全覆盖的 Review Change，
发现问题即修复，并用真实运行和浏览器证据证明组合结果。

## What Changes

- 冻结最终批次主干和已合并 PR 清单，逐项映射到现有 capability、前端、后端、共享契约与生成物。
- 对组合后的源码执行规则、架构、正确性、安全、依赖和发布就绪审查；Critical、High、Medium
  发现必须修复并复核，Low 发现能安全修复则处理，否则形成明确的后续记录。
- 将 Dashboard 明确纳入 `tenon:design-taste-frontend`、Web 设计、可访问性、响应式、
  中英文、明暗主题、减少动态效果和真实浏览器状态矩阵，覆盖成功、失败、空、加载、禁用及键盘路径。
- 复现并消除已观察到的 Progress 抽屉焦点恢复和 GovernanceRail 确认控件测试时序风险。
- 运行干净安装、构建、类型检查、前后端测试、生成物新鲜度、OpenSpec、仓库门禁、API 冒烟和
  最终精确 head CI；不得以跳过必需门禁换取通过。
- 修复统一审查新发现的 Workbench、Machine、Project Registration、Create Change、AFK、Progress
  等错误路径把 raw `Error.message` 或中文 client/server fallback 泄漏到英文界面的问题，以及 `document-evidence-timeline`
  主规格结构缺口；将 5 个已结束、无 proposal/delta、但仍滞留 active changes 目录的历史
  状态证据通过 OpenSpec 官方 archive 操作完整保留并移出活跃校验面，使
  `openspec validate --all --strict` 真实全绿。
- 绑定所有 Dashboard 危险确认、项目级选择和在途 mutation 到精确 root + entity + operation token；
  切换项目立即使旧确认与迟到结果失效，防止同名 Loop/Change/Workflow 在新项目被旧确认误操作。
- Progress Create Change 的草稿与提交必须额外绑定创建时的
  `{root, name, track, workflow, intent}`；切换项目立即关闭并清空旧草稿，不得把项目 A 的输入提交到
  项目 B。AFK settings 与 enqueue/retry 使用互不干扰的 generation/busy identity，避免交错请求永久
  锁住动作或静默保留未落地的乐观值。
- 修复默认 Workflow 创建/复制的系统阶段标签本地化、异步 locale 竞态和成功响应 JSON 解析分类，
  使语言切换不持久化另一语言产品文案，200 非 JSON 不被误报为网络失败。
- 更新 README、测试现实和发布文档中因本批次功能产生的真实变化；审查修复通过独立 PR 合入
  `main` 后，再启动单独的 release Change。

非目标：不增加与审查发现无关的新产品功能，不发布 npm 包或生产部署，不修改四小时自动化配置，
不手工修改 Tenon canonical state 或 `.pipeline.yaml`。

## Capabilities

### New Capabilities

无。统一审查本身不创造新的用户能力。

### Modified Capabilities

Explore 已将 requirement delta 收窄为：

- `dashboard-ui-ux-system`：补充受支持语言不得出现非技术性的混合语言文案，并明确 Governance
  升档确认在逻辑等价快照刷新时必须保持、仅在决策相关事实变化时失效；#19 的 Progress 状态筛选
  还必须在语言切换后保持 tab/canvas 状态，并继续提供当前 locale 的可见摘要与可访问名称。
- `repository-architecture-compliance`：补充干净安装后的依赖安全门，Critical/High 不得进入可发布
  主干，并要求例外、覆盖和升级兼容性具有可复现证据；同时要求可发布仓库的 active OpenSpec
  change tree 不得包含已结束的 state-only 残骸，历史证据只能完整归档、不得删除或伪造 delta。

`host-target-plan`（含 #15 桌面 Host Plan 信息层次）、`document-evidence-timeline`、
`trace-timeline`（含 #17 桌面 session rail 与 timeline detail workspace）、`loop-scope-preview`、`related-session-memory`、
`prompt-routing-bypass`、`verification-evidence-composer`、`context-bundle-budget-preview` 与
`open-source-documentation-experience` 仍属于组合回归范围，但本次调研未发现需要改变其 requirement
语义的证据，因此不虚构 delta。PR #19 的 Progress triage requirement 已由其原 Change 写入主规格，
本 Change 只补充语言切换组合场景，不重复创建同义 requirement。PR #18 仅完整归档 #17 已完成 Change 的 canonical 治理证据，
不改变 runtime capability；它仍纳入 OpenSpec 完整性、摘要链、路径迁移和秘密扫描。

## Impact

影响范围横跨 `packages/dashboard-app`、`packages/server`、`packages/cli`、共享 kernel/schema、
生成的 CLI/Server/Dashboard 产物、测试、OpenSpec 与公开文档。兼容边界包括 HTTP/CLI 错误语义、
状态解码、缓存/超时/取消、React 焦点和键盘行为、窄屏布局、i18n 以及发布资产一致性。
所有修复保持现有公开契约向后兼容；若审查证明必须改变需求语义，则必须回到 Spec 登记并重新 review。
