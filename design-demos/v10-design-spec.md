# v10 设计 spec —— 「如果我是负责人，基于后端重新设计」三方向探索

> 本文件是三个并行设计版本的**唯一共同输入**。只含产品理解、能力面模型、数据 fixture、
> 功能覆盖硬清单与工程约束——**不含任何视觉风格信息**（风格各版独立决定）。
> 生成时间 2026-07-14。依据：packages/server/src/server.ts 全端点扫描 +
> packages/dashboard-app 功能面扫描 + GOAL.md。

## 1. 产品是什么

**Pipeline 控制台**：一台机器上所有「AI agent 流水线项目」的全局指挥面。
后端是一个 workflow 引擎（7 相位默认流程 + 自定义 workflow DAG）+ AFK 沙箱自动化
（docker 里放 claude-code/codex 无人值守跑活，8 态状态机）+ loop 治理（L1→L3 分级放权
毕业制）+ 流量代理 tap（捕获 13+ AI CLI 的真实请求）+ channel worker 总线（event-sourced
多 agent 协作）。前端经 SSE 订阅全机快照，动作走带 token 鉴权的写端点。

**用户**：单人开发者（也是运维者），中文，专家级。一天多次瞥一眼：「有什么在等我拍板？
跑着的活健康吗？」然后要么一键放行/打回，要么拷个命令回终端接管。

**使用场景与距离**：笔记本 1m，1440×900 起步。高频短访问（30 秒扫一眼）+ 低频深访问
（配置 workflow/loop、追失败现场）。

## 2. 能力面模型（产品哲学，硬约束）

1. **前端以「只读看进度」为主体**——它是玻璃驾驶舱，不是第二个 IDE。
2. **人的写动作只有**：放行/继续（transition 前进边）、打回（回退边）、重试、终止、
   放弃（dismiss）、以及配置面编辑（workflow/loop/AFK 参数/凭证/hook 开关）。
   另有两个后端已支持的动作可入设计：新建 change、手动挂入 AFK 队列（enqueue）。
3. **收件箱只收「能拍板的事」**：gate 等放行/打回、失败等重试/放弃、loop 草稿等批准/驳回、
   升档等确认。缺产出的（等 agent 干活）不进收件箱，归进度。
4. **接不了手的事给「可拷贝命令」回终端**：恢复会话、cd worktree、docker exec、重跑。
   这是一等公民交互，不是降级。
5. 强制安全门（gate/skill-gate hook）**没有开关**——安全边界要呈现为「常开、不可关」。

## 3. 输出格式（三版必须统一，否则无法横向对比）

- 单文件 HTML（纯 HTML/CSS + 原生 JS，不用 React/构建），存
  `design-demos/v10<x>-<名>.html`。
- 目标视口 **1440×900**；页面可纵向滚动，但不得横向滚动。
- **hash 路由**：加载时读 `location.hash` 直达对应功能面（至少支持
  `#progress` `#inbox` `#detail` `#afk` `#workbench` `#observe`，命名可按各版信息架构
  调整但须在文件头注释里列全），无 hash 落默认视图。运行时点击导航也要能切。
- 全中文 UI 文案，中文引号「」；正文 ≥14px、标签/注释 ≥12px、正文对比度 ≥4.5:1。
- 引擎名（claude-code / codex / gemini…）一律以等宽文本徽章呈现，**不放任何第三方 logo**。
- 不编数据：只用本 spec §5 的 fixture，逐字段渲染。
- 文件底部固定一枚小版本签名（如「v10a · 设计提案 · <风格名>」）。

## 4. 信息架构覆盖（硬清单——每一项都必须在页面上真实出现）

### A. 全局壳
- [ ] A1 项目切换器：「全部项目」聚合 + 3 个项目（活跃 change 计数徽标）+ 注销入口
- [ ] A2 待拍板计数红徽标（=收件箱条目数 6）
- [ ] A3 SSE 连接灯（在线）+ 离线横幅形态（可用注释/隐藏态或切换演示）
- [ ] A4 亮/暗主题切换、中/EN 语言切换（控件出现即可，不必真实现双语）
- [ ] A5 server 版本号 v2.0.0 · pid 48213；调度器健康灯（attention：1 执行·1 排队·2 失败·上限 4）
- [ ] A6 零项目/零 change 空态的教学形态（三步可拷命令：init→setup→doctor）——
      可做成一个隐藏 hash 视图或页内示意块

