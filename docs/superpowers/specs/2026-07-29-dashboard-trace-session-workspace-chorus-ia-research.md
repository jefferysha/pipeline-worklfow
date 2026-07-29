# Dashboard Trace 会话工作区：Chorus 信息架构对照研究

## 研究问题与边界

本报告回答一个限定问题：在不改变 Trace API、安全边界与 Tenon 视觉身份的前提下，如何把机器页诊断区现有的“会话列表在上、时间线在下”改造成适用于 **1024–1920px 电脑端**的 session rail + detail timeline 工作区。

本轮只研究桌面布局，不提出、不借鉴也不验收手机端布局。目标不是复刻 Chorus，而是从其成熟的运营信息架构中抽取可迁移模式，再用 Tenon 已有的蓝色 ops-console 语言实现。

## 来源与固定版本

### 外部一手来源

- 官方仓库：[chorus-aidlc/chorus](https://github.com/chorus-aidlc/chorus)
- 固定提交：`be647877b4b56a61e480e939d6a6d31b3f84f7f9`
- 本机只读浅克隆：`/tmp/chorus-ui-reference.d8Ol7o`
- 重点源码：
  - `src/components/agent-presence/connections-view.tsx`
  - `src/components/agent-presence/execution-row.tsx`
  - `src/app/(dashboard)/projects/[uuid]/activity/page.tsx`
  - `src/app/(dashboard)/projects/[uuid]/dashboard/dashboard-content.tsx`
  - `src/app/(dashboard)/projects/[uuid]/dashboard/idea-tracker.tsx`
  - `src/app/(dashboard)/projects/[uuid]/dashboard/idea-status-group.tsx`

### Tenon 当前实现

- `packages/dashboard-app/src/advanced/TrafficPanel.tsx`
- `packages/dashboard-app/src/advanced/trafficData.ts`
- `packages/dashboard-app/src/api/auditTypes.ts`
- `packages/dashboard-app/src/api/traceDecoders.ts`
- `packages/dashboard-app/src/advanced/AdvancedPanel.tsx`
- `packages/dashboard-app/src/machine/MachineView.tsx`
- `packages/dashboard-app/src/index.css`
- 可复用的 Tenon 自有先例：`packages/dashboard-app/src/afk/AfkView.tsx`

以下把“源码直接表达的行为”列为事实，把由事实推导的布局判断列为建议；不把视觉推断冒充 Chorus 的显式设计规范。

## 来源事实

### Chorus 的桌面工作区事实

1. `connections-view.tsx` 在 `lg+` 使用明确的 master-detail：左侧固定 `340px` rail，右侧 `flex-1` detail；选中行以左侧 3px 强调条和背景变化表达，详情始终占据右侧稳定区域。
2. Rail 行不只显示状态，而是按“主身份 → 区分实例的次身份 → 低优先级上下文 → 最近活动”排列：agent 名称最强，cwd 使用 monospace path chip，client/host 降级，最后活动靠右。
3. 选中对象不是纯装饰状态：`selectedUuid` 无效时派生回可见列表首项，因此桌面首屏不会先闪一个“请选择”空面板；rail 高亮与实际详情使用同一个派生 selection。
4. Detail 先建立对象身份，再放状态摘要，最后放执行列表；执行数据按 running / queued / interrupted 分组，空、加载与错误不会互相冒充。
5. `activity/page.tsx` 把事件按日期分组，每条事件维持稳定的“actor/action/entity/time”扫描顺序；`idea-status-group.tsx` 则通过轻量状态点、计数和折叠把长列表压成可扫视结构。

### Tenon 当前事实

1. `MachineView` 的内容框最大宽度为 `1088px`，主内容还有应用 rail 与页面横向 padding；诊断区位于整页末尾的一张卡片中。因此在 1024px 视口下，Trace 工作区可用宽度明显小于 1024px，不能照搬 Chorus 的 `340px` rail。
2. `TrafficPanel` 目前先纵向渲染全部 session button，选中后再在列表下方追加 timeline。用户切换会话时，视线需要跨越整个 session 列表；session 数量增长会把详情首屏持续向下推。
3. 当前 session 行只突出 `client`、记录数与状态；`id`、`proxy_mode`、`started_at`、`updated_at` 已在 API 中存在，但没有形成可辨识会话的二级身份。
4. Timeline 已具备可直接组成详情区的数据：会话身份、4 项 summary、完整/部分/截断诊断、all/error/success 筛选，以及 sequence、turn、time、method/path、status/outcome、duration/transport、model/token/stream 元数据。
5. 当前实现已经正确区分 session list 的 loading/error/empty，与 timeline 的 loading/error/known-empty/partial-window/filter-empty；旧请求也不会覆盖新 selection，Escape 会关闭详情并把焦点还给选中 session。
6. Trace decoder 强制 `outbound: local-only`、`content: metadata-only`，并拒绝含 query string 的 path；此次 UI 重排不需要、也不应扩大原始数据面。
7. Tenon 已有自己的 master-detail 先例：AFK 页使用 `360px + minmax(0,1fr)` 双栏、统一蓝色 token、紧凑运行队列与详情区域。新 Trace 工作区应与这个本地语法同族，而不是引入 Chorus 的暖色卡片语言。

## 可借鉴的模式

### 1. 固定选择上下文的 desktop master-detail

将 session 列表变成左侧 rail，timeline 变成右侧 detail。切换会话只替换右侧内容，不改变页面纵向锚点。建议在本卡片内使用近似：

```text
可用宽度约 860–1056px
┌──────────── 248–288px rail ────────────┬──────── minmax(0, 1fr) detail ────────┐
│ 会话标题 / 数量                         │ 会话身份 + 状态 + 时间范围              │
│ 选中条 · client                         │ 4 项摘要（紧凑一行或 2×2）              │
│ session id 短码 · proxy mode            │ 完整性通知 + 结果筛选                     │
│ record count · updated time              │ 时间线事件列表                            │
└─────────────────────────────────────────┴──────────────────────────────────────┘
```

这是从 Chorus 的“稳定 rail + 稳定 detail”结构迁移，而非迁移其 `340px` 数值。Tenon 在 1024px 目标视口应优先保证右侧请求路径、状态与耗时可读，rail 只占约 28%–31%。

### 2. “身份优先、状态其次”的 session 行

Rail 主行建议按下面层级读取现有字段：

- 第一行：`client`（主身份）+ status badge。
- 第二行：截短 session id（monospace）+ `proxy_mode`。
- 第三行：record count + 相对或格式化的 `updated_at`。

完整 session id 应通过 `title` 或可访问描述保留，不能只显示不可恢复的短码。这样能解决同一 client 多个 session 在当前列表中几乎无法区分的问题，同时不制造 API 不存在的 agent 名称、cwd 或 host。

### 3. 详情头承担“当前看的是谁”

右侧应在摘要卡之前放一个紧凑 detail header，至少包含 client、session id、proxy mode、状态与 started/updated 时间。当前详情直接从四张统计卡开始，切换后只能回看左栏高亮来确认对象；把身份固定在详情顶部可降低交叉核对成本。

### 4. 摘要、完整性与筛选形成单条诊断路径

建议详情顺序固定为：

1. 会话身份；
2. calls / HTTP errors / duration / actual tokens；
3. partial/truncated 完整性通知；
4. all/error/success 筛选；
5. timeline rows。

这个顺序沿用 Tenon 已有的“先可信度、再细节”原则。筛选不能移到完整性通知之前，否则用户可能把“当前筛选无结果”误认成“窗口完整且无失败”。

### 5. 行式 timeline，而不是卡片瀑布

当前每个请求都是完整圆角卡片，信息密度低且重复边框多。桌面 detail 更适合同一容器内的分隔行：

- 左窄列：turn / timestamp / sequence；
- 中主列：method + path，下一行 model/tokens/stream；
- 右窄列：status/outcome，下一行 duration/transport。

用状态圆点、细分隔线和 monospace 数字构成 Tenon 的操作台感；错误行可以使用红色状态标签，但不把整行铺成高饱和警报色。此处借鉴 Chorus 的稳定行扫描节奏，不复制其卡片半径、暖灰分隔色或图标系统。

### 6. 默认选中与键盘连续性

桌面模式可在 sessions 成功且非空后派生首个 selection，使首屏成为完整工作区；若坚持“显式点击才加载”，则右侧必须有真实的选择提示，而不能塌陷。无论采用哪种方案，都应保留：

- session button 的可见 focus ring；
- `aria-pressed` 或等价 selection 语义；
- Escape 清除详情并还焦到 rail 原按钮；
- 旧请求不能覆盖新选中项；
- 切换 session 后筛选重置为 all。

## 不应复制

1. **不复制品牌与色板。** Chorus 的暖米色背景、棕橙 primary、特定暗色值与 `#FBF4EF` 等硬编码颜色不进入 Tenon。继续使用 `--accent` / `--accent-t` / `--accent-b`、`--text*`、`--fill*`、`--border*` 与现有红/绿/amber 语义 token。
2. **不复制圆角与卡片堆叠。** Chorus 的 `rounded-2xl`、大面积留白与 340px rail 面向其全屏 modal；Tenon Trace 位于 1088px 页面内的诊断卡，需要更紧凑的 `rounded-lg/xl`、更小 padding 和更高信息密度。
3. **不复制字段语义。** Chorus connection 的 agent name、cwd、host、uptime、online 与 executions 都不属于 Tenon Trace API。不得从 session id 猜 agent，不得把 trace status 等同 daemon 在线状态，也不得虚构 uptime。
4. **不复制操作能力。** Chorus detail 中的 interrupt/resume/send instruction 是有鉴权的控制面；Tenon Trace 是 metadata-only 诊断面，本轮只读，不能添加类似操作。
5. **不复制手机布局。** Chorus 同文件包含 `< lg` 卡片列表与 drill-down；本 Change 明确只面向 1024–1920px，不实现、不截图、不验收其手机分支。
6. **不复制依赖与资产。** 不因参考 Chorus 引入 shadcn、Framer Motion、图标或品牌素材；优先使用当前 React/Tailwind/token 与现有组件约定。

## 当前实现差距

| 诊断任务 | 当前实现 | 目标差距 | 建议 |
| --- | --- | --- | --- |
| 在多个 session 间比较 | 全部 session 纵向堆叠，详情追加在其后 | 切换会导致大幅纵向跳读 | 左 rail 常驻、右 detail 原地更新 |
| 判断当前 session 身份 | 行内只有 client、count、status | 同 client 多 session 不可快速区分 | 增加 session id 短码、proxy mode、updated time |
| 首屏进入诊断 | 非空列表仍无 detail，需点击 | 工作区右侧可能不存在/空白 | 桌面派生首项，或稳定选择提示 |
| 判断数据可信度 | partial/truncated 提示在 summary 之后 | 语义正确，但纵向结构分散 | 固定在 summary 与 filter 之间 |
| 扫描请求序列 | 每条独立卡片，重复边框 | 200 条上限时扫描成本较高 | 单容器分隔行、稳定三列 |
| 看时间上下文 | 条目有时间，session 行没有时间 | 找最近 session 依赖列表顺序的隐含假设 | 显示 `updated_at`，不要重新排序除非契约明确 |
| 处理空/错/加载 | 各状态已拆分且可重试 | 双栏后容易误把整面板状态混在一起 | rail 状态与 detail 状态继续独立占位 |
| 键盘退出 | Escape 关闭 detail 并还焦 | 默认选择后“关闭”语义需重新定义 | 保留 Escape；明确关闭后是否显示选择提示 |
| 1024px 可用宽度 | 纵向布局不会水平冲突 | 新双栏存在 rail 挤压 path 的风险 | rail 248–288px；detail `minmax(0,1fr)`；验收无横滚 |
| Tenon 识别度 | 已使用蓝色 token 与 monospace | 参考外部 UI 后可能风格漂移 | 复用 AFK 的紧凑双栏、蓝选中态与 token |

## 推荐的桌面信息架构

### Rail

- 头部：`会话` + 数量；local-only / metadata-only 不重复塞进每行。
- 列表：session button 全宽，选中态使用 Tenon 蓝左边线 + 淡蓝底 + 现有 focus ring。
- 每行三层，控制在约 64–72px 高；长 client/session id 单行截断但保留完整 title。
- session 多时 rail 独立滚动；滚动条只在内容确实超过合理工作区高度时出现，不能把页面锁成固定 viewport 高度。

### Detail

- Header：client、完整 session id（可截断显示）、proxy mode、status、started/updated。
- Summary：保持四项；数值 monospace/tabular，标签弱化。
- Integrity：partial/truncated 继续是醒目的 amber 区域，重试留在这里。
- Filters：紧凑 segmented buttons，selection 使用蓝色语义，不引入 Chorus 暖色。
- Timeline：稳定三列的分隔行；错误状态醒目但不破坏 method/path 主读取线。

### 状态矩阵

| Rail | Detail | 呈现 |
| --- | --- | --- |
| loading | 未建立 selection | 左侧骨架/状态；右侧保持稳定占位，不显示假空 |
| error | 未建立 selection | 左侧错误与 retry；右侧解释需要先恢复会话列表 |
| empty | 无 selection | 用一张跨工作区空状态，保留“tap 默认关闭”事实 |
| ready | timeline loading | rail 可继续切换；右侧局部 loading |
| ready | timeline error | 右侧局部 error + retry，不清空 rail |
| ready | known empty | 明确“会话为空” |
| ready | partial with no entries | 明确“窗口无可见完整记录，但会话不为空” |
| ready | filter empty | 明确“筛选无匹配，原始会话仍有记录” |

## 风险与约束

- **宽度风险：** 1024px 视口下需按应用 rail、主区 padding、诊断卡 padding 后的真实内容宽度验收，不能仅在独立 Story/测试容器中以 1024px 组件宽度验收。
- **默认选择风险：** 自动选择首项会立即多发一次 timeline 请求，也改变现有“点击后才加载”的交互；若采纳，应钉住请求次数、失败状态和 Escape 后行为。
- **长数据风险：** session id、path、model、transport 都可能较长；所有 grid 子项必须 `min-w-0`，不能依赖 truncate 掩盖容器缺少最小宽度约束。
- **状态真实性风险：** `summary` 在 sessions 端仍是未解释的 `Record<string, unknown> | null`，不要为了 rail 摘要直接渲染未解码字段。
- **可访问性风险：** 视觉上的 master-detail 不自动等于可访问的选择控件；必须保持 button、选中语义、命名 section、实时状态和焦点恢复。

## 开放决策（5 项）

1. **非空 sessions 首屏是否自动选择第一项？**  
   推荐“是”，因为桌面工作区应首屏完整，并与 Chorus 的派生 selection 一致；代价是增加一次自动 timeline 请求，并需定义 Escape 后是否保持关闭直到用户再次选择。

2. **Rail 宽度采用固定值还是 `clamp`？**  
   推荐在诊断卡内使用 `clamp(248px, 28%, 288px)` 或等价 grid，优先保护 detail；不要复制 Chorus 的 340px，也不要让 1920px 视口把 rail 无限放大。

3. **Rail 是否显示相对时间？**  
   推荐直接格式化 `updated_at` 为短日期/时间，不引入持续 ticker。相对时间更易扫视，但需要定时刷新并增加测试不稳定性；当前 Change 的价值不依赖它。

4. **Timeline 是否引入可视“轴线”？**  
   推荐先用 sequence/status dot + 行分隔线形成节奏，不画贯穿整列的装饰轴线。真正的轴线只有在 turn 分组或时序间隔被编码时才有信息价值，否则只是视觉仿真。

5. **1024px 时 summary 保持四列还是 2×2？**  
   推荐由 detail 实际宽度决定：在 detail 小于约 620px 时 2×2，足够宽时四列。验收点应是标签和值不碰撞、path 列无横向滚动，而不是追求固定卡片数。

## 结论

最值得借鉴的不是 Chorus 的外观，而是它把“选择对象”和“观察对象详情”固定成两个稳定区域，并为 loading/error/empty 保留互不冒充的状态语义。Tenon 已有足够的 Trace 字段、状态处理、蓝色 token 和 AFK 双栏先例完成同类信息架构；本轮应聚焦 `TrafficPanel` 的结构与层级重排，不扩大 API、数据暴露、依赖或移动端范围。
