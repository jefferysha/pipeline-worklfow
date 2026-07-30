# Orchestration Graph UI 评修记录

## 第一轮：frontend-design / web-design-guidelines / design-taste-frontend

验收对象：当前 worktree production Dashboard，Change 详情右侧面板，真实 47-node graph。

| Severity | 问题 | 修复 |
| --- | --- | --- |
| high | strict client 接受 scope 合法但与当前 root/change 不一致的 200 body，存在串线展示风险 | `fetchOrchestrationGraph` 增加请求 scope 精确相等校验并补回归测试 |
| medium | 默认展示全部 47 节点，单资源列把图拉到 2766px，主要流程不可读 | 默认只展开 workflow/change/phase；增加“全部”入口，资源节点最多三列，canvas 内部最大高度 520px |
| medium | phase 按 node id 字母序排列，不符合 frozen workflow 顺序 | Server phase metadata 增加一基 `order`；视觉和键盘顺序复用同一 comparator |
| medium | raw `current/pending/unread` 与 edge 英文 label 混入中文 UI | 节点状态与 edge kind 增加中英文闭集映射，未知业务状态才保留原值 |
| medium | 过滤或搜索隐藏 selected node 后，详情仍留在图下方 | selection 仅在 node 仍处于 visible set 时展示 |
| medium | 真浏览器里 End 能移动焦点，但 Enter 未可靠更新 selection | 显式处理 Enter/Space，复用同一 typed selection 状态并补组件测试 |
| low | 详情只能靠 Escape 清除，指针用户不明显 | selection header 增加有可见焦点和 aria-label 的清除按钮 |
| low | 可访问替代列表始终显示全图，与当前 filters/search 不同步 | 列表改用 `visibleNodes/visibleEdges`，与视觉图共享同一可见集 |

## 第二轮复评

结果：通过；critical/high/medium 遗留为零。

- 最终 production build 由本 worktree 的 Server 与 Dashboard dist 提供，页面标题为
  `Tenon Dashboard`，URL 同时固定本 worktree root 与当前 Change。
- 默认核心图真实读取 `9 nodes · 16 edges`，phase 顺序为
  Open/Explore/Spec/Build/Verify/Ship/Archive；“All”展开为 `47 nodes · 54 edges`。
- 任务类型筛选得到 `27 nodes · 0 edges`；无匹配搜索得到过滤空态，清除后恢复全图；可访问替代
  列表和视觉图共用过滤结果。
- End 把焦点移至 Archive，Enter 展示 Archive 详情，Escape 清除选择且未冒泡关闭 Change 详情；
  URL 的 `change=frozen-workflow-definition-status-20260730` 保持不变。
- 受控回环代理分别验证加载后真实空态，以及 500 错误后 Retry 恢复真实图；404 unavailable
  由组件契约测试覆盖。
- 中英文状态、edge kind、控制文案与详情均已在真实浏览器切换验证。
- 1024、1440、1920px 下 `document.body.scrollWidth === window.innerWidth`；全图由 520px
  内部滚动画布承载，没有页面级横向溢出。

## 第三轮：pre-Verify 完整 diff 返工

完整 diff 审查发现并修复：

- HIGH：exact-change reader 仍可能跟随 Change 或 `.pipeline-run` 目录 symlink。Server 现在以已注册
  root 为锚点，对 Change、canonical 父目录、revision、transition、pre-Verify review 与 legacy
  leaf 做 pre/post realpath、inode 和 symlink 拒绝；真实 filesystem 与 HTTP 回归均覆盖。
- HIGH：root 解析错误可能透出内部路径。图与 workflow definition 路由统一返回有界错误码与文案。
- MEDIUM：strict client 对 implemented/deferred coverage、kind metadata 与 `handled` status 的闭集
  校验不完整；现已按 node kind 校验唯一已知字段，并显式支持 handled。
- MEDIUM：自定义 phase label、`explore-complete`、非 transition 语义边、筛选后 selected node 的
  相邻边详情存在展示缺口；现已保留自定义 label、完整本地化、显示所有有意义边标签，并用 full
  graph 关系渲染详情。
- MEDIUM：图内 focus ring 对比度不足；所有 filter/search/node 控件现统一使用 accent ring。
- MEDIUM：独立 workflow-definition-status 缺少 `root` 时可能误用 server cwd。路由现在先返回
  400，且 route 与真实 HTTP 均锁定“不会咨询 registered-root resolver”的行为。
