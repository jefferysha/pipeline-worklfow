import { randomUUID } from 'node:crypto'
import type { AdapterInstallStateV1 } from '@tenon/kernel'
import { isHostId, type HostId } from './hostTargetPlanProtocol.js'
import type { PipelineCliRunner } from './operations.js'

export interface AdapterInstallJob {
  readonly job_id: string
  readonly root: string
  readonly hosts: readonly HostId[]
  readonly dry_run: boolean
  readonly states: readonly AdapterInstallStateV1[]
}

interface MutableJob {
  readonly job_id: string
  readonly root: string
  readonly hosts: readonly HostId[]
  readonly dry_run: boolean
  readonly states: AdapterInstallStateV1[]
  readonly subscribers: Set<(state: AdapterInstallStateV1) => void>
}

function uniqueHosts(value: unknown): HostId[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return null
  const hosts: HostId[] = []
  for (const item of value) {
    if (!isHostId(item) || hosts.includes(item)) return null
    hosts.push(item)
  }
  return hosts
}

export function parseAdapterInstallRequest(value: unknown): { root: string; hosts: HostId[]; dryRun: boolean; confirm: boolean } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const root = typeof body.root === 'string' ? body.root : ''
  const hosts = uniqueHosts(body.hosts)
  if (root === '' || hosts === null) return null
  if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') return null
  if (body.confirm !== undefined && typeof body.confirm !== 'boolean') return null
  const dryRun = body.dry_run === undefined ? true : body.dry_run
  const confirm = body.confirm === true
  if (!dryRun && !confirm) return null
  return { root, hosts, dryRun, confirm }
}

export class AdapterInstallManager {
  private readonly jobs = new Map<string, MutableJob>()

  constructor(
    private readonly runner: PipelineCliRunner,
    private readonly clock: () => string,
  ) {}

  start(root: string, hosts: readonly HostId[], dryRun: boolean): AdapterInstallJob {
    const job: MutableJob = {
      job_id: randomUUID(), root, hosts: [...hosts], dry_run: dryRun, states: [], subscribers: new Set(),
    }
    this.jobs.set(job.job_id, job)
    void this.run(job)
    return this.view(job)
  }

  get(jobId: string): AdapterInstallJob | null {
    const job = this.jobs.get(jobId)
    return job === undefined ? null : this.view(job)
  }

  subscribe(jobId: string, listener: (state: AdapterInstallStateV1) => void): (() => void) | null {
    const job = this.jobs.get(jobId)
    if (job === undefined) return null
    for (const state of job.states) listener(state)
    job.subscribers.add(listener)
    return () => job.subscribers.delete(listener)
  }

  private view(job: MutableJob): AdapterInstallJob {
    return { job_id: job.job_id, root: job.root, hosts: job.hosts, dry_run: job.dry_run, states: [...job.states] }
  }

  private emit(job: MutableJob, host: HostId, phase: AdapterInstallStateV1['phase'], message: string, exitCode?: number): void {
    const state: AdapterInstallStateV1 = {
      job_id: job.job_id, host, phase, message, at: this.clock(),
      ...(exitCode === undefined ? {} : { exit_code: exitCode }),
    }
    job.states.push(state)
    for (const subscriber of job.subscribers) subscriber(state)
  }

  private async run(job: MutableJob): Promise<void> {
    for (const host of job.hosts) {
      this.emit(job, host, 'queued', `${host} 已排队`)
      this.emit(job, host, 'preflight', `${host} 正在执行无副作用预检`)
      const args = ['setup', `--${host}`, ...(host === 'codex' || host === 'claude' ? [] : ['--target', job.root]), '--yes', '--dry-run']
      try {
        const preflight = await this.runner(job.root, args)
        if (preflight.exitCode !== 0) {
          this.emit(job, host, 'failed', `${host} 预检失败`, preflight.exitCode)
          continue
        }
        if (job.dry_run) {
          this.emit(job, host, 'planned', `${host} 预检通过；dry-run 未写入宿主或项目`)
          continue
        }
        this.emit(job, host, 'installing', `${host} 正在安装`)
        const installArgs = ['setup', `--${host}`, ...(host === 'codex' || host === 'claude' ? [] : ['--target', job.root]), '--yes']
        const installed = await this.runner(job.root, installArgs)
        if (installed.exitCode !== 0) {
          this.emit(job, host, 'failed', `${host} 安装失败`, installed.exitCode)
          continue
        }
        this.emit(job, host, 'verifying', `${host} 正在验证安装产物`)
        this.emit(job, host, 'installed', `${host} 已安装并通过 CLI 退出码验证`, 0)
      } catch (error) {
        this.emit(job, host, 'failed', `${host} 安装异常：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

export function isInstallJobId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value)
}
