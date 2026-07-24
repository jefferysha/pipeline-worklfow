/**
 * Track Registry 载入/合成/写入（GOAL.md 清单 T · T-R1）。
 *
 * - loadTrackRegistry：缺 `<repoRoot>/.pipeline/tracks.yaml` → 纯内建 Track
 *   （source:'builtin-only'）——零迁移成本路径，行为与「没有本功能」逐字一致（allowed:'*'
 *   全放行、缺省 workflow 'default'）。文件存在 → parse + validate（任一失败 fail-loud 抛出）
 *   → 合成 effective 模型：内建 Track 应用 builtins 覆写的 label/workflow 后恒排最前
 *   （chat/simple/pm/frontend/backend 固定序），额外 track 按文件声明序追加（builtin:false）。
 * - revision：规范化序列化（serialize.ts）的 sha256 前 16 hex——同语义不同排版的手写文件得
 *   同一 revision；缺文件时取空配置 {version:1} 的 revision，从而「读 builtin-only revision
 *   → 首次写入携带它」能顺利通过冲突检查。
 * - writeTrackRegistry 合同（codex R1 review 裁定）：签名必填 TrackValidationContext，写盘前
 *   对 next 跑完整 validateTrackRegistry（引用级校验不推给调用方；write 成功过的文件用同
 *   context load 读回永不 fail-loud）→ `.pipeline` 目录锁（state/lock.ts withLock）内检视
 *   现存文件：健康才比对 expectedRevision（不符抛 RegistryRevisionConflictError，即 R3
 *   server 409 的语义载体）；损坏（parse 失败或语义校验失败）默认拒绝覆写（抛
 *   RegistryCorruptFileError），重建走显式 { repairCorrupt: true }（与 expectedRevision
 *   互斥）→ 同目录 tmp+rename 原子写（复用 state/store.ts atomicWriteFile）。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { withLock } from '../state/lock.js'
import { atomicWriteFile } from '../state/store.js'
import type { ProjectTrackConfig, ProjectTrackEntryConfig, ReviewSeed, CoverageProfile, TrackDefinition, TrackRegistry, TrackValidationContext } from './types.js'
import { BUILTIN_TRACK_DEFINITIONS } from './builtins.js'
import { parseTrackRegistry } from './parse.js'
import { serializeTrackRegistry } from './serialize.js'
import { validateTrackRegistry } from './validate.js'

const PIPELINE_DIR = '.pipeline'
const TRACKS_FILE = 'tracks.yaml'

/** 缺文件时的隐式配置（builtin-only revision 的哈希输入）。 */
const EMPTY_PROJECT_CONFIG: ProjectTrackConfig = { version: 1 }

export function trackRegistryPath(repoRoot: string): string {
  return path.join(repoRoot, PIPELINE_DIR, TRACKS_FILE)
}

/** 规范化内容 hash：serializeTrackRegistry(config) 的 sha256 前 16 hex。 */
export function registryRevision(config: ProjectTrackConfig): string {
  return createHash('sha256').update(serializeTrackRegistry(config), 'utf8').digest('hex').slice(0, 16)
}

export class RegistryRevisionConflictError extends Error {
  readonly expected: string
  readonly actual: string

  constructor(expected: string, actual: string) {
    super(`tracks.yaml revision 冲突：期望 ${expected}，实际 ${actual}（文件已被他处修改；重新加载后重试）`)
    this.name = 'RegistryRevisionConflictError'
    this.expected = expected
    this.actual = actual
  }
}

/** 合成前置条件：config 已过校验。缺字段属内部错误（读写两路都由完整 validateTrackRegistry 守住）。 */
function invariant<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`tracks registry 内部错误：合成前未过校验（缺 ${what}）`)
  return v
}

function entryToDefinition(entry: ProjectTrackEntryConfig): TrackDefinition {
  const wf = invariant(entry.workflow, 'workflow')
  const p = invariant(entry.policyProfile, 'policy_profile')
  const routingCfg = invariant(p.routing, 'policy_profile.routing')
  const skillsCfg = invariant(p.skills, 'policy_profile.skills')
  const routing =
    routingCfg.enabled === true
      ? {
          enabled: true as const,
          pattern: invariant(routingCfg.pattern, 'routing.pattern'),
          ...(routingCfg.excludePattern === undefined ? {} : { excludePattern: routingCfg.excludePattern }),
          priority: invariant(routingCfg.priority, 'routing.priority'),
        }
      : { enabled: false as const }
  return {
    id: invariant(entry.id, 'id'),
    label: invariant(entry.label, 'label'),
    builtin: false,
    // allowed 无隐式默认：额外 track 必须显式声明（含全放行 '*'），省略在校验层就被拒
    workflow: { default: invariant(wf.default, 'workflow.default'), allowed: invariant(wf.allowed, 'workflow.allowed') },
    policyProfile: {
      // 闭集已由校验保证（REVIEW_SEEDS/COVERAGE_PROFILES），此处仅做类型收窄
      reviewSeed: invariant(p.reviewSeed, 'review_seed') as ReviewSeed,
      ...(p.autoEnqueueOnSpecComplete === undefined
        ? {}
        : { autoEnqueueOnSpecComplete: p.autoEnqueueOnSpecComplete }),
      automationEligible: invariant(p.automationEligible, 'automation_eligible'),
      coverageProfile: invariant(p.coverageProfile, 'coverage_profile') as CoverageProfile,
      routing,
      skills: { matrix: invariant(skillsCfg.matrix, 'skills.matrix'), profile: invariant(skillsCfg.profile, 'skills.profile') },
    },
  }
}

