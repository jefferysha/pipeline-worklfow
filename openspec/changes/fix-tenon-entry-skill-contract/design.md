# 设计

## 初始假设

已确认主编排入口只有一个机器可验证标识：插件 namespace 为 `tenon`，Skill id 为 `tenon`，
Codex 调用形式为 `tenon:tenon`。入口 id 进入 `product/identity.json`；doctor 直接消费生成的
TypeScript 身份，Codex AGENTS managed block 与静态 adapter 消费同一生成模板。身份门禁逐字验证
这些投影并确认 `skills/tenon/SKILL.md` 存在；仓库卫生门禁同时拒绝外部参考项目名称。

Dashboard 项目上下文采用显式和状态：`none | selected(root)`。机器注册表只提供可选择候选，
不能决定当前选择。URL 中经过登记校验的 `root` 或用户点击项目是仅有的选择来源；URL 无 `root`、
偏好失效、项目被移除时统一回到 `none`。`none` 不读历史 localStorage、不选 `projects[0]`，
不调用受项目约束 API，并把只能在单项目下运行的视图导向项目总览空态。

## 风险

- 修改不完整会让源码检查通过但新安装仍出现缺 Skill。
- 只改 doctor 会掩盖 AGENTS 真实引用错误。
- 版本发布后若未重装 managed runtime，本机会继续运行旧包。
- 宿主若仍启用另一个工作流插件，其 hook 可能先于 Tenon 拒绝正确的 Skill 来源。
- 若只在 URL effect 删除 `root`，而选择模型或工作台仍回退首个项目，隐式上下文会从另一条路径复发。
- 若失效深链静默改指首个项目，用户会在错误仓库执行治理动作。

## 待验证问题

- `AGENTS.md` 的 Tenon 静态块由哪个模板或生成器负责，如何建立零漂移断言？
- doctor 的 Codex contract skill 集是否应直接从发布 inventory 派生？
- 1.0.1 更新后，唯一 Selected Skill Root 是否能在无项目投影时全绿？
- 安装与 doctor 如何证明当前宿主只启用一个 Tenon 工作流插件身份？
- Dashboard 无 `root`、失效 `root`、项目移除和浏览器前进/后退是否都保持显式选择语义？

## Explore 结论

- 选择身份源驱动的确定性生成方案，不采用字符串补丁或兼容 alias。
- 原生安装继续以 immutable selected runtime 为唯一 Skill 根。
- 宿主安装态以插件管理器 inventory 为权威；冲突插件必须先由宿主卸载，Tenon 不直接改写宿主私有 cache。
- 版本控制路径与正文不得包含外部参考项目名称，检查范围由仓库卫生测试统一维护。
- 当前旧 `.agents/skills` 是被忽略的历史投影，已移动到废纸篓；产品不自动删除未知用户目录。
- Dashboard 不把注册顺序、首个可达项目或 localStorage 历史偏好当作选择授权；无显式选择时
  URL 保持无 `root`，项目型页面展示选择入口，只有用户选择后才访问 per-root API。
- 详细状态、备选方案与错误处理见
  `docs/superpowers/specs/fix-tenon-entry-skill-contract-design.md` 和
  `docs/adr/fix-tenon-entry-skill-contract.md`。
