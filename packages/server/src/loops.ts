/**
 * loops 治理跨项目聚合读（新增，server 零新依赖）——kernel 的 loadRegistry/computeReadiness/
 * computeBudgetStatus 都是单 repoRoot 的，这里对机器级注册的每个项目各跑一遍再拼一份
 * dashboard 用的扁平行列表。LoopEntry.id 只在单项目内唯一，聚合后用 root 字段消歧
 * （不假设跨项目全局唯一，不做 id 改写）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ABSENT_REGISTRY_EPOCH,
  budgetDayOf,
  buildGraduationReport,
  clearDraftMark,
  computeBudgetStatus,
  computeReadiness,
  createLoopLedgerStore,
  draftMarksPath,
  ledgerFilePath,
  loadRegistry,
  indexReservationTerminals,
  loopsYamlPath,
  LOOPS_SCHEMA,
  parseLoopsYaml,
  projectLoopLedger,
  readDraftMarks,
  readRegistrySnapshot,
  remainingTokens,
  updateLoopInYaml,
  validateSchema,
  writeRegistryWithGovernance,
  type GraduationFs,
  type LedgerRecord,
  type LoopEntry,
  type LoopRegistry,
} from '@tenon/kernel'
import type { LedgerSnapshot, LoopRow, LoopsSnapshot, LoopsSnapshotDeps } from './loopsTypes.js'
export type {
  LedgerSnapshot, LoopRow, LoopsSnapshot, LoopsSnapshotDeps,
} from './loopsTypes.js'

function readRunLogText(root: string): string | null {
  try {
    return readFileSync(join(root, '.superpowers', 'loops', 'progress.md'), 'utf8')
  } catch {
    return null
  }
}

function readLoopDocText(root: string): string | null {
  try {
    return readFileSync(join(root, 'LOOP.md'), 'utf8')
  } catch {
    return null
  }
}

/** buildGraduationReport 只调用前三个读面；两个写面仍显式 fail-closed，防未来函数扩展后误写。 */
const READONLY_GRADUATION_FS: GraduationFs = {
  loadRegistry,
  readRunLog: readRunLogText,
  readLoopDoc: readLoopDocText,
  readRegistrySnapshot: async () => null,
  writeRegistryGoverned: async () => ({ ok: false, error: 'snapshot graduation projection is read-only' }),
}

/**
 * T7：change_prefix 实际匹配的 openspec/changes 目录名——**镜像**
 * `packages/cli/src/commands/loops.ts::REAL_LOOPS_FS.listChanges` 的过滤逻辑（目录 + 排除
 * archive + startsWith 前缀 + 按名排序），不跨包 import cli，对齐 server 零运行时依赖纪律
 * （afk.ts:15-19 头注释同款先例：server 可以直接读 fs，但不能依赖 cli/automation 包）。
 * changePrefix 为 null 时调用方短路，不调用本函数（见下方 buildLoopsSnapshot）。
 */
