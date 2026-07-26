import {
  reservedTokensFor,
  type AutonomyLevel,
  type LoopEntry,
  type LoopStatus,
} from '@tenon/kernel'
import {
  AUTOMATION_LEVELS,
  settleSuccess,
  type AutomationLevel,
} from '@tenon/automation'
import type { CliDeps } from '../deps.js'
import type { SkillBundleWiringResult } from './loop-admission-view.js'
import type { AfkRoundExecutionResult } from './afk-executor.js'
import type { TargetedRunCandidate } from './loop-run-selection.js'

export const COMMIT_NOTE = '--commit 仅 real-run 生效；dry-run 预览忽略它'
const IMAGE_NOTE = 'image 非 loop 级字段；afk run 时由 --image / .pipeline/automation.json / 默认 sandcastle:local 决定'

export interface LoopRunPreviewJson {
  loop_id: string
  status: LoopStatus
  admission: string
  level: AutomationLevel
  level_source: 'flag' | 'loop-default'
  runner: string
  image: null
  settlement: 'merge-back' | 'paused'
  reserved_tokens: { tokens: number; basis: 'budget.tokens_per_run' | 'risk-default' }
  ledger_health: 'ok' | 'degraded' | 'missing'
  skill_bundle: {
    status: SkillBundleWiringResult['status']
    bundle_id: string | null
    blocking_reason: string | null
  }
  notes: string[]
}

export interface LoopRunArgs {
  selector: string | null
  dryRun: boolean
  json: boolean
  commit: boolean
  level?: string
  error?: string
}

export type ExecutionGroup =
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

export function resultOk(result: AfkRoundExecutionResult): boolean {
  if (result.report !== undefined && !result.report.ok) return false
  return result.status === 'completed' || result.status === 'empty'
}

export function renderExecutionGroup(deps: CliDeps, group: ExecutionGroup): void {
  if ('error' in group) {
    deps.io.err(`[loops run] level=${group.level} executor 抛错：${group.error}`)
    return
  }
  const { result } = group
  deps.io.out(
    `[loops run] level=${group.level} status=${result.status} image=${result.image} ` +
      `targets=${group.targets.length} fresh-ready=${result.ready.length}`,
  )
  for (const entry of result.report?.entries ?? []) {
    deps.io.out(
      `  · ${entry.change} disposition=${entry.disposition}` +
        `${entry.result === undefined ? '' : ` result=${entry.result}`}` +
        `${entry.reason === undefined ? '' : ` reason=${entry.reason}`}`,
    )
  }
  for (const failure of result.report?.failures ?? []) {
    deps.io.err(`  · ${failure.change} [${failure.phase}/${failure.kind}]: ${failure.message}`)
  }
  if (result.status === 'docker-unavailable' || result.status === 'configuration-error') {
    deps.io.err(`[loops run] level=${group.level} ${result.status}: ${result.message}`)
  }
}

export function parseLoopRunArgs(args: readonly string[]): LoopRunArgs {
  const parsed: LoopRunArgs = { selector: null, dryRun: false, json: false, commit: false }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg === '--dry-run') parsed.dryRun = true
    else if (arg === '--json') parsed.json = true
    else if (arg === '--commit') parsed.commit = true
    else if (arg === '--level') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('-')) {
        parsed.error = '--level 缺少值（需 L1|L2|L3）'
        return parsed
      }
      parsed.level = value
      index += 1
    } else if (arg.startsWith('-')) {
      parsed.error = `未知 flag「${arg}」`
      return parsed
    } else if (parsed.selector === null) {
      parsed.selector = arg
    } else {
      parsed.error = `额外位置参数「${arg}」`
      return parsed
    }
  }
  return parsed
}

export function isAutomationLevel(value: string): value is AutomationLevel {
  return (AUTOMATION_LEVELS as readonly string[]).includes(value)
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function selectLoops(loops: readonly LoopEntry[], selector: string): LoopEntry[] {
  if (selector.includes('*')) {
    const matcher = new RegExp(`^${selector.split('*').map(escapeRegExp).join('.*')}$`)
    return loops.filter((loop) => matcher.test(loop.id))
  }
  return loops.filter((loop) => loop.id === selector)
}

export function buildPreview(
  loop: LoopEntry,
  admission: string,
  ledgerHealth: LoopRunPreviewJson['ledger_health'],
  explicitLevel: AutomationLevel | undefined,
  wiring: SkillBundleWiringResult,
): LoopRunPreviewJson {
  const level: AutomationLevel = explicitLevel ?? (loop.autonomy_level as AutonomyLevel)
  const reserved = reservedTokensFor(loop)
  return {
    loop_id: loop.id,
    status: loop.status,
    admission,
    level,
    level_source: explicitLevel ? 'flag' : 'loop-default',
    runner: loop.runner,
    image: null,
    settlement: settleSuccess(level) === 'merged' ? 'merge-back' : 'paused',
    reserved_tokens: { tokens: reserved.tokens, basis: reserved.basis },
    ledger_health: ledgerHealth,
    skill_bundle: {
      status: wiring.status,
      bundle_id: wiring.bundleId,
      blocking_reason: wiring.reason,
    },
    notes: [IMAGE_NOTE],
  }
}

export function renderPreview(deps: CliDeps, preview: LoopRunPreviewJson): void {
  deps.io.out(`  ${preview.loop_id}  status=${preview.status}  admission=${preview.admission}`)
  deps.io.out(
    `    level=${preview.level}（${preview.level_source}）  runner=${preview.runner}  ` +
      `settlement=${preview.settlement}`,
  )
  deps.io.out(
    `    reserved-tokens=${preview.reserved_tokens.tokens}（${preview.reserved_tokens.basis}）  ` +
      `ledger=${preview.ledger_health}  image=(afk run 时决定)`,
  )
  const bundle = preview.skill_bundle
  deps.io.out(
    `    skill-bundle=${bundle.status}` +
      `${bundle.bundle_id !== null ? `（${bundle.bundle_id}）` : ''}` +
      `${bundle.blocking_reason !== null ? `：${bundle.blocking_reason}` : ''}`,
  )
  for (const note of preview.notes) deps.io.out(`    · ${note}`)
}
