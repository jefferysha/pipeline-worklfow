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
packages/channel         event-sourced worker 总线（历史迁移 / experimental 兼容面）：CLI 唯一依赖，
                         从 kernel 提取、保留 echo 能力，非 v3 默认 agent runtime
hooks/                   纯 bash 薄 shim（PreToolUse 三门拦截等，热路径不 spawn node）
tools/oracle/            golden-oracle 双跑校验（老内核 vs 本仓，逐字 diff）
tools/sandcastle/        AFK docker 执行镜像构建脚本
templates/               manifest.yaml（相位/转换/review_phases 单一真相源）+ 内置 default workflow
```

## 上手（5 分钟）

### 安装完整 Pipeline 插件（Codex / Claude）

这是一个完整插件，不是“CLI + 另装一批 skill”的组合包。7-phase 编排、OpenSpec、设计/计划/TDD/
验证、浏览器验收、ADR 与文档收据所需的 skill，以及 dashboard 的 server bundle 与 SPA 都随插件
一起安装；默认 workflow 不会再下载 npm、第三方 marketplace 或另一宿主的 cache。

宿主必须明确选择，避免一次安装意外修改多个 AI 工具：

```bash
pipeline setup --codex
pipeline setup --claude
```

第一次机器上尚不存在 `pipeline` 命令时，使用发布包自带的 bootstrap（它不是第二个包管理器，内部
仍会执行同一条 `pipeline setup --<host>` 安装契约）：

```bash
./install.sh --codex
# 或
./install.sh --claude
```

安装时宿主自己管理标准插件目录（Codex: `~/.codex/plugins/...`；Claude: `~/.claude/plugins/...`），
Pipeline 不猜测也不手改其 cache 布局；只根据宿主 `plugin list --json` 返回的实际安装根校验资产。
校验通过后，Pipeline 会把完整候选复制到本机的**已验证 runtime release**，再原子切换选择指针；
`~/.local/bin/pipeline` 与 `pipeline-hook` 是稳定启动器，绝不直接指向可变 marketplace checkout。
macOS 使用 `~/Library/Application Support/pipeline-lite/`，Linux 使用 XDG data/state/config 目录。新开一个
Codex/Claude 会话后，包内 skills 与 hooks 才会被该会话加载。

如果一次更新或本地文件损坏需要诊断或恢复：

```bash
pipeline runtime status --json
pipeline runtime repair --rollback   # 只允许回退到上一份完整校验通过的 release
```

`repair` 不是绕过 workflow 的后门：runtime 无法加载时，普通项目写操作仍被 gate 阻止；只有这条精确恢复
命令可达。没有可验证的上一版本时，重新运行 `pipeline setup --codex` 或 `pipeline setup --claude`。

Codex 对第三方 hook 保留一次性本机信任边界：执行 `pipeline setup --codex` 后，在 Codex 输入 `/hooks` 并信任
`pipeline-lite`。未信任时插件和 skills 已安装，但 SessionStart / UserPromptSubmit 不会运行，因此正常对话不会
自动派发 default pipeline；更新后若 Codex 将 hook 标为“已变更”，在同一处重新信任即可。

自动升级是显式 opt-in：

```bash
pipeline setup --codex --auto-update
pipeline update --codex                 # 立即更新指定宿主
```

启用后，SessionStart 最多每天一次在后台刷新所选宿主的 marketplace 和插件，配置只写在
Pipeline 的平台标准 runtime config 目录（macOS 为 `~/Library/Application Support/pipeline-lite/config/`；
Linux 为 `$XDG_CONFIG_HOME/pipeline-lite/`）；当前会话继续使用已加载版本，下一会话加载新版本。Claude 对应使用
`pipeline setup --claude --auto-update` / `pipeline update --claude`。Cursor 等非原生 marketplace
宿主仍可 `pipeline setup --cursor --target <项目目录>`，但由承载它的 Codex/Claude 插件负责更新。

装完即可用 `pipeline init/inbox/status` 起 change；`pipeline setup --codex` 会从刚发布的不可变
runtime 启动并在健康检查通过后打开随包的完整工作台（默认 `http://127.0.0.1:18765/`）。

