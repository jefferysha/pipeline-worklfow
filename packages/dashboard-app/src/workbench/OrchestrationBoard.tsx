import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { WbHookEvent, WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'
import { Icon } from '../shell/Icon'
import { LOCKED_IDS, type HooksConfigState } from './HookTimeline'
import type { GateHookInfo } from './StepperRail'
import { outputPresentation } from '../shared/outputPresentation'
import './workbench.css'

/**
 * OrchestrationBoard（P0：编排画布「只读泳道骨架」，契约 scratchpad/p0-contract.md §1 + 补丁 v2）：
 * 工作台阶段横排从 StepperRail 的「阶段卡 + 段间连接件」升级为分层泳道看板——一列 = 一个流水线
 * 阶段，列内纵向分三区（技能序列 / Hook 时机 / 产出）。设计定稿 design-demos/v11b-prod-lanes.html。
 *
 * 恒定边界（P0 立下、至今未变，改前先读）：**零端点调用——本组件不认识 fetch**。所有写回一律
 * 经回调冒泡给宿主 WorkbenchView（它持 def 草稿 + dirty/save 四件套），组件只做「输入 → 校验 →
 * 补丁」。P0 当初另外三条边界——无拖拽（阶段列重排 / 技能卡跨列搬）、无依赖 chip（depends_on
 * DAG 的第二行）、Hook 区恒折叠成一行摘要——都已分别在 P1-P4 落地解除，口径见下方各分节。
 * StepperRail 已上线的真功能一件都不许在换形态时静默丢（补丁 v2 守门口径）：
 * 门徽章 popover（v6 T11）与「+ 添加阶段」（验收反馈#4）原样移植，行为契约逐字不变。
 *
 * 纯展示组件：不吃原始 WorkflowDef，只吃 WorkbenchView 投影好的 BoardLane 视图模型——名称回退
 * （label→i18n phases→id）、技能去重、forward 边解析、真实计数/running 折叠全在投影层做完，
 * 本组件零业务判断（同 StepperRail 的分工纪律）。popover 开关是纯 UI 交互态，留在本组件内部。
 *
 * ── P1（契约 scratchpad/p1-contract.md §2）：阶段名 / 门 / 产出真可编 + 删阶段入口 ──
 * 仍然「零端点调用」：本组件不认识 fetch，编辑一律经 onLaneEdit(laneId, patch) 冒泡给宿主
 * （WorkbenchView 持 def 草稿 + dirty/save 四件套），删阶段经 onRemoveStage。分工不变：
 * 组件只做「输入 → 校验 → 补丁」，业务落地（patch 合并回 WbStepDef、转换边重连、写回
 * POST /api/workflows/:name）全在宿主侧。
 *
 * P1 三条口径（都是既有产品决策的对齐，不是本轮新发明，改之前先读这段）：
 *   ① **门是二态 `null ↔ 'review'`，不是三态循环**：逐字对齐 StepEditor.tsx:67-69 的 toggleGate。
 *      `'confirm'` 只在 default（只读态）出现——自定义 workflow 的编辑语义按 demo 已拍板为
 *      「review 单档」（见 StepEditor.tsx:20-23 头注释）。造第三态 = 同一 app 两套门语义。
 *      故 LanePatch.gate 的类型里虽保留 'confirm'（读回来的值可能是它），本组件永不发出它。
 *   ② **产出校验照抄 StepEditor**（FIELD_RE / 重名 / 错误 i18n key / 空值提交视同取消），
 *      理由见 FIELD_RE 上方注释：画布与编辑卡改的是同一个 outputs 面，规则分叉 = 两处打架。
 *   ③ **删阶段只做入口 + 确认弹窗 + 回调**：删掉一个 step 会让别的 step 的 transitions 指向死
 *      id（kernel validate 直接拒），边重连是宿主的活，本组件碰都不碰。
 *
 * 诚实门（契约 §0.6）在 P1 的落点：**只在 readonly===false 且宿主真给了回调时才出真控件**。
 * default 的阶段/门/产出**没有写端点**（结构由运行时 review_phases / transition-table 硬编码），
 * 故只读态**逐字保持 P0 的满屏 🔒 呈现：一个编辑控件都不渲染**（含门开关）。
 *
 * 「只读列干脆不渲染门开关」是真机截图复核后的收口（2026-07-15 守门），别再改回去：
 *   · 冗余——该列已有「复核门」徽章（状态读数）+「🔒 固定」徽章（为什么不能改），
 *     一个禁用开关不提供任何新信息，却仍读作「一个可以拨的控件」；
 *   · 定稿口径——v11b-prod-lanes.html 的 default 泳道只有徽章、没有开关；
 *   · product register 明禁 inactive 态上的满饱和主色，而 SWITCH 的 on 态正是满饱和蓝。
 * 契约 §0.6 的「禁用 + 解释」是**允许**写法而非**要求**：徽章已经把话说全时，不渲染比渲染一个
 * 禁用控件更干净。这与「没有门的只读列不长出加门开关」是同一条逻辑，只是再走一步。
 * 只读态的门徽章 + hover 解释 popover（v6 T11 既有特性）原样保留，一个都不许丢。
 *
 * ── P2（契约 scratchpad/p2-contract.md §3 + 补丁 v2）：约束式拖拽 + depends_on ──
 * 技能卡列内排序 / 跨列搬（onSkillMove）、depends_on 设改清（onSkillDep）、阶段列重排
 * （onStageReorder）。分工一如既往：本组件只报「谁、从哪、到哪、落在谁前后」，语义落地
 * （转换边线性重连、跨列搬的依赖清理、depends_on 增改删）全在宿主的纯函数里。
 *
 * P2 四条口径（都是既有决策的延伸，改前先读）：
 *   ① **default 一个拖手柄都不长**（契约 §2，比 P1 的诚实门更进一步）：default 的强制技能是
 *      manifest 的**扁平 token 列表，无排序语义**（P1 已因此不编号、挂「🔒 无序」徽章）——
 *      给它拖手柄 = 谎报「这里存在执行顺序」，比给个禁用按钮更坏。阶段结构同理（无写端点）。
 *      故三个拖拽 prop 全部走 `回调 !== undefined && !readonly` 的 canEdit 同款把关。
 *      落地上还多一层物理保障：default 的 skills 恒为 undefined（宿主投影层置空）→ 整个技能区
 *      交给 renderSkillZone，本文件的拖拽代码路径压根走不到。
 *   ② **不自造 DAG 环检测**：循环依赖由 kernel validate 在保存时拒并把原文上抛
 *      （SkillChain.tsx:24-25 既有纪律）。本组件连「A 依赖 B 时 B 不许依赖 A」这种一跳环都不拦
 *      ——半吊子校验会与 kernel 的权威判定分叉，出现「前端拦了但其实合法 / 前端放行但保存报错」。
 *      候选池只做**无争议的过滤**：排除自己（自指）、排除已有依赖（重复加同一条无意义）。
 *   ③ **多依赖必须全渲染**（补丁 v2 ②）：kernel 的 `StepDef.skills[].depends_on` 是 `string[]`，
 *      可多依赖。只渲染第一条 → 用户一点就把 N 条覆写成 1 条 = **静默丢数据**，诚实门红线。
 *      故 skillDeps[skillId] 有 N 项就渲染 N 个 chip，每个 chip 各自改/清自己那条（prevDep 定位）。
 *   ④ **拖影不压窄名字**（契约 §0.1 在拖拽态的延伸）：只有拖手柄 `draggable`（真实语义：只有
 *      抓手柄才拖得动），但 dragstart 处理挂在**卡/泳道根**上并 setDragImage(整卡/整列)——
 *      否则默认拖影只是那个 ⠿ 字形，或是被浏览器压缩的手柄框。
 *
 * ── P3（契约 scratchpad/p3-contract.md §2）：Hook 卡片化展开 ──
 * P0/P1 的一行折叠摘要长出可展开的卡片体：4 时机分组（EVENT_ORDER 固定序，空组也画节点）+
 * 每时机下的 hook 卡（人话名 + 描述 + 三档态）。默认开合 = 该列 running（定稿口径：当前在跑的
 * 阶段列展开、其余折叠），用户手动开合后以 hookOpen 覆盖。
 *
 * P3 四条口径（改前先读）：
 *   ① **Hook 卡一个拖手柄都不长**（契约 §1 诚实门，本期最重要的一条）：定稿 demo 的 hkcard 可拖，
 *      拖完弹 toast 说「执行序在 hooks.json 定义（⌘ 终端，无 app 写端点）· 仅本地演示」——**生产版
 *      不许这么做**。hook 执行顺序 / 新增 hook / 改时机注册**全都没有 app 写端点**（spec §1.1），
 *      能拖但不落盘 = 假交互，比给个禁用控件更坏（同 P2 口径 ① 对 default 技能的判断）。
 *      故本区**零拖手柄**，改为底部一行 ⌘ 提示指路 hooks/hooks.json。P2 刚落地的技能卡拖拽
 *      （drag/drop 状态机、DropHint、primeDrag）**刻意一行都不复用到 hook 卡上**。
 *   ② **三档态判定逐字对齐 HookTimeline.tsx:179-212**，不自造：
 *      `locked = !configurable && LOCKED_IDS.has(id)` / `pending = !configurable && !locked`。
 *      LOCKED_IDS 从 './HookTimeline' import（唯一真相源）——在本文件重抄一遍 id 字符串，
 *      就会出现「时序线认它是锁、画布认它可配」这种同一 app 两套判定。
 *      EVENT_ORDER 则是**本地重声明**：HookTimeline 没 export 它，而本轮不许改那个文件
 *      （契约「严禁」清单）。两处必须同序，改一处请连同另一处改。
 *   ③ **locked/pending 不渲染开关**（比 HookTimeline 更进一步）：那边给的是 checked+disabled 的
 *      恒开开关，这里只留徽章。理由与文件头 P1「只读列干脆不渲染门开关」逐字同一条——徽章
 *      （「强制常开」/「暂不可配」）已经把状态与原因说全，一个禁用开关不提供新信息却仍读作
 *      「一个可以拨的控件」。**判定同源、呈现从本文件的既定纪律**，两者不冲突。
 *   ④ **描述/提示语的宽度要设上限**（零截断约束 ①在散文上的另一面）：列宽是
 *      minmax(340px,max-content)，而 CJK 散文的 max-content = 整句不折行的宽度——描述若不设
 *      max-w，一句话就能把整列撑到几百 px。**名字仍然零截断**（nowrap 且无 max-w，照旧参与
 *      max-content）；受限的只有可自由折行的散文，它们折行不丢字，与「名字被切掉」是两回事。
 *
 * ── P4（契约 scratchpad/p4-contract.md §2）：补加/删技能 + nonempty guard ──
 * P0-P3 把「拖排 + 依赖」做全了，却**从没做过加/删技能**——那两件真能力一直只存在于 SkillChain
 * （sheet 里的「技能」页签）。P4 要合并五页签退役 SkillChain，故必须**先在画布补出去处**：
 * 缺口不补就退役 = 拿「合并 IA」当借口删功能（契约 §1 的立论）。同理 nonempty-output guard
 * 是 StepEditor 唯一还没被画布接管的面（label/gate/outputs 已在 P1 接管），一并补上。
 *
 * 分工一如既往（同 P1 删阶段 / P2 拖拽的既定纪律）：本组件只发「谁、加/删哪个技能、开还是关」，
 * 语义落地全在宿主——
 *   · 加：onSkillAdd(stageId, skillId) → 宿主往 step.skills 追一条 WbSkillRef（缺省无 depends_on，
 *     依赖靠 P2 的依赖 chip 单独设——popover 刻意不带「依赖于」下拉：那是 SkillChain 面板的形态，
 *     画布上依赖已有自己的第一等公民入口，同一件事两个入口会分叉）；
 *   · 删：onSkillRemove(stageId, skillId) → **依赖级联清理归宿主**（照 SkillChain.tsx:301-317
 *     的 removeSkill：清掉别的技能里指向被删技能的 depends_on，清空后落为无键）。本组件碰都不碰
 *     ——同 P1「删阶段的转换边重连是宿主的活」的同一条分工；
 *   · guard：onLaneGuard(stageId, nonempty) → 宿主往 step.guards 增删 { type:'nonempty-output' }
 *     （照 StepEditor.tsx:71-78 的 toggleNonempty：只过滤这一种，tasks-at-least 原样保留）。
 *
 * P4 四条口径（改前先读）：
 *   ① **registry 未就绪 → 「+ 技能」禁用 + 说明，不谎报可加**（契约 §2 的诚实门本体）：
 *      skillRegistry === null（宿主在拉/拉失败）**与 undefined（宿主压根不描述这个数据面）
 *      同等对待**——两者都意味着「此刻没有候选池」，而一个点开是空的加钮比禁用的更坏。
 *      这是本文件唯一一处**渲染禁用控件**而非不渲染：与「只读列不渲染门开关」不冲突——那边
 *      不渲染是因为徽章已把「为什么不能改」说全了，这里「能加、只是库还没就绪」是**暂态**，
 *      抹掉入口会让用户以为画布压根不支持加技能（把暂时不可用误读成能力缺席）。故留控件 + 说明。
 *   ② **不自造技能 id 字符集校验**（刻意**不**照搬 SkillChain.tsx:49 的 SKILL_ID_RE）：
 *      那条 `^[a-zA-Z0-9_-]+$` 是**过时的**——kernel 早已放宽为
 *      SKILL_IDENT_RE `^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$`（见 kernel/src/workflow/validate.ts:32-37
 *      的注释：skill-tracker.sh 落的是命名空间全名，workflow 必须能声明带冒号的 id），
 *      照搬会把 `superpowers:tdd` 这种**合法**候选禁掉。这正是文件头 P2 口径 ② 说的
 *      「半吊子校验会与 kernel 的权威判定分叉」的活样本：真越界的 id 由 kernel validate 在保存时
 *      拒并把原文上抛（WorkbenchView.readSaveErrors 已接线），前端不复刻。
 *   ③ **default 一个都不长**（比 P2 口径 ① 再走一遍）：default 的强制技能是 manifest 的扁平
 *      token 集合（含 `opsx:propose|openspec-propose` 这种 `|` 备选），加删走 P1 的 mandatory 面
 *      （renderSkillZone 交给宿主），语义与写端点都与 workflow def 的 skills 不是一回事。
 *      故三个新入口全走 `回调 !== undefined && !readonly` 的 canEdit 同款把关；`|` 备选的拆分
 *      逻辑一行都不搬过来——自定义 workflow 的 skills 是单 id。
 *   ④ **「未装」徽章的判定照 SkillChain**（installedMap.get(name)?.installed === false，
 *      SkillChain.tsx:276-299 同一条）：registry 未就绪 → 查询面为空 → 全部「不可判」→ 一个徽章
 *      都不显示（**保守不谎报**，同那边的既定纪律：不可判时说「已装」和说「未装」都是编的）。
 *      徽章不只挂 popover 候选，**已加入本列的技能卡上也挂**：SkillChain 退役后画布是自定义
 *      workflow 技能的唯一出口，「你 workflow 里这个技能本机没装」是既有的真信号，不该随页签蒸发。
 *
 * 落点提示的视觉（契约 §0.4「禁 side-stripe 彩色左右边框」在拖拽态的落点）：
 *   · 技能卡（纵向列表）= 顶/底 box-shadow 线（定稿 .skcard.dropbefore 等值搬运）；
 *   · 技能区容器（空列/末尾）= 虚线 outline（定稿 .cardlist.dropinto 等值搬运）；
 *   · 阶段列（横向列表）**刻意不照抄定稿**：定稿用的是 `.lane.dropbefore{box-shadow:-5px 0 0 -1px}`
 *     ——那正是 §0.4 明禁的 side-stripe（box-shadow 画出来与 4px 彩色左边框像素级等同，用 box-shadow
 *     绕开 border 的禁令是钻字面空子）。改用**插入位游标**：3px 全高圆头竖线画在列间 46px 的
 *     gap 里（[data-wb-drop-caret]，见 workbench.css P2 段）。它不是卡上的装饰边，而是列间的
 *     插入标记——横向列表的插入指示就该长这样（同 Figma/Notion 的列插入线），既守禁令也更准确。
 *     代价：首列之前的那道游标会落在横向滚动容器的左侧裁切区外，故**可拖列时**才把看板 grid 的
 *     左右内边距撑到 24px（`px-6`），给首/末列之外的插入位留出槽——不可拖时零布局变化。
 *
 * 三条硬约束（违反即返工，见契约 §0）：
 *   ① 名称零截断：技能全名含命名空间（superpowers:test-driven-development）一行完整显示，
 *      禁 truncate/ellipsis/overflow-hidden+定宽。物理保障 = 列宽 minmax(340px,max-content)：
 *      max-content 让列自动撑到放得下本列最长的名字，340px 下限让短列不瘦成条。名字节点
 *      whitespace-nowrap + flex-none + 不设 min-w-0，宽度才会参与 max-content 计算。
 *      命名空间前缀用 text-text-3 弱化「但完整可见」——弱化不是省略。
 *      P1 补充：**编辑态输入框同样受这条管**——阶段名/产出的就地输入框都不设定宽，改用原生
 *      `size`（按草稿字符数算，等宽字体下 1ch ≈ 1 字符）自适应内容，输入到一半被切掉是同一
 *      条约束的另一种破法。
 *      注：StepperRail 旧版技能 chips 走 shortSkill() 短名化 + 「+N」截断计数，那正是本轮要
 *      消灭的反例（grill-w… / test-driven-develo…），移植时刻意不带过来。
 *   ② 状态走 data-*（data-state/data-locked/data-forward/data-gated）+ aria-current + data-[…]:
 *      变体，不用条件类名拼样式；连接件由 CSS 认 data-forward 画（见 workbench.css P0 段）。
 *      P1 补充：门开关状态走 aria-checked（同 wb-ed-gate-sw），不拼条件类名。
 *   ③ 泳道不是卡片：只有 fill+border 无 shadow（卡片才有 shadow-sm），避免卡中卡。
 *
 * GSAP：P0 不加入场编排。running 脉冲沿用既有 data-anim="wb-gloss" 约定——补间挂在
 * WorkbenchView 侧（WorkbenchView.tsx:634 起的 matchMedia + repeat:-1 循环），本组件只负责在
 * running=true 时渲染承载元素。承载元素刻意包一层 absolute inset-0 的 overflow-hidden 遮罩：
 * 光泽要被裁在泳道头内（否则扫到邻列上去），而遮罩是名字节点的**兄弟**不是祖先——约束 ① 的
 * overflow-hidden 禁令因此零妥协（顺带 GSAP 取的 gloss.parentElement 宽度正好 = 泳道头宽）。
 */
export interface BoardLane {
  id: string
  /** 展示名（label 优先 → default 走 i18n phases.* → 兜底 id）。投影层已算好。 */
  name: string
  gate: 'review' | 'confirm' | null
  /**
   * 技能全名 id 序（去重后，含命名空间前缀，禁短名化）。
   * `[]` = 本阶段确实没有技能（自定义 workflow 的真实空态 → 渲染「（空）」）。
   * `undefined` = 技能不由本数据源描述 → **整段不渲染**（诚实占位，同 hooksCount 纪律）。
   * 后者专为 default：它的 workflow 定义里 skills 恒为空数组，但真实的强制技能存在
   * manifest 的 `phase.track` 矩阵（GET /api/config）里——渲染「（空）」等于谎报「无技能」。
   * 该矩阵由 P1 的 renderSkillZone 接入（宿主投喂，画布本身不认识 /api/config）。
   */
  skills?: string[]
  /**
   * 本列每个技能的 depends_on（P2 补丁 v2 ①）：键 = 技能 id，值 = 它依赖的技能 id 序。
   * **只含同列内的依赖**——跨 step 引用是 kernel 的校验期错误（kernel/src/workflow/types.ts
   * :SkillRef 注释明写），投影层已过滤，本组件不再二次判断（同 P0 的零业务判断分工）。
   *
   * 缺键 / 空数组 = 该技能无依赖；`undefined`（整个字段不给）= 数据面不描述依赖 → 不渲染
   * 任何依赖 chip（诚实占位，同 hooksCount / skills 的既定纪律：没有数据就不画，不谎报「无依赖」）。
   *
   * 为什么是 `Record` 而不是把 `skills` 改成对象数组：`skills: string[]` 是 P0/P1 的既有契约，
   * 既有 fixture 全按它写；加一个可选旁路字段是纯增量，改数组元素类型则要推翻所有既有用例。
   */
  skillDeps?: Record<string, string[]>
  /** 产出字段名序。 */
  outputs: string[]
  /**
   * 该列是否已开 nonempty-output guard（P4）：即 step.guards 里是否存在 { type:'nonempty-output' }
   * （判定照 StepEditor.tsx:64 的 hasNonempty，投影层已算好——本组件不认识 GuardConfig 的形状，
   * 同 P0 的零业务判断分工）。
   *
   * `undefined` = 数据面不描述 guard → **不渲染该开关**（诚实占位，同 hooksCount / skills /
   * skillDeps 的既定纪律：没有数据就不画，不谎报「这一列的 guard 是关着的」）。
   * 注：tasks-at-least 那类其余 guard 不由本字段表达，也不该被本开关碰——宿主在增删
   * nonempty-output 时把它们原样保留（StepEditor.tsx:71-78 的既定语义）。
   */
  nonemptyGuard?: boolean
  /** 该阶段启用 hook 数；undefined = 数据面未就绪 → 隐藏该段（诚实占位，不谎报数字）。 */
  hooksCount?: number
  /** 锁 hook 数（gate/interactive-skill-gate 恒 2）；hooksCount 未就绪时一并隐藏。 */
  hooksLocked?: number
  /** 与下一列之间的转换事件名；无 forward 边 = null → 不画连接件（诚实：边不存在就不画）。 */
  linkEvent: string | null
  /** 该阶段真实 change 计数。 */
  count: number
  /** 该阶段是否有 automation==='running' 的 change。 */
  running: boolean
}

/**
 * 阶段字段的就地编辑补丁（P1）：**只含被改字段**，未触碰字段由宿主原样保留
 * （同 StepEditor「除本卡触碰的面之外一律展开透传」的既有纪律）。
 *
 * · `gate` 的类型保留 'confirm' 是为了能表达读回来的 default 值，但本组件**永不发出它**
 *   ——门是二态 `null ↔ 'review'`（见文件头 P1 口径 ①）。
 * · `outputs` 是**字段名序 string[]**，不是 kernel 的 WbFieldRef[]：画布只认名字，
 *   新产出的缺省类型（StepEditor.tsx:108 既定的 `type: 'string'`——FieldRef 三型里最通用的
 *   一档）由宿主在转回 WbFieldRef 时补。本组件不认识 FieldRef 三型，同 P0 的零业务判断分工。
 */
export interface LanePatch {
  label?: string
  gate?: 'review' | 'confirm' | null
  outputs?: string[]
}

export interface OrchestrationBoardProps {
  lanes: BoardLane[]
  /** true = default workflow：满屏 🔒 只读态（禁拖手柄、锁徽章、产出标固定）。 */
  readonly: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  /** 看板容器 aria-label，如「release-train 阶段」。 */
  label: string
  /** 不传 = 禁用态（default 只读）。照 StepperRail 既有 disabled={!onAddStage} 语义。 */
  onAddStage?: () => void
  /** 门徽章 popover 的静态解释内容（gate/interactive-skill-gate 强制常开，决议 #2）。 */
  gateHooks?: readonly GateHookInfo[]
  /**
   * 阶段字段就地改（P1）。**不传 = 只读**（default）；`readonly === true` 时同样不出真控件
   * ——两者任一成立即锁死，宿主传错一个也不会漏出假可写面。
   * patch 只含被改字段，未触碰字段由宿主保留。
   */
  onLaneEdit?: (laneId: string, patch: LanePatch) => void
  /**
   * 删阶段（P1）。不传 = 不渲染删除入口；`readonly === true` 时同样不渲染。
   * 本组件只负责「入口 + 确认弹窗 + 回调」——删除引发的**转换边重连由宿主实现**（见文件头 ③）。
   */
  onRemoveStage?: (laneId: string) => void
  /**
   * 技能区的替代内容（P1）。提供时**渲染它取代默认技能区**；与 `BoardLane.skills === undefined`
   * 配套使用——default 的强制技能存在 manifest 的 `phase.track` 矩阵里，不是 workflow def 的
   * skills。数据面归宿主：这样画布本身不必认识 /api/config（同 P0 的零业务判断分工）。
   */
  renderSkillZone?: (laneId: string) => ReactNode
  /**
   * 技能卡拖动落位（P2）：列内排序 or 跨列搬。**不传 = 不给拖手柄**；`readonly === true` 时同样
   * 不给（default 的强制技能无排序语义，见文件头 P2 口径 ①）。
   *
   * 本组件只报「谁、从哪、到哪、落在谁前后」：数组次序怎么改、跨列搬要清哪些失效依赖、
   * 目标列已有同名技能时怎么 no-op，全在宿主的 moveSkillInDef 里（同 P1 删阶段的边重连分工）。
   * 唯一在本组件落地的是**跨列同名的当场拦截 + 提示**——那不是业务规则，是「别让用户以为搬成功了」。
   */
  onSkillMove?: (move: {
    skillId: string
    fromStage: string
    toStage: string
    /** 落在这个技能之前/之后；null = 落到该列末尾。 */
    refSkillId: string | null
    after: boolean
  }) => void
  /**
   * 设/清 depends_on（P2 补丁 v2 ②）。**不传 = 不给依赖入口**；`readonly === true` 时同样不给。
   * `prevDep` 定位「动的是哪一条」——多依赖时缺了它就只能整条覆写 = 静默丢数据（文件头口径 ③）：
   *   · dep !== null && prevDep === null → 新增一条依赖
   *   · dep !== null && prevDep !== null → 把 prevDep 那条改成 dep
   *   · dep === null && prevDep !== null → 清掉 prevDep 那条
   */
  onSkillDep?: (stageId: string, skillId: string, dep: string | null, prevDep: string | null) => void
  /**
   * 加技能到某列（P4）：从 registry 候选池选一个。**不传 = 不给「+ 技能」入口**；
   * `readonly === true` 时同样不给（default 的强制技能加删走 P1 的 mandatory 面，见文件头 P4 口径 ③）。
   *
   * 只发「哪一列、加哪个 id」：追进 step.skills 的 WbSkillRef 怎么造（缺省无 depends_on）、
   * 目标列已有同名时怎么 no-op，全在宿主（同 onSkillMove 的既定分工）。候选池已排除本列已有，
   * 故正常路径下不会重复加。
   */
  onSkillAdd?: (stageId: string, skillId: string) => void
  /** 打开该阶段的完整 Skill 编排器；依赖、串并行与拖拽都在同一处完成。 */
  onOpenSkillEditor?: (stageId: string) => void
  /**
   * 删技能（P4）。**不传 = 不给删除入口**；`readonly === true` 时同样不给。
   * **依赖级联清理归宿主**（清掉别的技能里指向被删技能的 depends_on，照 SkillChain.tsx:301-317）
   * ——同 P1 删阶段的边重连分工，本组件碰都不碰（见文件头 P4）。
   */
  onSkillRemove?: (stageId: string, skillId: string) => void
  /**
   * 技能候选池（P4，宿主投喂 GET /api/skills/registry 的结果——本组件不认识 fetch，同文件头 P1）。
   *
   * `null`（在拉/拉失败）与 `undefined`（宿主不描述这个数据面）**同等对待**：都 = 此刻没有候选池
   * → 「+ 技能」**禁用 + 说明**，不谎报可加（契约 §2 诚实门，见文件头 P4 口径 ①）。
   * 另用作「未装」徽章的查询面：未就绪 → 全部「不可判」→ 一个徽章都不显示（保守，见口径 ④）。
   */
  skillRegistry?: WbSkillEntry[] | null
  /**
   * 产出非空 guard 开关（P4，每列一个）。**不传 = 不给该开关**；`readonly === true` 时同样不给；
   * `BoardLane.nonemptyGuard === undefined`（数据面不描述）时亦不给。
   * 增删 { type:'nonempty-output' }（并保留其余 guard）是宿主的活——照 StepEditor.tsx:71-78。
   */
  onLaneGuard?: (stageId: string, nonempty: boolean) => void
  /**
   * 阶段列拖动重排（P2）。**不传 = 不给列拖手柄**；`readonly === true` 时同样不给
   * （default 的阶段结构由运行时 review_phases / transition-table 硬编码，无写端点）。
   * 转换边的线性重连是宿主的活（reorderStagesInDef），本组件碰都不碰——同 P1 删阶段口径 ③。
   */
  onStageReorder?: (fromId: string, toId: string, after: boolean) => void
  /**
   * Hook 数据面（P3，per-root，**与 workflow 无关**——hooks.json 是运行时配置，不属于 def 草稿，
   * 故 default 只读态下本区照常可切，与 readonly / canEdit 全线无关，见 HookTimeline.tsx:26-29）。
   *
   * **不传 = Hook 区保持 P0 的一行折叠摘要、不可展开**（诚实占位：没有 hook 元数据就没有卡可画，
   * 展开一个空壳等于谎报「本阶段没有 hook」——同 BoardLane.skills/hooksCount 的既定纪律）。
   * 类型直接复用 HookTimeline 导出的 HooksConfigState（宿主的 useHooksConfig 返回值原样透传），
   * 不另造一套：阶段卡 hooksCount、sheet 里的时序线、本区三处吃的必须是同一份矩阵。
   *
   * 注：这个 prop **不破坏「本组件不认识 fetch」**（文件头 P1）——它是宿主持有的状态对象，
   * 写回走它自带的 toggle 闭包（HookTimeline 的 useHooksConfig 里 POST + 乐观更新 + 回滚）。
   * 本组件只转发「哪个 hook、哪个阶段、开还是关」，零端点知识。
   */
  hooks?: HooksConfigState
  /** 看板级工具条的额外内容（P1 用于放 track 选择器）。不传则不渲染工具条。 */
  toolbarSlot?: ReactNode
}

/**
 * 时序线固定四时机（P3）：列序 = 会话生命周期序；**空组也画节点**——时序线是解释模型，
 * 不随数据缺列（逐字对齐 HookTimeline.tsx:32-33 的同名常量）。
 *
 * 为什么是重声明而不是 import：HookTimeline 没 export 它，而本轮契约的「严禁」清单里就有
 * HookTimeline.tsx——加个 export 也是改它。LOCKED_IDS 那边已 export 故直接 import（真相源唯一）。
 * 两处必须同序，改一处请连同另一处改。
 */
const EVENT_ORDER: readonly WbHookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']

/** 拖动中的载荷。kind 把「拖列」与「拖技能卡」分流——两者的落点判定与目标完全不同。 */
type DragPayload = { kind: 'lane'; stage: string } | { kind: 'skill'; stage: string; skill: string }

/**
 * 当前落点提示。`into` = 落到该列技能区的末尾（空列/末尾空白处），对应 refSkillId=null。
 * 同一时刻只有一个落点（拖拽本来就只有一个光标），故用单值而非集合。
 */
type DropHint =
  | { kind: 'lane'; stage: string; after: boolean }
  | { kind: 'skill'; stage: string; skill: string; after: boolean }
  | { kind: 'into'; stage: string }

/**
 * 全名拆分：`superpowers:tdd` → 前缀 `superpowers:` + 本体 `tdd`。
 * 定稿核心 ①：前缀不砍、不省略，只在渲染时弱化配色——所以本函数返回的两段拼回去必须
 * 逐字等于入参（技能卡名字节点的 textContent 全等断言依赖这一点）。
 */
function splitName(id: string): { ns: string; base: string } {
  const ix = id.lastIndexOf(':')
  return ix >= 0 ? { ns: id.slice(0, ix + 1), base: id.slice(ix + 1) } : { ns: '', base: id }
}

/**
 * 产出字段名校验（P1）：与 StepEditor.tsx:43 **同一条规则**（往上追是 kernel validate.ts 的
 * IDENT_RE / server 路由层 name 校验同一条线；G16：serialize 原样写出、parse 用 (\S+) 读回，
 * 字符集越界 =「保存成功、下次打不开」，客户端先挡一道）。
 * 刻意照抄常量而不是跨组件 import 一个私有 const，也刻意不另立标准：画布与编辑卡改的是同一个
 * outputs 面，两处规则一旦分叉就会出现「画布加得进、编辑卡打不开」这种自相矛盾的行为。
 */
const FIELD_RE = /^[a-zA-Z0-9_-]+$/

// ── 徽章原子类合集（demo .minibadge/.tag 等值搬运；字号 ≥11.5px 是契约 §0.2 下限）──
const BADGE_BASE = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-extrabold whitespace-nowrap'
const BADGE_LOCK = 'border-border-2 bg-fill text-text-3'
// 区头右侧小徽章：11.5px（demo .minibadge）——比泳道头徽章再小半档，但仍在契约下限上。
const MINI_BASE = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-extrabold whitespace-nowrap'
const MINI_RW = 'border-green-b bg-green-t text-green-d'
const MINI_RO = 'border-border-2 bg-fill-2 text-text-3'
const ZONE_TITLE = 'text-[13px] font-[750] whitespace-nowrap text-text-2'

// ── P1 编辑控件原子类 ──
// 门开关：StepEditor.tsx:51-52 的 SWITCH **等值搬运**（同一 app 同一控件词汇——那边是模块私有
// const，跨组件 import 私有实现不合适，故照抄；改这里请连同 StepEditor 一起改）。
const SWITCH =
  "relative h-5 w-[34px] flex-none cursor-pointer rounded-full border border-border-2 bg-fill-2 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-card after:shadow-md after:transition-transform after:content-[''] aria-checked:border-(--accent) aria-checked:bg-(--accent) aria-checked:after:translate-x-3.5 disabled:cursor-not-allowed disabled:opacity-55"
// 就地编辑输入框共用的边框/焦点环（StepEditor INPUT 同款焦点词汇；**刻意不设宽度类**——
// 宽度由原生 size 按内容算，见文件头硬约束 ①）。
const INPUT_BASE =
  'flex-none rounded-lg border border-border bg-card text-text transition-[border-color,box-shadow] hover:border-border-2 focus:border-(--accent) focus:ring-[3px] focus:ring-(--ring-blue) focus:outline-none'
// 产出 chip 上的 ×（StepEditor.tsx:186 的移除钮同款）
const OUT_X =
  '-mr-[3px] inline-grid h-4 w-4 flex-none cursor-pointer place-items-center rounded-[5px] p-0 text-[13px] leading-none text-text-3 transition-colors hover:bg-red-t hover:text-red-d'
// 「+ 添加」产出（demo .outs .add 等值搬运）
const OUT_ADD =
  'cursor-pointer rounded-lg border-[1.5px] border-dashed border-border-2 px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap text-text-3 transition-colors hover:border-green-b hover:text-green-d'
// 泳道头的低调删除入口（demo .ecard .rm 等值搬运）
const LANE_RM =
  'inline-grid h-[22px] w-[22px] flex-none cursor-pointer place-items-center rounded-md p-0 text-[15px] leading-none text-text-3 transition-colors hover:bg-red-t hover:text-red-d'
// 确认弹窗动作条（WorkbenchView 的 BTN_GHOST/BTN_DANGER 同款词汇）
const BTN_GHOST =
  'cursor-pointer rounded-md border border-border bg-transparent px-4 py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-text-3 hover:text-text'
const BTN_DANGER =
  'cursor-pointer rounded-md border border-red-b bg-transparent px-4 py-2 text-[12.5px] font-bold text-red-d transition-colors hover:bg-red-t'

// ── P2 拖拽/依赖原子类（demo .grip/.g/.depchip/.depadd 等值搬运）──
/** 阶段列拖手柄（demo .lane-head .grip）。 */
const GRIP_LANE =
  'flex-none cursor-grab rounded-[5px] p-0.5 text-[16px] leading-none text-text-3 select-none transition-colors hover:bg-fill hover:text-text-2 active:cursor-grabbing'
/** 技能卡拖手柄（demo .ecard .g）。 */
const GRIP_SK =
  'flex-none cursor-grab rounded-[5px] text-[15px] leading-none text-text-3 select-none transition-colors hover:text-text-2 active:cursor-grabbing'
/** 依赖 chip（demo .depchip）。字号 12px 在契约 §0.2 徽章下限（11.5px）之上。 */
const DEP_CHIP =
  'inline-flex flex-none cursor-pointer items-center gap-1 rounded-[7px] border border-purple-b bg-purple-t px-2 py-[3px] font-mono text-[12px] font-[650] whitespace-nowrap text-purple-d transition-colors hover:border-purple-d'
/**
 * 「⟼ 设依赖」虚线钮（demo .depadd）：hover 才显（opacity 0 → .9），避免无依赖的卡上常驻一个弱钮。
 * `focus-visible:opacity-100` 是**必须的补丁而非装饰**：opacity:0 的按钮仍可被 Tab 聚焦，
 * 只给 hover 会让键盘用户聚焦到一个看不见的控件上（demo 是鼠标演示，没管这条）。
 */
const DEP_ADD =
  'flex-none cursor-pointer rounded-[7px] border border-dashed border-border-2 bg-transparent px-2.5 py-[3px] text-[12px] leading-[1.4] font-semibold whitespace-nowrap text-text-3 opacity-0 transition-opacity group-hover/sk:opacity-90 hover:border-purple-b hover:text-purple-d focus-visible:opacity-100'
/** 依赖 popover 里的候选项/清除项（demo .pop .item）。P4 的技能候选项复用它（同一套浮层词汇）。 */
const DEP_OPT =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[12.5px] font-semibold text-text-2 transition-colors hover:bg-fill hover:text-text'

// ── P4 加/删技能 + guard 原子类（demo .addcard/.pop/.ecard .rm 等值搬运）──
/**
 * 「+ 技能」加卡钮（demo .addcard）：整列宽的虚线卡，坐在技能卡列表下方 = 「往这一列末尾加一张卡」
 * 的空间隐喻。禁用态（registry 未就绪）保留控件 + 说明，见文件头 P4 口径 ①——
 * 故 hover 变体必须 `enabled:` 打头，否则禁用的钮 hover 仍变紫，读作「可点」。
 */
const SK_ADD =
  'w-full cursor-pointer rounded-[11px] border-[1.5px] border-dashed border-border-2 bg-transparent p-[9px] text-[13px] font-bold text-text-3 transition-colors enabled:hover:border-purple-b enabled:hover:text-purple-d disabled:cursor-not-allowed disabled:opacity-55'
/**
 * 技能候选 popover（demo .pop）。**w-max**：宽度按最长技能全名撑开，绝不截断（同依赖 popover）。
 * max-h + overflow-y-auto 是 demo 同款（registry 可能几十条，浮层不该顶到视口外）——**纵向**滚动
 * 不碰名字：横向宽度已由 w-max 保证放得下，名字一个字都不会被切（硬约束 ①）。
 */
const SK_POP =
  'absolute top-[calc(100%+6px)] left-0 z-[7] max-h-[340px] w-max min-w-[280px] overflow-y-auto rounded-[11px] border border-border bg-card p-1.5 text-left shadow-md'
/**
 * 「未装」徽章（demo .inst.no 的琥珀语义 = 红绿 color-mix 派生家族，同 HK_LOOP 的既有表达）。
 * 11.5px = 契约 §0.2 徽章下限。零截断：nowrap + flex-none。
 */
const SK_UNINST =
  'inline-flex flex-none items-center rounded-full border border-amb-b bg-amb-t px-1.5 py-px text-[11.5px] font-bold whitespace-nowrap text-amb-d'
/** 技能卡上的移除 ×（demo .ecard .rm；与产出 chip 的 OUT_X 同款词汇，尺寸随卡放大一档）。 */
const SK_RM =
  'inline-grid h-[22px] w-[22px] flex-none cursor-pointer place-items-center rounded-md p-0 text-[15px] leading-none text-text-3 transition-colors hover:bg-red-t hover:text-red-d'
/**
 * guard 开关的标签。**可折行的散文**（「产出非空方可推进」/ 英文更长）→ 设 max-w 免得撑爆列宽
 * （文件头 P3 口径 ④）。它是控件标签不是名字，折行不丢字，与「名字被截断」是两回事。
 */
const GUARD_LABEL = 'max-w-[240px] text-[13px] font-semibold text-text'
/** guard 的一句话说明（StepEditor 的 NOTE 同款读数）。同为散文 → 同样设 max-w。 */
const GUARD_NOTE = 'mt-2 max-w-[280px] text-[12px] leading-[1.55] text-text-3'
/** registry 未就绪的说明（禁用「+ 技能」旁）。同为散文 → 同样设 max-w。 */
const SK_NOREG = 'mt-1.5 max-w-[280px] text-[12px] leading-[1.55] text-text-3'

// ── P3 Hook 卡原子类（demo .hookzone/.hkcard/.timing 等值搬运；**唯独 .g 拖手柄不搬**，见文件头 P3 口径 ①）──
/**
 * Hook 摘要行（demo .hookzone .sumrow）。可展开时是 <button>、否则是 <div>——同一套外观，
 * 故 hover 描边只在可展开时才给（`data-*` 承载见用处）：不可展开的行 hover 变色 = 暗示它可点。
 */
const HK_SUMROW = 'flex w-full items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-2 text-left'
const HK_SUMROW_BTN = 'cursor-pointer transition-colors hover:border-accent-b'
/** 折叠三角（demo .sumrow .caret）：展开时转 90°。状态走 data-open，不拼条件类名（硬约束 ②）。 */
const HK_CARET =
  'inline-block flex-none text-[11.5px] leading-none text-text-3 transition-transform duration-200 data-[open]:rotate-90'
/**
 * 时机分组（demo .timing）：::before = 节点圆点、::after = 连到下一节点的竖轨。
 * 竖轨是 border 中性色的**时序连接线**，不是卡上的彩色 side-stripe（§0.4 禁的是后者）——
 * 它画在卡片区之外的左槽里，与 P0 的列间连接件是同一类物件。末组不画轨（demo .timing:last-of-type）。
 */
const HK_GROUP =
  "relative pt-0.5 pb-1.5 pl-5 before:absolute before:top-[5px] before:left-0 before:z-[1] before:h-3 before:w-3 before:rounded-full before:border-[2.5px] before:border-(--accent) before:bg-card before:content-[''] after:absolute after:top-[17px] after:bottom-0 after:left-[5px] after:w-0.5 after:bg-border after:content-[''] last:after:hidden"
/** 时机人话名（demo .timing .tname）。零截断：nowrap 且不设 max-w。 */
const HK_TNAME = 'flex-none text-[13px] font-[750] whitespace-nowrap text-text-2'
/** 「每轮」chip（demo .timing .tname .loop，琥珀家族）。11.5px = 契约 §0.2 徽章下限。 */
const HK_LOOP =
  'inline-flex flex-none items-center rounded-full border border-amb-b bg-amb-t px-1.5 py-px text-[11.5px] font-bold whitespace-nowrap text-amb-d'
/**
 * Hook 卡（demo .ecard.hkcard）：**与技能卡同一套卡片语言**——同圆角 [11px]、同 border/bg-card、
 * 同内边距 px-2.5 py-2.5、同 shadow-sm、同 14.5px 卡名（契约 §2）。差别只在色相家族：
 * hook 走 accent（蓝）、技能走 purple。三档态承载在 data-state（同 HookTimeline 的既定属性名）。
 */
const HK_CARD =
  'rounded-[11px] border border-border bg-card px-2.5 py-2.5 shadow-sm transition-[border-color,box-shadow,opacity] duration-150 data-[state=configurable]:hover:border-accent-b data-[state=locked]:bg-fill-2 data-[state=locked]:shadow-none data-[state=pending]:bg-fill-2 data-[state=pending]:opacity-65 data-[state=pending]:shadow-none'
/** 卡首标记圆（demo .hkcard .mk）：与技能卡的序号圆同尺寸（22px），但 hook 无序号故放态记号。 */
const HK_MK = 'grid h-[22px] w-[22px] flex-none place-items-center rounded-full border text-[12px] leading-none'
const HK_MK_RW = 'border-accent-b bg-accent-t text-accent-d'
const HK_MK_RO = 'border-border-2 bg-fill text-text-3'
/**
 * Hook 人话名（demo .hkcard .nm）：与技能卡名同字号/字重。**刻意不 mono**——技能名是 id
 * （mono 有意义），hook 这里显示的是人话名（「注入工作流上下文」）。零截断：nowrap、无 max-w、
 * flex-none 且不设 min-w-0，宽度照常参与 max-content 把列撑开（硬约束 ①）。
 * 注：HookTimeline 那边给名字挂了 truncate，那正是本轮要消灭的写法，移植时刻意不带过来。
 */
const HK_NAME = 'flex-none text-[14.5px] font-[650] whitespace-nowrap text-text'
/**
 * Hook 一句话描述。**可折行的散文** → 设 max-w 免得撑爆列宽（文件头 P3 口径 ④：
 * 10px 卡内距 + 30px 缩进 + 260px = 300px < 340px 列宽下限 → 描述永不参与撑列）。
 * 折行不丢字，与「名字被截断」不是一回事。pl 与 demo .ecard .r2 同为 30px（22px 圆 + 8px gap）。
 */
const HK_DESC = 'mt-1.5 max-w-[260px] pl-[30px] text-[12.5px] leading-[1.5] text-text-3'
/** 落点的前/后判定：以元素中线为界（demo 同款）。纵向列表用 Y，横向（阶段列）用 X。 */
function isAfterY(e: { clientY: number }, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return e.clientY > r.top + r.height / 2
}
function isAfterX(e: { clientX: number }, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return e.clientX > r.left + r.width / 2
}

/**
 * dragstart 的 dataTransfer 装配。三处防御都不是摆设：
 *   · `dataTransfer` 缺失 —— jsdom 里 fireEvent.dragStart 不带 init 时它就是 undefined
 *     （既有先例 SkillTransferModal.test.tsx:18 手工造的假 DataTransfer 也只有 set/getData）；
 *   · `setData` 抛 —— Safari 在部分 dragstart 上会抛（demo 同款 try/catch）。payload 只是给外部
 *     放置区的礼节性数据，本组件的落位靠自己的 drag 状态，丢了不影响功能；
 *   · `setDragImage` 缺失 —— 同上 jsdom。有它时**必须**传整卡/整列做拖影：只有手柄 draggable，
 *     默认拖影就只剩那个 ⠿ 字形，名字整个不见（契约 §0.1 拖拽态零截断，见文件头口径 ④）。
 */
function primeDrag(e: { dataTransfer: DataTransfer | null }, payload: string, image: HTMLElement): void {
  const dt = e.dataTransfer as DataTransfer | null | undefined
  if (dt === null || dt === undefined) return
  dt.effectAllowed = 'move'
  try {
    dt.setData('text/plain', payload)
  } catch {
    // Safari/jsdom：payload 非功能依赖，静默略过即可。
  }
  if (typeof dt.setDragImage === 'function') dt.setDragImage(image, 24, 18)
}

export function OrchestrationBoard({
  lanes,
  readonly,
  selectedId,
  onSelect,
  label,
  onAddStage,
  gateHooks = [],
  onLaneEdit,
  onRemoveStage,
  renderSkillZone,
  onSkillMove,
  onSkillDep,
  onSkillAdd,
  onOpenSkillEditor,
  onSkillRemove,
  skillRegistry,
  onLaneGuard,
  onStageReorder,
  hooks,
  toolbarSlot,
}: OrchestrationBoardProps): JSX.Element {
  const { t } = useT()
  // 门徽章 popover 开关态（StepperRail.tsx:111-125 原样移植）：hover 即显（鼠标移出即收）；
  // 点击「钉住」显示，不受后续 mouseLeave 影响，再点一次或点外部区域才收起——同一时间只会有
  // 一个钉住（点新的门徽章直接切换）。
  const [hoverGate, setHoverGate] = useState<string | null>(null)
  const [pinnedGate, setPinnedGate] = useState<string | null>(null)
  // P1 就地编辑态。三份都键在 lane id 上（同 hoverGate/pinnedGate 的既定做法：本组件把整板
  // 渲染在一个组件里，逐列拆子组件纯粹为了存三个字段不划算），故同一时刻只有一列在编辑
  // ——点第二列的编辑入口会让第一列的草稿收起，这是就地编辑的常规语义，不是丢数据：
  // 草稿从未进过 def，收起 = 放弃这次未提交的输入。
  const [nameEdit, setNameEdit] = useState<{ id: string; draft: string } | null>(null)
  const [outAdd, setOutAdd] = useState<{ id: string; draft: string; error: string | null } | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  // P2 拖拽态。drag = 正在拖谁（null = 没在拖）；drop = 当前落点提示。两者分开存：dragend 要清
  // 两个，而 dragover 只动 drop。都是纯 UI 交互态（同 hoverGate/pinnedGate 的既定归属），不进 def。
  const [drag, setDrag] = useState<DragPayload | null>(null)
  const [drop, setDrop] = useState<DropHint | null>(null)
  // 依赖 popover 开关态。prevDep 记「点开的是哪一条 chip」——null = 从「+ 设依赖」钮开的（新增）。
  const [depPop, setDepPop] = useState<{ stage: string; skill: string; prevDep: string | null } | null>(null)
  // P4 技能候选 popover 开关态：值 = 开着的是哪一列（同一时刻只开一个，点第二列直接切换）。
  // 与 depPop 互斥：两个浮层同屏叠着谁也说不清在改什么，故开一个即关另一个（见两处开关处理）。
  const [skPop, setSkPop] = useState<string | null>(null)
  // 跨列搬撞名的提示（键在目标列 id 上）。见 commitSkillMove。
  const [dupWarn, setDupWarn] = useState<string | null>(null)
  // P3 Hook 区开合。**只存用户手动开合过的列**（缺键 = 跟随默认 = 该列 running，见 hkOpen 计算处）
  // ——存成「渲染时全量填满」的话，一旦某列 running 变化，它的默认就会被旧快照钉死。
  // 同 hoverGate/depPop 的既定归属：纯 UI 交互态，键在 lane id 上，不进 def。
  const [hookOpen, setHookOpen] = useState<Record<string, boolean>>({})
  const boardRef = useRef<HTMLDivElement>(null)

  // 诚实门（契约 §0.6）：真控件 = 宿主真给了回调 **且** 不是只读态。两个条件任一不成立即锁死
  // ——不做假按钮，也不指望宿主两个 prop 永远传得一致。
  const canEdit = onLaneEdit !== undefined && !readonly
  const canRemove = onRemoveStage !== undefined && !readonly
  // P2 三个拖拽/依赖面同款把关（契约 §2「default 一个拖手柄都不长」，见文件头 P2 口径 ①）。
  const canDragSkill = onSkillMove !== undefined && !readonly
  const canDep = onSkillDep !== undefined && !readonly
  const canDragLane = onStageReorder !== undefined && !readonly
  // P4 三个新面同款把关（契约 §2「全部入口 && !readonly」「default 一个都不长」，见文件头 P4 口径 ③）。
  const canAddSkill = (onOpenSkillEditor !== undefined || onSkillAdd !== undefined) && !readonly
  const canRemoveSkill = onSkillRemove !== undefined && !readonly
  const canGuard = onLaneGuard !== undefined && !readonly
  // 候选池就绪 = 宿主真给了一份 registry。null（在拉/拉失败）与 undefined（不描述该数据面）同等
  // 对待——两者都 = 此刻没有候选池（见文件头 P4 口径 ①）。
  const regReady = skillRegistry !== null && skillRegistry !== undefined
  // name → SkillEntry 查询面（「未装」徽章用）。未就绪 → 空表 = 全部「不可判」→ 一个徽章都不显示
  // （保守不谎报，逐字对齐 SkillChain.tsx:276 的 installedMap 口径）。
  const installedMap = new Map((skillRegistry ?? []).map((e) => [e.name, e]))
  const removeLane = removeId === null ? undefined : lanes.find((l) => l.id === removeId)

  useEffect(() => {
    if (pinnedGate === null) return
    function onDocClick(e: MouseEvent): void {
      if (boardRef.current && e.target instanceof Node && !boardRef.current.contains(e.target)) setPinnedGate(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [pinnedGate])

  // 依赖 popover 的外部点击收起。刻意**不**照抄上面 pinnedGate 的 boardRef.contains 口径：
  // 那个只在点到看板外时收，而依赖 popover 点到看板内的别处（另一列、另一张卡）也该收
  // ——它是个菜单，不是常驻读数。故认标记属性 [data-wb-dep-open]（只挂在当前开着的那一个上）：
  // 点在它内部（含候选项/清除）忽略，其余一律收起。
  // 触发它的 chip/钮自身走 stopPropagation，原生事件到不了 document，故不会「刚点开就被收掉」。
  useEffect(() => {
    if (depPop === null) return
    function onDocClick(e: MouseEvent): void {
      if (e.target instanceof Element && e.target.closest('[data-wb-dep-open]') !== null) return
      setDepPop(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [depPop])

  // 技能候选 popover 的外部点击收起。口径与上面的依赖 popover 逐字同一条（它也是菜单不是常驻
  // 读数：点到看板内的别处也该收），只是认自己的标记属性 [data-wb-sk-open]。
  useEffect(() => {
    if (skPop === null) return
    function onDocClick(e: MouseEvent): void {
      if (e.target instanceof Element && e.target.closest('[data-wb-sk-open]') !== null) return
      setSkPop(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [skPop])

  /** 门二态：`null ↔ 'review'`。逐字对齐 StepEditor.tsx:67-69，绝不长出第三态（文件头口径 ①）。 */
  function toggleGate(lane: BoardLane): void {
    onLaneEdit?.(lane.id, { gate: lane.gate === null ? 'review' : null })
  }

  /**
   * 阶段名就地提交。空名不提交（回落原值，同 StepEditor commitAdd 的「空值视同取消」口径）。
   * 值没变也不提交：本输入框是**点名字就打开**的，若原样失焦也发补丁，等于「点一下名字就把
   * workflow 标脏」——宿主的 dirty 徽章会凭空亮起，保存按钮凭空可点。
   * 注：`lane.name` 是投影后的展示名（label→i18n→id 回退），故「值没变」时不提交也顺带避免了
   * 把回退出来的 id 固化成一个真 label。
   */
  function commitName(lane: BoardLane, cancel: boolean): void {
    if (nameEdit === null || nameEdit.id !== lane.id) return
    if (cancel) {
      setNameEdit(null)
      return
    }
    const v = nameEdit.draft.trim()
    if (v !== '' && v !== lane.name) onLaneEdit?.(lane.id, { label: v })
    setNameEdit(null)
  }

  function removeOutput(lane: BoardLane, field: string): void {
    onLaneEdit?.(lane.id, { outputs: lane.outputs.filter((o) => o !== field) })
  }

  /** 产出新增提交。校验规则/错误文案/空值语义全部照抄 StepEditor.tsx:84-112（文件头口径 ②）。 */
  function commitOutAdd(lane: BoardLane, cancel: boolean): void {
    if (outAdd === null || outAdd.id !== lane.id) return
    if (cancel) {
      setOutAdd(null)
      return
    }
    const v = outAdd.draft.trim()
    if (v === '') {
      // 空值提交视同取消（demo 同款：失焦无值即收起）
      setOutAdd(null)
      return
    }
    if (!FIELD_RE.test(v)) {
      setOutAdd({ ...outAdd, error: t('workbench.ed_output_invalid') })
      return
    }
    if (lane.outputs.includes(v)) {
      setOutAdd({ ...outAdd, error: t('workbench.ed_output_dup') })
      return
    }
    // 新产出的缺省类型 type:'string' 由宿主在转回 WbFieldRef 时补（见 LanePatch.outputs 注释）。
    onLaneEdit?.(lane.id, { outputs: [...lane.outputs, v] })
    setOutAdd(null)
  }

  /** dragstart 公共前奏：清掉上一轮的撞名提示（否则它会一直挂着，见 dupWarn 注释）。 */
  function beginDrag(payload: DragPayload): void {
    setDupWarn(null)
    setDrag(payload)
  }

  function endDrag(): void {
    setDrag(null)
    setDrop(null)
  }

  /**
   * 技能落位提交。**唯一在本组件落地的业务判断**：跨列搬到已有同名技能的列 → 不发回调 + 提示。
   * 这不是抢宿主的活（宿主的 moveSkillInDef 同样会 no-op，两处一致），而是「静默 no-op 会让用户
   * 以为搬成功了」——诚实门要求把「没搬」说出来。技能在阶段内唯一是既定语义（同 demo moveSkill）。
   */
  function commitSkillMove(from: { stage: string; skill: string }, toLane: BoardLane, refSkillId: string | null, after: boolean): void {
    endDrag()
    if (from.stage !== toLane.id && (toLane.skills ?? []).includes(from.skill)) {
      setDupWarn(toLane.id)
      return
    }
    onSkillMove?.({ skillId: from.skill, fromStage: from.stage, toStage: toLane.id, refSkillId, after })
  }

  /**
   * 依赖 popover（chip 的「改/清」与「+ 设依赖」的「新增」共用一个——两者只差 prevDep）。
   *
   * 候选池 = 同列其他技能 − 该技能已有的依赖。两条过滤都是**无争议**的（自指、重复加同一条），
   * 刻意到此为止：**不做环检测**（文件头口径 ②，kernel validate 才是权威）。
   * 也刻意不列**跨 step** 的技能——那是 kernel 的校验期错误，给了就是引导用户存不进去。
   */
  function depPopover(lane: BoardLane, skillId: string, candidates: string[], prevDep: string | null): JSX.Element {
    return (
      <div
        // w-max：popover 宽度按最长技能全名撑开，绝不截断（契约 §0.1 在浮层里的延伸）。
        className="absolute top-[calc(100%+6px)] left-0 z-[7] w-max min-w-52 rounded-[11px] border border-border bg-card p-1.5 text-left shadow-md"
        data-testid={`wb-lane-dep-pop-${lane.id}-${skillId}`}
        // 外部点击收起的标记（只挂在当前开着的这一个上，见 depPop 的 useEffect）。
        data-wb-dep-open=""
      >
        <p className="px-2 pt-0.5 pb-1.5 text-[12px] font-bold text-text-2">{t('workbench.board_dep_pop_title')}</p>
        {candidates.length === 0 ? (
          <p className="px-2 pb-1 text-[12.5px] leading-[1.5] text-text-3">{t('workbench.board_dep_none')}</p>
        ) : (
          candidates.map((c) => {
            const { ns, base } = splitName(c)
            return (
              <button
                key={c}
                type="button"
                className={DEP_OPT}
                data-testid={`wb-lane-dep-opt-${lane.id}-${skillId}-${c}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setDepPop(null)
                  onSkillDep?.(lane.id, skillId, c, prevDep)
                }}
              >
                {/* 候选项也是技能全名 → 同样零截断（flex-none + nowrap，命名空间弱化但完整）。
                    按钮的可访问名就是这段文本，故不另设 aria-label。 */}
                <span className="flex-none font-mono text-[13px] font-[650] whitespace-nowrap text-text">
                  {ns !== '' && <span className="font-normal text-text-3">{ns}</span>}
                  {base}
                </span>
              </button>
            )
          })
        )}
        {/* 清除只在「改一条既有依赖」时出现——从「+ 设依赖」开的新增流程里没有可清的东西。 */}
        {prevDep !== null && (
          <button
            type="button"
            className={DEP_OPT}
            data-testid={`wb-lane-dep-clear-${lane.id}-${skillId}`}
            onClick={(e) => {
              e.stopPropagation()
              setDepPop(null)
              onSkillDep?.(lane.id, skillId, null, prevDep)
            }}
          >
            {t('workbench.board_dep_clear')}
          </button>
        )}
      </div>
    )
  }

  /**
   * 「未装」徽章（P4）。判定逐字对齐 SkillChain.tsx:280-282：**只有明确读到 installed===false
   * 才出**——registry 未就绪（查询面为空）或该 id 不在 registry 里 = 不可判 → 不出徽章
   * （保守不谎报：不可判时说「已装」和说「未装」都是编的，见文件头 P4 口径 ④）。
   *
   * title 用 installCmd（有则给出装的命令）、否则回落既有的 user 类提示——同 SkillChain 的既定
   * 文案分岔。**刻意不做「点徽章复制命令」**（SkillChain 那边有）：本徽章要挂在 popover 的候选项
   * （一个 <button>）里，按钮不能嵌按钮；两处形态分叉不如两处都只做提示。
   */
  function uninstBadge(id: string, testid: string): JSX.Element | null {
    const entry = installedMap.get(id)
    if (entry === undefined || entry.installed) return null
    return (
      <span className={SK_UNINST} data-testid={testid} title={entry.installCmd ?? t('workbench.sk_uninstalled_hint_user')}>
        {t('workbench.sk_uninstalled')}
      </span>
    )
  }

  /**
   * 技能候选 popover（P4）。候选池 = registry 全量 − 本列已有（契约 §2）。
   * **只做这一条无争议的过滤**（重复加同一个技能到同一列无意义，技能在阶段内唯一是既定语义）：
   *   · 不按 id 字符集筛（文件头 P4 口径 ②：kernel 早已接受命名空间全名，前端复刻校验只会分叉）；
   *   · 不筛掉未安装的（那是**信息**不是禁令——workflow 可以先编排、技能后装，
   *     故给徽章而不是禁用；禁掉等于替用户决定编排顺序）；
   *   · 不按 `|` 拆备选（那是 default 的 manifest token 语义，自定义 workflow 的 skills 是单 id）。
   * 本函数只在 regReady 时被调用（未就绪的列压根不出 popover，见调用处）。
   */
  function skillPopover(lane: BoardLane, candidates: string[]): JSX.Element {
    return (
      <div
        className={SK_POP}
        data-testid={`wb-lane-sk-pop-${lane.id}`}
        // 外部点击收起的标记（只挂在当前开着的这一个上，见 skPop 的 useEffect）。
        data-wb-sk-open=""
      >
        <p className="px-2 pt-0.5 pb-1.5 text-[12px] font-bold text-text-2">{t('workbench.sk_panel_title')}</p>
        {candidates.length === 0 ? (
          <p className="max-w-[260px] px-2 pb-1 text-[12.5px] leading-[1.5] text-text-3">{t('workbench.sk_panel_empty')}</p>
        ) : (
          candidates.map((c) => {
            const { ns, base } = splitName(c)
            return (
              <button
                key={c}
                type="button"
                className={DEP_OPT}
                data-testid={`wb-lane-sk-opt-${lane.id}-${c}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setSkPop(null)
                  onSkillAdd?.(lane.id, c)
                }}
              >
                {/* 候选项是技能全名 → 零截断（flex-none + nowrap + 不设 max-w，宽度参与 popover 的
                    w-max 计算；命名空间前缀弱化但完整）。按钮的可访问名就是这段文本 + 徽章文案，
                    故不另设 aria-label。 */}
                <span className="flex-none font-mono text-[13px] font-[650] whitespace-nowrap text-text">
                  {ns !== '' && <span className="font-normal text-text-3">{ns}</span>}
                  {base}
                </span>
                {/* 弹性留白把徽章推到浮层右缘（demo .pop .item .inst{margin-left:auto}）；
                    flex-basis 0，不参与撑宽。 */}
                <span className="min-w-3.5 flex-1" />
                {uninstBadge(c, `wb-lane-sk-opt-uninst-${lane.id}-${c}`)}
              </button>
            )
          })
        )}
      </div>
    )
  }

  /**
   * Hook 时机区的展开体（P3）。返回 null = **不可展开**：
   *   · `hooks` 没传 → 宿主不描述 hook 数据面；
   *   · `hooks.hooks === null` → 加载中/加载失败（HookTimeline.tsx:43-44 的既定语义）。
   * 两者都保持 P0 的一行死摘要——展开一个空壳 = 谎报「本阶段没有 hook」（诚实占位纪律）。
   *
   * 阶段维度：hook 的开关矩阵键是 `<hook>.<阶段>`，本区的「阶段」恒 = 本列 lane.id
   * （不是 selectedId）——一屏 N 列各读写各自那一列的键，这正是卡片化相对 sheet 里单阶段
   * 时序线的增量。与 readonly/canEdit 无关：hooks.json 是运行时配置，不属于 def 草稿。
   */
  function hookZoneBody(lane: BoardLane, open: boolean): JSX.Element | null {
    const list = hooks?.hooks
    if (hooks === undefined || list === null || list === undefined) return null
    if (!open) return <></>
    return (
      <div className="pt-2.5" id={`wb-lane-hk-body-${lane.id}`}>
        {/* 分组自成一层容器：底部的 ⌘ 提示不能算进「最后一组」的判定里，否则 last:after:hidden
            会落到提示上、最后一组的竖轨反而留一截悬空（demo 用 .timing:last-of-type 表达同一件事）。 */}
        <div className="flex flex-col">
          {EVENT_ORDER.map((ev) => {
            // 空组也画节点（时序线是解释模型，不随数据缺列）——filter 出空数组照样进 map。
            const evHooks = list.filter((h) => h.event === ev)
            return (
              <div key={ev} className={HK_GROUP} data-testid={`wb-lane-hk-group-${lane.id}-${ev}`}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={HK_TNAME} title={`技术事件：${ev}`}>{t(`workbench.hk_ev_${ev}`)}</span>
                  {/* 「每轮」只挂 UserPromptSubmit（定稿 .loop chip 的位置）：一轮对话 = 一次
                      UserPromptSubmit，它之后的 Pre/PostToolUse 都在这一轮里重复。 */}
                  {ev === 'UserPromptSubmit' && <span className={HK_LOOP}>{t('workbench.board_hk_loop')}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  {evHooks.length === 0 ? (
                    <span className="text-[12.5px] text-text-3">{t('workbench.board_hk_empty')}</span>
                  ) : (
                    evHooks.map((h) => {
                      const key = `${h.id}.${lane.id}`
                      // 矩阵只存禁用项、缺键 = 启用（fail-open，同 useHooksConfig 的写回语义）。
                      const enabled = !(key in hooks.matrix)
                      // 三档判定**逐字对齐 HookTimeline.tsx:182-183**，LOCKED_IDS 同一个真相源。
                      const locked = !h.configurable && LOCKED_IDS.has(h.id)
                      const pending = !h.configurable && !locked
                      // 人话文案缺席的未知 hook（server 新加而前端词典没跟上）：名称回落 id、描述留白
                      // （同 HookTimeline.tsx:184-192 的既有兜底，别自造占位文案）。
                      const nameKey = `workbench.hk_name_${h.id}`
                      const name = t(nameKey)
                      const display = name === nameKey ? h.id : name
                      const descKey = `workbench.hk_desc_${h.id}`
                      const desc = t(descKey)
                      return (
                        <div
                          key={h.id}
                          className={HK_CARD}
                          data-state={pending ? 'pending' : locked ? 'locked' : 'configurable'}
                          data-testid={`wb-lane-hk-${lane.id}-${h.id}`}
                          title={`${h.id} · ${h.event} · matcher ${h.matcher} · ${h.script}`}
                        >
                          <div className="flex items-center gap-2">
                            {/* 态记号（demo .mk）。aria-hidden：它是徽章/开关已经说过的话的字形复述。 */}
                            <span className={`${HK_MK} ${h.configurable ? HK_MK_RW : HK_MK_RO}`} aria-hidden="true">
                              <Icon name={locked ? 'gate' : pending ? 'clock' : 'gauge'} size={12} />
                            </span>
                            {/* 主视图只讲用途；技术 id、事件、matcher 与脚本路径放在整卡 hover。 */}
                            <span className={HK_NAME}>{display}</span>
                            <span className={`${MINI_BASE} ${MINI_RO}`}>
                              内置 Hook
                            </span>
                            {/* 弹性留白把右侧控件推到卡右缘（demo .ecard .pad）；不参与 max-content 撑列。 */}
                            <span className="min-w-2 flex-1" />
                            {/* locked/pending 只出徽章、**不出开关**（文件头 P3 口径 ③）。 */}
                            {(locked || pending) && (
                              <span className={`${MINI_BASE} ${MINI_RO}`} data-testid={`wb-lane-hk-badge-${lane.id}-${h.id}`}>
                                {locked ? t('workbench.hk_locked') : t('workbench.hk_pending')}
                              </span>
                            )}
                            {h.configurable && (
                              <button
                                type="button"
                                className={SWITCH}
                                role="switch"
                                aria-checked={enabled}
                                // 可访问名带阶段归属：一屏 N 列 × 同一批 hook，光「注入工作流上下文」
                                // 撞一片（同本文件所有多列控件的 `基名 · 阶段名` 统一口径）。
                                aria-label={`${display} · ${lane.name}`}
                                // 在途写回的键禁用（防同键乱序竞态，useHooksConfig 的 busyKeys 契约）。
                                disabled={hooks.busyKeys.has(key)}
                                data-testid={`wb-lane-hk-sw-${lane.id}-${h.id}`}
                                onClick={(e) => {
                                  // 同门开关：不冒泡到泳道根的选中处理。
                                  e.stopPropagation()
                                  hooks.toggle(h.id, lane.id, !enabled)
                                }}
                              />
                            )}
                          </div>
                          {desc !== descKey && <div className={HK_DESC}>{desc}</div>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {/* ⌘ 指路（契约 §1 诚实门的正面表达）：执行顺序/新增 hook/改时机注册都**没有 app 写端点**
            ——不给拖手柄，但也不能就此沉默，得把「那去哪儿改」说出来。
            ⌘ 与文件路径刻意留在 JSX 而非词典里：前者是记号、后者是真实路径，两者都不该按语言各抄一遍
            （同依赖 chip 的 ⟼ 的既定处理）。 */}
      </div>
    )
  }

  return (
    <>
      {/* ── P1 看板级工具条（toolbarSlot 非空才渲染；放在横向滚动容器**外**，这样切 track 之类
           的看板级镜头不会被滚到视野外）。 ── */}
      {toolbarSlot ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 px-1" data-testid="wb-board-toolbar">
          {toolbarSlot}
        </div>
      ) : null}

      {/* 横向滚动是明许的兜底而非失败态：列宽自适应到放得下最长的名字，放不下就滚，绝不截断。 */}
      <div className="overflow-x-auto px-1 pt-1.5 pb-4" data-testid="wb-board-scroll" ref={boardRef}>
        {/* 「+ 添加阶段」脱离等宽 grid 放看板右侧（demo .boardrow）：否则它会被算进 grid-auto-columns
            的等宽/max-content 计算，白白把每列撑到按钮宽度。 */}
        <div className="flex min-w-min items-start gap-3">
          <div
            // 可拖列时把左右内边距撑到 24px：插入位游标画在列间 gap 里（left/right: -24px），
            // 首列之前 / 末列之后的那两道若没有槽，会被横向滚动容器的左裁切边吃掉、或压到
            // 「+ 添加阶段」上（见文件头「落点提示的视觉」）。不可拖时零布局变化，保持 P0 原样。
            className={`grid grid-flow-col w-max items-start gap-x-8 [grid-auto-columns:minmax(320px,max-content)] ${canDragLane ? 'px-[18px]' : 'pr-1'}`}
            role="list"
            aria-label={label}
            data-testid="wb-stages"
          >
            {lanes.map((lane, i) => {
              const selected = lane.id === selectedId
              // 多态时优先 selected（选中是「用户此刻的焦点」，比 running 这个环境态更该被看见）。
              const state = selected ? 'current' : lane.running ? 'running' : 'idle'
              // 补丁 v2 ②：门徽章复用既有 gate_badge/gate_badge_confirm（既有测试按「复核门」断言），
              // board_* 新 key 只管分区标题等，不覆盖门徽章。
              const gateLabel = lane.gate === 'confirm' ? '需要确认' : '离开前复核'
              const openPop = hoverGate === lane.id || pinnedGate === lane.id
              const hooksReady = lane.hooksCount !== undefined
              // P3 Hook 区开合。**默认 = 该列 running**（定稿口径：当前在跑的阶段列展开、其余折叠）
              // ——手动开合过的列以 hookOpen 的存量为准（?? 只在缺键时回落默认，见 hookOpen 注释）。
              const hkOpen = hookOpen[lane.id] ?? lane.running
              // null = 不可展开（hooks 没传/未就绪）→ 摘要行退回 P0 的死行。见 hookZoneBody。
              const hookBody = hookZoneBody(lane, hkOpen)
              // 摘要行的读数部分（可展开与否共用——两者只差一个折叠三角与可点性）。
              // 计数仍走 lane.hooksCount/hooksLocked（投影层算好的真数），不在本组件二次统计：
              // 摘要与阶段卡徽章必须是同一个数，两处各算一遍就会分叉。
              const hookSummary = (
                <>
                  <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`}><Icon name="gauge" size={12} />自动检查</span>
                  <span className="ml-auto inline-flex flex-none items-center gap-1.5">
                    <span className={`${MINI_BASE} ${MINI_RO}`}>{(lane.hooksCount ?? 0) + (lane.hooksLocked ?? 0)} 项</span>
                  </span>
                </>
              )
              const editingName = nameEdit !== null && nameEdit.id === lane.id
              const addingOut = outAdd !== null && outAdd.id === lane.id
              const outError = addingOut ? outAdd.error : null
              // 门开关的出场条件（诚实门，见文件头）：**有且仅有可编时才出**。只读列一个开关都
              // 不渲染（连禁用的也不要）——徽章已经把「有没有门」「为什么不能改」说全了。
              const showGateSw = canEdit
              // P4 guard 开关的出场条件：可编 **且** 数据面真描述了这一列的 guard。
              // nonemptyGuard===undefined 时不渲染（诚实占位：没有数据就不画，渲染一个关着的开关
              // 等于谎报「这一列的 guard 是关着的」——见 BoardLane.nonemptyGuard 注释）。
              const showGuard = canGuard && lane.nonemptyGuard !== undefined
              // P2 本列的拖拽态投影。laneDrop 只在**拖列**时点亮（拖技能卡时泳道根不是落点）。
              const laneDragging = drag !== null && drag.kind === 'lane' && drag.stage === lane.id
              const laneDrop = drop !== null && drop.kind === 'lane' && drop.stage === lane.id ? (drop.after ? 'after' : 'before') : undefined
              const intoDrop = drop !== null && drop.kind === 'into' && drop.stage === lane.id
              // 提到局部 const：`lane.skills` 是属性访问，TS 的窄化在 .map 回调里保不住
              // （P1 时卡内不碰 skills 所以没暴露）。本轮卡内要算候选池，必须先拿成局部量。
              const skills = lane.skills
              // P0 口径原样保留（gate/readonly/count 任一成立即有徽章行），再并上可编态——
              // 可编且无门时徽章行里只有开关 +「未设复核门」，也得撑起这一行。
              const hasBadges = lane.gate !== null || readonly || showGateSw

              return (
                <div
                  key={lane.id}
                  // group：泳道是状态真相源，列内元素（序号圆等）用 group-data-[…]: 跟随，不拼条件类名。
                  // relative：连接件 ::before/::after 画在本列右侧的 gap 里，靠它定位（见 workbench.css）。
                  className="group relative flex flex-col overflow-visible rounded-[22px] border border-border bg-card shadow-[0_10px_30px_rgba(15,23,42,0.045)] transition-[border-color,box-shadow,opacity,transform] duration-200 hover:-translate-y-px hover:border-border-2 hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)] data-[locked]:bg-fill/55 data-[state=running]:border-green-b data-[state=current]:border-accent-b data-[state=current]:shadow-[0_16px_40px_rgba(37,99,235,0.10)] data-[state=current]:ring-2 data-[state=current]:ring-accent-t data-[dragging]:opacity-45"
                  role="listitem"
                  data-testid={`wb-step-${lane.id}`}
                  data-state={state}
                  data-locked={readonly ? '' : undefined}
                  data-dragging={laneDragging ? '' : undefined}
                  // 落点提示承载在 data-drop（契约 §3）；视觉是列间 gap 里的插入位游标，
                  // 不是卡上的彩色左右边框（§0.4 禁令，见文件头「落点提示的视觉」）。
                  data-drop={laneDrop}
                  // dragstart 挂在泳道根而非手柄上：手柄的 dragstart 会冒泡到这里，而 currentTarget
                  // 恰好是整列 → setDragImage(整列) 拿得到（文件头口径 ④）。技能卡的 dragstart 已在
                  // 卡上 stopPropagation，不会误触发本处。
                  onDragStart={
                    canDragLane
                      ? (e) => {
                          beginDrag({ kind: 'lane', stage: lane.id })
                          primeDrag(e, lane.id, e.currentTarget)
                        }
                      : undefined
                  }
                  onDragEnd={canDragLane ? endDrag : undefined}
                  // 拖列时本列才是落点；拖技能卡的 dragover 也会冒泡到这里，kind 守卫直接放行给
                  // 技能区自己处理（那边已 preventDefault，本处不重复）。拖自己不给落点（原地不动）。
                  onDragOver={(e) => {
                    if (drag === null || drag.kind !== 'lane' || drag.stage === lane.id) return
                    e.preventDefault()
                    setDrop({ kind: 'lane', stage: lane.id, after: isAfterX(e, e.currentTarget) })
                  }}
                  onDrop={(e) => {
                    if (drag === null || drag.kind !== 'lane' || drag.stage === lane.id) return
                    e.preventDefault()
                    const fromId = drag.stage
                    const after = isAfterX(e, e.currentTarget)
                    endDrag()
                    onStageReorder?.(fromId, lane.id, after)
                  }}
                  // 声明式连接件：只有真存在 forward 边才给 data-forward（无边不画线，诚实原则）。
                  data-forward={lane.linkEvent !== null ? lane.linkEvent : undefined}
                  data-gated={lane.gate !== null ? '' : undefined}
                  // 补丁 v2 ①：选中态承载在 aria-current="step"（既有测试 WorkbenchView.test.tsx:147-155
                  // 按它断言，也是正确 a11y 语义）；未选中时属性整个不渲染，不写 aria-current="false"。
                  aria-current={selected ? 'step' : undefined}
                  // 选中处理落在泳道根（不落在下面的头部按钮本身）：门徽章是按钮的兄弟节点而非子节点
                  // （按钮不能嵌按钮），选中处理若挂在按钮上，直接点击泳道本身（既有测试的既定用法，如
                  // fireEvent.click(getByTestId('wb-step-x'))）不会经过按钮冒泡触发。原生点击事件冒泡
                  // 覆盖按钮内部（含键盘 Enter/Space 在其上触发的原生 click），门徽章自己的 onClick 会
                  // stopPropagation 挡掉，两者不会互相误触发。同 StepperRail.tsx:145-151 的既定权衡。
                  onClick={() => onSelect(lane.id)}
                >
                  {/* 阶段列插入位游标：画在列间 46px 的 gap 里（位置/配色见 workbench.css P2 段，
                      认父级的 data-drop）。pointer-events-none 让它不参与命中——落点判定只该看
                      泳道自己的中线，游标横插一脚会让提示在边界处抖。 */}
                  {laneDrop !== undefined && <span className="pointer-events-none" data-wb-drop-caret="" aria-hidden="true" />}
                  <div className="relative flex flex-col items-start gap-[9px] border-b border-border px-3.5 pt-[13px] pb-3">
                    {lane.running && (
                      // 光泽遮罩：名字节点的兄弟而非祖先，overflow-hidden 只裁光泽，不碰名字（见文件头注释）。
                      <span className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-t-2xl" aria-hidden="true">
                        <i
                          className="absolute inset-y-0 left-0 w-[46px] bg-[linear-gradient(105deg,transparent_6%,color-mix(in_srgb,var(--green)_42%,transparent)_50%,transparent_94%)] opacity-0"
                          data-anim="wb-gloss"
                          data-testid={`wb-flow-gloss-${lane.id}`}
                        />
                      </span>
                    )}
                    <div className="relative z-[2] flex w-full items-center gap-[9px]">
                      {/* 阶段列拖手柄（契约 §2：只有自定义 workflow 长得出来）。
                          aria-hidden 是**刻意**的，不是漏了 a11y：拖拽重排没有键盘等价物，给它
                          role="button"+aria-label 会在读屏里长出一个按了没反应的按钮——那比不
                          暴露更坏（同文件头「禁用控件不如不渲染」的既定逻辑）。测试按 testid 寻址。
                          真正的键盘可达重排属独立能力，没做就不假装有。 */}
                      {canDragLane && (
                        <span
                          className={GRIP_LANE}
                          data-testid={`wb-lane-grip-${lane.id}`}
                          draggable
                          aria-hidden="true"
                          title={t('workbench.board_drag_lane')}
                        >
                          ⠿
                        </span>
                      )}
                      {/* 选择按钮：可编时只包序号圆——阶段名要变成自己的按钮/输入框，而按钮不能嵌按钮。
                          可访问名仍由 aria-label 带上阶段名，故语义无损（既有测试按
                          getByRole('button', { name: '选择阶段 X' }) 寻址，不受影响）。 */}
                      <button
                        type="button"
                        className="flex flex-none cursor-pointer items-center gap-[9px] rounded-lg text-left"
                        aria-label={t('workbench.board_lane_select', { name: lane.name })}
                      >
                        <span className="grid h-[27px] w-[27px] flex-none place-items-center rounded-full border border-green-b bg-green-t font-mono text-[14px] font-extrabold text-green-d group-data-[locked]:border-border-2 group-data-[locked]:bg-fill group-data-[locked]:text-text-3">
                          {i + 1}
                        </span>
                        {/* 定稿核心 ①：阶段名 nowrap，但绝不 overflow-hidden / ellipsis——列宽保证放得下。 */}
                        {!canEdit && (
                          <span className="flex-none font-mono text-[16.5px] font-[750] tracking-[-0.01em] whitespace-nowrap text-text">
                            {lane.name}
                          </span>
                        )}
                      </button>
                      {canEdit &&
                        (editingName ? (
                          <input
                            // 硬约束 ①：**不设宽度类**，size 按草稿字符数走（等宽字体 1ch ≈ 1 字符，
                            // +1 留一格光标位；下限 8 让刚清空的框不塌成一条缝）。输入到一半被切掉
                            // 与显示态被截断是同一条约束的两种破法。
                            className={`${INPUT_BASE} px-2 py-0.5 font-mono text-[16.5px] font-[750] tracking-[-0.01em]`}
                            data-testid={`wb-lane-name-input-${lane.id}`}
                            aria-label={`${t('workbench.board_ed_name')} · ${lane.name}`}
                            value={nameEdit.draft}
                            size={Math.max(nameEdit.draft.length + 1, 8)}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- 用户刚点了阶段名，焦点进输入框是这次点击的直接延续
                            autoFocus
                            onChange={(e) => setNameEdit({ id: lane.id, draft: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitName(lane, false)
                              } else if (e.key === 'Escape') {
                                commitName(lane, true)
                              }
                            }}
                            onBlur={() => commitName(lane, false)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          // 名字节点即按钮本体（不再包一层 span）：这样它的直接文本子节点恰好
                          // 是全名，getByText(name) 仍唯一命中一个节点，textContent 也逐字等于
                          // 全名——零截断断言的落点不因「名字变得可点」而漂移。
                          // 刻意**不** stopPropagation：点名字既进编辑态、也照常冒泡到泳道根选中
                          // 该列（既有「点泳道头 = 选中」语义不能因为长出编辑能力就变味）。
                          <button
                            type="button"
                            className="-mx-1 flex-none cursor-pointer rounded-md border border-transparent px-1 font-mono text-[16.5px] font-[750] tracking-[-0.01em] whitespace-nowrap text-text transition-colors hover:border-border-2 hover:bg-card"
                            data-testid={`wb-lane-name-${lane.id}`}
                            aria-label={`${t('workbench.board_ed_name')} · ${lane.name}`}
                            onClick={() => setNameEdit({ id: lane.id, draft: lane.name })}
                          >
                            {lane.name}
                          </button>
                        ))}
                      {canRemove && (
                        <>
                          {/* 弹性留白把删除入口推到泳道头右缘（demo .ecard .pad 同款）；flex-basis 0，
                              不参与 max-content 撑列。 */}
                          <span className="min-w-2 flex-1" />
                          <button
                            type="button"
                            className={LANE_RM}
                            data-testid={`wb-lane-rm-${lane.id}`}
                            aria-label={`${t('workbench.board_rm_lane')} · ${lane.name}`}
                            title={`${t('workbench.board_rm_lane')} · ${lane.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setRemoveId(lane.id)
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                    {hasBadges && (
                      <div className="relative z-[2] flex flex-wrap items-center gap-1.5">
                        {showGateSw && (
                          <span className="inline-flex flex-none items-center gap-1.5">
                            <button
                              type="button"
                              className={SWITCH}
                              role="switch"
                              aria-checked={lane.gate !== null}
                              // 可访问名必须**带阶段归属**：一屏上有 N 个门开关（每列一个），外加
                              // sheet 里 StepEditor 的 wb-ed-gate-sw——全叫「复核门」的话读屏用户
                              // 分不出在开哪一列的门，getByRole('switch', { name: '复核门' }) 也会
                              // 一次撞上多个（既有测试 WorkbenchView.test.tsx:321/443 按它寻址
                              // StepEditor 那一个）。`基名 · 阶段名` 的拼法是本文件所有多列控件的
                              // 统一口径（产出加/删、删阶段、阶段名同款）。
                              aria-label={`${t('workbench.board_ed_gate')} · ${lane.name}`}
                              // 刻意无 disabled/title：本开关只在可编时渲染（见 showGateSw），
                              // 只读态压根走不到这里。SWITCH 里的 disabled:* 变体是 StepEditor
                              // 原子类的一部分（逐字对齐，不裁剪），在本文件只是不被触发。
                              data-testid={`wb-lane-gate-sw-${lane.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleGate(lane)
                              }}
                            />
                            {/* 门关着时右边没有门徽章可当状态读数，补一个弱化的「未设复核门」。
                                刻意**不**写成「复核门」：一是那会让「门徽章只出现在有门的列」这条
                                既有断言（WorkbenchView.test.tsx:186-187）名存实亡——一个没有门的
                                列上赫然写着「复核门」，读者与测试都会以为它有门；二是这一格的语义
                                本来就是状态读数（有门/没门），不是控件标签——控件标签是开关自己的
                                aria-label（「复核门：阶段名」，静态、不随状态变）。 */}
                            {lane.gate === null && (
                              <span className="text-[12.5px] font-bold whitespace-nowrap text-text-3">{t('workbench.board_gate_off')}</span>
                            )}
                          </span>
                        )}
                        {lane.gate !== null && (
                          <span className="relative inline-flex">
                            <button
                              type="button"
                              className={`${BADGE_BASE} border-red-b bg-red-t text-red-d cursor-pointer hover:bg-red-b focus-visible:bg-red-b`}
                              data-testid={`wb-flow-gate-${lane.id}`}
                              aria-expanded={openPop}
                              title={t('workbench.gate_pop_title')}
                              onMouseEnter={() => setHoverGate(lane.id)}
                              onMouseLeave={() => setHoverGate(null)}
                              onFocus={() => setHoverGate(lane.id)}
                              onBlur={() => setHoverGate(null)}
                              onClick={(e) => {
                                e.stopPropagation()
                                setPinnedGate((cur) => (cur === lane.id ? null : lane.id))
                              }}
                            >
                              <Icon name="gate" size={11} />
                              {gateLabel}
                            </button>
                            {openPop && (
                              <div
                                className="absolute top-[calc(100%+6px)] left-0 z-[6] w-60 rounded-[11px] border border-border bg-card px-3 py-2.5 text-left shadow-md"
                                data-testid={`wb-flow-gatepop-${lane.id}`}
                                role="tooltip"
                              >
                                <p className="mb-1.5 text-[12px] font-bold text-text-2">{t('workbench.gate_pop_title')}</p>
                                <p className="mb-2 text-[12px] leading-[1.55] text-text-3">离开本阶段前，系统会执行下面的内置检查；任一检查未通过，流程就停在这里等待处理。</p>
                                <div className="space-y-[5px]">
                                  {gateHooks.map((h) => (
                                    <p key={h.id} className="text-[12px] leading-[1.55] text-text-2">
                                      <b className="block font-[650] text-text">{h.name}</b>
                                      {h.desc}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </span>
                        )}
                        {readonly && (
                          <span className={`${BADGE_BASE} ${BADGE_LOCK}`} data-testid={`wb-lane-lock-${lane.id}`}>
                            <Icon name="gate" size={11} />{t('workbench.board_lane_locked')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3.5 px-3 pt-3 pb-3.5">
                    {/* ── 技能序列区。renderSkillZone 提供时**整段交给宿主**（default 的强制技能
                         矩阵来自 manifest，不是 workflow def 的 skills——数据面归宿主，见 props 注释）；
                         否则走 P0 口径：skills===undefined → 整段不渲染（本数据源不描述技能，
                         渲染「（空）」会谎报「无技能」。见 BoardLane.skills 注释）。 ── */}
                    {renderSkillZone !== undefined
                      ? renderSkillZone(lane.id)
                      : skills !== undefined && (
                          <div data-testid={`wb-lane-skills-${lane.id}`}>
                            <div className="mx-0.5 mb-2 flex items-center gap-2">
                              <span className={ZONE_TITLE}>◇ {t('workbench.board_zone_skills')}</span>
                            </div>
                            {/* 卡列容器 = 「落到本列末尾」的落点（refSkillId=null）。空列时它也在（里面装
                                「（空）」而不是取代它）——空列必须能被拖入，否则技能一旦搬走就再也搬不回来。
                                min-h-2 给空列留出可命中的高度（demo .cardlist{min-height:8px} 同款）。 */}
                            <div
                              className="flex min-h-2 flex-col gap-2.5"
                              data-testid={`wb-lane-sklist-${lane.id}`}
                              data-drop={intoDrop ? 'into' : undefined}
                              onDragOver={
                                canDragSkill
                                  ? (e) => {
                                      // 卡上的 dragover 已 stopPropagation，故走到这里的只可能是
                                      // 卡与卡之间/末尾的空白（demo 用 e.target.closest('.skcard') 挡，
                                      // React 里由卡自己挡住冒泡，等价且更省）。
                                      if (drag === null || drag.kind !== 'skill') return
                                      e.preventDefault()
                                      setDrop({ kind: 'into', stage: lane.id })
                                    }
                                  : undefined
                              }
                              onDragLeave={
                                canDragSkill
                                  ? (e) => {
                                      // 只认真正离开容器本身的那次（子元素间移动也会冒泡出 dragleave）。
                                      if (e.target === e.currentTarget) setDrop(null)
                                    }
                                  : undefined
                              }
                              onDrop={
                                canDragSkill
                                  ? (e) => {
                                      if (drag === null || drag.kind !== 'skill') return
                                      e.preventDefault()
                                      commitSkillMove(drag, lane, null, true)
                                    }
                                  : undefined
                              }
                            >
                              {skills.length > 0 ? (
                                skills.map((skillId, si) => {
                                  const { ns, base } = splitName(skillId)
                                  const skDragging = drag !== null && drag.kind === 'skill' && drag.stage === lane.id && drag.skill === skillId
                                  const skDrop =
                                    drop !== null && drop.kind === 'skill' && drop.stage === lane.id && drop.skill === skillId
                                      ? drop.after
                                        ? 'after'
                                        : 'before'
                                      : undefined
                                  // 本卡的依赖（可多条，全渲染——文件头口径 ③）与可选候选池。
                                  const deps = lane.skillDeps?.[skillId] ?? []
                                  const candidates = skills.filter((s) => s !== skillId && !deps.includes(s))
                                  // 「+ 设依赖」的出场条件 = 真有东西可依赖。本列只有 1 个技能（候选空）
                                  // 时自然不出——不是特判，是「没有可依赖的对象就没有这个动作」。
                                  const showDepAdd = canDep && candidates.length > 0
                                  // 主画布负责说明当前调用关系；依赖的新增、修改与清除统一在 Skill 编排浮层完成。
                                  // 组件级 onSkillDep 仍保留给独立复用方，但 Workbench 不再接线这个重复入口。
                                  const showDepRow = !readonly && (deps.length > 0 || showDepAdd)
                                  const addOpen =
                                    depPop !== null && depPop.stage === lane.id && depPop.skill === skillId && depPop.prevDep === null
                                  return (
                                    <div
                                      key={skillId}
                                      // group/sk：具名 group——泳道根已占了匿名 group（group-data-[locked]:），
                                      // 依赖钮的 hover 显形要认卡而不是认列，两个 group 必须分得开。
                                      className="group/sk rounded-[11px] border border-border bg-card px-2.5 py-2.5 shadow-sm transition-[border-color,box-shadow,opacity] duration-150 hover:border-purple-b group-data-[locked]:hover:border-border data-[dragging]:opacity-40"
                                      data-testid={`wb-lane-sk-${lane.id}-${skillId}`}
                                      data-dragging={skDragging ? '' : undefined}
                                      // 落点提示：顶/底线（定稿 .skcard.dropbefore 等值搬运，见 workbench.css P2 段）。
                                      data-drop={skDrop}
                                      onDragStart={
                                        canDragSkill
                                          ? (e) => {
                                              // 挡住冒泡：否则泳道根会把这当成「拖列」（它的 dragstart 也在监听）。
                                              e.stopPropagation()
                                              beginDrag({ kind: 'skill', stage: lane.id, skill: skillId })
                                              primeDrag(e, skillId, e.currentTarget)
                                            }
                                          : undefined
                                      }
                                      onDragEnd={canDragSkill ? endDrag : undefined}
                                      onDragOver={
                                        canDragSkill
                                          ? (e) => {
                                              if (drag === null || drag.kind !== 'skill') return
                                              // 无条件挡冒泡：不然「悬在自己身上」会漏给容器变成 into 落点，
                                              // 松手就把卡甩到列尾——用户明明没打算移动它（demo 的已知瑕疵）。
                                              e.stopPropagation()
                                              if (drag.stage === lane.id && drag.skill === skillId) {
                                                setDrop(null)
                                                return
                                              }
                                              e.preventDefault()
                                              setDrop({ kind: 'skill', stage: lane.id, skill: skillId, after: isAfterY(e, e.currentTarget) })
                                            }
                                          : undefined
                                      }
                                      onDrop={
                                        canDragSkill
                                          ? (e) => {
                                              if (drag === null || drag.kind !== 'skill') return
                                              e.stopPropagation()
                                              if (drag.stage === lane.id && drag.skill === skillId) {
                                                endDrag()
                                                return
                                              }
                                              e.preventDefault()
                                              commitSkillMove(drag, lane, skillId, isAfterY(e, e.currentTarget))
                                            }
                                          : undefined
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        {/* 技能卡拖手柄。aria-hidden 的理由同阶段列手柄（无键盘等价物）。 */}
                                        {canDragSkill && (
                                          <span
                                            className={GRIP_SK}
                                            data-testid={`wb-lane-sk-grip-${lane.id}-${skillId}`}
                                            draggable
                                            aria-hidden="true"
                                            title={t('workbench.board_drag_skill')}
                                          >
                                            ⠿
                                          </span>
                                        )}
                                        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full border border-purple-b bg-purple-t font-mono text-[12.5px] font-extrabold text-purple-d">
                                          {si + 1}
                                        </span>
                                        {/* 定稿核心 ①：技能全名——flex-none 且不设 min-w-0，名字宽度参与 max-content
                                            计算，把列撑到放得下为止；命名空间前缀弱化但完整可见。本节点 textContent
                                            必须逐字等于 skillId（零截断断言的落点）。 */}
                                        <span className="flex-none font-mono text-[14.5px] font-[650] whitespace-nowrap text-text">
                                          {ns !== '' && <span className="font-normal text-text-3">{ns}</span>}
                                          {base}
                                        </span>
                                        {/* 「未装」徽章（P4 口径 ④）：SkillChain 退役后画布是自定义 workflow 技能的唯一
                                            出口，「你 workflow 里这个技能本机没装」是既有真信号，不随页签蒸发。
                                            **挂在名字节点之外**（兄弟而非子节点）——名字节点的 textContent 必须逐字
                                            等于 skillId，零截断断言的落点不能因为多了个徽章就漂移。 */}
                                        {uninstBadge(skillId, `wb-lane-sk-uninst-${lane.id}-${skillId}`)}
                                        {canRemoveSkill && (
                                          <>
                                            {/* 弹性留白把 × 推到卡右缘（demo .ecard .pad 同款）；不参与 max-content 撑列。 */}
                                            <span className="min-w-2 flex-1" />
                                            <button
                                              type="button"
                                              className={SK_RM}
                                              data-testid={`wb-lane-sk-rm-${lane.id}-${skillId}`}
                                              // 可访问名带阶段归属：一屏 N 列可有同名技能，光「移除技能 X」不唯一
                                              // （同本文件所有多列控件的 `基名 · 阶段名` 统一口径）。
                                              aria-label={`${t('workbench.sk_remove', { id: skillId })} · ${lane.name}`}
                                              title={t('workbench.sk_remove', { id: skillId })}
                                              onClick={(e) => {
                                                // 不冒泡到泳道根的选中处理（同门徽章/依赖 chip 的既定做法）。
                                                e.stopPropagation()
                                                // 依赖级联清理归宿主（文件头 P4）——本处只报「删哪一列的哪个技能」。
                                                onSkillRemove?.(lane.id, skillId)
                                              }}
                                            >
                                              ×
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      {/* ── 第二行：依赖 chip（定稿核心 ③——降到第二行，不与名字抢宽度）。
                                           **纵向堆叠**而非横排：多依赖时横排的 max-content 会把整列撑到
                                           「所有 chip 排成一行」的宽度（零截断禁止压窄它们），列宽会失控；
                                           一行一条则列宽只取最长的那条，且多依赖读起来本就该分行。 ── */}
                                      {showDepRow && (
                                        <div className="mt-[7px] flex flex-col items-start gap-1.5 pl-[30px]">
                                          {deps.map((dep) => {
                                            const dn = splitName(dep)
                                            const chipOpen =
                                              depPop !== null && depPop.stage === lane.id && depPop.skill === skillId && depPop.prevDep === dep
                                            return (
                                              <span key={dep} className="relative inline-flex">
                                                {canDep ? <button
                                                  type="button"
                                                  className={DEP_CHIP}
                                                  data-testid={`wb-lane-dep-${lane.id}-${skillId}-${dep}`}
                                                  aria-expanded={chipOpen}
                                                  // 可访问名带「依赖谁 · 哪个技能 · 哪一列」——一屏上 N 列 × N 卡 × N 条依赖，
                                                  // 光「依赖」不唯一（同本文件所有多列控件的 `基名 · 阶段名` 口径，再加技能名一档）。
                                                  aria-label={`${t('workbench.board_dep_label')} ${dep} · ${skillId} · ${lane.name}`}
                                                  title={t('workbench.board_dep_chip_hint', { id: dep })}
                                                  onClick={(e) => {
                                                    // stopPropagation 两用：① 不让外部点击监听把刚开的 popover 收掉；
                                                    // ② 不冒泡到泳道根的选中处理（同门徽章的既定做法）。
                                                    e.stopPropagation()
                                                    // 与技能候选 popover 互斥（P4，见 skPop 注释）：stopPropagation 挡掉了
                                                    // 那边的外部点击监听，故这里得显式关，否则两个浮层会叠着同屏。
                                                    setSkPop(null)
                                                    setDepPop(chipOpen ? null : { stage: lane.id, skill: skillId, prevDep: dep })
                                                  }}
                                                >
                                                  {/* ⟼ 是装饰性方向记号（定稿 .depchip 同款），刻意留在 JSX 而非词典里：
                                                      它不是可翻译内容，进词典只会让每种语言各抄一遍同一个字形。 */}
                                                  <span className="flex-none whitespace-nowrap">⟼ {t('workbench.board_dep_label')}</span>
                                                  {/* 依赖的技能全名同样零截断（含命名空间，弱化但完整）。 */}
                                                  <span className="flex-none whitespace-nowrap">
                                                    {dn.ns !== '' && <span className="font-normal text-text-3">{dn.ns}</span>}
                                                    {dn.base}
                                                  </span>
                                                </button> : <span className={DEP_CHIP} title={`等待 ${dep} 完成后执行`}>
                                                  <span className="flex-none whitespace-nowrap">等待</span>
                                                  <span className="flex-none whitespace-nowrap">
                                                    {dn.ns !== '' && <span className="font-normal text-text-3">{dn.ns}</span>}
                                                    {dn.base}
                                                  </span>
                                                </span>}
                                                {canDep && chipOpen && depPopover(lane, skillId, candidates, dep)}
                                              </span>
                                            )
                                          })}
                                          {showDepAdd && (
                                            <span className="relative inline-flex">
                                              <button
                                                type="button"
                                                className={DEP_ADD}
                                                data-testid={`wb-lane-dep-${lane.id}-${skillId}`}
                                                aria-expanded={addOpen}
                                                aria-label={`${t('workbench.board_dep_add')} · ${skillId} · ${lane.name}`}
                                                title={t('workbench.board_dep_add')}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  // 与技能候选 popover 互斥（同上一处 chip 的理由）。
                                                  setSkPop(null)
                                                  setDepPop(addOpen ? null : { stage: lane.id, skill: skillId, prevDep: null })
                                                }}
                                              >
                                                ⟼ {t('workbench.board_dep_add')}
                                              </button>
                                              {addOpen && depPopover(lane, skillId, candidates, null)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                              ) : (
                                <span className="mx-0.5 text-[13px] text-text-3">{t('workbench.board_skills_empty')}</span>
                              )}
                            </div>
                            {/* 跨列搬撞名：不搬 + 说清为什么（诚实门——静默 no-op 会被读作「搬成功了」）。
                                下一次 dragstart 自动清（beginDrag），不设定时器：计时器在测试里是薛定谔的。 */}
                            {dupWarn === lane.id && (
                              <p className="mt-2 text-[12.5px] leading-[1.5] text-red" data-testid={`wb-lane-sk-dup-${lane.id}`} role="status">
                                {t('workbench.board_drag_dup')}
                              </p>
                            )}
                            {/* ── P4「+ 技能」（定稿 .addcard：整列宽虚线卡，坐在卡列表下方 = 「往这一列末尾
                                 加一张卡」的空间隐喻）。registry 未就绪 → **禁用 + 说明**，不谎报可加
                                 （契约 §2 诚实门，见文件头 P4 口径 ①）。 ── */}
                            {canAddSkill && (
                              <div className="relative mt-1.5">
                                <button
                                  type="button"
                                  className={SK_ADD}
                                  data-testid={`wb-lane-sk-add-${lane.id}`}
                                  aria-expanded={onOpenSkillEditor ? undefined : skPop === lane.id}
                                  // 可访问名带阶段归属（同 board_ed_out_add 的既定拼法：可见文案本身
                                  // 就是「+ 技能」，N 列之间靠 · 阶段名 才唯一）。
                                  aria-label={`${t('workbench.board_sk_add')} · ${lane.name}`}
                                  // 禁用时把「为什么点不动」也挂到 title 上——说明段是给看得见的人，
                                  // title 是给 hover 的人，两处同一句话。
                                  title={regReady ? '打开 Skill 编排器，配置顺序、并行与依赖' : t('workbench.board_sk_noreg')}
                                  disabled={!regReady}
                                  onClick={(e) => {
                                    // stopPropagation 两用（同依赖 chip 的既定做法）：① 不让外部点击监听把刚开的
                                    // popover 收掉；② 不冒泡到泳道根的选中处理。
                                    e.stopPropagation()
                                    // 与依赖 popover 互斥：开一个即关另一个（见 skPop 注释）。
                                    setDepPop(null)
                                    if (onOpenSkillEditor) onOpenSkillEditor(lane.id)
                                    else setSkPop((cur) => (cur === lane.id ? null : lane.id))
                                  }}
                                >
                                  {t('workbench.board_sk_add')}
                                </button>
                                {/* 禁用态的说明（契约 testid wb-lane-sk-noreg-${stage}）。role="note" 不存在，
                                    这是静态解释而非动态播报，故不加 role="status"——它随钮一起常驻，
                                    不是「刚刚发生的事」。 */}
                                {!regReady && (
                                  <p className={SK_NOREG} data-testid={`wb-lane-sk-noreg-${lane.id}`}>
                                    {t('workbench.board_sk_noreg')}
                                  </p>
                                )}
                                {/* 候选池 = registry 全量 − 本列已有。regReady 才渲染（未就绪时钮已禁用，
                                    skPop 也开不起来，这里的 && 是纯防御）。 */}
                                {!onOpenSkillEditor && regReady &&
                                  skPop === lane.id &&
                                  skillPopover(
                                    lane,
                                    (skillRegistry ?? []).map((e) => e.name).filter((n) => !skills.includes(n)),
                                  )}
                              </div>
                            )}
                          </div>
                        )}

                    {/* ── Hook 时机区（定稿核心 ④：一行摘要，点开是 4 时机分组的卡片体；
                         hooksCount 未就绪则整段不渲染）。**零拖手柄**——见文件头 P3 口径 ①。 ── */}
                    {hooksReady && (
                      <div data-testid={`wb-lane-hooks-${lane.id}`}>
                        {/* 摘要行。可展开时才是按钮（hooks 没传 = 没有卡可画 → 保持 P0 的死行，
                            连 hover 描边都不给：一个点了没反应的行比不可点更坏）。
                            刻意**不** stopPropagation：点摘要行既开合本区、也照常冒泡到泳道根选中该列
                            （同阶段名按钮的既定权衡——长出新能力不该让「点泳道 = 选中」变味）。 */}
                        {hookBody === null ? (
                          <div className={HK_SUMROW}>{hookSummary}</div>
                        ) : (
                          <button
                            type="button"
                            className={`${HK_SUMROW} ${HK_SUMROW_BTN}`}
                            data-testid={`wb-lane-hk-toggle-${lane.id}`}
                            aria-expanded={hkOpen}
                            // 收起时展开体整个不在 DOM 里，故 aria-controls 一并撤掉——指向一个不存在的
                            // id 是**坏掉的**关联（读屏跟过去什么都没有），比不给关联更糟。
                            aria-controls={hkOpen ? `wb-lane-hk-body-${lane.id}` : undefined}
                            onClick={() => setHookOpen((cur) => ({ ...cur, [lane.id]: !hkOpen }))}
                          >
                            <span className={HK_CARET} data-open={hkOpen ? '' : undefined} aria-hidden="true">
                              <Icon name="chevron" size={11} />
                            </span>
                            {hookSummary}
                          </button>
                        )}
                        {hookBody}
                      </div>
                    )}

                    {/* ── 产出区 ── */}
                    <div data-testid={`wb-lane-outs-${lane.id}`}>
                      <div className="mx-0.5 mb-2 flex items-center gap-2">
                        <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`}><Icon name="doc" size={12} />{t('workbench.board_zone_outputs')}</span>
                        <span className="ml-auto inline-flex flex-none items-center gap-1.5">
                          {readonly ? (
                            <span className={`${MINI_BASE} ${MINI_RO} inline-flex items-center gap-1`}><Icon name="gate" size={10} />{t('workbench.board_badge_ro')}</span>
                          ) : (
                            <span className={`${MINI_BASE} ${MINI_RW} inline-flex items-center gap-1`}><Icon name="gauge" size={10} />{t('workbench.board_badge_rw')}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-col items-start gap-1.5">
                        {lane.outputs.map((o) => {
                          const presentation = outputPresentation(o)
                          return (
                          // 字段名保持**直接文本子节点**（× 钮包在自己的 <button> 里）：
                          // getByText 只认直接文本，故「加了 × 之后 getByText(field) 就找不到了」
                          // 这种回归不会发生，零截断断言的落点也不漂移。同 StepEditor 产出 chip。
                          <span
                            key={o}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap text-text-2"
                            title={presentation.title}
                          >
                            {presentation.label}
                            {canEdit && (
                              <button
                                type="button"
                                className={OUT_X}
                                data-testid={`wb-lane-out-rm-${lane.id}-${o}`}
                                // 带阶段归属：不同阶段可以有同名产出字段，光「移除产出 notes」
                                // 在一屏 N 列里不唯一（也与 StepEditor 的「移除 {field}」区分开）。
                                aria-label={`${t('workbench.board_ed_out_rm', { field: o })} · ${lane.name}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeOutput(lane, o)
                                }}
                              >
                                ×
                              </button>
                            )}
                          </span>
                          )
                        })}
                        {lane.outputs.length === 0 && !addingOut && (
                          <span className="mx-0.5 text-[13px] text-text-3" data-testid={`wb-lane-outs-empty-${lane.id}`}>
                            {t('workbench.board_outs_empty')}
                          </span>
                        )}
                        {canEdit &&
                          (addingOut ? (
                            <input
                              // 同阶段名输入框：宽度走原生 size，不设宽度类（硬约束 ①）。
                              className={`${INPUT_BASE} px-2.5 py-1 font-mono text-[13px]`}
                              data-testid={`wb-lane-out-input-${lane.id}`}
                              placeholder={t('workbench.board_ed_out_placeholder')}
                              aria-label={`${t('workbench.board_ed_out_add')} · ${lane.name}`}
                              aria-invalid={outError !== null}
                              value={outAdd.draft}
                              size={Math.max(outAdd.draft.length + 1, 12)}
                              // eslint-disable-next-line jsx-a11y/no-autofocus -- 用户刚点了「+ 添加」，焦点进输入框是这次点击的直接延续
                              autoFocus
                              onChange={(e) => setOutAdd({ id: lane.id, draft: e.target.value, error: null })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  commitOutAdd(lane, false)
                                } else if (e.key === 'Escape') {
                                  commitOutAdd(lane, true)
                                }
                              }}
                              // 失焦：有值即提交、无值即收起（StepEditor.tsx:215 同款）
                              onBlur={() => commitOutAdd(lane, outAdd.draft.trim() === '')}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              className={OUT_ADD}
                              data-testid={`wb-lane-out-add-${lane.id}`}
                              // 可见文案「+ 产出」（定稿 demo 同款）而非 StepEditor 的「+ 添加」：
                              // 两者同屏，同名按钮作用于不同阶段，用户分不清（既有测试
                              // WorkbenchView.test.tsx:909 按 name '+ 添加' 寻址 StepEditor 那个，
                              // 撞名即 ambiguous）。aria-label 再带阶段归属，N 列之间也唯一。
                              // 注：**校验规则与错误文案仍照抄 StepEditor**（FIELD_RE /
                              // ed_output_invalid / ed_output_dup）——那是「同一条规则不许分叉」，
                              // 与这里的按钮文案撞名是两回事，别一起改。
                              aria-label={`${t('workbench.board_ed_out_add')} · ${lane.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOutAdd({ id: lane.id, draft: '', error: null })
                              }}
                            >
                              {t('workbench.board_ed_out_add')}
                            </button>
                          ))}
                      </div>
                      {outError !== null && (
                        <p className="mt-1.5 text-[12.5px] text-red" data-testid={`wb-lane-out-err-${lane.id}`}>
                          {outError}
                        </p>
                      )}
                      {/* ── P4 产出非空 guard（StepEditor 唯一还没被画布接管的面）。
                           落在产出区**之下**而非自成一区：它讲的是「这些产出得填了才放行」，
                           与产出 chips 是同一件事的两半，隔开就读不出关系（StepEditor.tsx:228-241
                           的既有版式同款：chips → 错误 → 开关 → 说明）。
                           文案逐字复用既有 ed_nonempty / ed_nonempty_note——画布与编辑卡开的是**同一个**
                           guard，两处措辞分叉 = 同一 app 两套说法（同 P1 口径 ② 对产出校验的判断）。 ── */}
                      {showGuard && (
                        <>
                          <div className="mt-2.5 flex items-center gap-[9px]">
                            <button
                              type="button"
                              className={SWITCH}
                              role="switch"
                              aria-checked={lane.nonemptyGuard === true}
                              // 可访问名带阶段归属：一屏 N 列各一个 guard 开关，外加 sheet 里 StepEditor 的
                              // wb-ed-nonempty——全叫「产出非空方可推进」的话读屏用户分不出在开哪一列
                              // （同本文件所有多列控件的 `基名 · 阶段名` 统一口径）。
                              aria-label={`${t('workbench.ed_nonempty')} · ${lane.name}`}
                              // 刻意无 disabled：本开关只在可编时渲染（见 showGuard），只读态压根走不到
                              // 这里（同门开关的既定注释）。
                              data-testid={`wb-lane-guard-${lane.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                // guards 数组的增删（并保留 tasks-at-least 等其余 guard）是宿主的活。
                                onLaneGuard?.(lane.id, lane.nonemptyGuard !== true)
                              }}
                            />
                            <span className={GUARD_LABEL}>{t('workbench.ed_nonempty')}</span>
                          </div>
                          <p className={GUARD_NOTE}>{t('workbench.ed_nonempty_note')}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {onAddStage && <button
            type="button"
            // v11 P4：宽度从定宽 140px 改为按内容自适应（w-max + px-6）。定宽在 1728 视口 3 列时
            // 恰好比可视区多出 ~22px，被 board-scroll 右缘裁成「+ 添加」——虽在滚动容器内滚一下
            // 就完整（零截断红线未破），但首屏读作「按钮文字被截断」。自适应后按钮只占它真正需要
            // 的宽度，同时 whitespace-nowrap 保证文案任何语言下都不折行。
            className="mt-1.5 grid min-h-[190px] w-max flex-none cursor-pointer place-items-center self-start rounded-2xl border-[1.5px] border-dashed border-border-2 px-6 text-[14px] font-bold whitespace-nowrap text-text-3 transition-colors duration-150 enabled:hover:border-green-b enabled:hover:bg-card enabled:hover:text-green-d disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onAddStage}
          >
            {t('workbench.add_stage')}
          </button>}
        </div>
      </div>

      {/* ── P1 删阶段二次确认（走共享 <Dialog>——Esc/Tab 困笼/焦点归位一并到位，禁原生 confirm）。
           本组件只发回调；删除引发的转换边重连是宿主的活（见文件头 P1 口径 ③）。
           removeLane 找不到（宿主已把该列删掉/换了 workflow）时整个弹窗不渲染，不留悬空确认框。 ── */}
      {removeLane !== undefined && (
        <Dialog
          title={t('workbench.board_rm_title', { name: removeLane.name })}
          onClose={() => setRemoveId(null)}
          testid="wb-lane-rm-confirm"
          actions={
            <>
              <button type="button" className={BTN_GHOST} onClick={() => setRemoveId(null)}>
                {t('workbench.board_rm_cancel')}
              </button>
              <button
                type="button"
                className={BTN_DANGER}
                data-testid="wb-lane-rm-ok"
                onClick={() => {
                  setRemoveId(null)
                  onRemoveStage?.(removeLane.id)
                }}
              >
                {t('workbench.board_rm_confirm')}
              </button>
            </>
          }
        >
          <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">
            {t('workbench.board_rm_body', { name: removeLane.name })}
          </p>
        </Dialog>
      )}
    </>
  )
}
