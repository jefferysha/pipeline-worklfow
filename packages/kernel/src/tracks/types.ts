/**
 * 动态 Track Registry —— 类型契约（GOAL.md 清单 T · T-R1，codex 2026-07-17 设计裁决钉死）。
 *
 * 两层模型：
 * - ProjectTrackConfig：`.pipeline/tracks.yaml` 的原始配置（parse 的输出、validate 的输入、
 *   serialize 的输入）。字段可选性如实反映文件里可省略的内容；枚举字段放宽为 string——
 *   闭集校验是 validate 的职责（parse 只管形状与标量类型），所以非法值必须能被本类型承载。
 * - TrackDefinition / TrackRegistry：合成后的 effective 模型（内建 Track + 项目额外 track），
 *   字段全部收窄为闭集类型，registry 的消费方只读这一层。
 *
 * 本模块只在 tracks/ 内部与其直接消费方之间使用；kernel/src/types.ts 的 TRACKS 常量仍是
 * 现行运行时全集来源，切换属于清单 T 的 R2 阶段（见 GOAL.md）。
 */

/** track 标识符（词法约束见 TRACK_ID_RE）。 */
export type TrackId = string

/** review 双字段的初始种子值（对齐 state/store.ts initialFields：pm 轨种 skipped，其余 pending）。 */
export type ReviewSeed = 'pending' | 'skipped'

/** 覆盖率剖面（对齐 guard 侧覆盖率适用性判定的四档语义）。 */
export type CoverageProfile = 'none' | 'pm' | 'frontend' | 'backend'

/**
 * track id 词法：小写字母开头，仅 a-z0-9_-，总长 ≤32。
 * 禁 '.'——manifest 的 phase.track 键空间用点分隔，id 带点会撕裂键解析。
 * '_all' 是保留字（manifest 技能表的兜底键）：本正则已排除下划线开头的 id，
 * validate 对 '_all' 另给专门报错文案。
 */
export const TRACK_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/

/** track ↔ workflow 绑定：default 为 init 构造点使用的缺省 workflow；allowed 为白名单（'*' 全放行）。 */
export interface TrackWorkflowBinding {
  readonly default: string
  readonly allowed: '*' | readonly string[]
}

/**
 * track 能力位集合——把 store.ts reviewInit、gate/afk 的 pm 特判、覆盖率适用性、
 * router_patterns、技能矩阵参与度收敛成的显式 policy（消费接线属于清单 T 的 R4/R5 阶段）。
 * plan/review 豁免刻意不进本类型：保持 P0 的 track-not-in:['pm'] predicate 语义。
 */
export interface TrackPolicyProfile {
  readonly reviewSeed: ReviewSeed
  /**
   * 真正的「spec-complete 后交给 AFK」策略位。它与 automationEligible 分离：后者只表示
   * 用户显式执行 `pipeline afk enqueue` 是否被允许，不能因为默认值为 true 就劫持正常 Build。
   * 缺席等价于 false，兼容已存在的项目 track registry。
   */
  readonly autoEnqueueOnSpecComplete?: boolean
  readonly automationEligible: boolean
  readonly coverageProfile: CoverageProfile
  readonly routing:
    | { readonly enabled: false }
    | {
        readonly enabled: true
        readonly pattern: string
        /** A match here excludes this track before score/priority selection. */
        readonly excludePattern?: string
        readonly priority: number
      }
  readonly skills: {
    readonly matrix: boolean
    /** manifest skill profile 名，不等于 track id；'_all' = 不分 track 的兜底表。 */
    readonly profile: '_all' | string
  }
}

/** effective 模型里的单条 track 定义。 */
export interface TrackDefinition {
  readonly id: TrackId
  readonly label: string
  /** effective 模型的计算字段（内建 Track 为 true / 项目额外 track 为 false），不直接来自 YAML。 */
  readonly builtin: boolean
  readonly workflow: TrackWorkflowBinding
  readonly policyProfile: TrackPolicyProfile
}

/** 合成后的 registry：内建 Track 恒排最前（chat/simple/pm/frontend/backend 固定序），额外 track 按文件声明序。 */
export interface TrackRegistry {
  readonly ordered: readonly TrackDefinition[]
  readonly byId: ReadonlyMap<TrackId, TrackDefinition>
  /** 规范化内容 hash（serialize.ts 规范化输出的 sha256 前 16 hex），见 registry.ts。 */
  readonly revision: string
  readonly source: 'builtin-only' | 'project-file'
}

