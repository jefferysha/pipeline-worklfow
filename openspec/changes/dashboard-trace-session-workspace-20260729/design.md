# 设计

## Explore 结论

- 真实 Machine 页在 1024/1200/1440/1920px 下给 TrafficPanel 的宽度分别约为 854/1030/1054/1054px，现有纵向布局无横向溢出，但选中 7 条请求的会话后面板高度约 808px，会话列表与详情之间需要纵向跳读。
- 采用 `clamp(248px, 28%, 288px) + minmax(0, 1fr)` 的桌面主从网格；rail 保持会话选择上下文，detail 原地替换。
- 不自动选择首个 session。保留现有“用户选择后才读取 timeline”的网络与隐私心智，未选择时右侧显示稳定、可读的选择提示。
- 会话行使用现有 API 的 `client`、`id`、`proxy_mode`、`updated_at`、`record_count` 与 `status`，不得推断 agent、host、cwd 或 uptime。
- 详情顺序固定为身份 → 四项摘要 → 完整性 → 筛选 → 时间线；1024px 的 detail 摘要使用 2×2，较宽桌面使用四列。
- 时间线使用同一容器内的分隔行与稳定三列，继续使用 Tenon 蓝色 token、monospace 数字和红/绿/amber 语义色。
- 现有 API、decoder、请求竞态保护与 Escape 焦点恢复足以完成改造，不引入依赖、后端契约或新的远端行为。

## 交互与状态

- sessions 的 loading/error/empty 仍只由 rail 层拥有；timeline 的 loading/error/known-empty/partial-window/filter-empty 仍只由 detail 层拥有。
- session button 继续使用原生按钮和 `aria-pressed`。Tab 顺序先遍历 rail，再进入 detail；Enter/Space 选择，Escape 清除详情并把焦点还给原 session。
- 切换 session 时筛选重置为 `all`，旧 timeline 响应不得覆盖新 selection；重试只重载当前会话。
- sessions 可用但尚未选择时，detail 保持稳定占位，不发 timeline 请求，不把“未选择”描述成空会话。

## 视觉边界

- 只验收 1024–1920px 电脑端；不新增、不修改、不截图也不验收手机端布局。
- 借鉴 Chorus 的稳定 master-detail 与活动行扫描顺序，不复制其暖色板、340px rail、品牌、图标、字段、操作能力、依赖或移动 drill-down。
- 选中态使用 Tenon 现有蓝色边界/浅底/focus ring；错误状态必须同时有文字或状态码，不只靠颜色。

## 风险

- 折叠诊断区可用宽度可能不足，必须用真实 1024–1920px Machine 页面测量，而不能只看独立组件。
- 高密度呈现可能削弱可读性、焦点顺序或错误/空态的可发现性。
- Chorus 的视觉语言不能被直接复制；只吸收信息架构，颜色、品牌与交互反馈保持 Tenon 身份。
- session id、path、model 与 transport 都可能较长；网格子项必须使用 `min-w-0`、truncate/title 或可访问描述，且四个桌面视口不得横向滚动。
- rail 独立滚动只能在 session 数量需要时出现，不能把整页强锁为 viewport 高度。

## Decision Log

1. 选择主从布局，不选择继续纵向堆叠：前者能稳定选择上下文并更充分使用桌面宽度。
2. 选择显式 selection，不选择默认首项：避免新增隐式请求，并保持 Escape “关闭详情”的明确语义。
3. 选择短绝对时间，不选择相对时间：避免持续 ticker 与不稳定测试。
4. 选择分隔行，不选择装饰轴线：当前数据没有时距编码，贯穿轴线只会增加噪声。
5. 选择复用本地 token/组件约定，不引入 Chorus 依赖或资产。
