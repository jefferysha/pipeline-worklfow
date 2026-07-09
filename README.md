# pipeline-worklfow

7-phase 开发流水线状态机的**轻量 TypeScript 重建**——[workflow-plugin] 的单语言前锋版。
v2.0 在此之上加了一层**工作流自定义引擎 + dashboard 工作台**：不止跑内置 7 相位，还能画
自己的 step/skill 拓扑、经浏览器点按驱动全流程、托管 AFK 无人值守跑批、治理 loop 分级放权。

> 状态机 + 三门 + guard 的硬保障，去掉一切正交子系统。数据格式与老内核字节级兼容。
> 运行时依赖：node ≥22 + 几百行 bash hook shim，仅此而已（dashboard/automation/tap 等
> 可选子系统各自独立 workspace 包，不装不影响核心路径）。

- 目标与收敛判据：[GOAL.md](GOAL.md)（v1.0 内核重写 + v2.0 自定义引擎/dashboard，均已收官）
- 迭代协议（loop-lite）：[LOOP.md](LOOP.md) · 队列：[BACKLOG.md](BACKLOG.md)
- 数据/CLI/并行开发契约：[docs/CONTRACT.md](docs/CONTRACT.md)
- 真测审计（已知缺口如实登记，不糊弄）：[docs/TEST-REALITY.md](docs/TEST-REALITY.md)
- 逐轮实施流水：[docs/loops/progress.md](docs/loops/progress.md)

## 布局

```
packages/kernel          状态机内核（零运行时依赖）：state 读写/锁/CAS · flow 转换/guard/manifest ·
                         workflow 自定义引擎（loadWorkflow/serializeWorkflow/skillDag/validate）
packages/cli             pipeline 命令行（commander）——状态机 + afk/loops/channel/mem/tap 各子命令族
packages/server          全局 dashboard server：snapshot 聚合 + SSE 推送 + token 鉴权写端点 +
                         版本抢占（同机多版本 server 自动接管）
packages/dashboard-app   dashboard 前端 SPA（React + GSAP + @xyflow/react 画布，零外部 CDN/字体）
packages/automation      AFK 无人值守跑批：队列 + scheduler + docker sandcastle 执行 + L1→L3 放权
packages/tap             流量代理/tap daemon：本地 CA + TLS MITM 抓 LLM 请求，dashboard 只读展示
hooks/                   纯 bash 薄 shim（PreToolUse 三门拦截等，热路径不 spawn node）
tools/oracle/            golden-oracle 双跑校验（老内核 vs 本仓，逐字 diff）
tools/sandcastle/        AFK docker 执行镜像构建脚本
templates/               manifest.yaml（相位/转换/review_phases 单一真相源）+ 内置 default workflow
```

## 上手（5 分钟）

```bash
npm i && npm run build          # 产出单文件 packages/cli/dist/pipeline.mjs（零 node_modules 运行时）
npx pipeline init demo --track backend --preset full
npx pipeline get demo phase     # open
npx pipeline transition demo open-complete
npx pipeline inbox                     # 收件箱：在等你决策的 change（--html 出静态单页）
npx pipeline status
```

终端 statusline（`当前change · 相位 · 等:门`，纯 bash 零开销）——在 `~/.claude/settings.json` 加：

```json
"statusLine": { "type": "command", "command": "bash <本仓路径>/hooks/statusline.sh" }
```

## Dashboard 工作台

全机唯一一个 Global server，聚合本机所有已注册项目的 change，浏览器点按驱动状态机
（不用记 CLI 参数）：

```bash
npm run build:web && npm run build:server   # 产出 dashboard-app/dist + server/dist/dashboard.mjs
npx pipeline-dashboard                      # 监听 127.0.0.1:8765（已跑同/旧版本会自动让位/被接管）
```

项目注册直接在 dashboard 里完成：首次打开（零项目）会看到**教学式引导页**——填项目根目录
点「注册项目」即可（等价 CLI：页面上有可复制的命令）；多项目时导航栏有**项目切换器**，
末项「＋ 注册项目…」随时可加。注册表本体仍是 `~/.claude/pipeline-projects.json`，手改也行。

打开 `http://127.0.0.1:8765/` 后：

- **收件箱**（默认页）/ **看板**：在等你决策的 change、**按 workflow 分组的看板**
  （default 七相位 + 每个自定义 workflow 各自的独立分组与列集），拖拽或卡片上的
  快捷转换按钮推进相位、回退边二次确认，不用记事件名。**自定义 workflow 的复核门
  （gate=review 的 step）同样进收件箱**。右上角「＋ 新建 change」对话框等价
  `pipeline init`（名字/workflow/track，实时校验 + CLI 教学行）。
- **设置**：相位 × 轨道强制技能矩阵、skill 双栏穿梭编辑器。
- **工作台**下拉分组：
  - **Loop 治理**：loop-engineering 治理面（就绪分/drift、L1→L3 分级放权升档、budget 熔断状态；
    drift 门拒绝升档时给出具体理由）。
  - **AFK 工作台**：无人值守跑批队列（挂队/查看快照与实时日志/取消/重试），docker sandcastle 执行。
  - **自定义 workflow**：见下节（画布上 gate step 直接亮「复核门/确认门」徽章，
    详情侧栏支持 guard 的新增与移除）。

设计语言「工票车间」：白纸双色功能语义——**绿=流水线在跑，朱红=需要人出面**（复核门、
回退、删除、错误共用一个语义）；深浅色双主题；零外部字体/CDN（CSP 自足）。

写端点（相位转换/保存 workflow/AFK 操作等）需要 server 启动时生成的一次性 token，
**只有 `npx pipeline-dashboard` 真正提供页面时才会同源注入**——单独跑 `vite dev`
（`packages/dashboard-app` 内 `npm run dev`）只适合前端本身的样式/组件开发，
写操作会 401；要驱动完整流程，走上面 `pipeline-dashboard` 这条真实路径。

## 自定义 workflow

默认 7 相位（`open→explore→spec→build→verify→ship→archive`）只是内置的一份 workflow
定义（`templates/workflows/default.yaml`）。可以在 dashboard「自定义 workflow」里画一份
自己的 step 拓扑（双击某 step 钻入其 skill DAG，声明 `depends_on`/guards/inputs/outputs），
保存为 `.pipeline/workflows/<name>.yaml`，再用

```bash
npx pipeline init <change-name> --track backend --preset full --workflow <name>
```

把某个 change 摆到这份自定义 workflow 的首个 step 上（`gate.sh` 会按该 workflow 的
step/guard 定义动态解锁 skill，不再是硬编码的 7 相位判断）。已知简化点（多项目场景固定
编辑第一个已注册项目、guard 只支持移除不支持新增、无撤销重做/多选/minimap 等）见
[GOAL.md](GOAL.md) 清单 E8 脚注。

## 开发

```bash
npm test                        # vitest 全量（kernel/cli/server/automation/tap）
npm run test:web                # dashboard-app 前端测试（vitest + jsdom + testing-library）
bash tools/test-hooks.sh        # hook shim 断言
bash tools/verify-skills.sh     # 插件资产零悬空引用（CONTRACT §5.7）
bash tools/test-bundle.sh       # 单文件分发冒烟
npm run oracle                  # golden-oracle 双跑（vs 老内核）
```

MIT