// ── 项目文件原始配置（YAML 侧 snake_case → TS 侧 camelCase）─────────────────────

/**
 * workflow 绑定的文件形态：内建覆写场景两键都可省略（省略 = 继承内建原值）；额外 track 的
 * default 与 allowed 均必填——全放行必须显式写 '*'，省略是校验错误（codex R1 裁定，无隐式默认）。
 */
export interface ProjectWorkflowConfig {
  readonly default?: string
  readonly allowed?: '*' | readonly string[]
}

/** routing 的文件形态：闭集/判别联合的约束（enabled=false 不许带 pattern/priority）由 validate 执行。 */
export interface ProjectRoutingConfig {
  readonly enabled?: boolean
  readonly pattern?: string
  readonly excludePattern?: string
  readonly priority?: number
}

export interface ProjectSkillsConfig {
  readonly matrix?: boolean
  readonly profile?: string
}

/** policy_profile 的文件形态：额外 track 必须全字段声明（缺失由 validate 报错，不做隐式默认）。 */
export interface ProjectPolicyProfileConfig {
  readonly reviewSeed?: string
  readonly autoEnqueueOnSpecComplete?: boolean
  readonly automationEligible?: boolean
  readonly coverageProfile?: string
  readonly routing?: ProjectRoutingConfig
  readonly skills?: ProjectSkillsConfig
}

/**
 * builtins 覆写节的单条：v1 只许 label/workflow 两个子键。
 * policyProfile 在此可表示是刻意的——parse 保真带出文件内容，由 validate 统一拒绝
 * （v1 锁死内建 policy），错误归属对齐裁决的校验面划分。
 */
export interface ProjectBuiltinOverrideConfig {
  readonly label?: string
  readonly workflow?: ProjectWorkflowConfig
  readonly policyProfile?: ProjectPolicyProfileConfig
}

/** tracks: 数组的单条（额外 track 声明）。 */
export interface ProjectTrackEntryConfig {
  readonly id?: string
  readonly label?: string
  readonly workflow?: ProjectWorkflowConfig
  readonly policyProfile?: ProjectPolicyProfileConfig
}

/** `.pipeline/tracks.yaml` 的完整原始配置。 */
export interface ProjectTrackConfig {
  readonly version: 1
  /** 键 = 内建 track id（键合法性由 validate 判定，parse 层任意字符串键都能承载）。 */
  readonly builtins?: Readonly<Record<string, ProjectBuiltinOverrideConfig>>
  readonly tracks?: readonly ProjectTrackEntryConfig[]
}

/**
 * validate/load 的外部事实注入面：
 * - workflowExists：workflow id 是否存在（'default' 恒视为存在，无须查询）；
 * - skillProfiles：manifest 侧全部 skill profile 名（'_all' 恒合法，不必包含在集合里）。
 */
export interface TrackValidationContext {
  workflowExists(id: string): boolean
  readonly skillProfiles: ReadonlySet<string>
}

// ── R3 CRUD：patch/spec 类型（tracks/crud.ts 的纯配置变换入参）─────────────────────

/**
 * create 一个额外 track 的完整规格（CLI 层已把 --policy preset 展开成完整 policyProfile 再传入；
 * kernel 只做纯配置变换 + 落盘前完整校验）。id 词法/撞名/上限等由 crud + 完整校验共同守住。
 */
export interface CreateTrackSpec {
  readonly id: string
  readonly label: string
  readonly workflow: TrackWorkflowBinding
  readonly policyProfile: TrackPolicyProfile
}

/**
 * update 的字段级 partial patch（未提供的键 = 保留锁内最新值，不是清空）。workflowDefault 与
 * workflowAllowed 各自独立可改；policyProfile 仅额外 track 可改（builtin 传它由 crud 拒绝）。
 * id 不在 patch 内——改 id 属未来显式 migrate，不是普通 update（codex D3 裁决）。
 */
export interface UpdateTrackPatch {
  readonly label?: string
  readonly workflowDefault?: string
  readonly workflowAllowed?: '*' | readonly string[]
  readonly policyProfile?: TrackPolicyProfile
}