### 正常对话的四种执行路径

启用并信任 hook 后，普通对话不是“一律跑完整流水线”：

- 解释、讨论、`/` 命令和系统通知不创建 Change。
- 明确的 typo、文案/注释、unused import、单行或单文件值调整，且不涉及 API/公共契约、
  schema/migration、数据库、认证/安全、并发/事务、依赖、发布/生产数据、跨模块或新功能时，
  进入内建 `simple`：`change → verify → done`。它只调用随包的 `simple-task` 与
  `verification-before-completion`，不生成 OpenSpec、Superpowers、ADR 或七阶段 Todo。
- 其余实现、修复、重构、调研和产品任务进入对应 PM/frontend/backend 的完整 default：
  `open → explore → spec → build ⇄ verify → ship → archive`。
- 用户显式选择“自由模式 / free mode”时进入内建 `free` Track。它可绑定 default 或任意项目
  Workflow，不叠加 PM/frontend/backend 的 coverage、AFK 与技能矩阵；但所选 Workflow 自己的
  阶段、Skill、Hook、门禁、OpenSpec/Superpowers/ADR 和后续读取收据仍完整执行。`free` 永不作为
  关键词评分的自动兜底；Dashboard 在没有自动 winner 时把它作为默认手选入口。

`simple` 采用“正向证据 + 否决优先”而不是按改动行数猜测。例如“修复一个 `.tsx` 文案 typo”可走
轻量轨；“只改一行 API schema”仍必须走完整轨。执行中发现范围扩大时，simple Change 会进入
`escalated` 终态，再创建新的 default Change，并用依赖关系保留审计链，不会原地偷换 workflow。

### 从源码构建

```bash
npm i && npm run build          # 产出 CLI bundle、dashboard server bundle 和 SPA（零 node_modules 运行时）
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
pipeline dashboard                            # 监听 127.0.0.1:18765（已跑同/旧版本会自动让位/被接管）
pipeline dashboard --background --open        # 后台启动，健康后打开浏览器
```

生产态只有**一个**前端入口：`pipeline dashboard` 在 `127.0.0.1:18765` 同时提供 API 和已构建的
`dashboard-app/dist` SPA；不会再额外启动一个生产前端端口。开发时才会有 Vite 的独立 UI 端口
`5173`，它把 `/api` 代理到 `18765`。旧的 `8765` 不是默认端口；如需兼容它，可显式：

```bash
pipeline dashboard --port 8765
# 前端开发时让 Vite 代理到同一后端：
PIPELINE_DASHBOARD_PORT=8765 npm run dev -w @pipeline-lite/dashboard-app
```

Vite UI 端口如有冲突可另设 `PIPELINE_DASHBOARD_DEV_PORT`（默认仍为 `5173`）。

项目注册直接在 dashboard 里完成：首次打开（零项目）会看到**教学式引导页**——填项目根目录
点「注册项目」即可（等价 CLI：页面上有可复制的命令）；多项目时导航栏有**项目切换器**，
末项「＋ 注册项目…」随时可加。注册表本体仍是 `~/.claude/pipeline-projects.json`，手改也行。

打开 `http://127.0.0.1:18765/` 后：

- **收件箱**（默认页）/ **看板**：在等你决策的 change、**按 workflow 分组的看板**
  （default 七相位 + 每个自定义 workflow 各自的独立分组与列集）。行/卡点开**详情卡**——
  证据 chips（verify_result/build_sha 等门槛字段一望便知）+ 产物 + 语境，一键放行/打回；
  `j`/`k`/`Enter`/`Esc` 键盘操作；拖拽时目标列**合法/非法前示**（非法落点抖动+提示），
  或用卡片上的快捷转换按钮，都不用记事件名。项目切换器可选**「◈ 全部项目」聚合视图**
  跨项目查看与操作。**自定义 workflow 的复核门（gate=review 的 step）同样进收件箱**。
  右上角「＋ 新建 change」对话框等价 `pipeline init`（名字/workflow/track，实时校验 +
  CLI 教学行）。
