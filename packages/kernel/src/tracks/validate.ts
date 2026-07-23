/**
 * ProjectTrackConfig 语义校验——返回错误清单（空 = 合法），不 throw，fail-loud 姿势由调用方定
 * （loadTrackRegistry 聚合抛出、R3 CRUD 面可整单回显）。
 *
 * 分两档：
 * - validateTrackConfigStructure：上下文无关子集（id 词法/'_all' 保留字/与内建重名/彼此重名/
 *   闭集/正则过 JS RegExp 语法烟测/priority 非负整数/上限 32/额外 track 的 allowed 显式声明/
 *   builtins 覆写限制）。它只是子集、不是完整校验：引用存在性它看不到。写盘前的强制校验是
 *   完整档（writeTrackRegistry 必填 context，见 registry.ts）；本函数服务于拿不到上下文的
 *   纯形状 lint 场景。
 * - validateTrackRegistry：结构子集 + 上下文检查（workflowExists / skillProfiles 成员资格）。
 *
 * 约定：'default' workflow 恒视为存在（kernel 固有 workflow 名）；'_all' 恒为合法 skill
 * profile（manifest 技能表兜底键）。builtins 覆写只许 label/workflow 两个子键——v1 锁死内建
 * policy 的裁决理由：P0 后 plan/review 豁免仍按 track-not-in:['pm'] predicate 判定，放开内建
 * policy 覆写会造成新的语义撕裂。
 */
import {
  TRACK_ID_RE,
  type ProjectBuiltinOverrideConfig,
  type ProjectPolicyProfileConfig,
  type ProjectTrackConfig,
  type ProjectTrackEntryConfig,
  type ProjectWorkflowConfig,
  type TrackValidationContext,
} from './types.js'
import { BUILTIN_TRACK_IDS, builtinTrack, isBuiltinTrackId, type BuiltinTrackId } from './builtins.js'
import { stringUnrepresentableReason } from './representable.js'

/** track 总数上限（内建 + 额外合计）。 */
export const MAX_TRACKS = 32

const REVIEW_SEEDS: ReadonlySet<string> = new Set(['pending', 'skipped'])
const COVERAGE_PROFILES: ReadonlySet<string> = new Set(['none', 'pm', 'frontend', 'backend'])

/**
 * 把「serialize 写不出 ⇒ write→load 自毁」前移到校验层（R2 阻断 2）：任何会落进 tracks.yaml
 * 的字符串字段，validate 放行必须蕴含 serialize 写得出。拒绝面唯一事实源在 representable.ts，
 * 与 serialize.emitString 共用，两处不再各自漂移。仅对已确认是非空字符串的值调用。
 */
function checkRepresentable(value: string, at: string, errors: string[]): void {
  const reason = stringUnrepresentableReason(value)
  if (reason !== null) errors.push(`${at}: ${reason}`)
}

type WorkflowOk = (id: string) => boolean
type ProfileOk = (profile: string) => boolean

export function validateTrackRegistry(
  config: ProjectTrackConfig,
  context: TrackValidationContext,
): readonly string[] {
  return collect(config, context)
}

/** 上下文无关子集（跳过 workflowExists/skillProfiles 成员检查，其余规则全跑）。 */
export function validateTrackConfigStructure(config: ProjectTrackConfig): readonly string[] {
  return collect(config, null)
}

