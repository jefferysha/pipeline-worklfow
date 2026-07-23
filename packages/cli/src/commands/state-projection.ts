/** G1 canonical state / legacy YAML projection 的显式运维入口。 */
import { join } from 'node:path'
import type { CliDeps } from '../deps.js'

export interface StateProjectionCommandOptions {
  readonly json?: boolean
  readonly forceCanonical?: boolean
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function cmdStateProjection(
  deps: CliDeps,
  sub: string,
  name: string,
  opts: StateProjectionCommandOptions = {},
): Promise<number> {
  const changeDir = join(deps.cwd, 'openspec', 'changes', name)
  try {
    switch (sub) {
      case 'status': {
        const status = await deps.store.inspectProjection(changeDir)
        deps.io.out(opts.json ? JSON.stringify(status) : `${name}: ${status.status}`)
        return status.status === 'drift' ? 2 : 0
      }
      case 'repair-projection': {
        const status = await deps.store.repairProjection(changeDir, {
          forceCanonical: opts.forceCanonical,
        })
        deps.io.out(opts.json ? JSON.stringify(status) : `${name}: ${status.status}`)
        return 0
      }
      case 'import-legacy': {
        const result = await deps.store.importLegacyProjection(changeDir)
        const body = { status: 'imported', projection: result.projection.status }
        deps.io.out(opts.json ? JSON.stringify(body) : `${name}: imported (${result.projection.status})`)
        return result.projection.status === 'updated' ? 0 : 2
      }
      default:
        deps.io.err('用法：pipeline state <status|repair-projection|import-legacy> <change>')
        return 1
    }
  } catch (error) {
    deps.io.err(`ERROR: ${message(error)}`)
    return 1
  }
}
