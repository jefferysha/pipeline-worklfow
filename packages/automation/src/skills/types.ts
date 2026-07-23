/**
 * skill 内容定位与 CAS 物化的共享类型面（H10-T4，设计定稿 §3 步骤 3-6 / §8 任务4；H10 r1 复审
 * 阻断2/4 补 provenance 字段规范与路径安全判据补漏）。
 *
 * 本文件放 content-locator.ts 与 snapshot-store.ts 两者共用的数据形状，以及两处都要用、必须
 * 共用同一条判据、不允许分裂成两份的极少量纯函数（目前只有 `isPathSafeSkillId`）——错误类和
 * 有副作用的实现始终留在各自的实现文件里（同本包既有惯例：WorktreeError 在 worktree.ts、
 * BarrierDriftError 在 barrier.ts，不额外抽一个"错误类型 barrel"）。
 *
 * 定位边界：这两个模块是「已接线 skillBundleId → 物化 CAS 快照」链路（设计 §3 步骤 3-6）里
 * 最底层的两个物理原语——
 *   · content-locator 回答"这个具体 skill id 现在的字节在哪个目录"（物理定位，不保存 bundle
 *     定义、不做安装）；
 *   · snapshot-store 回答"把这些目录的完整内容冻结成不可变、内容寻址的快照"（CAS 物化）。
 * 谁在什么时点调用它们（admission→claim→prepareSkillBundle 的编排、每类失败对应哪个
 * SkillBundleFailureReason、governance/ledger 的重新校验）是 H10 任务 5 的范围，本文件与
 * 下述两个实现文件都不出现那些编排概念，也不 import scheduler/admission/lifecycle 的任何符号。
 */

/** 具体 skill 的标识——已经过 alternative 挑选后的单一 id（不是 manifest `a|b` token 本身）。 */
export type SkillId = string

/**
 * 规范化文件条目——快照 manifest 的最小单位（设计 §3 步骤 5：只记路径、内容 hash、可执行位；
 * 不记录 mtime、uid、绝对宿主路径——那些是宿主机私有状态，不构成"内容"的一部分，两台机器/
 * 两个不同安装位上字节相同的同一个 skill 必须产出相同的条目）。
 */
export interface CanonicalFileEntry {
  /** 相对 skill 内容根的路径，POSIX `/` 分隔，按码点升序排列于所属 manifest 内。 */
  readonly relativePath: string
  /** 文件内容的 sha256（64 位小写 hex）。symlink 已解引用——这是被引用目标的内容 hash。 */
  readonly sha256: string
  /** 任一 exec bit（owner/group/other）为真即记 true。 */
  readonly executable: boolean
}

/**
 * 单个 skill 内容根的规范化清单：排序后的文件条目 + 该 skill 自身内容的聚合 hash。
 * `treeSha256` 是 content-locator 多根折叠/歧义判定与 snapshot-store 聚合快照 hash 共用的
 * 同一算法产物——两处故意不各自发明一套摘要口径。
 */
export interface SkillCanonicalManifest {
  readonly skillId: SkillId
  readonly files: readonly CanonicalFileEntry[]
  readonly treeSha256: string
}

/** content-locator 对一个 skill id 的物理定位结果。 */
export interface LocatedSkillContent {
  readonly skillId: SkillId
  /** 内容所在的真实目录——已穿过顶层安装位 symlink 解析，不是可能悬空的链接本身。 */
  readonly contentDir: string
}

/** snapshot-store 的物化输入：已经过 locator 挑选、无歧义的具体 skill 内容位置。 */
export interface SkillSnapshotInput {
  readonly skillId: SkillId
  readonly contentDir: string
}

/**
 * skill id 的路径安全判据——content-locator（`join(root, skillId)` 做候选定位）与 snapshot-store
 * （`join(stagingDir, 'skills', skillId)` 做 CAS 暂存）都会把 skillId 直接拼进真实文件系统路径，
 * 两处必须共用同一条判据，不允许标准分裂出"这边挡住了、那边漏了"的缺口：禁空串、路径分隔符
 * （`/`、`\`）、`..`（父目录逃逸）、NUL 字节、恰好等于单独的 `.`。
 *
 * 单独 `.` 单独枚举（H10 r1 复审阻断2/4 第3节尾注）：`join(root, '.')` 退化成 `root` 自身——把
 * 整个内容根（可能含多个 skill、任意目录结构）当成"一个 skill"去定位/物化，是路径语义层面的
 * 越权，不是字面的路径分隔符/父目录逃逸，原判据（禁 `/`、`\`、`..`、NUL）不会拦住它，必须单独
 * 判断（`..` 判据只匹配"连续两个点"，不会命中恰好一个点的 `.`）。
 */
