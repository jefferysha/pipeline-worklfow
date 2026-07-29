# Host Plan 电脑端信息清晰度

## ADDED Requirements

### Requirement: 电脑端高密度宿主选择与已选详情

Dashboard SHALL 在 1024–1920px 电脑端以稳定的 master-detail 布局呈现宿主目录和当前选择。目录 SHALL 为每个宿主持续展示名称、CLI flag、kind、scope 和可键盘操作的选择动作；完整 capabilities SHALL 在目标被选中后、选择 setup/update 前显示于详情区。系统 SHALL 保持 catalog 原始顺序、只读计划语义和既有 API 契约。

#### Scenario: 扫描宿主目录

- **WHEN** catalog 在 1024×768、1200×870、1440×900 或 1920×1080 电脑端视口成功加载
- **THEN** 页面无横向溢出，目录和详情不得重叠
- **AND** 每个目录项持续展示宿主名称、CLI flag、kind 与 scope
- **AND** 1024×768 视口在无需滚动目录时至少完整展示前 6 个宿主，显著高于变更前的 4 个

#### Scenario: 核对已选宿主上下文

- **WHEN** 用户以鼠标或键盘选择一个宿主
- **THEN** 目录项以 `aria-pressed`、可见 accent 边界和本地化已选文案表达当前选择
- **AND** 详情在 operation button group 之前展示该宿主的 CLI flag、kind、scope 与全部 capability
- **AND** 选择宿主本身不得请求计划、写文件或执行 setup/update

#### Scenario: 从宿主上下文进入计划

- **WHEN** 用户选择 Setup 或 Update
- **THEN** 详情按“宿主上下文 → 操作 → loading/error/ready → 只读计划”顺序呈现
- **AND** 切换宿主 SHALL 取消活动请求、清除旧 operation 与旧 plan，并显示新宿主的 awaiting-operation 状态
- **AND** light、dark、system 与 `prefers-reduced-motion` 下均不得依赖颜色或动画单独表达状态

#### Scenario: 保留失败与恢复路径

- **WHEN** catalog 或 plan 请求失败、catalog 为空、或复制命令失败
- **THEN** 既有本地化 error/empty/retry/copy feedback SHALL 保持可感知并可由键盘恢复
- **AND** 页面不得显示或调用真实执行入口