function composeRegistry(config: ProjectTrackConfig, source: TrackRegistry['source']): TrackRegistry {
  const overrides = config.builtins ?? {}
  const ordered: TrackDefinition[] = BUILTIN_TRACK_DEFINITIONS.map((base) => {
    const ov = Object.prototype.hasOwnProperty.call(overrides, base.id) ? overrides[base.id] : undefined
    if (ov === undefined) return base
    return {
      ...base,
      label: ov.label ?? base.label,
      workflow: {
        default: ov.workflow?.default ?? base.workflow.default,
        allowed: ov.workflow?.allowed ?? base.workflow.allowed,
      },
    }
  })
  for (const entry of config.tracks ?? []) ordered.push(entryToDefinition(entry))

  const byId = new Map<string, TrackDefinition>(ordered.map((t) => [t.id, t]))
  if (byId.size !== ordered.length) {
    throw new Error('tracks registry 内部错误：合成出重复 id（写入前必须过 validateTrackConfigStructure）')
  }
  return { ordered, byId, revision: registryRevision(config), source }
}

/**
 * tracks.yaml 文本（或缺文件时 null）→ { config, registry } 单一真相合成核。缺文件 → 空配置
 * builtin-only；有文件 → parse + 完整校验（失败 fail-loud 抛聚合错误）→ project-file。
 * loadTrackRegistry（同步读）与 withTrackRegistryLock（锁内异步读）共用它，保证两条读路径
 * 的降级/报错口径逐字一致。
 */
function synthesize(text: string | null, context: TrackValidationContext): RegistrySnapshot {
  if (text === null) {
    return { config: EMPTY_PROJECT_CONFIG, registry: composeRegistry(EMPTY_PROJECT_CONFIG, 'builtin-only') }
  }
  const config = parseTrackRegistry(text)
  const errors = validateTrackRegistry(config, context)
  if (errors.length > 0) {
    throw new Error(`.pipeline/tracks.yaml 校验失败（${errors.length} 条）：\n  - ${errors.join('\n  - ')}`)
  }
  return { config, registry: composeRegistry(config, 'project-file') }
}

/**
 * 载入 `<repoRoot>/.pipeline/tracks.yaml`：
 * 缺文件（ENOENT）→ builtin-only 内建 Track；解析失败 → TrackConfigParseError（带行号）；
 * 校验失败 → 聚合错误清单抛出；其余 fs 错误（权限/EISDIR 等）原样上抛，不静默降级。
 * 注意：本函数不带缓存（无记忆化）——每次调用都从盘读，装配层禁止跨命令/跨锁记忆化返回值
 * （codex R3 D4：CRUD 后同进程续用陈旧 registry 是真实竞态源）。
 */