- **设置**：相位 × 轨道强制技能矩阵、skill 双栏穿梭编辑器。
- **工作台**下拉分组：
  - **Loop 治理**：loop-engineering 治理面（就绪分/drift、L1→L3 分级放权升档、budget 熔断状态；
    drift 门拒绝升档时给出具体理由）。
  - **AFK 工作台**：无人值守跑批队列（挂队/查看快照与实时日志/取消/重试），docker sandcastle 执行。
  - **自定义 workflow**：见下节（画布上 gate step 直接亮「复核门/确认门」徽章，
    详情侧栏支持 guard 的新增与移除）。

PM 内建轨道把 `spec-complete` 后的 AFK 交接作为一条显式 policy：成功进入 Build 后仅原子写入
`automation=queued`，默认仍是 L1 report-only；不会自行启动 Docker、runner 或产生外部副作用。
`automation_eligible` 仍只表示“允许手动 AFK”，不会让 frontend/backend 被自动接管。自定义 Track
可在工作台用「规格完成后自动进入 AFK」开关写入同名 policy，未启用时保持按需执行。

视觉语言「OpenAI 配色 × Trellis 布局」：蓝色签名承担全部结构性强调（主按钮/选中态/
聚焦环），绿/红退回纯语义 tint 徽章——**绿=成功，红=需要人出面**（复核门、回退、删除、
错误共用）；主内容+右侧摘要栏双列骨架；深浅色双主题；零外部字体/CDN（CSP 自足）。

写端点（相位转换/保存 workflow/AFK 操作等）需要 server 启动时生成的一次性 token，
**只有 `pipeline dashboard` 真正提供页面时才会同源注入**——单独跑 `vite dev`
（`packages/dashboard-app` 内 `npm run dev`）只适合前端本身的样式/组件开发，
写操作会 401；要驱动完整流程，走上面 `pipeline dashboard` 这条真实路径。

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

Workflow 的图与文档治理现在独立组合：

- `openspec_contract: required` 是旧兼容别名，只用于完整 seven-phase OpenSpec 图；它会登记
  proposal / design / tasks、Superpower design / ADR、delta spec / plan、verification report
  与 applied spec。
- 任意短图可声明 `document_contract.version: v1`，只列出这张图真正产出的文档、owner step、
  producer Skill，以及后续哪些 step 必须先读它。例如三步流程可以只治理 proposal：

  ```yaml
  document_contract:
    version: v1
    slots:
      - kind: proposal
        owner_step: shape
        producers: [writer]
    reads:
      - step: implement
        kinds: [proposal]
      - step: prove
        kinds: [proposal]
  ```

- 两者都不声明就是自由模式，不生成或强迫读取 OpenSpec 文档。内建 `simple` workflow 使用该模式，
  且项目同名文件不能覆盖它。

两种文档契约互斥。受治理文档统一由 `.pipeline-documents.json` 记录内容 hash、真实 Skill 证据和
读取收据；缺失、未读取或后来被修改时，`pipeline check` / `pipeline transition` 会拒绝推进。

## 开发

```bash
npm test                        # vitest 全量（kernel/cli/server/automation/tap）
npm run test:web                # dashboard-app 前端测试（vitest + jsdom + testing-library）
npm run test:hooks              # hook shim 断言
npm run check:architecture      # 包边界、codec、跨域协议单源门禁
bash tools/verify-skills.sh     # 插件资产零悬空引用（CONTRACT §5.7）
bash tools/test-bundle.sh       # 单文件分发冒烟
npm run oracle                  # golden-oracle 双跑（vs 老内核）
```

MIT
