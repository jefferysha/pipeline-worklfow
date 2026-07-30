# Projects 桌面聚焦 UI 评修记录

## 评审范围

- 运行目标：`Tenon Dashboard`，`http://127.0.0.1:18831/?view=projects`
- 身份：`/Users/a1234/.codex/worktrees/b632/pipeline-worklfow`；
  Change `dashboard-projects-focus-20260730` 在 Progress 详情中显示为 Build。
- 规范：`frontend-design`、`web-design-guidelines`、`design-taste-frontend`
- 桌面视口：1024×768、1200×870、1440×900、1920×1080；不含手机端。

## 第一轮发现与修复

| 严重度 | 发现 | 用户影响 | 修复 |
| --- | --- | --- | --- |
| MEDIUM | PageHeader 底线与聚焦工具栏上边线形成相邻双分隔线 | 搜索控制与页面标题之间出现无意义空带，削弱层级 | 工具栏只保留下边线，页面头与控制区由单一分隔关系组织 |
| MEDIUM | `type=search` 的浏览器原生清除图标与 Lucide 清除按钮同时显示 | 同一动作出现两个 X，键鼠用户无法判断差异 | 改为原生 text input + `role=searchbox`，保留唯一、具名的清除按钮 |
| LOW | 零结果时工具栏与空态同时出现“清除条件” | 同一视区重复主动作 | 零结果时只保留空态主按钮；有结果时工具栏保留快捷清除 |

## 第二轮复评

- 信息层级：搜索、状态筛选、当前结果和项目列表按任务顺序排列；工具栏不覆盖 PageHeader 或项目身份。
- 视觉系统：只使用既有 card/fill/border/accent/text/button token 与 Lucide；无新增品牌色、渐变或装饰动画。
- 状态：成功结果、零结果、不可达只读、加载、离线与恢复均有文字和语义 role。
- 键盘：searchbox、唯一清除按钮和 roving 状态按钮组可达；ArrowLeft/Right/Home/End 同步按下状态与焦点；
  Escape 只清查询；清除全部条件后焦点返回 searchbox。
- 主题与布局：System/Light/Dark 角色一致；四档电脑端 `scrollWidth === clientWidth`，
  搜索与状态按钮组同行且项目身份、相位和健康摘要未被挤压。
- 动效：筛选不改变完整 rows 指纹，不重播集合级 GSAP；reduced-motion 测试确认直接 `gsap.set`
  终态，未调用 `fromTo`。

复评结论：无剩余 CRITICAL、HIGH 或 MEDIUM 问题。LOW 重复动作已一并消除。

## 冻结 Verify 返工

首个冻结 SHA `ccbfe80f06aa431d98c4e32e69393a28c1cefb88` 的独立 Reviewer 与视觉轨发现：

| 严重度 | 发现 | 修复 |
| --- | --- | --- |
| MEDIUM | `<label>` 同时包裹 input 与清除 button | 改为显式 `htmlFor/id` 的屏幕阅读器标签，input 与清除 button 成为同级控件 |
| MEDIUM | 筛选器使用不完整的 `tablist/tab` 语义 | 经 `requirements-changed` 回 Spec，改为有名称的按钮组和逐按钮 `aria-pressed` |
| MEDIUM | 不可达行整体 `opacity-70` 降低小字对比度 | 删除整体透明度，项目名提升为 `text-text-2`，路径与状态保留未经混色的语义文本色 |
| MEDIUM | 仓外截图与冻结产物不一致且缺 1200/1920、不可达行 | 第二次 Build 后从新冻结产物重新采集完整四档桌面与不可达证据 |
| LOW | 计划错误引用 `.test.ts` | 在 Spec 修订为仓库实际发现的 `.test.tsx` |

TDD 回归先得到 4 个预期失败，再以最小实现令定向 2 files / 28 tests 全绿。第二轮冻结前必须重新
执行完整视觉复评；当前代码审阅未发现新增层级、装饰或动效问题。

## 第二次 Build 桌面复评

- 专用浏览器：`pipeline-worklfow-dashboard-browser-owner`
  （`-321f-437e-bfcb-60819feae066`），目标为本 worktree 的
  `http://127.0.0.1:18831/?view=projects`。
- 1024×768 Light：basename/root 查询 `b632` 只显示本 worktree，searchbox 只有一个具名清除
  button；`scrollWidth === innerWidth === 1024`。
- 1200×870 Light：`读不到 20` 显示 20 个 `aria-disabled` 只读 group，行内没有 button，
  没有 `opacity-70`；项目名、路径与状态的计算 opacity 均为 1。
- 1024×768 Dark：零结果保持一个查询清除 icon 和一个空态“清除条件”主动作，结果状态为
  `显示 0 / 40 个项目`，无横向溢出。
- 1440×900 Dark：查询结果行的项目、阶段与健康摘要保持单行主层级；1920×1080 Dark：
  默认 all 恢复既有“需你动手 / 其余 / 读不到”分区。
- 键盘：从“全部”按 ArrowRight 聚焦并选择“需处理”，按 End 聚焦并选择“读不到”；
  searchbox 内 Escape 只清查询且保留“读不到”按下状态和输入焦点。
- 中英文：按钮组分别暴露 `项目状态聚焦` / `Project status focus`，搜索和结果 live summary
  同步本地化；最终恢复中文与 System（本机解析为 Dark）。
- 离线：停止本地 Dashboard server 后出现 `连接断开——数据可能过期` 与 `重连`；恢复 server
  后自动清除离线状态，原有筛选模型保持可用。
- 截图目录：
  `/var/folders/1c/hyn3mfvd12ngm6sgy28_s5gm0000gn/T/dashboard-projects-focus-20260730-verify2/`，
  包含 1024 Light filtered、1200 Light unreachable、1024 Dark empty、1440 Dark filtered、
  1920 Dark all；截图仅作仓外验证证据，不纳入提交。

第二次 Build 复评结论：第一轮冻结的 4 个 MEDIUM 和 1 个 LOW 均已修复；当前无剩余
CRITICAL、HIGH 或 MEDIUM 发现。最终结论仍须以后续精确新 build SHA 的独立 Verify 四轨为准。
