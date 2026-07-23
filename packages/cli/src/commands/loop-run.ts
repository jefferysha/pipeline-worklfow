/**
 * `pipeline loop run <loop-id|pattern>` —— H14 loop 定向发起（★硬需求收口起点）。
 *
 * `--dry-run` 只读预览：零状态写 / 零 docker / 零 git / 零 ledger 写。real-run 每次 fresh 扫描
 * ready FIFO、现读 durable loop ledger，以「最新显式 binding → 最长前缀」解析自然归属，再只把命中
 * selector 的 TargetedRunCandidate 交给共享 `runAfkRound`。Docker/worktree/skill snapshot/verifier/
 * settlement/commit 全复用 AFK 生产链，不在命令里另造第二套执行器。
 *
 * selector：① 精确 loop-id（id 完全相等）；② glob（含 `*` → 通配匹配 id）。多命中全部纳入；
 * 零命中 → stderr + exit 1。real-run 只筛自然归属，不替 change 强塞归属。
 *
 * 预览字段与来源（同源复用，绝不各写一份漂移）：
 *   · admission 判定 ← loop-admission-view.ts::admissionProbe（= loops status/budget 同一 admissionDecision）。
 *   · level        ← --level 显式值，否则 loop.autonomy_level（缺省 L1）。
 *   · runner       ← LoopEntry.runner（自由字符串）。
 *   · settlement   ← automation settleSuccess(level)：L3→merge-back / L1|L2→paused。
 *   · reserved 预占 ← kernel reservedTokensFor(loop)（budget.tokens_per_run 优先，否则 risk 预设）。
 *   · image        ← 非 loop 级字段（LoopEntry 无 image）：afk run 时由 --image/.pipeline/automation.json/
 *                    默认 sandcastle:local 决定，故预览里 image=null + note 说明。
 *   · skill_bundle  ← H10 §6/§8任务7 唯一 wiring 判定 evaluateSkillBundleWiring（loop-admission-
 *                    view.ts）：bundle id / unwired-invalid-ready 三态 / 阻断 reason。只读静态
 *                    解析 + locator.locate() 只读探测——不建 CAS、不写 ledger、不暂停 loop、零状态
 *                    写（设计定稿 §6：dry-run 不物化快照或写 registry）。
 */
import { homedir } from 'node:os'
import {
  createLoopLedgerStore,
  reservedTokensFor,
  type AutonomyLevel,
  type LedgerReadResult,
  type LoopEntry,
  type LoopStatus,
} from '@pipeline-lite/kernel'
import {
  AUTOMATION_LEVELS,
  createAutomation,
  settleSuccess,
  type AutomationLevel,
  type LoopExecutionGuardResult,
} from '@pipeline-lite/automation'
import type { CliDeps } from '../deps.js'
import { createProductionSkillContentLocator } from '../skillBundleAssembly.js'
import {
  admissionProbe, evaluateSkillBundleWiring, ledgerProjections,
  type LedgerProjector, type SkillBundleWiringDeps, type SkillBundleWiringResult,
} from './loop-admission-view.js'
import {
  enforceProductionLoopWiring,
  runAfkRound,
  type AfkRoundExecutionResult,
  type RunAfkRoundOptions,
} from './afk-executor.js'
import { selectTargetedRunCandidates, type TargetedRunCandidate } from './loop-run-selection.js'
import type { LoopsFs } from './loops.js'

const IMAGE_NOTE = 'image 非 loop 级字段；afk run 时由 --image / .pipeline/automation.json / 默认 sandcastle:local 决定'
const COMMIT_NOTE = '--commit 仅 real-run 生效；dry-run 预览忽略它'

