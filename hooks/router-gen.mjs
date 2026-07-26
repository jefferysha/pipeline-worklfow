/**
 * router-gen.mjs <manifest> <repo-root>
 *
 * router.sh 的安装态冷生成 fallback。与 CLI `_gen-router-sh` 一样，从项目 effective registry
 * 构建投影，再由 kernel `encodeRouterDataCache` 输出 `TENON_ROUTER_V5`。这里绝不生成 shell
 * assignment；项目可写 cache 永远只是 hex 编码的数据。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

async function loadKernel() {
  const candidates = [
    new URL('../packages/kernel/dist/index.js', import.meta.url).href,
    '@tenon/kernel',
  ]
  let lastError
  for (const specifier of candidates) {
    try {
      return await import(specifier)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('kernel 不可解析')
}

function trackValidationContext(kernel, repoRoot, manifest) {
  const skillProfiles = new Set()
  for (const track of kernel.BUILTIN_TRACK_DEFINITIONS) {
    if (track.policyProfile.skills.profile !== '_all') skillProfiles.add(track.policyProfile.skills.profile)
  }
  for (const table of [manifest.mandatorySkills, manifest.recommendedSkills]) {
    for (const row of Object.values(table)) {
      for (const profile of Object.keys(row)) if (profile !== '_all') skillProfiles.add(profile)
    }
  }
  return {
    workflowExists(id) {
      if (id === 'default') return true
      try {
        return kernel.loadWorkflow(repoRoot, id) !== null
      } catch {
        return false
      }
    },
    skillProfiles,
  }
}

function assertTargetGrepPatterns(projection) {
  for (const track of projection.tracks) {
    for (const [kind, pattern] of [['pattern', track.pattern], ['exclude_pattern', track.excludePattern]]) {
      if (pattern === undefined) continue
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

async function main() {
  const manifestPath = process.argv[2]
  const repoRoot = process.argv[3]
  if (!manifestPath || !repoRoot) {
    process.stderr.write('router-gen: 用法 router-gen.mjs <manifest> <repo-root>\n')
    process.exitCode = 2
    return
  }

  const canonicalRoot = realpathSync(repoRoot)
  const manifestBytes = readFileSync(manifestPath)
  const kernel = await loadKernel()
  const manifest = kernel.loadManifest(manifestPath)
  const registry = kernel.loadTrackRegistry(
    canonicalRoot,
    trackValidationContext(kernel, canonicalRoot, manifest),
  )
  const projection = kernel.buildRouterProjection(registry, manifest)
  assertTargetGrepPatterns(projection)
  process.stdout.write(kernel.encodeRouterDataCache({
    projectRoot: canonicalRoot,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    registryRevision: kernel.effectiveRouterRevision(registry.revision, projection),
    contractRevision: kernel.routerContractRevision(manifest),
    tracksPresent: existsSync(join(canonicalRoot, '.pipeline', 'tracks.yaml')),
    projection,
  }))
}

main().catch((error) => {
  process.stderr.write(`router-gen: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