function collect(config: ProjectTrackConfig, context: TrackValidationContext | null): string[] {
  const errors: string[] = []
  const workflowOk: WorkflowOk = (id) => id === 'default' || context === null || context.workflowExists(id)
  const profileOk: ProfileOk = (p) => p === '_all' || context === null || context.skillProfiles.has(p)

  if ((config.version as number) !== 1) {
    errors.push(`version: 只支持 1，得到 ${JSON.stringify(config.version)}`)
  }

  for (const [key, ov] of Object.entries(config.builtins ?? {})) {
    const at = `builtins.${key}`
    if (!isBuiltinTrackId(key)) {
      errors.push(`${at}: 不是内建 track id（内建只有 ${BUILTIN_TRACK_IDS.join('/')}；额外 track 放 tracks: 数组）`)
      continue
    }
    checkOverride(ov, at, key, workflowOk, errors)
  }

  const tracks = config.tracks ?? []
  const seen = new Set<string>()
  // 索引循环 + 空槽拒绝（同 allowed：forEach 跳过稀疏数组空槽 → validate 放行，但 serialize 的
  // for...of 会在空槽拿到 undefined 读 entry.id 抛 TypeError，write→load 自毁；codex R5 抓到顶层
  // tracks 与 allowed 同构，两处都要索引循环）。
  for (let i = 0; i < tracks.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(tracks, i)) {
      errors.push(`tracks[${i}]: 数组空槽（稀疏数组不可表示）`)
      continue
    }
    checkEntry(tracks[i]!, `tracks[${i}]`, seen, workflowOk, profileOk, errors)
  }

  const total = BUILTIN_TRACK_IDS.length + tracks.length
  if (total > MAX_TRACKS) {
    errors.push(`track 总数 ${total} 超过上限 ${MAX_TRACKS}（内建 ${BUILTIN_TRACK_IDS.length} + 额外 ${tracks.length}）`)
  }
  return errors
}

function checkOverride(
  ov: ProjectBuiltinOverrideConfig,
  at: string,
  id: BuiltinTrackId,
  workflowOk: WorkflowOk,
  errors: string[],
): void {
  if (ov === null || typeof ov !== 'object') {
    errors.push(`${at}: 覆写须为 mapping（只许 label/workflow 两个子键）`)
    return
  }
  if (ov.policyProfile !== undefined) {
    errors.push(
      `${at}.policy_profile: v1 锁死内建 policy，不允许覆写（只许 label/workflow 两个子键；` +
        `理由：plan/review 豁免按 track-not-in:['pm'] 判定，放开会撕裂该语义）`,
    )
  }
  if (ov.label !== undefined) {
    if (typeof ov.label !== 'string' || ov.label.trim() === '') errors.push(`${at}.label: 须为非空字符串`)
    else checkRepresentable(ov.label, `${at}.label`, errors)
  }
  if (ov.workflow !== undefined) {
    checkWorkflow(ov.workflow, at, builtinTrack(id).workflow.default, false, workflowOk, errors)
  }
}

function checkEntry(
  entry: ProjectTrackEntryConfig,
  at: string,
  seen: Set<string>,
  workflowOk: WorkflowOk,
  profileOk: ProfileOk,
  errors: string[],
): void {
  if (entry === null || typeof entry !== 'object') {
    errors.push(`${at}: 须为 mapping（'- id: …' 形式）`)
    return
  }
  const id = entry.id
  if (typeof id !== 'string' || id === '') {
    errors.push(`${at}.id: 缺失或非字符串`)
  } else {
    if (id === '_all') {
      errors.push(`${at}.id: '_all' 是保留字（manifest 技能表兜底键），不能作 track id`)
    } else if (!TRACK_ID_RE.test(id)) {
      errors.push(`${at}.id: '${id}' 不合法（须匹配 ${String(TRACK_ID_RE)}：小写字母开头、仅 a-z0-9_-、最长 32、禁 '.'）`)
    }
    if (isBuiltinTrackId(id)) {
      errors.push(`${at}.id: '${id}' 与内建 track 重名（内建覆写走 builtins: 节）`)
    }
    if (seen.has(id)) errors.push(`${at}.id: '${id}' 重复声明`)
    seen.add(id)
  }

  if (typeof entry.label !== 'string' || entry.label.trim() === '') {
    errors.push(`${at}.label: 须为非空字符串`)
  } else {
    checkRepresentable(entry.label, `${at}.label`, errors)
  }

  if (entry.workflow === undefined) {
    errors.push(`${at}.workflow.default: 缺失（额外 track 必须声明非空 workflow id）`)
    errors.push(`${at}.workflow.allowed: 缺失（额外 track 必须显式声明；全放行请写 '*'）`)
  } else {
    checkWorkflow(entry.workflow, at, undefined, true, workflowOk, errors)
  }

  if (entry.policyProfile === undefined) {
    errors.push(`${at}.policy_profile: 缺失（额外 track 必须完整声明 policy_profile）`)
  } else {
    checkPolicy(entry.policyProfile, `${at}.policy_profile`, profileOk, errors)
  }
}

