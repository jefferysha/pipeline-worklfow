import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureWorkflowRootAnchor, closeWorkflowRootAnchor } from './workflows.js'
import { resolveDefinitionCatalogRoute } from './definitionCatalogRoutes.js'
import type { PipelineCliRunner } from './operations.js'

const HOSTS = ['codex', 'claude', 'cursor', 'gemini', 'copilot', 'pi', 'devin', 'zed', 'aider', 'continue', 'cline', 'amp'] as const
const hostCatalog = {
  schema_version: 'host-target-plan/v1',
  targets: HOSTS.map((id) => ({
    id,
    kind: id === 'codex' || id === 'claude' ? 'native' : 'adapter',
    cli_flag: `--${id}`,
    target_scope: id === 'codex' || id === 'claude' ? 'user' : 'project',
    supported_operations: ['setup', 'update'],
    capabilities: id === 'codex' || id === 'claude'
      ? ['native-marketplace', 'managed-runtime', 'bundled-skills', 'automatic-update']
      : ['project-adapter', 'managed-runtime', 'bundled-skills'],
  })),
}

describe('definition catalog routes', () => {
  const anchors: Array<ReturnType<typeof captureWorkflowRootAnchor>> = []
  const roots: string[] = []
  afterEach(async () => {
    while (anchors.length) closeWorkflowRootAnchor(anchors.pop()!)
    while (roots.length) await rm(roots.pop()!, { recursive: true, force: true })
  })

  it('projects builtin definitions and adapter catalog through the real route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-catalog-'))
    roots.push(root)
    await mkdir(join(root, '.pipeline'), { recursive: true })
    const anchor = captureWorkflowRootAnchor(root)
    anchors.push(anchor)
    const runner = vi.fn<PipelineCliRunner>().mockResolvedValue({ exitCode: 0, stdout: JSON.stringify(hostCatalog), stderr: '' })
    let response: unknown
    const result = await resolveDefinitionCatalogRoute(
      { url: `/api/catalog?root=${encodeURIComponent(root)}` } as never,
      {} as never,
      '/api/catalog',
      {
        workflowRootForRequest: () => ({ ok: true, anchor }),
        hostHome: root,
        operationRunner: runner,
        trackValidationContextFor: () => ({ workflowExists: () => true, skillProfiles: new Set() }),
        clock: () => '2026-09-02T00:00:00.000Z',
        pollIntervalMs: 100,
        heartbeatMs: 1000,
        sendJson: (_res, _code, body) => { response = body },
      },
    )
    expect(result).toBe(true)
    expect((response as { schema_version: string }).schema_version).toBe('definition-catalog/v1')
    expect((response as { adapters: unknown[] }).adapters).toHaveLength(12)
    expect((response as { workflows: Array<{ id: string }> }).workflows.map((item) => item.id)).toEqual(['default', 'simple'])
    expect((response as { pipelines: unknown[] }).pipelines.length).toBeGreaterThan(0)
    expect(runner).toHaveBeenCalledWith(root, ['host-target-plan', '--json'])
  })

  it('fails closed before reading untrusted roots', async () => {
    let response: unknown
    const result = await resolveDefinitionCatalogRoute(
      { url: '/api/catalog?root=/tmp/evil' } as never,
      {} as never,
      '/api/catalog',
      {
        workflowRootForRequest: () => ({ ok: false, code: 403, error: 'untrusted' }),
        hostHome: '/tmp',
        operationRunner: vi.fn<PipelineCliRunner>(),
        trackValidationContextFor: () => ({ workflowExists: () => true, skillProfiles: new Set() }),
        clock: () => new Date(0).toISOString(),
        pollIntervalMs: 100,
        heartbeatMs: 1000,
        sendJson: (_res, code, body) => { response = { code, body } },
      },
    )
    expect(result).toBe(true)
    expect(response).toEqual({ code: 403, body: { ok: false, code: 'CATALOG_ROOT_INVALID', error: 'untrusted' } })
  })
})
