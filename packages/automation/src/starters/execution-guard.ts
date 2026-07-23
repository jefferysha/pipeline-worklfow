/**
 * H11 real-run wiring guard：对 active loop fresh 复验 runner/template/workflow/skill bundle；失败时
 * 通过 registry governance epoch-CAS 暂停。CAS 竞态必须重读重判，禁止拿旧 invalid 结论误暂停
 * 已被并发修好的 loop。此模块只编排共享 evaluator 与 kernel 原子写入口，不复制任何 wiring 规则。
 */
import {
  readRegistrySnapshot,
  updateLoopInYaml,
  writeRegistryWithGovernance,
  type LoopRegistrySnapshot,
} from '@pipeline-lite/kernel'
import {
  evaluateLoopExecutionWiring,
  type LoopExecutionWiringResult,
  type LoopStarterWiringDeps,
} from './wiring.js'

type BlockingWiring = Exclude<LoopExecutionWiringResult, { readonly status: 'ready' }>

export interface LoopExecutionWiringBlock {
  readonly loopId: string
  readonly status: BlockingWiring['status']
  readonly dimension: BlockingWiring['dimension']
  readonly reason: string
}

export interface LoopExecutionGuardResult {
  readonly blocked: readonly LoopExecutionWiringBlock[]
}

export interface LoopExecutionGuardDeps {
  readonly repoRoot: string
  readonly wiring: LoopStarterWiringDeps
  readonly maxCasAttempts?: number
  readonly readSnapshot?: (repoRoot: string) => Promise<LoopRegistrySnapshot>
  readonly pauseAtEpoch?: (
    repoRoot: string,
    loopId: string,
    expectedEpoch: string,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }>
  readonly evaluate?: typeof evaluateLoopExecutionWiring
}

async function defaultPauseAtEpoch(
  repoRoot: string,
  loopId: string,
  expectedEpoch: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> {
  const result = await writeRegistryWithGovernance(
    repoRoot,
    expectedEpoch,
    (current) => updateLoopInYaml(current, loopId, { status: 'paused' }),
  )
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

function snapshotError(snapshot: LoopRegistrySnapshot): string {
  return snapshot.errors.length > 0 ? snapshot.errors.join('；') : 'loops.yaml 缺失'
}

function blockFrom(verdict: BlockingWiring): LoopExecutionWiringBlock {
  return {
    loopId: verdict.loopId,
    status: verdict.status,
    dimension: verdict.dimension,
    reason: verdict.reason,
  }
}

/**
 * 只检查点名且此刻 active 的 loop。首次即非 active 是安全状态，不产生阻断；若先观察到 invalid，
 * 随后 CAS 竞态发现已被别人暂停，则保留阻断事实；若发现配置已修好且仍 active，则重判 ready 并放行。
 */
export async function enforceActiveLoopExecutionWiring(
  loopIds: readonly string[],
  deps: LoopExecutionGuardDeps,
): Promise<LoopExecutionGuardResult> {
  const readSnapshot = deps.readSnapshot ?? readRegistrySnapshot
  const pauseAtEpoch = deps.pauseAtEpoch ?? defaultPauseAtEpoch
  const evaluate = deps.evaluate ?? evaluateLoopExecutionWiring
  const maxAttempts = deps.maxCasAttempts ?? 3
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`maxCasAttempts 必须是 >=1 的安全整数，收到 ${String(maxAttempts)}`)
  }

  const blocked: LoopExecutionWiringBlock[] = []
  for (const loopId of [...new Set(loopIds)]) {
    let observedFailure: LoopExecutionWiringBlock | undefined
    let lastCasError = 'unknown CAS failure'
    let resolved = false

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const snapshot = await readSnapshot(deps.repoRoot)
      if (snapshot.registry === null) {
        throw new Error(`loop execution wiring guard 无法读取 registry：${snapshotError(snapshot)}`)
      }
      const loop = snapshot.registry.loops.find((entry) => entry.id === loopId)
      if (loop === undefined) {
        throw new Error(`loop execution wiring guard：registry 中找不到点名 loop "${loopId}"`)
      }
      if (loop.status !== 'active') {
        if (observedFailure !== undefined) blocked.push(observedFailure)
        resolved = true
        break
      }

      const verdict = await evaluate(loop, snapshot.registry.loops, deps.wiring)
      if (verdict.status === 'ready') {
        resolved = true
        break
      }
      observedFailure = blockFrom(verdict)

      const paused = await pauseAtEpoch(deps.repoRoot, loopId, snapshot.epoch)
      if (paused.ok) {
        blocked.push(observedFailure)
        resolved = true
        break
      }
      lastCasError = paused.error
      // epoch 变了：下一拍必须 fresh read + fresh evaluate。绝不直接重放旧 pause candidate。
    }

    if (!resolved) {
      throw new Error(
        `loop "${loopId}" wiring invalid 后 governance pause CAS 连续 ${maxAttempts} 次失败：${lastCasError}`,
      )
    }
  }
  return { blocked }
}
