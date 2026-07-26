/** Container-private H5 constraint gate. The parent wrapper supplies immutable policy env after the agent exits. */
import { readFileSync } from 'node:fs'
import { evaluateConstraintPolicy, validateAutomationPolicySnapshot } from '@tenon/kernel'
import { matchesPathGlob } from '@tenon/automation'
import type { CliDeps } from '../deps.js'

export async function cmdInternalConstraintGate(
  deps: CliDeps,
  operation: string,
  nulPathsFile: string,
): Promise<number> {
  if (operation !== 'write' && operation !== 'merge') {
    deps.io.err(`internal-constraint-gate: unsupported operation '${operation}'`)
    return 1
  }
  try {
    const encoded = deps.env?.('TENON_AUTOMATION_POLICY_B64')
    if (!encoded) throw new Error('TENON_AUTOMATION_POLICY_B64 missing')
    const policy = validateAutomationPolicySnapshot(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
    const rawPaths = readFileSync(nulPathsFile)
    const decodedPaths = rawPaths.toString('utf8')
    if (!Buffer.from(decodedPaths, 'utf8').equals(rawPaths)) throw new Error('paths file is not canonical UTF-8')
    const paths = decodedPaths.split('\0').filter((path) => path.length > 0)
    if (paths.some((path) => path.startsWith('/') || path.split('/').includes('..'))) {
      throw new Error('paths file contains non-repository-relative path')
    }
    const decision = evaluateConstraintPolicy(policy.constraints, {
      operation, active: true, paths, matches: matchesPathGlob,
    })
    if (!decision.allowed) {
      deps.io.err(`internal-constraint-gate: ${decision.reason}: ${(decision.paths ?? []).join(', ')}`)
      return 2
    }
    return 0
  } catch (error) {
    deps.io.err(`internal-constraint-gate: invalid policy/path input: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