### B. 进度（在制总览）
- [ ] B1 五态行模型全出现：gate（可放行/等你判断两种）、failed（含 cancelled 琥珀态）、
      running、queued、agent（等产出·缺 X）
- [ ] B2 状态筛选页签 + 计数：全部 10 / 等你动手 5 / 运行中 1 / 等待中 4
- [ ] B3 每行：change 名、track chip、workflow 全称 chip、▦沙箱/⌨终端调度标识、
      更新时间、判定徽章、失败短成因 chip、相位轨（该行 workflow 的真实 steps，当前高亮）
- [ ] B4 行内动作：gate 行「→ 放行进入 X」+「↩ 打回 Y」；running 行「⏹ 终止」；
      failed/conflict 行「重试」「放弃」+ 回终端命令 chip；queued/agent 行无动作
- [ ] B5 聚合语境按项目分组（组头 + 件数）
- [ ] B6 归档折叠区（3 个已归档，展开为只读行）

### C. 收件箱（拍板队列——后端有此聚合逻辑、现前端未上，必须补齐设计）
- [ ] C1 6 条待拍板事项按等待时长降序（见 fixture §5.8），每条：在等什么决定（人话）、
      等了多久、一键动作组
- [ ] C2 事项类型覆盖：verify 门放行、评审 fail 裁决、冲突处置、失败重试、loop 草稿
      批准/驳回、升档确认

### D. 详情（单 change 深视图）
- [ ] D1 阶段垂直时间线：✓done/●当前/×失败 + 每阶段产出字段 chips（可拷贝暗示）
- [ ] D2 verify 门三轨证据：verify_result / agent_review_result / codex_review_result
      + verification_report + build_sha
- [ ] D3 失败诊断卡（人话）：成因标题 + 处置指引 + 修复命令 + 报错原文折叠 + attempts/cause
- [ ] D4 连接现场命令组：恢复会话、cd worktree、docker exec、改完重跑（各可拷）
- [ ] D5 流程历史（只留 transition/init 级事件）
- [ ] D6 running 态实时日志 tail（2.5s 轮询语义 + 跟随尾部开关 + 沙箱内阶段行）

### E. AFK 指挥面（后端有 /api/afk/snapshot+聚合 log、现前端未上，必须补齐设计）
- [ ] E1 六泳道：queued 1 / running 1 / merged 2 / failed 1 / conflict 1 / paused 1
- [ ] E2 调度器聚合流水时间线（fixture §5.9 的 7 条）
- [ ] E3 就绪三灯：docker ✓ / 镜像 ✓ / 凭证（claude-code ✓ · codex ✗）
- [ ] E4 手动入队（enqueue）动作入口 + 「默认入队」开关的关系交代
- [ ] E5 L1/L2 report-only「跑完不合并、停给人工」与 L3 自动合并的区别在泳道上可读出

### F. 工作台（配置编排面，per-root）
- [ ] F1 workflow 切换器（default 只读 pill + sec-hotfix「未保存」+ content-pipeline）
      + 保存钮 + 校验错误呈现形态 + **删除自定义 workflow 入口**（后端有 DELETE，现前端没有）
- [ ] F2 流程带：阶段卡（序号/名/技能数/钩子数/产出数/门徽章）+ 真实 change 计数气泡 +
      running 脉冲 + 添加阶段
- [ ] F3 阶段编辑：技能 DAG 链（编号节点+依赖连线+未安装标注+安装命令）、产出物 chips +
      「产出非空方可推进」开关、复核门开关
- [ ] F4 Hook 会话时序线：四时机（会话开始/你发消息/agent 调工具/工具完成）× 钩子卡
      三档（可配开关/强制常开锁定/暂不可配灰显）