export function loadTrackRegistry(repoRoot: string, context: TrackValidationContext): TrackRegistry {
  let text: string | null = null
  try {
    text = readFileSync(trackRegistryPath(repoRoot), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  return synthesize(text, context).registry
}

/** 按 id 取 track；未注册 → 抛可读错误（列出 registry 来源与已注册 id）。 */
export function requireTrack(registry: TrackRegistry, id: string): TrackDefinition {
  const def = registry.byId.get(id)
  if (def) return def
  const known = registry.ordered.map((t) => t.id).join(', ')
  throw new Error(`未注册的 track '${id}'（registry 来源 ${registry.source}；已注册：${known}）`)
}

/** workflow 绑定校验：allowed='*' 全放行；数组按 membership，拒绝时列出允许值。 */
export function assertWorkflowAllowed(track: TrackDefinition, workflowId: string): void {
  if (track.workflow.allowed === '*') return
  if (track.workflow.allowed.includes(workflowId)) return
  throw new Error(
    `track '${track.id}' 不允许绑定 workflow '${workflowId}'（允许：${track.workflow.allowed.join(', ')}）`,
  )
}

/** 现存 tracks.yaml 损坏（parse 失败或完整语义校验失败）时写入被默认拒绝的信号。 */
export class RegistryCorruptFileError extends Error {
  readonly file: string
  readonly detail: string

  constructor(file: string, detail: string) {
    super(`${file} 已损坏（${detail}），默认拒绝覆写——确认要用完整校验过的 next 重建时传 { repairCorrupt: true }`)
    this.name = 'RegistryCorruptFileError'
    this.file = file
    this.detail = detail
  }
}

type ExistingFileState =
  | { readonly kind: 'missing' }
  | { readonly kind: 'healthy'; readonly revision: string }
  | { readonly kind: 'corrupt'; readonly detail: string }

/**
 * 锁内检视现存文件：缺失（ENOENT）/ 健康（parse + 完整语义校验都过，附 revision）/
 * 损坏（parse 失败或语义校验失败，附原因）。权限等其余 I/O 错误不算「损坏」，原样上抛。
 */
async function inspectExistingUnderLock(file: string, context: TrackValidationContext): Promise<ExistingFileState> {
  let text: string | null = null
  try {
    text = await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (text === null) return { kind: 'missing' }
  let config: ProjectTrackConfig
  try {
    config = parseTrackRegistry(text)
  } catch (e) {
    return { kind: 'corrupt', detail: `解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  const errors = validateTrackRegistry(config, context)
  if (errors.length > 0) {
    return { kind: 'corrupt', detail: `语义校验失败（${errors.length} 条）：${errors.join('；')}` }
  }
  // 纵深防御：可表示域统一后，parse+validate 都过、registryRevision（内部 serialize）却抛
  // 经公开 API 已构造不出；但真出现（未来某处 serialize/validate 域漂移）也必须归类为损坏、
  // 落进九格表损坏列（repairCorrupt 可修），而不是裸异常外泄，写侧无从按语义表处置。
  try {
    return { kind: 'healthy', revision: registryRevision(config) }
  } catch (e) {
    return { kind: 'corrupt', detail: `revision 计算失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

export interface WriteTrackRegistryOptions {
  /**
   * 现存文件损坏（parse 失败或完整语义校验失败）时，允许用本次完整校验过的 next 重建。
   * 语义是「我知道它坏了，用这份 next 重建」，不是无条件 force：现存文件缺失或健康时传它
   * 会被拒绝；next 自身的完整校验义务不豁免。与 expectedRevision 互斥。
   */
  readonly repairCorrupt?: boolean
}

/**
 * 序列化 next 并原子落盘（同目录 tmp + rename），`.pipeline` 目录锁内执行。
 * 写盘前强制完整校验：validateTrackRegistry(next, context) 有错即拒写（错误清单进异常）。
 * 由此保证合同自洽：write 成功过的文件，loadTrackRegistry 用同一 context 读回永不 fail-loud。
 *
 * 现存文件状态 × 参数的语义表（expectedRevision 与 repairCorrupt 互斥——前者假设现存文件
 * 健康可比对 revision，后者断言其已损坏，前提矛盾，同时传直接抛错）：
 *
 * | 现存文件      | 两者都不传       | expectedRevision                  | repairCorrupt: true |
 * | 缺失 (ENOENT) | 写入            | 与空配置 revision 比对，不符 409   | 拒绝（无可修复）     |
 * | 健康          | 无条件覆写      | revision 比对，不符 409            | 拒绝（并未损坏）     |
 * | 损坏          | 拒绝（Corrupt） | 拒绝（Corrupt，revision 无从比对） | 用 next 重建        |
 *
 * 「409」= RegistryRevisionConflictError；「Corrupt」= RegistryCorruptFileError；
 * 损坏 = parse 失败或完整语义校验失败；权限等其余 I/O 错误不算损坏，原样上抛。
 */
export async function writeTrackRegistry(
  repoRoot: string,
  next: ProjectTrackConfig,
  context: TrackValidationContext,
  expectedRevision?: string,
  options: WriteTrackRegistryOptions = {},
): Promise<TrackRegistry> {
  const repairCorrupt = options.repairCorrupt === true
  if (expectedRevision !== undefined && repairCorrupt) {
    throw new Error(
      'writeTrackRegistry: expectedRevision 与 repairCorrupt 互斥——前者假设现存文件健康可比对 revision，后者断言其已损坏，前提矛盾',
    )
  }
  const errors = validateTrackRegistry(next, context)
  if (errors.length > 0) {
    throw new Error(
      `writeTrackRegistry: next 未过完整校验（${errors.length} 条），拒写：\n  - ${errors.join('\n  - ')}`,
    )
  }
  const file = trackRegistryPath(repoRoot)
  const dir = path.dirname(file)
  await mkdir(dir, { recursive: true })
  return withLock(dir, async () => {
    const existing = await inspectExistingUnderLock(file, context)
    if (repairCorrupt && existing.kind !== 'corrupt') {
      const why =
        existing.kind === 'missing'
          ? 'tracks.yaml 不存在（无可修复，直接常规写入即可）'
          : `现存文件健康（revision ${existing.revision}）——常规更新请走 expectedRevision`
      throw new Error(`writeTrackRegistry: repairCorrupt=true 但${why}`)
    }
    if (!repairCorrupt && existing.kind === 'corrupt') {
      throw new RegistryCorruptFileError(file, existing.detail)
    }
    if (expectedRevision !== undefined) {
      // 此处 existing 只会是 missing/healthy：corrupt 在上面已拒（repairCorrupt 又与本参数互斥）
      const actual = existing.kind === 'healthy' ? existing.revision : registryRevision(EMPTY_PROJECT_CONFIG)
      if (actual !== expectedRevision) throw new RegistryRevisionConflictError(expectedRevision, actual)
    }
    await atomicWriteFile(file, serializeTrackRegistry(next))
    return composeRegistry(next, 'project-file')
  })
}

// ── R3 mutate-under-lock 原语（GOAL.md 清单 T · T-R3 · codex D4）───────────────────

/** registry 生命周期锁内的读快照：原始 config（构造 next 用）+ 合成后的 effective registry。 */
export interface RegistrySnapshot {
  readonly config: ProjectTrackConfig
  readonly registry: TrackRegistry
}

/** mutateTrackRegistry 的返回：写盘后的新 registry + callback 自定义结果。 */
export interface MutationOutcome<T> {
  readonly registry: TrackRegistry
  readonly result: T
}

/**
 * 锁内 fresh read：`.pipeline` 仓级锁内异步读盘 → synthesize。缺文件 → builtin-only；
 * 损坏（parse/校验失败）→ fail-loud 抛出（**普通 CRUD/init/fields 默认拒绝损坏文件**，不做
 * 隐式 repairCorrupt——修损坏走显式 writeTrackRegistry({repairCorrupt:true})）。
 */
async function freshReadUnderLock(file: string, context: TrackValidationContext): Promise<RegistrySnapshot> {
  let text: string | null = null
  try {
    text = await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  return synthesize(text, context)
}

/**
 * 持仓级 registry 生命周期锁（`.pipeline` 目录锁，与 writeTrackRegistry 同一把锁），锁内
 * fresh-load registry 后运行 callback，透传其结果。callback 可在锁内再进 change 锁做组合校验/
 * 写 change（**锁序固定 registry → change**，见 init/fields）——本原语只负责「registry 锁 +
 * 锁内新鲜快照」，不自行写 registry。损坏文件在 load 处即 fail-loud（callback 不会跑）。
 *
 * 锁不可重入（state/lock.ts）：callback 内**禁止**再调 withTrackRegistryLock/mutateTrackRegistry/
 * writeTrackRegistry（同一 `.pipeline` 锁嵌套即死锁）；change 锁是不同锁目录，可安全嵌套。
 */
export async function withTrackRegistryLock<T>(
  repoRoot: string,
  context: TrackValidationContext,
  callback: (snapshot: RegistrySnapshot) => Promise<T>,
): Promise<T> {
  const file = trackRegistryPath(repoRoot)
  const dir = path.dirname(file)
  await mkdir(dir, { recursive: true })
  return withLock(dir, async () => callback(await freshReadUnderLock(file, context)))
}

/**
 * mutate-under-lock（CRUD 主原语）：`.pipeline` 仓级锁内 read 最新 raw config → callback（锁内
 * 做存在性/引用扫描/构造 next）→ 完整 next 校验 → **同锁** tmp+atomic rename → 返回新 registry。
 * 语义要点（codex D4）：
 * - 全程单锁 read-modify-validate-write，两并发 mutate 串行、结果确定（非泛化 revision 冲突）。
 * - **不嵌套 writeTrackRegistry**（withLock 非重入）；直接 atomicWriteFile。
 * - callback 抛错 / next 校验失败 → 不写盘（文件不变，invariant 14）。
 * - 不走 repairCorrupt：损坏文件在 freshReadUnderLock 处已 fail-loud。
 */
export async function mutateTrackRegistry<T>(
  repoRoot: string,
  context: TrackValidationContext,
  callback: (snapshot: RegistrySnapshot) => Promise<{ next: ProjectTrackConfig; result: T }>,
): Promise<MutationOutcome<T>> {
  const file = trackRegistryPath(repoRoot)
  return withTrackRegistryLock(repoRoot, context, async (snapshot) => {
    const { next, result } = await callback(snapshot)
    const errors = validateTrackRegistry(next, context)
    if (errors.length > 0) {
      throw new Error(
        `mutateTrackRegistry: next 未过完整校验（${errors.length} 条），拒写：\n  - ${errors.join('\n  - ')}`,
      )
    }
    await atomicWriteFile(file, serializeTrackRegistry(next))
    return { registry: composeRegistry(next, 'project-file'), result }
  })
}