/** 单个命中 loop 的 dry-run 预览（--json 结构；照 loops.ts buildAdmissionJson 的信封风格）。 */
export interface LoopRunPreviewJson {
  loop_id: string
  status: LoopStatus
  /** 'allowed' 或 'blocked:<维度>'（同 loops status admit 列——admissionDecision 同源）。 */
  admission: string
  level: AutomationLevel
  level_source: 'flag' | 'loop-default'
  runner: string
  /** LoopEntry 无 image 字段 → 恒 null（见 notes 的 IMAGE_NOTE）。 */
  image: null
  /** L3→merge-back / L1|L2→paused（automation settleSuccess 语义）。 */
  settlement: 'merge-back' | 'paused'
  reserved_tokens: { tokens: number; basis: 'budget.tokens_per_run' | 'risk-default' }
  ledger_health: 'ok' | 'degraded' | 'missing'
  /** H10 §6：唯一 wiring 判定（evaluateSkillBundleWiring）——unwired/invalid/ready + bundle id + 阻断 reason。 */
  skill_bundle: { status: SkillBundleWiringResult['status']; bundle_id: string | null; blocking_reason: string | null }
  notes: string[]
}

interface LoopRunArgs {
  selector: string | null
  dryRun: boolean
  json: boolean
  commit: boolean
  level?: string
  error?: string
}

export interface LoopRunRuntime {
  /** H11 active starter 的 scan 前 fresh wiring + governance pause backstop。 */
  enforceLoopWiring?: (
    deps: CliDeps,
    loopIds: readonly string[],
  ) => Promise<LoopExecutionGuardResult>
  /** 每次 real-run 都现扫 ready FIFO；测试在这个系统边界注入，避免触碰 Docker。 */
  scanReady(deps: CliDeps): Promise<readonly string[]>
  /** selector 前现读 durable loop ledger，坏行由调用方 fail-closed。 */
  readLedger(repoRoot: string): Promise<LedgerReadResult>
  /** 共享 AFK 真执行器；负责 admission→Docker→verify→settlement→commit。 */
  runAfkRound(
    deps: CliDeps,
    input: RunAfkRoundOptions & { readonly targets: readonly TargetedRunCandidate[] },
  ): Promise<AfkRoundExecutionResult>
}

const DEFAULT_LOOP_RUN_RUNTIME: LoopRunRuntime = {
  scanReady: (deps) => createAutomation({
    repoRoot: deps.cwd,
    store: deps.store,
    clock: deps.clock,
    config: { level: 'L1' },
  }).scanReady(),
  readLedger: (repoRoot) => createLoopLedgerStore().read(repoRoot),
  runAfkRound,
}

type ExecutionGroup =
  | {
      readonly level: AutomationLevel
      readonly targets: readonly TargetedRunCandidate[]
      readonly result: AfkRoundExecutionResult
    }
  | {
      readonly level: AutomationLevel
      readonly targets: readonly TargetedRunCandidate[]
      readonly error: string
    }

function resultOk(result: AfkRoundExecutionResult): boolean {
  if (result.report !== undefined && !result.report.ok) return false
  return result.status === 'completed' || result.status === 'empty'
}

function renderExecutionGroup(deps: CliDeps, group: ExecutionGroup): void {
  if ('error' in group) {
    deps.io.err(`[loops run] level=${group.level} executor 抛错：${group.error}`)
    return
  }
  const { result } = group
  deps.io.out(
    `[loops run] level=${group.level} status=${result.status} image=${result.image} ` +
    `targets=${group.targets.length} fresh-ready=${result.ready.length}`,
  )
  if (result.report !== undefined) {
    for (const entry of result.report.entries) {
      deps.io.out(
        `  · ${entry.change} disposition=${entry.disposition}` +
        `${entry.result === undefined ? '' : ` result=${entry.result}`}` +
        `${entry.reason === undefined ? '' : ` reason=${entry.reason}`}`,
      )
    }
    for (const failure of result.report.failures) {
      deps.io.err(`  · ${failure.change} [${failure.phase}/${failure.kind}]: ${failure.message}`)
    }
  }
  if (result.status === 'docker-unavailable' || result.status === 'configuration-error') {
    deps.io.err(`[loops run] level=${group.level} ${result.status}: ${result.message}`)
  }
}

function parseLoopRunArgs(args: string[]): LoopRunArgs {
  const out: LoopRunArgs = { selector: null, dryRun: false, json: false, commit: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--json') out.json = true
    else if (a === '--commit') out.commit = true
    else if (a === '--level') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('-')) {
        out.error = '--level 缺少值（需 L1|L2|L3）'
        return out
      }
      out.level = value
      i++
    } else if (a.startsWith('-')) {
      out.error = `未知 flag「${a}」`
      return out
    } else if (out.selector === null) {
      out.selector = a
    } else {
      out.error = `额外位置参数「${a}」`
      return out
    }
  }
  return out
}