- MEDIUM：状态源 leaf 和读取前不存在的 canonical companion 目录没有完整 post-check。reader
  现在记录 present identity 或 absent sentinel，读取后复核 source path、leaf dev/inode/size/
  realpath，并拒绝 legacy→canonical source switch；两个可控竞态测试均先红后绿。
- MEDIUM：中文标题、Workflow/Change kind 与 Track/Preset metadata 仍残留英文。现已补为
  “编排图 / 工作流 / 变更 / 轨道 / 预设”，并由 i18n 与真实组件断言锁定。

## 第四轮：最新 production browser 回归

- 固定页面仍是当前 worktree 与当前 Change 的 `Tenon Dashboard`；默认图为
  `9 nodes · 16 edges`，阶段过滤为 `7 nodes · 8 edges`。
- 仅保留“阶段”后选择 Build，详情仍显示来自 Change/Spec/Verify 的隐藏相邻节点关系，以及流向
  Verify 和任务的完整关系；筛选不再丢失诊断上下文。
- End 将焦点移动到 Archive，Enter 选中，Escape 只清除节点选择；所有图内交互控件使用 accent
  focus ring，未残留 legacy blue ring。
- 中文显示“调研完成”，英文显示 `Explore complete`，没有 raw `explore-complete`；语义边均是
  有向、可读标签。
- 1024、1440、1920px 均无页面或 graph region 横向溢出。
- 本次图 API 没有新增控制台错误。长生命周期共享浏览器中保留了本次 server 启动前的历史 SSE
  `ERR_CONNECTION_REFUSED`，当前页面另有仓库既存 Context Bundle preview 501；两者均与
  Orchestration Graph 路由分离，未伪装为零错误。

## 第五轮：最终契约与生成物收敛

- Codex 发现 custom step-graph 复用标准 phase id 时会被默认本地化覆盖；现仅
  `phase-manifest` 本地化内建 phase，`step-graph` 保留 frozen workflow label。
- Codex 发现 strict client 只闭合 metadata key、未闭合 value；现已验证 execution model、
  fingerprint、坐标、整数、gate、boolean、review field 与 timestamp，并保留 Tenon 合法的开放
  custom preset（有界且拒绝控制字符）。
- 多轨复核发现 kernel 接受的非 canonical heartbeat 会被 client 拒绝；Server graph 边界现统一
  输出 ISO timestamp，源码与 production bundle 均有回归覆盖。
- 架构门禁发现 Graph Card 超过 400 行；纯展示 helper 已提取到 presentation 模块，组件回到
  395 行，行为与键盘顺序不变。
- 最终 Codex 发现 legacy custom workflow fallback 仍可能跟随 workflow leaf symlink；exact-change
  reader 现把同一 registered-root anchor 传给 `readWorkflowForApi`，外部定义不会进入 graph。
- 最终 Codex 发现 Change/definition 的 typed path violation 被折叠为 500；Graph v1 现分别返回
  bounded 403 `ORCHESTRATION_CHANGE_FORBIDDEN` / `ORCHESTRATION_DEFINITION_FORBIDDEN`，独立
  definition status 也保留 403，corrupt state 仍维持 500。
- 后续 Codex 复核继续闭合 exact-change 可选文件：`tasks.md` 现通过 `O_NOFOLLOW` fd 读取并
  复核 dev/inode/size/realpath；workflow 的普通 I/O 用 `WorkflowReadError` 保持 500，不与
  path trust 403 混淆。
- 文档节点的 10 个 canonical kind 与 `chat/simple` 内建 track 已补齐中英文展示，搜索、画布、
  详情和可访问替代列表不再直出这些闭集协议 token。
- 最终三条独立复核均为 `C0/H0/M0`；完整 Web、根测试、生成物、静态、hooks、oracle 与
  OpenSpec 结果以冻结基线的 Verify 报告为准。

## 第六轮：有界读取、单快照诊断与自环可见性

- Codex 全量 diff 审查发现 `tasks.md` 普通文件读取虽有 `O_NONBLOCK`，但仍缺硬字节上限；
  reader 现以 256 KiB `fstat` fast-fail，并用 `max + 1` 的固定 buffer `readSync` 检测读取期间增长，
  不再让 HTTP 请求同步分配或解析无界任务内容。
- Graph 路由不再分别读取 Change snapshot 与 definition status。exact Change reader 从同一次
  canonical state 生成 `workflowDefinition`，路由只消费这一份复合投影；legacy workflow 的
  `WorkflowReadError` 保持为 `ORCHESTRATION_DEFINITION_UNREADABLE`，不再误报 Change 损坏。
