# Host Plan 桌面信息清晰度设计

## 问题与目标

Host Plan 的目标用户是在执行 setup/update 前核对宿主、范围、命令和副作用的本地开发者。当前 12 个宿主卡片每张高约 202px，在 1024–1920px 电脑端只同时显示 4–5 个宿主；重复 capability chips 占用了选择目录的大部分高度。

本批次目标是让用户更快完成“扫描宿主 → 选择目标 → 核对能力与范围 → 选择操作 → 阅读/复制计划”，同时保持 `host-target-plan/v1`、只读生成、所有错误/空态和现有中英文文案契约。

## 约束与非目标

- 只验收 1024×768、1200×870、1440×900、1920×1080。
- 不做手机端设计、截图、触控目标或验收。
- 不改 API、DTO、server、持久化、依赖、App/Nav、全局 token 或开放 PR 的功能域。
- 不增加真实 setup/update 执行入口。
- 不新增动画；选择和计划状态仍即时更新，避免对运维决策面添加装饰性运动。

## 基线证据

详见 `docs/research/2026-07-29-dashboard-host-plan-clarity-audit.md`。关键事实是目录 `scrollHeight=2235px`，而四个目标桌面视口的目录可视高度为 640–952px，首卡固定约 202px，只能同时看到 4–5 个宿主。

## 方案比较

| 方案 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| A. 紧凑目录 + 已选详情（采用） | 目录只保留名称、flag、kind、scope 和选择动作；capabilities 移到详情头部 | 不新增状态/文案；显著提高扫描密度；信息不丢失 | 选择前看不到所有 capability，需要一次无副作用选择 |
| B. 搜索与 kind 过滤 | 增加搜索框、All/Native/Adapter 筛选 | 大目录定位最快 | 新增状态、可见文案和 i18n；目录只有 12 项，复杂度偏高；与多个开放 PR 的翻译文件重叠 |
| C. 多列卡片网格 | 宽屏显示两列卡片 | 保留全量 capability 概览 | 1024px 主从布局下卡片过窄；阅读顺序和详情位置更易跳动 |

## 决策

采用方案 A。目录继续由 `HostTargetPlanView` 拥有选择和请求状态；`HostOperationPlanPanel` 负责展示已选宿主上下文、操作与计划。未引入新的共享组件、Context、API 或依赖。

### 目录

- 仍按 server catalog 稳定顺序渲染 12 个目标。
- 每项使用紧凑 article，保留宿主名称、CLI flag、kind、scope 和全宽选择按钮。
- 通过 `aria-pressed`、accent 边界和清晰的已选文案表达选择。
- capability chips 不再在每个未选项重复。

### 已选宿主详情

- operation panel 顶部展示 CLI flag、kind、scope 与当前宿主 capability chips。
- 信息顺序固定为“宿主上下文 → 操作 → 请求状态/计划”，与键盘顺序一致。
- loading/error/retry/ready 分支复用现有状态机；切换宿主继续取消旧请求并清除过期计划。

### 状态与可访问性

- catalog loading/error/empty 保持可感知，retry 行为不变。
- 目标与 operation 仍使用原生 button；焦点环、`aria-pressed`、具名 group 和 live status 保持。
- 复制命令仅复制 `plan.command.display`，成功/失败继续通过 `role=status` 播报。
- 明暗/system 主题只使用既有语义 token，不引入新的颜色值。
- `prefers-reduced-motion` 下没有新增需关闭的动画。

## Assumptions / Decision Log

1. 用户在选择前首先需要区分宿主名称、native/adapter 和 user/project scope；完整 capability 是核对当前选择的详情，而不是所有候选的首要扫描字段。
2. 选择宿主只改变本地 UI 状态，不请求计划、不写文件、不执行命令，因此把 capability 移到选择后的详情不会增加外部风险。
3. 目录规模固定为当前注册宿主集合，12 项不足以证明搜索状态的维护成本合理；若未来目录显著增长，再以独立 Change 引入筛选。
4. 外部库调研不适用：方案只重排既有 React/Tailwind 组件，不做依赖选择或技术替换，因此跳过 `search-first` 外部包搜索。

## Grill 红队自检

| 质疑 | 证据/回答 | 归属 |
| --- | --- | --- |
| capability 是否被隐藏导致错误选择？ | 选择本身零副作用；选中后、选择操作前完整展示 capability，且 kind/scope 始终在目录可见。 | 本设计与 delta spec |
| 目录压缩是否牺牲可读性？ | 名称、flag、kind、scope 保留；目标视口最窄仍有约 339px 卡片宽度。以浏览器验收测量行高、换行与对比。 | Verify 矩阵 |
| 谁拥有 catalog 顺序和能力 token？ | server 的 `host-target-plan/v1` DTO 与 `TENON_HOSTS` 顺序拥有；前端只投影，不排序、不推断。 | 既有主 spec |
| 状态失败时是否回退到过期计划？ | 现有 request sequence + AbortController 在切换目标时取消并清空计划；本批次不改变该规则并保留测试。 | `HostTargetPlanView` |
| 为何不使用 GSAP？ | 选择层级和反馈已经由原生即时状态表达；新增运动不会增加因果理解，反而干扰快速核对。 | ADR |

## 验收矩阵

- 1024、1200、1440、1920px：无横向页面溢出，目录和详情不重叠，目录同屏可见宿主数明显高于基线。
- light/dark/system：名称、flag、kind/scope、capability、选中态、命令与 notice 均可辨。
- 键盘：从目录选择目标后可继续到 Setup/Update 和复制命令；焦点可见，顺序与视觉顺序一致。
- 状态：catalog loading/error/empty/retry，plan loading/error/retry/ready，复制成功/失败。
- reduced-motion：无新增动画；状态变化不依赖运动表达。

```coverage
touches:
L1_api:      waived -> 不改变 host-target-plan/v1、HTTP 路由或客户端 decoder
L2_data:     waived -> 不改变 host-target-plan/v1 DTO、catalog 顺序或状态模型
L3_rules:    filled -> #状态与可访问性
L4_state:    filled -> #目录
L5_errors:   filled -> #状态与可访问性
L6_security: waived -> 保持本机只读 GET、无执行入口与既有信任边界
L7_perf:     filled -> #基线证据
L8_deps:     waived -> 不新增或升级依赖
L10_terms:   filled -> #术语
```

## 术语

- **目录**：左侧宿主目标选择集合。
- **详情**：右侧已选宿主上下文、操作与计划预览区域。
- **计划**：`side_effects: none` 的只读命令和步骤描述，不是执行动作。