function isAutomationLevel(v: string): v is AutomationLevel {
  return (AUTOMATION_LEVELS as readonly string[]).includes(v)
}

/** 正则元字符转义（selector 非 `*` 段按字面匹配，`.`/`-` 等不当通配）。 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** selector → 命中 loop 列表：含 `*` 走 glob（`*`→`.*`，锚定全串），否则 id 完全相等。 */
function selectLoops(loops: readonly LoopEntry[], selector: string): LoopEntry[] {
  if (selector.includes('*')) {
    const re = new RegExp(`^${selector.split('*').map(escapeRegExp).join('.*')}$`)
    return loops.filter((l) => re.test(l.id))
  }
  return loops.filter((l) => l.id === selector)
}

/** LoopEntry + ledger 投影 + --level/--commit + skill bundle wiring → 单条 dry-run 预览。 */
function buildPreview(
  l: LoopEntry,
  admission: string,
  ledgerHealth: LoopRunPreviewJson['ledger_health'],
  explicitLevel: AutomationLevel | undefined,
  wiring: SkillBundleWiringResult,
): LoopRunPreviewJson {
  const level: AutomationLevel = explicitLevel ?? (l.autonomy_level as AutonomyLevel)
  const settlement = settleSuccess(level) === 'merged' ? 'merge-back' : 'paused'
  const reserved = reservedTokensFor(l)
  return {
    loop_id: l.id,
    status: l.status,
    admission,
    level,
    level_source: explicitLevel ? 'flag' : 'loop-default',
    runner: l.runner,
    image: null,
    settlement,
    reserved_tokens: { tokens: reserved.tokens, basis: reserved.basis },
    ledger_health: ledgerHealth,
    skill_bundle: { status: wiring.status, bundle_id: wiring.bundleId, blocking_reason: wiring.reason },
    notes: [IMAGE_NOTE],
  }
}

function renderPreview(deps: CliDeps, pv: LoopRunPreviewJson): void {
  deps.io.out(`  ${pv.loop_id}  status=${pv.status}  admission=${pv.admission}`)
  deps.io.out(`    level=${pv.level}（${pv.level_source}）  runner=${pv.runner}  settlement=${pv.settlement}`)
  deps.io.out(`    reserved-tokens=${pv.reserved_tokens.tokens}（${pv.reserved_tokens.basis}）  ledger=${pv.ledger_health}  image=(afk run 时决定)`)
  const sb = pv.skill_bundle
  deps.io.out(`    skill-bundle=${sb.status}${sb.bundle_id !== null ? `（${sb.bundle_id}）` : ''}${sb.blocking_reason !== null ? `：${sb.blocking_reason}` : ''}`)
  for (const n of pv.notes) deps.io.out(`    · ${n}`)
}

/**
 * `wiringDeps` 缺省真装配（H10 §8任务7）：resolver=deps.resolver（G2 P5 同一 EffectiveSkillResolver，
 * 不另装一份）；isSkillProfileKnown=deps.isSkillProfileKnown（main.ts/harness 装配的 trackCtx.
 * skillProfiles 判定，见 deps.ts 头注）；locator 用与 afk.ts cmdAfk('run') 同一套根枚举
 * （createProductionSkillContentLocator，见 skillBundleAssembly.ts）——dry-run 只读 locate()（stat/
 * realpath），不物化 CAS。
 */
function defaultSkillBundleWiringDeps(deps: CliDeps, runner: string): SkillBundleWiringDeps {
  return {
    isSkillProfileKnown: deps.isSkillProfileKnown,
    resolver: deps.resolver,
    locator: createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot, home: homedir(), runner,
    }),
  }
}

export type SkillBundleWiringProvider =
  | SkillBundleWiringDeps
  | ((loop: LoopEntry) => SkillBundleWiringDeps)

