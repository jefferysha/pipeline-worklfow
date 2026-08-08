import { isAbsolute, join } from 'node:path'
import type { CliDeps } from '../deps.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { SetupEnv } from './setup.js'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

/** Report workspace sync commands without mutating any registered project during a plugin update. */
export function reportRegisteredProjects(deps: CliDeps, env: SetupEnv, pluginVersion: string): void {
  let registry: string | undefined
  try {
    registry = env.readText(resolveRuntimePaths({
      homeDir: env.homeDir(),
      env: env.runtimeEnv(),
    }).registryPath)
  } catch {
    deps.io.err('[update] WARN: 项目注册表无法读取；未修改任何工作区。')
    return
  }
  if (registry === undefined) return
  let roots: unknown
  try {
    roots = JSON.parse(registry)
  } catch {
    deps.io.err('[update] WARN: 项目注册表无法解析；未修改任何工作区。')
    return
  }
  if (!Array.isArray(roots)) return
  const registeredRoots = [...new Set(
    roots.filter((root): root is string => typeof root === 'string' && isAbsolute(root)),
  )]
  const outdated = registeredRoots.filter((root) => {
    try {
      return env.readText(join(root, '.pipeline-version'))?.trim() !== pluginVersion
    } catch {
      return true
    }
  })
  if (outdated.length === 0) return
  deps.io.out(`[update] ${outdated.length} 个已登记项目需要显式同步（本次更新未写工作区）：`)
  for (const root of outdated) deps.io.out(`  cd ${shellQuote(root)} && tenon sync`)
}