- [ ] F5 default workflow 的 manifest 强制技能矩阵（track × phase）+ 穿梭框编辑形态
- [ ] F6 Loop 治理卡：L1/L2/L3 tile + 毕业制（升档被拒示例含 blockers 原文）、
      四滑杆（节奏/每日上限/在跑上限/token 上限）、超限策略、breaker 三态、
      human_gates / kill_criteria / allowlist（标「预留零消费」）/ denylist（标「真硬消费」）、
      草稿审批动作、readiness 分
- [ ] F7 AFK 执行参数：并发滑杆 1-8、重试 0-3、默认入队开关、镜像输入（datalist 候选）
- [ ] F8 凭证：两键（掩码态/未配置态）+ 配置/更新/删除 + write-only 输入 + 「怎么拿」引导
      + CODEX_HOME 只读行 + 优先级说明
- [ ] F9 技能健康：已装 41 / 未装 3 + 缺失清单 + `pipeline setup` 可拷命令
- [ ] F10 新建 change 入口（POST /api/changes 已存在：name/track/workflow 三字段表单形态）

### G. 观测面（后端已支持、前端从未呈现——设计必须给出容身之处，全部只读+命令 chip）
- [ ] G1 Channel worker 总线：3 个 worker（生命周期灯 running/idle/crashed + 活动态
      mid-turn/idle + provider）+ 2 条 forum thread（status/labels/assignees/评论数）
      + spawn/send 命令 chips
- [ ] G2 Tap 流量：2 个捕获会话（client/条数/status）+ 3 条记录摘要 + `pipeline tap start`
      命令 chip + CA 证书状态
- [ ] G3 Mem 会话检索：搜索框 + 3 条跨平台结果 + 恢复命令 chip
- [ ] G4 Doctor 保障面：11 项保障生效清单（10 ✓ 1 ✗ 降级）+ `pipeline doctor` chip
- [ ] G5 最近流转：6 条 history 降序
- [ ] G6 advance/handoff 等 CLI-only 能力以「命令卡」形式给出（`pipeline advance --dry-run`、
      `pipeline handoff`），不做假按钮

> 自检要求：交付报告里附一张 A1–G6 对照表，逐项写「出现在哪个视图/区块」。缺一项不许交。

## 5. 数据 fixture（三版逐字共用；时间基准 2026-07-14 15:00）

### 5.1 项目（3）
| root 尾段 | 活跃 | 备注 |
|---|---|---|
| pipeline-worklfow | 7 | 主项目 |
| workflow-plugin | 2 | 老仓 |
| sandcastle-images | 1 | 镜像仓，另有归档 |

### 5.2 changes（11 活跃 + 3 归档）
1. `dashboard-redesign-v10` · pipeline-worklfow · frontend · default · phase=verify ·
   ⌨ 终端 · **gate 绿「✓ 可以放行」**：verify_result=pass · agent_review=pass ·
   codex_review=pass · report=openspec/…/verification.md · build_sha=9c83db7 ·
   更新 13:02（等了 2h）。动作：→ 放行进入 ship ｜ ↩ 打回 build
2. `tap-ws-reconstruct` · pipeline-worklfow · backend · default · phase=verify ·
   ▦ 沙箱 · automation=paused（L2 跑完停人工）· **gate 红「等你判断」**：verify=pass ·
   agent_review=pass · **codex_review=fail** · worktree=~/.sandcastle/wt/tap-ws ·
   更新 07:00（等了 8h）。动作：↩ 打回 build（放行被前置校验拦）
3. `afk-merge-guard` · pipeline-worklfow · backend · **自定义 sec-hotfix** ·
   automation=**running** · 沙箱内阶段「构建修复」· 容器 sandcastle-afk-merge-guard ·
   attempts 0 · 更新 14:41。动作：⏹ 终止。日志 tail（示例 6 行，含
   `[14:41:22] $ vitest run --shard 2/4` `[14:41:37] ✓ 212 passed`）
4. `loop-budget-breaker` · pipeline-worklfow · backend · default · automation=**failed** ·
   attempts 2/2 · cause=verify-fail · 短成因「验证未过」· worktree 现场保留
   ~/.sandcastle/wt/loop-budget · 更新 13:30（等 1.5h）。动作：重试｜放弃｜回终端 chips
