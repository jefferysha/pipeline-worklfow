# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Workbench 控制面 SHALL 使用统一表面与尺寸层级

Workbench SHALL 将 Workflow identity/actions 与项目级 Track selector 放在一个控制表面中，以分隔线
区分两行任务。所有一等按钮/radio SHALL 使用一致的 40–44px 高度、padding、圆角、focus ring 与
disabled 语义；Track SHALL NOT 再包裹独立的大卡表面。

#### Scenario: 1024px 查看 Workflow 与 Track

- **WHEN** 用户在 1024×768 打开 default Workflow
- **THEN** Workflow、创建/复制/治理、只读契约状态与 Track 形成一个有序控制区
- **AND** 控件不重叠、不出现竞争性的大小外框且页面无根级水平溢出。

#### Scenario: 键盘操作统一控制面

- **WHEN** 用户用键盘切换 Workflow、Track 并进入 Track 设置
- **THEN** 焦点顺序与视觉两行顺序一致
- **AND** 每个控制拥有可见 focus ring 和具名语义。

### Requirement: Machine SHALL 区分核心阻断与 AFK 可选能力

Machine SHALL 将交互核心能力与 AFK 自动运行能力分组。Docker 和 sandbox image 缺失 SHALL 显示为
`optional-unavailable` 并明确“仅影响 AFK”，不得计入全局 blocker 数或“当前阻断”。必备 Skill、
受控操作和真实 Loop canonical readiness 仍按各自事实显示 attention/blocker。

#### Scenario: 普通交互环境没有 Docker

- **GIVEN** Docker daemon 不可用且没有 sandbox image
- **AND** 其他核心能力可用
- **WHEN** 用户打开 Machine
- **THEN** 页面显示 AFK 自动运行未配置
- **AND** 全局当前阻断为空，普通 Codex/终端工作不被标记为阻断。

#### Scenario: Loop 真实 not-ready

- **WHEN** canonical Loop readiness 为 `not-ready`
- **THEN** 项目风险队列继续显示该 Loop 的真实原因
- **AND** 可选能力卡片不会覆盖或伪造该 canonical 结论。

### Requirement: 五域桌面修复 SHALL 通过统一生产验收

Projects、Orchestration Graph、Workbench、Machine 与 Host Plan SHALL 在最终合并产物上统一完成组件
测试、前后端类型检查、生产构建和真实 Dashboard 浏览器验收，不得每修一个页面单独发布/review。

#### Scenario: 四档桌面视口统一验收

- **WHEN** 在 1024×768、1200×870、1440×900、1920×1080 验收 light/dark/system、键盘与
  reduced-motion
- **THEN** 五个目标页面均可操作且无根级水平溢出
- **AND** loading、empty、error/retry、ready 与 disabled 状态有本地化文字和非颜色线索。
