# Context Bundle 预算预览增量规格

## MODIFIED Requirements

### Requirement: Dashboard SHALL 提供可操作的完整预览状态

Dashboard SHALL 在选中 Change 的进度抽屉内提供 Context Bundle 预算预览。组件 SHALL 显示可见
目标阶段选择、正整数预算输入和提交动作；默认预选当前阶段之后的下一个 canonical phase，默认
预算为现有 `120000`，但每次 API 请求仍 SHALL 显式携带 target 与 budgetBytes。

组件 SHALL 区分 idle/loading、success、policy-empty、budget-error、其他 error；错误后 SHALL
提供 retry。target、budget 或 Change 改变时，旧请求不得覆盖新状态。表单 SHALL 支持键盘
Tab 导航与 Enter 提交，控件 SHALL 具备可见 label、可访问名称和焦点样式。

success 与 budget-error SHALL 在输入清单之前呈现独立容量摘要。摘要 SHALL 同时提供精确
used/max bytes、本地化使用比例、document count，以及 success 的 remaining 或 budget-error 的
overage。线性容量条 SHALL 使用 progressbar 语义，视觉宽度 SHALL 钳制在 0–100%，但文本 SHALL
保留真实超限比例和字节缺口；不得因视觉钳制把 budget-error 表示为成功。

输入清单 SHALL 保持 server 返回的确定性顺序，并以紧凑文档行显示 path、kind、mode、
本地化 reason、source bytes 和 materialized bytes。客户端 SHALL NOT 按体积重排、推导新的
物化规则或以颜色作为唯一状态线索。

loading SHALL 使用有界的状态占位并保留 `role="status"`/`aria-busy`；policy-empty、budget-error
和其他 error SHALL 保持可读文字、对应语义 role 与原地恢复路径。容量与 loading 动效 SHALL 在
`prefers-reduced-motion: reduce` 下直接呈现终态。

当前 workflow step 可以是 custom step；这不影响用户选择 canonical target。custom step 下组件
SHALL 可见，默认 target 为 `open`，请求的 `from` 保留当前安全 step id。只有 target 必须是
canonical phase。

默认七阶段 workflow 的阶段名 SHALL 始终通过 `phases.*` 使用当前 Dashboard locale 显示，包括
当前阶段序号、前进动作和回退动作；custom workflow 的作者标签 SHALL 原样保留，不得用语言启发式
猜测或改写。

#### Scenario: 成功预览

- **WHEN** 用户打开抽屉且默认目标的预览成功
- **THEN** 页面在输入清单之前显示 used/max bytes、使用比例、remaining、document count 和有语义的容量条
- **AND** 每项按 server 顺序显示 mode/reason/source/materialized bytes
- **AND** loading 状态被成功内容替换。

#### Scenario: 真实空态

- **WHEN** 用户选择没有 required reads 的 `open`
- **THEN** 页面显示本地化空态
- **AND** 不显示错误、容量摘要或伪造输入。

#### Scenario: 预算错误与重试

- **WHEN** 用户以不足预算提交
- **THEN** 页面显示本地化预算警告、required/available、真实超限比例、overage 和安全输入摘要
- **AND** 容量条视觉宽度不超过容器且保持 error 语义
- **AND** 用户调整预算后可以 retry/submit 得到成功状态。

#### Scenario: 完整性错误恢复

- **WHEN** API 返回 missing、stale、platform capability 或其他稳定错误
- **THEN** 页面显示本地化错误说明、稳定 code、恢复提示与 retry
- **AND** 修复外部条件后无需刷新整个 Dashboard 即可重试。

#### Scenario: 加载与 reduced motion

- **WHEN** 预览请求仍在进行
- **THEN** 页面显示有界 loading 状态且提交按钮禁用
- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** loading 与容量反馈直接呈现可操作终态而不执行过渡动画。

#### Scenario: 键盘提交和竞态

- **WHEN** 键盘用户聚焦预算输入并按 Enter
- **THEN** 触发与点击按钮相同的预览请求
- **AND** Tab 顺序保持 target、budget、submit
- **AND** 快速切换 target 时最后一次请求结果保持可见，旧响应被忽略。

#### Scenario: 默认阶段标签随语言切换

- **GIVEN** Dashboard 使用默认七阶段 workflow
- **WHEN** 用户切换到英文
- **THEN** 当前阶段、前进动作和回退动作显示 `Open`、`Explore`、`Spec`、`Build`、`Verify`、
  `Ship`、`Archive` 的对应英文标签
- **AND** 容量、remaining/overage、document count 和输入摘要同步切换为英文
- **AND** 不显示默认 workflow 中固化的中文作者标签。

#### Scenario: custom workflow 保留作者标签

- **GIVEN** Dashboard 使用 custom workflow
- **WHEN** 当前 step 或 transition 带有作者提供的标签
- **THEN** 阶段与动作显示作者标签
- **AND** 不按字符语言或 default phase id 猜测改写该标签。
