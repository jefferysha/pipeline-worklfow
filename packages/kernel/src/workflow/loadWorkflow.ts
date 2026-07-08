import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseWorkflow } from './parse.js'
import type { WorkflowDef } from './types.js'

export function loadWorkflow(repoRoot: string, name: string): WorkflowDef | null {
  const p = join(repoRoot, '.pipeline', 'workflows', `${name}.yaml`)
  if (!existsSync(p)) return null
  return parseWorkflow(readFileSync(p, 'utf8'))
}