function checkWorkflow(
  wf: ProjectWorkflowConfig,
  at: string,
  fallbackDefault: string | undefined,
  // true = 额外 track（default/allowed 均必须显式声明）；false = 内建覆写（省略 = 继承内建原值）
  isProjectTrack: boolean,
  workflowOk: WorkflowOk,
  errors: string[],
): void {
  if (wf === null || typeof wf !== 'object') {
    errors.push(`${at}.workflow: 须为 mapping（default/allowed）`)
    return
  }
  const d = wf.default
  if (isProjectTrack && (d === undefined || d === '')) {
    errors.push(`${at}.workflow.default: 缺失（额外 track 必须声明非空 workflow id）`)
  }
  if (d !== undefined) {
    if (typeof d !== 'string' || d === '') errors.push(`${at}.workflow.default: 须为非空字符串`)
    else {
      checkRepresentable(d, `${at}.workflow.default`, errors)
      if (!workflowOk(d)) errors.push(`${at}.workflow.default: workflow '${d}' 不存在`)
    }
  }

  const allowed = wf.allowed
  if (allowed === undefined) {
    // codex R1 裁定：额外 track 的 allowed 不给隐式默认，全放行必须显式写 '*'；
    // 内建覆写省略 allowed 继承内建原值，不落显式声明义务。
    if (isProjectTrack) {
      errors.push(`${at}.workflow.allowed: 缺失（额外 track 必须显式声明；全放行请写 '*'）`)
    }
    return
  }
  if (allowed === '*') return
  if (!Array.isArray(allowed)) {
    errors.push(`${at}.workflow.allowed: 只支持 '*' 或字符串数组`)
    return
  }
  // R3 D3：显式拒绝空数组，给直接错误（不再靠"未含 default"间接报）——空白名单让该 track 无任何
  // 可绑定 workflow，是配置错误本身，全放行必须显式写 '*'。空数组也不进下方 default membership 判定。
  if (allowed.length === 0) {
    errors.push(`${at}.workflow.allowed: 数组不能为空（全放行写 '*'，否则至少列一个 workflow id）`)
    return
  }
  // 索引循环 + 显式空槽拒绝（不是 forEach——它跳过稀疏数组的空槽：`['default'];a.length=2` 会
  // 校验通过，但 serialize 的 map/every 同样跳过空槽写出 `[default, ]`，parse 读第二项为 null
  // → load 失败，write→load 自毁，codex R4 探针实证）。
  const seenAllowed = new Set<string>()
  for (let j = 0; j < allowed.length; j++) {
    if (!Object.prototype.hasOwnProperty.call(allowed, j)) {
      errors.push(`${at}.workflow.allowed[${j}]: 数组空槽（稀疏数组不可表示）`)
      continue
    }
    const w = allowed[j]
    if (typeof w !== 'string' || w === '') errors.push(`${at}.workflow.allowed[${j}]: 须为非空字符串`)
    else {
      checkRepresentable(w, `${at}.workflow.allowed[${j}]`, errors)
      if (!workflowOk(w)) errors.push(`${at}.workflow.allowed[${j}]: workflow '${w}' 不存在`)
      // R3 D3：拒绝重复项（无意义、且让 registry 序列化输出不稳定）
      if (seenAllowed.has(w)) errors.push(`${at}.workflow.allowed[${j}]: 重复项 '${w}'（同一 workflow 不能列多次）`)
      seenAllowed.add(w)
    }
  }
  // membership 按 effective default 判：覆写场景未改 default 时用内建缺省值兜底
  const eff = typeof d === 'string' && d !== '' ? d : fallbackDefault
  if (eff !== undefined && !allowed.includes(eff)) {
    errors.push(`${at}.workflow.allowed: 数组必须包含 default '${eff}'`)
  }
}

