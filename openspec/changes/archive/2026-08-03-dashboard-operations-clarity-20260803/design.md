# 设计

## Explore 决策

- “项目”应代表稳定的仓库身份，worktree 是项目下的运行实例，不应平铺成多个同名项目。
- 七阶段执行主线应优先呈现为可扫描的阶段路径，治理关系作为次级信息，不应画成主线蛛网。
- Docker 与沙箱镜像只在 AFK 容器任务中构成阻断，普通交互流程应显示为可选能力未就绪。
- 宿主计划应自动检测当前宿主、默认选中推荐操作，并把命令预览与用户动作放在同一视觉层级。
- 项目组身份由安全的 Git common directory hash 提供；探测失败时 root 自成一组，绝不按 basename 猜测。
- 失效登记只显式批量注销，不由服务端静默清扫；本轮当前 29 个失效 root 已通过官方端点清理。
- 编排主线只显示 canonical phase order；完整边事实进入次级关系区与语义列表。
- Host Plan 新增独立只读 detection DTO；自动推荐只加载 `side_effects:none` 计划，不执行 setup/update。

## 风险

- Git 仓库身份探测必须有边界、超时和失败降级，不能对任意未注册路径执行 shell。
- 清理失效项目登记不可删除磁盘文件或 Change 数据，并须保留重新注册能力。
- 现有 Dashboard API 与旧客户端需要兼容；具体 schema 演进待 Explore 决定。

## 已解决问题

- 当前 Snapshot 没有仓库身份，需要 additive `repository` 字段；旧响应安全降级。
- 失效清理采用显式批量注销，避免暂时不可达挂载被自动移除。
- catalog 只声明目标，不能证明本机宿主；增加只读检测端点，以受限大小读取 native host 的活动插件清单/配置，并与非 symlink 缓存标记交叉验证，避免卸载残留误报。

完整状态、失败、安全与验收设计见
`docs/superpowers/specs/2026-08-03-dashboard-operations-clarity-design.md`，决策记录见
`docs/adr/2026-08-03-dashboard-operations-clarity-20260803-explore.md`。
