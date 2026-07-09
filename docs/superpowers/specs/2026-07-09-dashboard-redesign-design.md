# Dashboard 全量重构设计 —— 工票车间 × 分组看板 × G17/G18

> 2026-07-09 · brainstorming 定稿（三轮浏览器 demo 逐屏确认，用户逐项拍板）。
> demo 源文件在 `.superpowers/brainstorm/97296-1783564232/content/`（gitignored，仅本机参考；
> 本文档内嵌全部关键信息，不依赖 demo 存活）。

## 0. 已拍板的决定（全部经用户确认，不再复议）

| # | 决定 | 内容 |
|---|---|---|
| D1 | 范围 | **推倒重来换设计语言**：`packages/dashboard-app` 全部 15 个组件重写视觉层；现有测试查询清单跟随新 markup **有意识地**逐文件同步重写（保留测试意图） |
| D2 | 设计语言 | **工票车间（Ticket）**：白纸双色功能语义——绿=流水线在跑，朱红=需要人出面；深绿铭牌做结构分组头 |
| D3 | G17 布局 | **分组看板**：每个活跃 workflow 一个可折叠分组，列集各自精确；吸收"列表方案"的优点=卡片 hover 快捷转换按钮，拖拽与点按并存 |
| D4 | G18 | **纳入本轮，动 server**：新增注册项目 / 注销项目 / 新建 change 三个端点 + 前端入口；**现有 21 个端点形状零改动**（只增不改） |
| D5 | G14 | 顺手吃掉：导航加**项目切换器**（纯前端 state，切 `currentRoot`），不做跨项目聚合视图 |
| D6 | 琥珀退役 | 原 `--gate` 琥珀色删除；"等复核"与"危险/失败"统一朱红系（语义：系统停下来等你），视觉区分靠**形态**：实底圆徽章=等复核，ghost 按钮=回退/删除，平铺文本=错误 |
| D7 | 相位模型 | **混合模型**：default workflow 走内置常量（零网络），自定义 workflow 按 `fields.workflow` 走现有 `GET /api/workflows/:name` 拉取+缓存 |

## 1. 设计语言规范

### 1.1 色彩 token（值已经 Playwright 深浅色截图验证）

机制保留现状：`styles.ts` 单文件内联注入、CSP 自足零外部资源、
`@media (prefers-color-scheme)` + `[data-theme]` 双向覆盖三段式。值全部替换：

| token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` / `--surface` | `#ffffff` | `#131a15` | 页面底 / 卡面（同值，结构靠描边不靠层次色） |
| `--well` | `#f2f6f3` | `#1a231d` | 列井、chip 底、内嵌块 |
| `--ink` / `--ink-soft` / `--ink-mute` | `#191c1a` / `#3b423d` / `#5b625d` | `#e9efe9` / `#c2cbc4` / `#96a099` | 三级文字 |
| `--line` | `#dfe5e0` | `#2c372f` | 细线（绿倾向中性，chroma 极低） |
| `--plate` / `--plate-fg` | `#1f4d33` / `#f2f7f3` | `#245c3c` / `#eaf4ec` | 深绿铭牌（分组头/活跃 tab） |
| `--green` / `--green-soft` | `#23854f` / `#e3f2e8` | `#4dbb82` / `rgba(77,187,130,.15)` | 主色：主按钮、正向转换、运行中、选中描边（种子 oklch 0.6 0.158 150°） |
| `--verm` / `--verm-soft` | `#c23a26` / `#fae3de` | `#e56a54` / `rgba(229,106,84,.16)` | 朱红：需要人（复核门/回退/删除/错误/失败态） |
| `--gate-bg` / `--gate-fg` | `#c23a26` / `#ffffff` | `#b6402c` / `#ffffff` | "等你复核"实底徽章 |
| `--focus` | `#1f4d33` | `#6fcf9a` | focus-visible 环 |
| `--radius` / `--radius-sm` | 10px / 8px（对话框 12px） | 同 | — |

书写规范：新增颜色一律先以 OKLCH 推导再落 hex 注释来源；禁止在组件里出现裸色值。

### 1.2 排版与质感