function listMatchedChanges(root: string, changePrefix: string): string[] {
  try {
    return readdirSync(join(root, 'openspec', 'changes'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'archive' && e.name.startsWith(changePrefix))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** POST /api/loops/update 的写回结果（ok:false 一律 400 语义；error 首因 + errors 定位明细）。 */
export type LoopsUpdateResult =
  | { ok: true }
  | { ok: false; error: string; errors?: string[] }

/**
 * H11：starter 激活前必须针对“拟写入”的完整 registry 做运行接线校验。validator 看 candidate
 * 而不是旧文件，随后仍由同一个首读 epoch 做 governance CAS；校验期间若有人改表，写入会失败，
 * 因而不会把针对 A 候选的裁决错误地用于 B 候选。
 */
export interface LoopActivationValidationInput {
  root: string
  loopId: string
  previous: LoopRegistry
  candidate: LoopRegistry
}

export type LoopActivationValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export type LoopActivationValidator = (
  input: LoopActivationValidationInput,
) => Promise<LoopActivationValidationResult>

export interface ApplyLoopsUpdateDeps {
  validateActivation?: LoopActivationValidator
}

const STARTER_EXECUTION_FIELDS = new Set([
  'status',
  'runner',
  'phases',
  'goal',
  'risk',
  'change_prefix',
  'template_id',
  'template_version',
  'workflow_id',
  'skill_bundle_id',
])

function registryFromText(text: string): { data: LoopRegistry | null; errors: string[] } {
  return loadRegistry('', { readText: () => text })
}

function isStarter(loop: LoopEntry | undefined): boolean {
  return typeof loop?.template_id === 'string' && loop.template_id.length > 0
}

function requiresStarterActivationValidation(
  previous: LoopEntry | undefined,
  candidate: LoopEntry | undefined,
  patch: Readonly<Record<string, unknown>>,
): boolean {
  if (!isStarter(candidate) || candidate?.status !== 'active') return false
  if (previous?.status !== 'active') return true
  return Object.keys(patch).some((field) => STARTER_EXECUTION_FIELDS.has(field))
}

/**
 * POST /api/loops/update 的写回逻辑（v5 T3 / 决议 #3 #12 存储侧）：
 * kernel updateLoopInYaml 文本手术（只 patch 已存在 loop 的标量/字符串数组字段；autonomy_level
 * 不收，升降档只走 /api/loops/level）。落盘前双门：
 *   ① 写回文本整文档重校验（parseLoopsYaml + validateSchema(LOOPS_SCHEMA)）——手术只保证行级
 *      形状，值域（cadence pattern / risk enum / budget minimum …）在这里兜住，失败不落盘；
 *   ② 读-判-写 CAS（对齐 afk.ts::retryAfkRun 的 CAS 先例，介质从 StateStore 字段换成文件原文）：
 *      写前重读比对首读原文，不一致说明校验 await 间隙有并发写（另一请求 / applyLevelChange /
 *      人工编辑），如实拒绝，不盲写覆盖别人的改动。
 */
export async function applyLoopsUpdate(
  root: string,
  id: string,
  patch: Record<string, unknown>,
  deps: ApplyLoopsUpdateDeps = {},
): Promise<LoopsUpdateResult> {
  // Stage B 返工 #3#4：首读取原始字节 epoch；写走 governance 锁 + epoch-CAS + atomic writer（替代原
  // 无锁「读完马上 writeFile」——两并发 update 曾可能都过旧 CAS 双写造成 lost update / 半文件）。
  const snap0 = await readRegistrySnapshot(root)
  if (snap0.epoch === ABSENT_REGISTRY_EPOCH) {
    return { ok: false, error: `loops.yaml 未找到于 ${loopsYamlPath(root)}` }
  }

  const { text, error } = updateLoopInYaml(snap0.text, id, patch)
  if (error !== null || text === null) {
    return { ok: false, error: error ?? 'loops.yaml 文本手术失败' }
  }

  // ① 整文档重校验：手术后的文本必须仍是合法登记表，否则不落盘
  const parsed = parseLoopsYaml(text)
  if (parsed.error !== null || parsed.data === null || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return { ok: false, error: `写回文本解析失败：${parsed.error ?? '顶层非 mapping'}` }
  }
  const schemaErrors = validateSchema(parsed.data, LOOPS_SCHEMA)
  if (schemaErrors.length > 0) {
    return { ok: false, error: 'patch 后 schema 校验失败，未落盘', errors: schemaErrors }
  }

  // H11：schema 只证明字段形状合法；starter 能否真正运行还取决于 runner/workflow/skill bundle。
  // 对 candidate 做 host 侧完整校验，且任何 validator 缺席、拒绝或异常都 fail-closed，不落 active。
  const previousRegistry = registryFromText(snap0.text)
  const candidateRegistry = registryFromText(text)
  if (previousRegistry.data === null || candidateRegistry.data === null) {
    return {
      ok: false,
      error: 'starter activation 候选 registry 无法载入，未落盘',
      errors: [...previousRegistry.errors, ...candidateRegistry.errors],
    }
  }
  const previousData = previousRegistry.data
  const candidateData = candidateRegistry.data
  const previousLoop = previousData.loops.find((loop) => loop.id === id)
  const candidateLoop = candidateData.loops.find((loop) => loop.id === id)
  const needsActivationValidation = requiresStarterActivationValidation(previousLoop, candidateLoop, patch)
  const validateCandidate = async (stage: 'preflight' | 'commit-point'): Promise<string | null> => {
    if (!needsActivationValidation) return null
    if (deps.validateActivation === undefined) return 'starter activation validator 未装配，拒绝激活'
    try {
      const verdict: LoopActivationValidationResult = await deps.validateActivation({
        root,
        loopId: id,
        previous: previousData,
        candidate: candidateData,
      })
      return verdict.ok ? null : `starter activation ${stage} 校验拒绝：${verdict.error}`
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return `starter activation ${stage} 校验失败：${detail}`
    }
  }

  const preflightValidationError = await validateCandidate('preflight')
  if (preflightValidationError !== null) {
    return { ok: false, error: `${preflightValidationError}，未落盘` }
  }

  // ② governance 锁内重读 epoch；一致后在 atomic rename 前再次验证 workflow/skill execution material。
  // 第一次验证控制锁等待时长，第二次才是提交点裁决。锁不宣称冻结外部文件；真实执行仍逐轮 fresh guard。
  const res = await writeRegistryWithGovernance(root, snap0.epoch, async () => {
    const commitValidationError = await validateCandidate('commit-point')
    return commitValidationError === null
      ? { text, error: null }
      : { text: null, error: `${commitValidationError}，未落盘` }
  })
  if (!res.ok) {
    return { ok: false, error: `loops.yaml 治理写入拒绝（${res.error}）` }
  }
  // P2：批准(status:active)/驳回(status:paused) 都算「已审阅」——patch 含 status 自有键且已落盘即清草稿标记
  // （best-effort：标记是展示元数据，清失败吞错，不影响 {ok:true}）。patch 不含 status，或上面任一门先 return
  // ok:false（updateLoopInYaml/schema/CAS 拒），都走不到这里 → 标记不动。
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    await clearDraftMark(draftMarksPath(root), id).catch(() => {})
  }
  return { ok: true }
}

/** 单 root 的账本快照读一次（records+rejected + 文件是否存在），供逐 loop 投影复用（不每 loop 重读）。 */
async function readLedgerForRoot(root: string): Promise<{ records: readonly LedgerRecord[]; rejected: number; exists: boolean }> {
  const exists = existsSync(ledgerFilePath(root))
  if (!exists) return { records: [], rejected: 0, exists: false }
  try {
    const { records, rejected } = await createLoopLedgerStore().read(root)
    return { records, rejected: rejected.length, exists: true }
  } catch {
    // ENOENT 之外的 IO 错误（EISDIR/EACCES…）：不崩快照，视为 degraded（坏行式 fail-closed 语义）。
    return { records: [], rejected: 1, exists: true }
  }
}

export async function buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot> {
  const now = deps.now()
  const budgetDay = budgetDayOf(now.toISOString())
  const rows: LoopRow[] = []
  for (const root of deps.registry()) {
    const { data } = loadRegistry(root)
    if (!data) continue
    const runLogText = readRunLogText(root)
    const graduation = buildGraduationReport(root, null, now, READONLY_GRADUATION_FS).report
    const graduationById = new Map((graduation?.verdicts ?? []).map((verdict) => [verdict.id, verdict]))
    // GOAL H · Stage C：每 root 读一次 durable ledger（逐 loop 投影复用；文件缺失 → health=missing）。
    const led = await readLedgerForRoot(root)
    // P2 草稿标记：每 root 读一次 sidecar（fail-open→[]），行级 draft = id 命中；仅现有行判，无幽灵行。
    const draftSet = new Set(readDraftMarks(draftMarksPath(root)))
    for (const loop of data.loops) {
      const proj = projectLoopLedger(led.records, led.rejected, loop.id, budgetDay)
      const reservationIds = new Set(
        led.records.flatMap((record) =>
          record.kind === 'budget-reservation' && record.loop_id === loop.id ? [record.reservation_id] : [],
        ),
      )
      const healthy = proj.health === 'ok'
      const activatedReservationIds = indexReservationTerminals(led.records).activatedReservationIds
      const admissionEnforced = healthy && reservationIds.size > 0
      const inflightEnforced = healthy && [...reservationIds].some((id) => activatedReservationIds.has(id))
      const ledger: LedgerSnapshot = {
        health: !led.exists ? 'missing' : proj.health,
        rejected_records: proj.rejectedRecords,
        admission_enforced: admissionEnforced,
        inflight_enforced: inflightEnforced,
        runs_today: proj.runsToday,
        in_flight: proj.inFlight,
        activated_in_flight: proj.activatedInFlight,
        settled_tokens_actual: proj.settledTokensActual,
        settled_tokens_estimated: proj.settledTokensEstimated,
        reserved_tokens: proj.reservedTokensOutstanding,
        remaining_tokens: remainingTokens(proj, loop.budget.max_tokens_per_day),
        last_result: proj.lastResult ?? null,
        last_finished_at: proj.lastFinishedAt ?? null,
      }
      rows.push({
        root,
        id: loop.id,
        name: loop.name,
        autonomy_level: loop.autonomy_level,
        status: loop.status,
        cadence: loop.cadence,
        goal: loop.goal,
        design_doc: loop.design_doc,
        change_prefix: loop.change_prefix,
        risk: loop.risk,
        runner: loop.runner,
        human_gates: loop.human_gates,
        kill_criteria: loop.kill_criteria,
        allowlist: loop.allowlist,
        denylist: loop.denylist,
        budget_decl: loop.budget,
        readiness: computeReadiness(loop),
        budget: computeBudgetStatus(loop, runLogText, now),
        matched_changes: loop.change_prefix === null ? [] : listMatchedChanges(root, loop.change_prefix),
        phases: loop.phases,
        draft: draftSet.has(loop.id),
        template_id: loop.template_id,
        template_version: loop.template_version,
        workflow_id: loop.workflow_id,
        skill_bundle_id: loop.skill_bundle_id ?? null,
        ledger,
        graduation: graduationById.get(loop.id) ?? null,
      })
    }
  }
  return { generated_at: now.toISOString(), rows }
}
