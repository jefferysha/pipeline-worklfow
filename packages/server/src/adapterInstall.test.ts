import { describe, expect, it, vi } from 'vitest'
import { AdapterInstallManager, parseAdapterInstallRequest } from './adapterInstall.js'
import type { PipelineCliRunner } from './operations.js'

describe('adapter installation state machine', () => {
  it('requires explicit confirmation for side effects and rejects duplicate hosts', () => {
    expect(parseAdapterInstallRequest({ root: '/project', hosts: ['cursor'], dry_run: false })).toBeNull()
    expect(parseAdapterInstallRequest({ root: '/project', hosts: ['cursor', 'cursor'], dry_run: true })).toBeNull()
    expect(parseAdapterInstallRequest({ root: '/project', hosts: ['cursor'], dry_run: true })).toEqual({ root: '/project', hosts: ['cursor'], dryRun: true, confirm: false })
  })

  it('runs each selected host serially and records real CLI phases', async () => {
    const calls: string[][] = []
    const runner = vi.fn<PipelineCliRunner>().mockImplementation(async (_root, args) => {
      calls.push([...args])
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const manager = new AdapterInstallManager(runner, () => '2026-09-02T00:00:00.000Z')
    const job = manager.start('/project', ['cursor', 'gemini'], false)
    await vi.waitFor(() => expect(manager.get(job.job_id)?.states.some((state) => state.phase === 'installed' && state.host === 'gemini')).toBe(true))
    expect(calls).toEqual([
      ['setup', '--cursor', '--target', '/project', '--yes', '--dry-run'],
      ['setup', '--cursor', '--target', '/project', '--yes'],
      ['setup', '--gemini', '--target', '/project', '--yes', '--dry-run'],
      ['setup', '--gemini', '--target', '/project', '--yes'],
    ])
  })
})
