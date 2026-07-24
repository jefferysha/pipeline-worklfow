import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  buildRouterProjection,
  effectiveRouterRevision,
  loadManifest,
  routerContractRevision,
  type TrackDefinition,
  type TrackRegistry,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'
import { cmdGenRouterSh } from './gen-router.js'

const MANIFEST = new URL('../../../../templates/manifest.yaml', import.meta.url)
const ROUTER_HOOK = new URL('../../../../hooks/router.sh', import.meta.url)

function customTrack(pattern = "'$(touch /tmp/router-owned)`printf pwn`|mobile-route-token"): TrackDefinition {
  return {
    id: 'designer-mobile',
    label: 'Designer $(inert)',
    builtin: false,
    workflow: { default: 'pet-adoption', allowed: ['pet-adoption'] },
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'frontend',
      routing: { enabled: true, pattern, priority: 901 },
      skills: { matrix: false, profile: 'frontend' },
    },
  }
}

function registry(track = customTrack()): TrackRegistry {
  return {
    ordered: [track],
    byId: new Map([[track.id, track]]),
    revision: '0123456789abcdef',
    source: 'project-file',
  }
}

function deps(root: string, value: TrackRegistry, out: string[], err: string[]): CliDeps {
  return {
    cwd: root,
    loadRegistry: () => value,
    io: { out: (line) => out.push(line), err: (line) => err.push(line) },
  } as unknown as CliDeps
}

describe('_gen-router-sh project data-cache command', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pipeline-gen-router-'))
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'tracks.yaml'), 'version: 1\n', 'utf8')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('pins the bash hot-path contract to the current builtin and manifest projection', async () => {
    const hook = await readFile(ROUTER_HOOK, 'utf8')
    const pinned = hook.match(/^ROUTER_CONTRACT_REV="([0-9a-f]{64})"$/m)?.[1]
    expect(pinned).toBe(routerContractRevision(loadManifest(MANIFEST.pathname)))
  })

  test('emits PIPELINE_ROUTER_V5 from the effective registry with canonical identity and inert hex data', async () => {
    const out: string[] = []
    const err: string[] = []
    const loadCalls: number[] = []
    const d = deps(root, registry(), out, err)
    d.loadRegistry = () => {
      loadCalls.push(1)
      return registry()
    }

    const run = cmdGenRouterSh as unknown as (
      deps: CliDeps,
      manifestPath: string | undefined,
      repoRoot: string | undefined,
    ) => Promise<number>
    expect(await run(d, MANIFEST.pathname, root)).toBe(0)
    expect(loadCalls).toHaveLength(1)
    expect(err).toEqual([])
    expect(out).toHaveLength(1)

    const cache = `${out[0]}\n`
    const lines = cache.trimEnd().split('\n')
    expect(lines[0]).toBe('PIPELINE_ROUTER_V5')
    const metadata = lines[1]?.split('|') ?? []
    expect(metadata).toEqual([
      'M',
      Buffer.from(await realpath(root), 'utf8').toString('hex'),
      createHash('sha256').update(await readFile(MANIFEST)).digest('hex'),
      effectiveRouterRevision(
        '0123456789abcdef',
        buildRouterProjection(registry(), loadManifest(MANIFEST.pathname)),
      ),
      '1',
      routerContractRevision(loadManifest(MANIFEST.pathname)),
    ])
    const route = lines.find((line) => line.startsWith('R|'))?.split('|') ?? []
    expect(Buffer.from(route[3] ?? '', 'hex').toString('utf8')).toBe('designer-mobile')
    expect(route[4]).toBe('1')
    expect(Buffer.from(route[5] ?? '', 'hex').toString('utf8')).toContain('mobile-route-token')
    expect(Buffer.from(route[6] ?? '', 'hex').toString('utf8')).toBe('')
    expect(Buffer.from(route[7] ?? '', 'hex').toString('utf8')).toBe('frontend')
    expect(route.slice(8, 10)).toEqual(['0', '0']) // matrix=false 仍进入 router；custom 不是 builtin
    expect(Buffer.from(route[11] ?? '', 'hex').toString('utf8')).toBe('pet-adoption')
    expect(cache).not.toContain('FE_PATTERN=')
    expect(cache).not.toContain('$(')
    expect(cache).not.toContain('`')
    expect(cache).not.toContain('/tmp/router-owned')
  })

  test('requires a repo root instead of silently generating a project-agnostic cache', async () => {
    const out: string[] = []
    const err: string[] = []
    const run = cmdGenRouterSh as unknown as (
      deps: CliDeps,
      manifestPath: string | undefined,
      repoRoot: string | undefined,
    ) => Promise<number>
    expect(await run(deps(root, registry(), out, err), MANIFEST.pathname, undefined)).toBe(2)
    expect(out).toEqual([])
    expect(err.join('\n')).toMatch(/项目根|repo root/)
  })

  test('rejects an enabled pattern that the target grep -E dialect cannot compile', async () => {
    const out: string[] = []
    const err: string[] = []
    const bad = registry(customTrack('[[:not-a-real-class:]]'))
    const run = cmdGenRouterSh as unknown as (
      deps: CliDeps,
      manifestPath: string | undefined,
      repoRoot: string | undefined,
    ) => Promise<number>
    expect(await run(deps(root, bad, out, err), MANIFEST.pathname, root)).toBe(2)
    expect(out).toEqual([])
    expect(err.join('\n')).toMatch(/grep|pattern|正则/)
  })
})