- 默认 `archive → archive` 及 custom self-transition 改为节点右侧的 cubic SVG loop；普通边、
  transition label、选中节点相邻边与可访问替代列表继续复用同一 `edgeLabel` 语义。
- 为满足前端 400 行架构门禁，SVG edge 抽为 `OrchestrationGraphEdge`；一次遗漏 import 的回归已由
  独立 reviewer 捕获并修复。最终 Card 为 381 行，Edge 为 53 行。
- 最终主会话按 `tenon:code-review` 完成 Standards/Spec 双轴复审，三条独立终审均为
  `C0/H0/M0/L0`。补充的 `codex review --uncommitted` 重跑被账户用量上限外部中断，未伪装为
  通过；其上一轮四项 P2 已逐项修复，并由上述主审、独立 reviewer、安全与上游契约轨复验。

## 第七轮：fd 绑定状态读取与等价无障碍图

- 安全复核发现 `StateStore.read(pathname)` 的读取后 inode 复核仍允许同 UID 写者执行
  swap-read-restore。Kernel 新增复用 canonical revision、governance binding、frozen plan 原解析器
  的 `readPipelineStateFromSync`；Graph exact-change 路径改由 registered-root 目录链和
  `O_NOFOLLOW` leaf fd 提供字节，不再把 pathname 委托给 StateStore。
- terminal activity sidecar 同样改为 `O_NOFOLLOW | O_NONBLOCK` 打开，从 fd 有界读取，并在读取
  前后复核 leaf identity；symlink、FIFO、换位、超限或损坏均 fail-closed 为无活动会话。
- Change canonical path violation 统一成为 bounded 403；canonical 内容损坏继续保持 500，
  不混淆 scope violation 与数据损坏。
- UI 复核发现语义列表缺少状态、metadata 与每节点入/出关系；独立可访问列表组件现在提供与
  selection 详情等价的信息，且继续随过滤/搜索同步。
- 多条同节点 self-transition 现在按稳定 edge id 分配不同 loop 半径/偏移；transition label 仅在
  选中相邻节点时出现。unavailable、真实空和过滤空均增加 polite status 语义。
- 发布复核刷新五个上游固定点：部分默认分支与稳定 release 已前移；研究文档现
  自包含 default commit URL、stable release/tag URL、读取日期，以及 GitHub latest 与严格
  SemVer stable 双口径。浏览器截图移到仓外，避免误提交。

## 第八轮：Graph 资源预算与浏览器解码上限

- 安全复核发现 project-controlled workflow、document ledger、文档内容和任务图仍可能放大
  同步读取、digest 与浏览器渲染成本。API workflow 现于 parse 前以 `fstat` 拒绝超过 256 KiB
  的定义；document ledger 限 1 MiB/256 records，单文档限 2 MiB，digest 改为有界串行。
- Graph v1 在生成过程中限制 512 nodes、1024 edges 和 1024 字符 label，超限稳定返回
  `413 ORCHESTRATION_GRAPH_LIMIT_EXCEEDED`；Dashboard strict decoder 镜像节点、边、id 与
  label 上限，恶意或漂移 payload 不进入 React 渲染。
- 新增 workflow、ledger、Graph builder、路由和 Dashboard decoder 的超限回归测试；定向
  68 条 backend/kernel 与 39 条 Web 断言全绿，架构门禁恢复通过。

## 第九轮：读取期增长封口与契约对称

- 发布复核发现 workflow、document ledger 与 document source 虽在读取前检查 `fstat.size`，
  仍可能在检查后被同权限写者扩容。三条路径现统一使用 fd 绑定的 `max + 1` 有界读取，并在读取
  前后复核 fd inode/size、目标目录项与目录锚；读取期增长会 fail-closed，不进入 YAML/JSON
  解析、digest 或 Graph 构建。
- Server 与 Dashboard 已统一 512 nodes、1024 edges、2048 字符 node id、4096 字符 edge id、
  1024 字符 label 以及 C0/C1 控制字符谓词；合法边界不会再出现 Server 200、Client 拒绝，
  越界统一返回 `413 ORCHESTRATION_GRAPH_LIMIT_EXCEEDED`。
- 新增 workflow、ledger、document source 三条读取期增长回归。最终发布、安全与 UI 复核均为
  `C0/H0/M0`；定向 backend/kernel 111 条、Graph Web 39 条通过，最新 production bundle 已包含
  fd-bound reader 与对称 Graph decoder。