5. `mem-session-search` · pipeline-worklfow · chat · default · phase=explore ·
   ⌨ 终端 · **agent 态「等产出 · 缺 design_doc」** · 更新 11:20
6. `skill-dag-editor` · pipeline-worklfow · frontend · default · automation=**queued** ·
   depends_on=dashboard-redesign-v10 · 更新 14:05
7. `handoff-compress-custom` · pipeline-worklfow · backend · default ·
   automation=**conflict** · cause=conflict · 短成因「合并冲突 · 现场已保留」·
   preserved=~/.sandcastle/wt/handoff-c（等 6h）。动作：重试｜放弃｜进 worktree
8. `golden-oracle-sync` · workflow-plugin · pm · default · phase=spec ·
   **gate 绿**：design_doc ✓ · plan ✓（等 4h）。动作：→ 放行进入 build ｜ ↩ 打回 explore
9. `legacy-import-fix` · workflow-plugin · backend · default · automation=off ·
   cause=**cancelled** · 琥珀「已取消（人为终止）」· 更新 09:12。动作：回终端 chip（重跑）
10. `alpine-bash-passwd` · sandcastle-images · backend · default · phase=ship ·
    agent 态「等产出 · 缺 pr_url」· 更新 10:44
11. `i18n-hardcode-audit` · pipeline-worklfow · chat · **自定义 content-pipeline** ·
    phase=素材盘点 · agent 态 · 更新 12:15
- 归档（pipeline-worklfow）：`workflow-editor-canvas`、`codex-proxy-mitm`、`i18n-cleanup`

计数口径：全部 11 行里「等你动手 5」=（1、2、4、7、8）；「运行中 1」=3；
「等待中 5」= 6（queued）+ 5/10/11（agent）+ 9（cancelled 归等待中不进拍板）。
（B2 写「等待中 4」以 fixture 此行为准：**等待中 5**，全部 11。）

### 5.3 workflow 定义
- `default`（只读）：open→explore→spec→build→verify→ship→archive；复核门 explore/spec/verify
- `sec-hotfix 安全修复流`（编辑中，「未保存」）：定位漏洞 → 复现（产出 repro.md）→
  构建修复（confirm 门）→ 双评审（review 门；skills：patch-build → sec-review(依赖
  patch-build) → regression-suite(依赖 patch-build)；sec-review **未安装**）→ 合并
- `content-pipeline 内容流水线`：素材盘点 → 成稿（review 门）→ 发布

### 5.4 manifest 强制技能矩阵（default·节选 3 相位即可）
explore：chat=[brainstorming]；frontend=[frontend-design, brainstorming]；backend=[brainstorming]
spec：全 track=[writing-plans]；verify：frontend=[verification, visual-check]；backend=[verification]

### 5.5 hooks（四时机）
会话开始：session-context ✔ 可配（开）；你发消息：prompt-router ✔ 可配（开）；
agent 调工具：**gate 🔒 常开**、**interactive-skill-gate 🔒 常开**；
工具完成：post-verify ✔ 可配（关）、confirm-clear ◌ 暂不可配、decision-recorder ◌ 暂不可配

### 5.6 loops（3）
- `nightly-refactor` · L2 · active · claude-code · risk=medium · 就绪分 82 ·
  今日 3/8 轮 · token 上限 2.5M/日 · breaker=ok · prefix `rf-`→4 个匹配 ·
  human_gates=[verify 复核] · kill=[连续 3 次 verify-fail]。
  升 L3 被拒示例：blockers=「就绪分 82 < 90」「L2 无失败轮次 3/5」