- 系统字体栈（现状保留）：正文 `-apple-system…PingFang SC`；**全部 id/数字/相位名/命令走 `--mono`**（ui-monospace 栈）——等宽是这套语言的结构支柱。
- 基准字号 13px，标题 17px，徽章 10.5px；比例 ≤1.2（product register 纪律）。
- 无投影或极轻投影（对话框 `0 14px 40px rgba(10,22,14,.25)` 一处即止）；结构靠 1px 描边。
- 票根虚线：卡片 meta 行 `border-top: 1px dashed var(--line)`（工票隐喻的唯一装饰元素，不扩散）。
- 等复核卡/行：`1.5px solid var(--verm)` 全边框 + hover `box-shadow: 0 0 0 3px var(--verm-soft)`。**禁止 side-stripe（>1px 单侧彩边）**。

### 1.3 组件形态基线（demo 已验证）

按钮：主=绿实底白字；ghost=细线透明底；朱红 ghost=回退/删除/取消。表单控件：白底细线，
focus 绿描边+3px soft 环；错误态朱红描边+soft 环+下方 11px 朱红说明行。徽章：等复核=朱红实底
胶囊；运行中=绿点+绿字；档位=深绿铭牌胶囊；track/workflow 标签=well 底小 chip。
tab 活跃态=深绿铭牌（与分组头同元素语言）。空态=居中票卡+教学内容。

## 2. 信息架构（G17 根治）

### 2.1 新模块 `src/model/workflowModel.ts`

types.ts 的四个写死常量（PHASES/TRANSITIONS/EVENT_BY_EDGE/REVIEW_PHASES）收拢于此，对外只暴露：

```ts
interface WorkflowRules {
  steps: readonly string[]
  transitions: Record<string, readonly { event: string; to: string }[]>  // from → 出边
  gateByStep: Record<string, 'review' | 'confirm' | null>
}
// default → 内置常量构造（REVIEW_PHASES 三相位映射为 gate:'review'，其余 null）
// 自定义   → GET /api/workflows/:name?root= 的 WorkflowDef 映射，按 (root,name) 模块级缓存
// useWorkflowRules(root, names: string[]): { rules: Map<name, WorkflowRules>, errors }
```

- 缓存失效：workflow 编辑器保存成功后主动失效对应 (root,name)；看板挂载时对 snapshot 中
  出现的 workflow 名集合做一次批量确保。
- **优雅降级**：某个自定义 workflow 拉取失败 → 该组渲染为不可拖拽的错误分组（组头朱红提示
  "workflow 定义加载失败"，卡片只读可见）——任何情况下卡不消失（G17 的底线）。

### 2.2 BoardView —— 分组看板

- 按 `change.fields.workflow ?? 'default'` 分组；组序：default 在前，自定义按名排序。
- 组头=深绿铭牌：折叠 caret + workflow 名（mono）+ `N 步/相位 · M 张`；折叠态存 localStorage
  （key `board.collapsed.<root>.<workflow>`）。
- 列=该组 rules.steps；拖拽合法性/事件名从该组 rules.transitions 查（`plannedTransition` 泛化，
  board/events.ts 改造）；verify-fail 类回退转换保留现有确认对话框。
- 卡片 hover/focus 浮出快捷转换按钮（当前 step 的全部出边：正向=绿 ghost，回退=朱红 ghost），
  与拖拽走同一 `postTransition`。
- default 组的 archive 列渲染为折叠计数条（"N 张已归档"），不再逐卡列出——有意简化。
- 空组（某 workflow 的卡全部归档）不渲染该组。

### 2.3 InboxView —— gate 泛化

"在等我决定"判据从 `REVIEW_PHASES.includes(phase)` 改为
`rules.gateByStep[change.phase] === 'review'`（含 phase_status 既有条件不变）。
行=朱红工票行：名字/track/workflow 标签/相位胶囊/等复核徽章/相对时间/行尾快捷转换按钮
（与看板卡一致）。排序 updated_at 降序。金标准地位保留：只答"在等我什么"。

## 3. G18 —— server 新端点与前端闭环

### 3.1 新端点契约（TDD：`server.test.ts` 先红后绿；交接接口清单同步更新）