function checkPolicy(p: ProjectPolicyProfileConfig, at: string, profileOk: ProfileOk, errors: string[]): void {
  if (p === null || typeof p !== 'object') {
    errors.push(`${at}: 须为 mapping（review_seed/automation_eligible/coverage_profile/routing/skills）`)
    return
  }
  if (p.reviewSeed === undefined) errors.push(`${at}.review_seed: 缺失（须为 pending|skipped）`)
  else if (!REVIEW_SEEDS.has(p.reviewSeed)) {
    errors.push(`${at}.review_seed: 须为 pending|skipped，得到 '${String(p.reviewSeed)}'`)
  }

  if (typeof p.automationEligible !== 'boolean') errors.push(`${at}.automation_eligible: 缺失或非布尔`)

  if (p.coverageProfile === undefined) errors.push(`${at}.coverage_profile: 缺失（须为 none|pm|frontend|backend）`)
  else if (!COVERAGE_PROFILES.has(p.coverageProfile)) {
    errors.push(`${at}.coverage_profile: 须为 none|pm|frontend|backend，得到 '${String(p.coverageProfile)}'`)
  }

  const r = p.routing
  if (r === undefined || r === null || typeof r !== 'object' || typeof r.enabled !== 'boolean') {
    errors.push(`${at}.routing.enabled: 缺失或非布尔`)
  } else if (!r.enabled) {
    if (r.pattern !== undefined || r.priority !== undefined) {
      errors.push(`${at}.routing: enabled=false 时不接受 pattern/priority`)
    }
  } else {
    if (typeof r.pattern !== 'string' || r.pattern === '') {
      errors.push(`${at}.routing.pattern: 缺失或为空（enabled=true 必填）`)
    } else {
      // JS RegExp 语法烟测；与 router.sh grep -E 的方言收敛属 R5。只挡明显语法错误，
      // 不验证也不担保 grep -E（POSIX ERE）语义。
      try {
        void new RegExp(r.pattern)
      } catch (e) {
        errors.push(
          `${at}.routing.pattern: 非法正则——JS RegExp 语法烟测未过（${e instanceof Error ? e.message : String(e)}）`,
        )
      }
      checkRepresentable(r.pattern, `${at}.routing.pattern`, errors)
    }
    // writer 采用的安全保守子域 [0, MAX_SAFE_INTEGER]（不是 Number.isInteger 的全整数域，
    // 也不是 parse 的原始读取域——parse 能识别 2^53/负数/更大纯十进制数，之后由本校验拒绝）：
    // 1e21 过 isInteger 但 String() 成科学计数法 'priority: 1e+21'，parse 只认纯十进制会报
    // 「应为整数」——write→load 合同破口（codex R2 探针实证）。子域内所有值都以纯十进制写出并
    // 精确读回。另拒 -0：serialize 写 '0'、parse 读 +0，-0 会破坏 serialize 宣称的严格结构相等
    // （Object.is 口径，codex R3 note）。
    if (
      typeof r.priority !== 'number' || !Number.isSafeInteger(r.priority) || r.priority < 0 ||
      Object.is(r.priority, -0)
    ) {
      errors.push(`${at}.routing.priority: 须为非负安全整数（不含 -0），得到 ${JSON.stringify(r.priority)}`)
    }
  }

  const s = p.skills
  if (s === undefined || s === null || typeof s !== 'object') {
    errors.push(`${at}.skills: 缺失（须声明 matrix 与 profile）`)
    return
  }
  if (typeof s.matrix !== 'boolean') errors.push(`${at}.skills.matrix: 缺失或非布尔`)
  if (typeof s.profile !== 'string' || s.profile === '') {
    errors.push(`${at}.skills.profile: 缺失（manifest skill profile 名或 '_all'）`)
  } else {
    checkRepresentable(s.profile, `${at}.skills.profile`, errors)
    if (!profileOk(s.profile)) {
      errors.push(`${at}.skills.profile: '${s.profile}' 不在 manifest skill profile 集合（或 '_all'）`)
    }
  }
}
