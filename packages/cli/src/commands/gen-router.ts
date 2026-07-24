/**
 * `_gen-router-sh <manifest> <repo-root>` —— router.sh 的项目感知冷生成命令。
 *
 * 输出不是 shell 程序，而是 `PIPELINE_ROUTER_V5` data-only cache。routing 只来自
 * `deps.loadRegistry()` 返回的 effective registry；manifest 仅提供 phase/profile skill 与
 * breadcrumb。所有自由字符串由 kernel encoder 以 UTF-8 hex 写出，项目 cache 不可 source/eval。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildRouterProjection,
  effectiveRouterRevision,
  encodeRouterDataCache,
  loadManifest,
  routerContractRevision,
  type RouterProjection,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'

function assertTargetGrepPatterns(projection: RouterProjection): void {
  for (const track of projection.tracks) {
    for (const [kind, pattern] of [['pattern', track.pattern], ['exclude_pattern', track.excludePattern]] as const) {
      if (pattern === undefined) continue
      // 0=匹配、1=合法但空输入不匹配；其余=目标 grep 方言不接受或进程故障。
      const probe = spawnSync('grep', ['-E', '--', pattern], {
        input: '',
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'pipe'],
      })
      if (probe.error) {
        throw new Error(`track '${track.id}' routing ${kind} 无法用目标 grep -E 校验：${probe.error.message}`)
      }
      if (probe.status !== 0 && probe.status !== 1) {
        const detail = String(probe.stderr ?? '').trim()
        throw new Error(`track '${track.id}' routing ${kind} 不兼容目标 grep -E${detail ? `：${detail}` : ''}`)
      }
    }
  }
}

export async function cmdGenRouterSh(
  deps: CliDeps,
  manifestPath: string | undefined,
  repoRoot?: string,
): Promise<number> {
  if (!manifestPath) {
    deps.io.err('_gen-router-sh: 缺 manifest 路径参数')
    return 2
  }
  if (!repoRoot) {
    deps.io.err('_gen-router-sh: 缺项目根（repo root）参数')
    return 2
  }

  try {
    const canonicalRoot = realpathSync(repoRoot)
    const depsRoot = realpathSync(deps.cwd)
    if (canonicalRoot !== depsRoot) {
      throw new Error(`项目根与 CLI effective registry 上下文不一致：${canonicalRoot} != ${depsRoot}`)
    }

    const manifestBytes = readFileSync(manifestPath)
    const manifest = loadManifest(manifestPath)
    const registry = deps.loadRegistry()
    const projection = buildRouterProjection(registry, manifest)
    assertTargetGrepPatterns(projection)

    const cache = encodeRouterDataCache({
      projectRoot: canonicalRoot,
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      registryRevision: effectiveRouterRevision(registry.revision, projection),
      contractRevision: routerContractRevision(manifest),
      tracksPresent: existsSync(join(canonicalRoot, '.pipeline', 'tracks.yaml')),
      projection,
    })
    // CliIO.out 自己补一个换行；剥掉 encoder 的最后一个换行，真实 stdout 与 mjs 逐字一致。
    deps.io.out(cache.slice(0, -1))
    return 0
  } catch (e) {
    deps.io.err(`_gen-router-sh: ${e instanceof Error ? e.message : String(e)}`)
    return 2
  }
}