| 端点 | 请求 | 成功 | 失败 |
|---|---|---|---|
| `POST /api/projects` | `{root: string}` | `200 {ok:true, root}`（root 为规范化绝对路径） | `400` body 非法；`404` 路径不存在或非目录；`409` 已注册 |
| `DELETE /api/projects` | `?root=<path>` | `200 {ok:true}` | `400` 缺参；`404` 未注册 |
| `POST /api/changes` | `{root, name, workflow?, track?}` | `200 {ok:true, name, path}` | `400` name 非法（`^[a-zA-Z0-9_-]+$`）/workflow 或 track 非法/change 已存在；`404` root 未注册或 workflow 不存在 |

- 鉴权：三个端点全走既有三层（Host 守卫 + 一次性 token + Content-Type）。
  `POST /api/projects` **豁免第四层信任锚**（它的职责就是把 root 放进注册表）——文档必须写明这个例外及理由。
- `POST /api/changes` 复用 kernel 的 init 逻辑；若 kernel 未导出可复用函数，实现阶段先补导出（kernel 侧同样测试先行）。
- 写 `~/.claude/pipeline-projects.json` 时沿用 `dedupeRoots(registry())` 的规范化语义。

### 3.2 前端入口

- **项目切换器**（Nav，D5）：下拉列出 snapshot.projects（root 尾段目录名 + change 数徽章），
  切换只改 App 的 `currentRoot` state；单项目时退化为静态标签。附"注册新项目…"入口（弹注册对话框）。
- **新建 change 对话框**（收件箱/看板头部绿主按钮）：字段=名字（mono，实时校验
  `^[a-zA-Z0-9_-]+$`，错误态朱红）+ workflow 下拉（default + `GET /api/workflows` 列表）+
  track 下拉（chat/pm/frontend/backend）；底部灰票块展示等价 CLI 命令（教学延续）；成功→绿 toast + snapshot 刷新。
- **教学式空状态**：零项目=注册表单（路径输入+注册按钮）+ CLI 块（`pipeline projects add …`，一键复制）双路径；有项目零 change=同结构换"新建 change"表单 + `pipeline init` 命令。

## 4. 各视图设计定义（demo 截图已验证深浅色）

| 视图 | 要点 |
|---|---|
| Nav | 品牌+一级 3 项（收件箱带等复核计数徽章·朱红）+ 工作台下拉 + 项目切换器 + 主题/语言/连接点 |
| 收件箱 | §2.3；默认落地页 |
| 看板 | §2.2 |
| 设置 | tab=铭牌活跃态；phase×track 矩阵：井底表头、技能 chip（绿 soft）、虚线"＋"开穿梭框 |
| 技能穿梭框 | 双栏+中间箭头；左栏点选（绿描边+勾），**顶部搜索过滤框（新增）**；保存按钮带计数 |
| workflow 列表页 | 工票行：名字+step 数+打开/删除（删除=朱红 ghost + 确认对话框） |
| workflow 画布 | 点阵网格底（22px）；节点=白票卡 mono，选中绿描边+soft 环；gate 节点带朱红"复核门"徽章；边/箭头/event 标签绿系（箭头用 clip-path 三角，禁 border hack）；工具栏=crumb+保存状态胶囊+添加 step |
| StepDetailPanel | 右滑面板：节标题=深绿小写间隔大写体；Guards 节**补新增表单**（类型下拉+条件参数 n+添加；选 nonempty-output 隐藏 n）——现有代码只有移除，本轮补齐功能+设计 |
| 添加 step 对话框 | id mono 输入+字符集提示+错误态 |
| AFK 工作台 | 双栏：左=挂队表单+队列卡（running 绿/queued 灰/failed 朱红实底/paused 虚线边）；右=详情（mono 标题+元信息行+终端风日志块 `#10150f` 底绿✓朱⚠+跟随尾部标注）+ 操作（查看 change ghost/取消朱红 ghost/重试绿） |
| Loops | 工票行：mono 名+档位铭牌徽章（L0 只读/L1 提案制/L2 半自动…）+就绪度 n/10（绿 mono）+升档绿 ghost/降档 ghost/不可升置灰；展开区=drift 门拒绝朱红提示条（拒绝理由原文） |
| Traffic | 折叠在 Advanced；会话列表复用 loops 行语言，记录详情复用 AFK 日志块语言；无新元素 |
| 对话框/toast | 对话框=票卡+backdrop `rgba(12,20,14,.38)`；toast=底部滑入，成功绿实底/失败朱红实底白字 |

