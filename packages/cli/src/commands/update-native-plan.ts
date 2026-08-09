import type { CliDeps } from '../deps.js'
import {
  hostFlag,
  type HostCommandPlanItem,
  type NativePipelineHost,
} from './plugin-host.js'

export function renderNativeUpdatePlan(
  deps: CliDeps,
  host: NativePipelineHost,
  plan: readonly HostCommandPlanItem[],
): void {
  deps.io.out(`[update] ${hostFlag(host)} 发布更新计划（只更新所选宿主）`)
  for (const item of plan) deps.io.out(`  $ ${item.cmd} ${item.args.join(' ')}`)
}

export function isAlreadyInstalledResult(
  result: { readonly stdout: string; readonly stderr: string },
): boolean {
  return /already|exists|installed|duplicate/i.test(`${result.stdout}\n${result.stderr}`)
}