/**
 * `pipeline loop run <loop-id|pattern>` 分派体（cmdLoops 'run' 分派目标）。
 * fs 由 cmdLoops 注入（缺省 REAL_LOOPS_FS）；projectLedger 缺省真 ledger 投影，测试注入 fake（不碰真 IO）。
 * wiringDeps 缺省真装配（defaultSkillBundleWiringDeps，H10 §8任务7），测试注入 fake resolver/locator。
 */
export async function cmdLoopRun(
  deps: CliDeps,
  args: string[],
  fs: LoopsFs,
  projectLedger: LedgerProjector = ledgerProjections,
  wiringDeps: SkillBundleWiringProvider = (loop) => defaultSkillBundleWiringDeps(deps, loop.runner),
  runtime: LoopRunRuntime = DEFAULT_LOOP_RUN_RUNTIME,
): Promise<number> {
  const p = parseLoopRunArgs(args)

  if (p.error !== undefined) {
    deps.io.err(`ERROR: ${p.error}`)
    return 1
  }

  // selector 必填（缺 → 用法错误）
  if (p.selector === null || p.selector === '') {
    deps.io.err('ERROR: loops run 需要 <loop-id|pattern>——用法: pipeline loop run <loop-id|pattern> [--dry-run] [--level L1|L2|L3] [--commit] [--json]')
    return 1
  }

  // --level 校验（给了就必须合法；非法即停，不预览）
  let explicitLevel: AutomationLevel | undefined
  if (p.level !== undefined) {
    if (!isAutomationLevel(p.level)) {
      deps.io.err(`ERROR: --level 需 L1|L2|L3，收到 '${p.level}'`)
      return 1
    }
    explicitLevel = p.level
  }

  // 登记表（只读）：损坏 → 定位错误 exit 1；缺失 → exit 1。
  const { data: reg, errors } = fs.loadRegistry(deps.cwd)
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return 1
  }
  if (reg === null) {
    deps.io.err('ERROR: .pipeline/loops.yaml 未找到——无 loop 登记表可预览（先 pipeline loops init 起草一个 loop）')
    return 1
  }

  // selector 匹配：零命中 → stderr + exit 1（不做 change→loop 反查——那是 afk 的职责）
  const matched = selectLoops(reg.loops, p.selector)
  if (matched.length === 0) {
    deps.io.err(`ERROR: 选择器「${p.selector}」未命中任何 loop（登记表共 ${reg.loops.length} 个）。精确 id 需完全相等；glob 用「*」通配。不做 change→loop 反查（那是 afk 的职责）。`)
    return 1
  }

  if (!p.dryRun) {
    // H11：只要 selector 命中 active starter，就必须在“当前是否有 ready change”之前 fresh 复验。
    // 这封住了 invalid active starter 在空队列时长期伪装 active，以及 scan/reservation/Docker 旁路。
    const activeStarterIds = matched
      .filter((loop) => loop.status === 'active' && loop.template_id !== undefined)
      .map((loop) => loop.id)
    if (activeStarterIds.length > 0) {
      let guard: LoopExecutionGuardResult
      try {
        guard = runtime.enforceLoopWiring === undefined
          ? await enforceProductionLoopWiring(deps, activeStarterIds)
          : await runtime.enforceLoopWiring(deps, activeStarterIds)
      } catch (error) {
        deps.io.err(
          `ERROR: loop execution wiring guard 失败：${error instanceof Error ? error.message : String(error)}`,
        )
        return 1
      }
      if (guard.blocked.length > 0) {
        for (const block of guard.blocked) {
          deps.io.err(
            `ERROR: loop「${block.loopId}」wiring ${block.status}（${block.dimension}）：${block.reason}；已治理暂停`,
          )
        }
        return 1
      }
    }

    let readyChanges: readonly string[]
    let ledger: LedgerReadResult
    try {
      readyChanges = await runtime.scanReady(deps)
      ledger = await runtime.readLedger(deps.cwd)
    } catch (error) {
      deps.io.err(`ERROR: loop real-run preflight 失败：${error instanceof Error ? error.message : String(error)}`)
      return 1
    }

    if (ledger.rejected.length > 0) {
      deps.io.err(`ERROR: loop ledger 含 ${ledger.rejected.length} 条坏行，拒绝在不完整归属事实上执行`)
      return 1
    }

    const selected = selectTargetedRunCandidates({
      selectedLoopIds: matched.map((entry) => entry.id),
      readyChanges,
      loops: reg.loops,
      ledgerRecords: ledger.records,
    })
    if (!selected.ok) {
      deps.io.err(`ERROR: change「${selected.error.change}」归属不可判定（${selected.error.reason}）：${selected.error.detail}`)
      return 1
    }
    if (selected.targets.length === 0) {
      if (p.json) {
        deps.io.out(JSON.stringify({
          dry_run: false,
          selector: p.selector,
          matched_loops: matched.map((entry) => entry.id),
          ready: readyChanges.length,
          selected: 0,
          commit: { requested: p.commit, enforced: true },
          groups: [],
          ok: true,
        }, null, 2))
      } else {
        deps.io.out(`[loops run] 选择器「${p.selector}」当前无 ready change`)
      }
      return 0
    }

    const loopById = new Map(reg.loops.map((entry) => [entry.id, entry]))
    const groups = new Map<AutomationLevel, TargetedRunCandidate[]>()
    for (const target of selected.targets) {
      const entry = loopById.get(target.expectedLoopId)
      if (entry === undefined) {
        deps.io.err(`ERROR: 已解析归属 loop「${target.expectedLoopId}」不在当前 registry`)
        return 1
      }
      const level = explicitLevel ?? entry.autonomy_level
      const group = groups.get(level) ?? []
      group.push(explicitLevel === undefined
        ? target
        : { ...target, expectedAutonomyLevel: null })
      groups.set(level, group)
    }

    const executionGroups: ExecutionGroup[] = []
    for (const [level, targets] of groups) {
      try {
        const result = await runtime.runAfkRound(deps, { level, targets })
        executionGroups.push({ level, targets, result })
      } catch (error) {
        executionGroups.push({
          level,
          targets,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const ok = executionGroups.every((group) => 'result' in group && resultOk(group.result))
    if (p.json) {
      deps.io.out(JSON.stringify({
        dry_run: false,
        selector: p.selector,
        matched_loops: matched.map((entry) => entry.id),
        ready: readyChanges.length,
        selected: selected.targets.length,
        commit: { requested: p.commit, enforced: true },
        groups: executionGroups,
        ok,
      }, null, 2))
    } else {
      for (const group of executionGroups) renderExecutionGroup(deps, group)
      deps.io.out(
        `[loops run] commit=enforced（--commit ${p.commit ? '已显式请求' : '未传也不弱化'}）；` +
        `选择 ${selected.targets.length} 个 ready change，结果=${ok ? 'ok' : 'failed'}`,
      )
    }
    return ok ? 0 : 1
  }

  // ledger 投影（与 loops status/budget 同源；测试注入 fake 投影，绝不碰真 IO）
  const now = new Date(deps.clock())
  const { byId, missing } = await projectLedger(deps.cwd, matched.map((l) => l.id), now)

  // H10 §6：skill bundle wiring 判定（evaluateSkillBundleWiring 是本函数唯一消费点，见其头注
  // 「H11 只消费该 evaluator，不复制判断逻辑」）——纯读、逐 loop 静态解析 + locator 只读探测。
  const previews = await Promise.all(matched.map(async (l) => {
    const proj = byId.get(l.id)!
    const admission = admissionProbe(l, proj)
    const ledgerHealth: LoopRunPreviewJson['ledger_health'] = missing ? 'missing' : proj.health
    const wiring = await evaluateSkillBundleWiring(
      l,
      typeof wiringDeps === 'function' ? wiringDeps(l) : wiringDeps,
    )
    return buildPreview(l, admission, ledgerHealth, explicitLevel, wiring)
  }))

  if (p.json) {
    deps.io.out(JSON.stringify({
      dry_run: true,
      commit_ignored: p.commit,
      selector: p.selector,
      matched: previews.length,
      previews,
    }, null, 2))
    return 0
  }

  deps.io.out(`[loops run · dry-run] 选择器「${p.selector}」命中 ${previews.length} 个 loop（只读预览：不改盘 / 不 docker / 不 merge）`)
  if (p.commit) deps.io.out(`  注意：${COMMIT_NOTE}`)
  for (const pv of previews) renderPreview(deps, pv)
  return 0
}