## 5. 动效规范（GSAP motion.ts 承载）

| 词汇 | 参数 | 用途 |
|---|---|---|
| stampConfirm（新增） | 200ms ease-out-quart；徽章 scale 1.6→1 rotate(-7°)+fade | 转换成功在卡上盖"✓ 已推进 → x"绿章，1.6s 后淡出 |
| revealDialog（改参） | backdrop fade 150ms + 票卡 scale 1.06→1 200ms | 全部对话框 |
| slideInPanel（改参） | 220ms ease-out-quint translateX | StepDetailPanel/AFK 详情 |
| revealList（改参） | 170ms/项，stagger 45ms，translateY 7px | 视图首次进场列表 |
| toast（新增） | 200ms ease-out-cubic translateY 14px | 成功/失败提示 |
| foldToggle（新增） | 210ms ease-out-quint height | 看板分组折叠 |

纪律：全部 150-250ms、ease-out 指数族、无弹跳；只传达状态变化，无页面加载编排；
`prefers-reduced-motion` 一律瞬时（机制沿用现有全局覆盖）。快捷按钮浮现用 CSS transition（150ms）不走 GSAP。

## 6. 测试与验收

- **每阶段门**：`npm test` + `npm run test:web` + `tsc --noEmit` 全绿才进下一阶段；改动视图当阶段配 Playwright 深浅色截图对比。
- **查询清单同步**：重写 markup 前先读该视图现有测试，列出全部查询（getByText/Role/TestId），新 markup 逐条给出对应物或有意废弃的说明；测试意图（断言的行为）不丢。
- **server TDD**：三个新端点先写 `server.test.ts` 用例（含鉴权矩阵：无 token/错 Host/错 Content-Type/未注册 root），红→绿。
- **最终验收（Playwright 真机点击，真 build + 真 server，非 vite dev）**：
  1. 正常 pipeline 全 7 相位（含 verify-fail 回退确认）；
  2. AFK 全流程（挂队→运行→取消/重试）；
  3. workflow 编辑器：建自定义 workflow（含 gate step、guard 新增）→ 保存；
  4. **G17 验收**：用该自定义 workflow init 一个 change → 看板出现独立分组、卡可见、拖拽推进成功、快捷按钮推进成功、gate step 出现在收件箱；
  5. **G18 验收**：空注册表起步 → 空状态注册项目 → 新建 change → 推进 → 归档全闭环；
  6. 深浅色两套截图过一遍全部视图。
- 完成后：`docs/loops/progress.md` 记 iteration；`docs/TEST-REALITY.md` 的 G17/G18（及 G14）改判；交接接口清单如有实现期偏差同步修订。

## 7. 阶段划分（writing-plans 按此展开）

1. token+基础组件层（styles.ts 重写、按钮/表单/徽章/对话框/toast/空态、i18n 新增 key）
2. workflowModel + InboxView + BoardView（G17 核心）
3. server 三端点 TDD（G18 后端）
4. Nav 项目切换器 + 新建 change 对话框 + 教学空状态（G18 前端，吃 G14）
5. Loops / AFK / Traffic（零样式三件套按 §4 设计）
6. workflow 三件套换装 + guard 新增功能
7. 动效统一（motion.ts 六词汇）+ 全量验收（§6）

## 8. 明确不做（YAGNI）

- 不改现有 21 个端点的任何请求/响应形状；不加鉴权模型之外的新机制。
- 不做跨项目聚合视图（切换器只切 currentRoot）；不做归档卡片浏览（折叠计数即止）。
- 不引入外部字体/图标库/CDN（CSP 自足红线）；不换 xyflow/GSAP/React 技术栈。
- 不做移动端专门布局（保留现有 720px 断点的降级即可）。
