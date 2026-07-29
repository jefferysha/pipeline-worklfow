import { fetchConfig, type WbTrackDefinition } from '../api/client'

export type MatrixTrack = string

// ══════════════════════════════════════════════════════════════════════════
// B1：共享 config 探测缓存（自 SkillChain.tsx:156-191 逐字搬迁，行为零改动）
// ══════════════════════════════════════════════════════════════════════════

// ── default 模式：manifest 强制技能矩阵的模块级探测缓存 ──
// StepEditor 按 (workflow, step) 复合 key 挂载，切阶段即重挂——探测结果放模块级，
// 避免每次切阶段都重打一发 GET /api/config（旧设置视图 的 fetchedConfigRef 等价物，
// 但要跨 remount 存活）。保存成功后同步写缓存，重挂读到的就是新值。
export interface MandatoryConfig {
  capable: boolean
  table: Record<string, string[]>
  tracks: WbTrackDefinition[]
  writableProfiles: string[]
  revision: string
  source: 'builtin-only' | 'project-file'
  generatedAt: string
  error: string | null
}

const cfgCache = new Map<string, MandatoryConfig>()
const cfgInflight = new Map<string, Promise<MandatoryConfig>>()

function cacheKey(root: string): string {
  return root
}

function unavailableConfig(error: string): MandatoryConfig {
  return {
    capable: false,
    table: {},
    tracks: [],
    writableProfiles: [],
    revision: '',
    source: 'builtin-only',
    generatedAt: '',
    error,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const TRACK_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/
const MATRIX_KEY_RE = /^[a-z][a-z0-9_-]{0,63}\.(?:_all|[a-z][a-z0-9_-]{0,31})$/
// 与 server/config.ts 的写边界同构；其后再叠加 kernel 对 a|b / namespace 段的语义校验。
const SKILL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,127}$/
const MAX_SKILLS = 50

/** HTTP 边界严格验证：任一 track 畸形就拒整份快照，避免“半张 registry”制造错误可写列。 */
function parseTracks(value: unknown): WbTrackDefinition[] | null {
  if (!Array.isArray(value)) return null
  const parsed: WbTrackDefinition[] = []
  const ids = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !TRACK_ID_RE.test(item.id) || ids.has(item.id)) return null
    if (typeof item.label !== 'string' || item.label.trim() === '' || typeof item.builtin !== 'boolean') return null
    if (!isRecord(item.workflow) || typeof item.workflow.default !== 'string' || item.workflow.default === '') return null
    const allowed = item.workflow.allowed
    if (
      allowed !== '*' && (
        !Array.isArray(allowed) ||
        allowed.length === 0 ||
        !allowed.every((v) => typeof v === 'string' && v !== '') ||
        new Set(allowed).size !== allowed.length ||
        !allowed.includes(item.workflow.default)
      )
    ) return null
    if (!isRecord(item.policyProfile) || !isRecord(item.policyProfile.skills)) return null
    const profile = item.policyProfile.skills.profile
    const matrix = item.policyProfile.skills.matrix
    if (typeof profile !== 'string' || (profile !== '_all' && !TRACK_ID_RE.test(profile)) || typeof matrix !== 'boolean') return null
    const routing = item.policyProfile.routing
    if (!isRecord(routing) || typeof routing.enabled !== 'boolean') return null
    if (!routing.enabled && (
      routing.pattern !== undefined || routing.excludePattern !== undefined || routing.priority !== undefined
    )) return null
    if (routing.enabled) {
      if (
        typeof routing.pattern !== 'string' || routing.pattern === '' ||
        (routing.excludePattern !== undefined && (
          typeof routing.excludePattern !== 'string' || routing.excludePattern === ''
        )) ||
        typeof routing.priority !== 'number' || !Number.isSafeInteger(routing.priority) ||
        routing.priority < 0 || Object.is(routing.priority, -0)
      ) return null
      try {
        void new RegExp(routing.pattern)
        if (routing.excludePattern !== undefined) void new RegExp(routing.excludePattern)
      } catch {
        return null
      }
    }
    if (
      (item.policyProfile.reviewSeed !== 'pending' && item.policyProfile.reviewSeed !== 'skipped') ||
      (item.policyProfile.autoEnqueueOnSpecComplete !== undefined && typeof item.policyProfile.autoEnqueueOnSpecComplete !== 'boolean') ||
      typeof item.policyProfile.automationEligible !== 'boolean' ||
      !['none', 'pm', 'frontend', 'backend'].includes(String(item.policyProfile.coverageProfile))
    ) return null

    ids.add(item.id)
    parsed.push({
      id: item.id,
      label: item.label,
      builtin: item.builtin,
      workflow: { default: item.workflow.default, allowed: allowed === '*' ? '*' : [...allowed] as string[] },
      policyProfile: {
        reviewSeed: item.policyProfile.reviewSeed,
        ...(item.policyProfile.autoEnqueueOnSpecComplete === undefined
          ? {}
          : { autoEnqueueOnSpecComplete: item.policyProfile.autoEnqueueOnSpecComplete }),
        automationEligible: item.policyProfile.automationEligible,
        coverageProfile: item.policyProfile.coverageProfile as WbTrackDefinition['policyProfile']['coverageProfile'],
        routing: routing.enabled
          ? {
              enabled: true,
              pattern: routing.pattern as string,
              ...(routing.excludePattern === undefined
                ? {}
                : { excludePattern: routing.excludePattern as string }),
              priority: routing.priority as number,
            }
          : { enabled: false },
        skills: { matrix, profile },
      },
    })
  }
  return parsed
}