export function isPathSafeSkillId(skillId: SkillId): boolean {
  return skillId.length > 0 && skillId !== '.' && !/[/\\]|\.\.|\0/.test(skillId)
}

/**
 * 一次快照发布的结果。`reused=true` 表示命中已有同 digest 的 CAS 目录——逐字节验证通过、
 * 未覆盖、直接复用；`false` 表示本次真正写入了一个此前不存在的新 CAS 目录。
 */
export interface SkillSnapshotPublishResult {
  readonly digest: string
  readonly casDir: string
  readonly manifests: readonly SkillCanonicalManifest[]
  readonly reused: boolean
}

/**
 * 单个 effective slot 的完整 provenance——记录 resolver 当次的候选原序与最终选中项（H10 r1
 * 复审阻断2/4 D4："审计字段必须至少包括...slot alternatives/selection"，不能只留最终选择、
 * 丢失候选顺序这一步的可核验性）。字段与 kernel `ledger-types.ts::SkillBundleSnapshotRecord.slots`
 * 同构，刻意共用同一套字段拼写（`concrete_skill_id`/`tree_sha256` 沿用既有 ledger 命名；
 * `alternatives` 是本次新增、取代原单一 `token` 声明字符串的更完整形式——原始 token 文本可由
 * `alternatives.join('|')` 还原，不丢信息）。
 */
export interface SkillSnapshotProvenanceSlot {
  /** 该 slot 声明的候选 skill id，按 manifest/workflow 原始声明顺序排列（不是选中后的单值）。 */
  readonly alternatives: readonly SkillId[]
  /** resolver 最终选中、实际参与物化的具体 skill id（= alternatives 中的某一个）。 */
  readonly concrete_skill_id: SkillId
  /** 被选中 skill 内容目录自身的聚合 hash（= 对应 SkillCanonicalManifest.treeSha256）。 */
  readonly tree_sha256: string
}

/**
 * CAS canonical descriptor（manifest.json）的完整 provenance——由调用方传入，snapshot-store.ts
 * 只负责诚实落盘、并把整份内容纳入聚合 digest 覆盖（H10 r1 复审阻断2/4 第2/4点 D4："CAS 内必须
 * 有被 digest 覆盖的完整 canonical descriptor"）。三处必须共用同一套字段拼写与取值——本类型、
 * kernel `ledger-types.ts::SkillBundleSnapshotRecord`、
 * `automation/admission/execution-context.ts::PreparedExecutionContext.skillBundle`；本类型是
 * 三者中字段集最完整的一份（另两处目前更窄，对齐到本形状是 H10 任务B1 的接线工作，本文件不
 * 单方面替它们改）。字段沿用 loops/ledger 域既有的 snake_case 惯例（同
 * `ExecutionContext` 顶层字段——`attempt_id`/`reservation_id`/`loop_id`/`policy_epoch`/
 * `skill_bundle_id`/`workflow_run_id`——见 execution-context.ts），不是本包别处（如现有
 * `PreparedSkillBundle`）用的 camelCase：这些字段的价值恰恰在于"能在三处间原样比对"，spelling
 * 漂移会让审计/复核逻辑必须先做字段名翻译，白白增加出错面。
 *
 * 本类型只钉字段形状，不做业务校验（如 slots 是否真的对应调用方传入的 inputs、workflow/step/
 * track 是否真实存在于某个 workflow 定义里）——snapshot-store.ts 不 import kernel/admission 的
 * 任何符号（见该文件头注），无法也不应该在本层做那类校验；把 provenance 数据接到真实 admission
 * 上下文（loop-admission.ts）是 H10 任务B1 的职责，本类型现在只是"允许调用方可选传入"的入口。
 */
export interface SkillSnapshotProvenance {
  readonly loop_id: string
  readonly policy_epoch: string
  readonly skill_bundle_id: string
  readonly attempt_id: string
  readonly reservation_id: string
  /** 已有 runMetadata 时诚实携带；非 loop 的直跑路径没有 WorkflowRun 可归属时省略（镜像
   *  `ExecutionContext.workflow_run_id` 同一可选性理由，见该字段头注）。 */
  readonly workflow_run_id?: string
  readonly workflow: string
  readonly step: string
  readonly track: string
  /** workflow/manifest 输入的摘要（= `CapturedExecutionCoordinate.inputsDigest`），供
   *  governance→ledger 锁序下的 TOCTOU 复核比对（设计 §3 步骤7）。 */
  readonly coordinate_digest: string
  readonly resolution_source: 'default' | 'custom'
  readonly slots: readonly SkillSnapshotProvenanceSlot[]
}