- `docs-sync` · L3 · active · codex · risk=low · 就绪分 96 · breaker=**warn（今日 token 84%）** ·
  allowlist=docs/**（预留零消费）· denylist=packages/kernel/**（真硬消费）
- `sec-scan` · L1 · **draft 待审阅** · claude-code · risk=high · 就绪分 41 ·
  动作：批准并启用｜驳回（转暂停，现场保留）

### 5.7 AFK/凭证/技能/镜像
并发 4/8 · 重试 1 · 默认入队 off · 镜像 sandcastle:local（候选 sandcastle:local /
sandcastle:test / node:24-alpine）。凭证：CLAUDE_CODE_OAUTH_TOKEN=已配置
（sk-ant-oat01-••••f3aa · 文件 0600）；OPENAI_API_KEY=未配置。CODEX_HOME=~/.codex（只读行）。
技能：已装 41 / 未装 3（sec-review · load-test · i18n-audit）。

### 5.8 收件箱 6 条（降序）
① tap-ws-reconstruct · 8h · 「codex 评审未过，放行还是打回？」· 打回 build／查证据
② handoff-compress-custom · 6h · 「合并冲突已留现场」· 重试／放弃／进 worktree
③ sec-scan（loop 草稿）· 5h · 「agent 起草的 loop 等你审」· 批准／驳回
④ golden-oracle-sync · 4h · 「spec 齐了，进 build？」· 放行／打回
⑤ dashboard-redesign-v10 · 2h · 「verify 三轨全绿，发船？」· 放行 ship／打回
⑥ loop-budget-breaker · 1.5h · 「重试 2 次仍验证未过」· 重试／放弃／回终端

### 5.9 AFK 聚合流水（7 条，降序）
15:00 breaker 预警：docs-sync 今日 token 84%｜14:41 afk-merge-guard 进入「构建修复」｜
14:05 skill-dag-editor 入队（依赖未清）｜13:30 loop-budget-breaker 第 2 次重试失败
（verify-fail）落 failed｜11:52 tap-ws-reconstruct L2 跑完停人工（+3 commits 待复核）｜
09:12 legacy-import-fix 被人工终止｜08:47 handoff-compress-custom 合并冲突，现场保留

### 5.10 观测面
workers：`w-explore-01` claude-code·running·mid-turn·频道 feat-mem-search；
`w-review-02` codex·running·idle；`w-docs-03` claude-code·**crashed**（可 respawn）。
threads：`#设计评审` opened · labels[ui,v10] · @jefferySha · 12 评论；`#发布清单` processed。
tap 会话：`claude-2026-07-14-a` active·128 条·anthropic；`codex-2026-07-13-b` complete·
64 条·openai。记录例：POST /v1/messages · 200 · 1.2s · 4.1k tok；POST /v1/responses ·
200 · 0.8s · 2.3k tok；CONNECT api.anthropic.com:443 · tunnel。CA：已安装。
mem 结果例：claude`ses_a1b2`「重构 transition 表」昨天；codex`c-9f`「修 ws 帧重组」3 天前；
opencode`oc-11`「镜像瘦身」上周 → 恢复命令 `claude --resume ses_a1b2`。
doctor：11 项，10 ✓ + 1 ✗（tap CA 未装进 gemini——降级说明）。
最近流转：14:41 afk-merge-guard build→verify（沙箱）｜14:05 skill-dag-editor 入队｜
13:30 loop-budget-breaker verify-fail 回 build｜13:02 dashboard-redesign-v10 build→verify｜
11:20 mem-session-search open→explore｜09:12 legacy-import-fix 终止

## 6. 反 slop 底线（三版共同）
- 禁：紫渐变（除非该版参照品牌本身用）、emoji 当图标、每标题配 icon、
  「均匀深蓝底 #0D1117 + 通用青/紫霓虹 glow」组合、SVG 手画人物/实物、编造数据。
- 工票/车间视觉语言（穿孔、单据、邮票齿孔、图钉）已被产品负责人否决，禁用。
- 状态语义色可用且应当用（成功/危险/警告/运行中），但必须过对比度底线。
- 每版交付报告须写一句「form 来自内容的哪里」（视觉母题从产品哪个真实概念长出来）。

## 7. 工程约束
- 只新建/修改自己的一个 HTML 与 `design-demos/shots/` 下自己的截图，**禁止运行任何 git
  命令**，禁止改仓库其他文件。
- 自验：`npx playwright screenshot "file://<abs>#<hash>" design-demos/shots/<名>-N.png
  --viewport-size=1440,900 --wait-for-timeout=1200`，至少 3 张（默认视图 + 两个不同
  hash 视图），肉眼确认视图切换真实生效、无叠字溢出。
- 报告返回：文件绝对路径、截图路径、A1–G6 覆盖对照表、form 一句话、已知妥协点。