function isSkillToken(value: string): boolean {
  if (!SKILL_TOKEN_RE.test(value)) return false
  const alternatives = value.split('|')
  if (alternatives.some((branch) => branch === '')) return false
  if (new Set(alternatives).size !== alternatives.length) return false
  return alternatives.every((branch) => branch.split(':').every((segment) => segment !== '' && segment !== '.'))
}

/** GET/POST 两侧共用的 mandatory skill 数组边界校验。 */
export function isValidMandatorySkillList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_SKILLS
    && value.every((skill) => typeof skill === 'string' && isSkillToken(skill))
    && new Set(value).size === value.length
}

function parseMandatoryTable(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null
  const table: Record<string, string[]> = {}
  for (const [key, skills] of Object.entries(value)) {
    if (!MATRIX_KEY_RE.test(key)) return null
    if (!isValidMandatorySkillList(skills)) return null
    table[key] = [...skills]
  }
  return table
}

interface ParsedConfigSnapshot {
  table: Record<string, string[]>
  tracks: WbTrackDefinition[]
  writableProfiles: string[]
  revision: string
  source: 'builtin-only' | 'project-file'
  generatedAt: string
}

/** `/api/config` 是能力边界：整包 canonical 后才开放 UI，不能从半合法信封拼出可写状态。 */
function parseConfigSnapshot(value: unknown): ParsedConfigSnapshot | null {
  if (!isRecord(value) || value.ok !== true) return null
  if (
    typeof value.generated_at !== 'string' || Number.isNaN(Date.parse(value.generated_at)) ||
    typeof value.revision !== 'string' || value.revision.trim() === '' ||
    (value.source !== 'builtin-only' && value.source !== 'project-file')
  ) return null
  const table = parseMandatoryTable(value.mandatory_skills)
  const tracks = parseTracks(value.tracks)
  if (table === null || tracks === null || !Array.isArray(value.mandatory_skills_writable_profiles)) return null

  const writableProfiles = value.mandatory_skills_writable_profiles
  if (
    !writableProfiles.every((profile) => typeof profile === 'string' && TRACK_ID_RE.test(profile)) ||
    new Set(writableProfiles).size !== writableProfiles.length ||
    writableProfiles.some((profile) => !tracks.some((track) =>
      track.id === profile && track.policyProfile.skills.matrix && track.policyProfile.skills.profile === profile,
    ))
  ) return null

  return {
    table,
    tracks,
    writableProfiles: [...writableProfiles],
    revision: value.revision,
    source: value.source,
    generatedAt: value.generated_at,
  }
}

/** 测试钩子 + 未来手动刷新入口：清空 config 探测缓存（同 invalidateWorkflowRules 的命名惯例）。 */
export function invalidateMandatoryConfig(): void {
  cfgCache.clear()
  cfgInflight.clear()
}

/**
 * 缓存读窗（搬迁适配位，非新行为）：原 SkillChain 在同一模块内直接读 `cfgCache` 作
 * useState 初值；跨模块后 import 绑定只读，故以取值函数暴露。语义逐字等价。
 */
export function peekMandatoryConfig(root: string): MandatoryConfig | null {
  if (root.trim() === '') return null
  return cfgCache.get(cacheKey(root)) ?? null
}

/**
 * 缓存写窗（搬迁适配位，非新行为）：原 SkillChain 保存成功后直接 `cfgCache = next`
 * 推进模块缓存；跨模块后同理改为函数。**只在写回成功后调用**——这条路径不是乐观更新。
 */
export function primeMandatoryConfig(next: MandatoryConfig, root: string): void {
  if (root.trim() === '') return
  cfgCache.set(cacheKey(root), next)
}

export function loadMandatoryConfig(root: string): Promise<MandatoryConfig> {
  if (root.trim() === '') return Promise.resolve(unavailableConfig('项目 root 缺失'))
  const key = cacheKey(root)
  const cached = cfgCache.get(key)
  if (cached) return Promise.resolve(cached)
  const running = cfgInflight.get(key)
  if (running) return running
  const request = fetchConfig(root)
    .then(async (res) => {
      // r.ok 检查必须在 r.json() 之前（SkillTransferModal 同一条既有教训：server 错误
      // 也是 JSON 信封，非 2xx 时 json() 照样 resolve，不先查 ok 就探测不到「不可写」）。
      if (!res.ok) return unavailableConfig(`HTTP ${res.status}`)
      const body: unknown = await res.json()
      const parsed = parseConfigSnapshot(body)
      if (parsed === null) return unavailableConfig('config/effective tracks 快照缺失或畸形')
      return {
        capable: true,
        table: parsed.table,
        tracks: parsed.tracks,
        writableProfiles: parsed.writableProfiles,
        revision: parsed.revision,
        source: parsed.source,
        generatedAt: parsed.generatedAt,
        error: null,
      }
    })
    .catch((): MandatoryConfig => unavailableConfig('network'))
    .then((r) => {
      cfgCache.set(key, r)
      cfgInflight.delete(key)
      return r
    })
  cfgInflight.set(key, request)
  return request
}

/** POST /api/config/mandatory-skills 的成功响应体形状（自 旧设置视图 迁移）。 */


export function clearMandatoryConfig(root: string): void {
  cfgCache.delete(cacheKey(root))
  cfgInflight.delete(cacheKey(root))
}
