import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { atomicWriteFile, withLock } from '@tenon/kernel'
import type {
  RuntimeActivation,
  RuntimeAuditEntry,
  RuntimeInspection,
  RuntimePaths,
  RuntimeReleaseManifest,
  RuntimeReleaseSource,
  RuntimeSelection,
} from './types.js'
import { RuntimeFailure } from './types.js'
import {
  isExistingReleaseCollision,
  isRecord,
  lastAudit,
  nonEmptyString,
  PAYLOAD_ENTRIES,
  readReleaseManifest,
  readSelection,
  stableJson,
  validReleaseId,
  writeAudit,
} from './release-store-codecs.js'

interface CommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface RuntimeCommandRunner {
  run(file: string, args: readonly string[], cwd: string): Promise<CommandResult>
}

export type RuntimeAuditWriter = (paths: RuntimePaths, entry: RuntimeAuditEntry) => Promise<void>

export interface RuntimeReleaseStoreOptions {
  readonly paths: RuntimePaths
  readonly now?: () => string
  readonly runner?: RuntimeCommandRunner
  readonly retainedReleases?: number
  readonly auditWriter?: RuntimeAuditWriter
}


function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(`${sep}..${sep}`))
}

function candidatePath(root: string, entry: string): string {
  const path = resolve(root, entry)
  if (!isWithin(resolve(root), path)) throw new RuntimeFailure('candidate-invalid', `候选发布路径越界: ${entry}`)
  return path
}

async function copyEntry(source: string, target: string): Promise<void> {
  const sourceStat = await lstat(source)
  if (sourceStat.isSymbolicLink()) throw new RuntimeFailure('candidate-invalid', `候选发布包含符号链接: ${source}`)
  if (sourceStat.isDirectory()) {
    await mkdir(target, { recursive: true, mode: sourceStat.mode & 0o777 })
    const entries = await readdir(source, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) await copyEntry(join(source, entry.name), join(target, entry.name))
    return
  }
  if (!sourceStat.isFile()) throw new RuntimeFailure('candidate-invalid', `候选发布包含非普通文件: ${source}`)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  await chmod(target, sourceStat.mode & 0o777)
}

async function copyPayload(candidateRoot: string, payloadRoot: string): Promise<void> {
  for (const entry of PAYLOAD_ENTRIES) {
    const source = candidatePath(candidateRoot, entry)
    try {
      await copyEntry(source, join(payloadRoot, entry))
    } catch (error) {
      if (error instanceof RuntimeFailure) throw error
      throw new RuntimeFailure('candidate-invalid', `候选发布缺少或无法读取 ${entry}: ${String(error)}`)
    }
  }
}

async function hashTree(root: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const child = join(dir, entry.name)
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      const item = await lstat(child)
      if (item.isSymbolicLink()) throw new RuntimeFailure('runtime-corrupt', `发布 payload 包含符号链接: ${childRel}`)
      if (item.isDirectory()) {
        hash.update(`D\u0000${childRel}\u0000`)
        await visit(child, childRel)
      } else if (item.isFile()) {
        hash.update(`F\u0000${childRel}\u0000${(item.mode & 0o777).toString(8)}\u0000`)
        hash.update(await readFile(child))
      } else {
        throw new RuntimeFailure('runtime-corrupt', `发布 payload 包含非普通文件: ${childRel}`)
      }
    }
  }
  await visit(root, '')
  return hash.digest('hex')
}

function commandRunner(): RuntimeCommandRunner {
  return {
    run: (file, args, cwd) => new Promise<CommandResult>((resolveResult) => {
      execFile(file, [...args], { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error === null
          ? 0
          : typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (error as NodeJS.ErrnoException & { code: number }).code
            : 1
        resolveResult({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      })
    }),
  }
}

async function shellFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      const item = await lstat(path)
      if (item.isSymbolicLink()) throw new RuntimeFailure('candidate-invalid', `shell 资产不得是符号链接: ${path}`)
      if (item.isDirectory()) await visit(path)
      else if (item.isFile() && entry.name.endsWith('.sh')) files.push(path)
    }
  }
  await visit(root)
  return files
}

function hookCommands(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) hookCommands(item, output)
    return
  }
  if (!isRecord(value)) return
  const command = value.command
  if (typeof command === 'string') output.push(command)
  for (const item of Object.values(value)) hookCommands(item, output)
}

async function verifyHookAbi(payloadRoot: string): Promise<void> {
  const manifestPath = join(payloadRoot, 'hooks', 'hooks.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new RuntimeFailure('candidate-invalid', `hooks/hooks.json 无法解析: ${String(error)}`)
  }
  const commands: string[] = []
  hookCommands(parsed, commands)
  if (commands.length === 0) throw new RuntimeFailure('candidate-invalid', 'hooks/hooks.json 未声明命令 hook')
  for (const command of commands) {
    if (command.includes('${PLUGIN_ROOT') || command.includes('${CLAUDE_PLUGIN_ROOT')) {
      throw new RuntimeFailure('candidate-invalid', 'host hook 不得直接执行可变 PLUGIN_ROOT payload')
    }
    if (!command.includes('tenon-hook')) {
      throw new RuntimeFailure('candidate-invalid', `host hook 未调用稳定 tenon-hook ABI: ${command}`)
    }
  }
}

async function assertFile(path: string, label: string): Promise<void> {
  try {
    const value = await lstat(path)
    if (!value.isFile() || value.isSymbolicLink()) throw new Error('不是普通文件')
  } catch (error) {
    throw new RuntimeFailure('candidate-invalid', `${label} 缺失或不可用: ${String(error)}`)
  }
}

async function runChecked(
  runner: RuntimeCommandRunner,
  file: string,
  args: readonly string[],
  cwd: string,
  label: string,
): Promise<void> {
  const result = await runner.run(file, args, cwd)
  if (result.code === 0) return
  const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
  throw new RuntimeFailure('candidate-invalid', `${label} 失败: ${detail}`)
}

async function verifyPayload(payloadRoot: string, runner: RuntimeCommandRunner): Promise<void> {
  const verifier = join(payloadRoot, 'tools', 'verify-skills.sh')
  const cli = join(payloadRoot, 'packages', 'cli', 'dist', 'tenon.mjs')
  const server = join(payloadRoot, 'packages', 'server', 'dist', 'dashboard.mjs')
  const bootstrap = join(payloadRoot, 'runtime', 'tenon-bootstrap.mjs')
  await assertFile(verifier, 'verify-skills')
  await assertFile(cli, 'CLI bundle')
  await assertFile(server, 'dashboard server bundle')
  await assertFile(bootstrap, 'runtime bootstrap')
  await verifyHookAbi(payloadRoot)
  await runChecked(runner, 'bash', [verifier, '--quiet', '--root', payloadRoot], payloadRoot, '插件资产校验')
  for (const file of await shellFiles(join(payloadRoot, 'hooks'))) {
    await runChecked(runner, 'bash', ['-n', file], payloadRoot, `hook 语法 ${basename(file)}`)
  }
  for (const file of await shellFiles(join(payloadRoot, 'adapters'))) {
    await runChecked(runner, 'bash', ['-n', file], payloadRoot, `adapter 语法 ${basename(file)}`)
  }
  for (const file of [cli, server, bootstrap]) {
    await runChecked(runner, process.execPath, ['--check', file], payloadRoot, `Node 语法 ${basename(file)}`)
  }
  await runChecked(runner, process.execPath, [cli, '--help'], payloadRoot, 'CLI smoke')
}

async function candidateVersion(candidateRoot: string): Promise<string> {
  for (const manifest of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(candidateRoot, manifest), 'utf8'))
      const version = isRecord(parsed) ? nonEmptyString(parsed.version) : null
      if (version !== null) return version
    } catch {
      // Try the compatibility manifest; verification later reports a missing manifest precisely.
    }
  }
  return 'unknown'
}

export class RuntimeReleaseStore {
  private readonly paths: RuntimePaths
  private readonly now: () => string
  private readonly runner: RuntimeCommandRunner
  private readonly retainedReleases: number
  private readonly auditWriter: RuntimeAuditWriter

  constructor(options: RuntimeReleaseStoreOptions) {
    this.paths = options.paths
    this.now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'))
    this.runner = options.runner ?? commandRunner()
    this.retainedReleases = Math.max(2, options.retainedReleases ?? 3)
    this.auditWriter = options.auditWriter ?? writeAudit
  }

  async stageAndActivate(candidateRoot: string, host: RuntimeReleaseSource['host']): Promise<RuntimeActivation> {
    const absoluteCandidate = resolve(candidateRoot)
    await this.prepareRoots()
    try {
      return await withLock(this.paths.stateRoot, async () => this.stageAndActivateUnderLock(absoluteCandidate, host))
    } catch (error) {
      if (error instanceof RuntimeFailure) throw error
      throw new RuntimeFailure('candidate-invalid', `无法安装候选 runtime: ${String(error)}`)
    }
  }

  async inspect(): Promise<RuntimeInspection> {
    await this.prepareRoots()
    const selection = await readSelection(this.paths)
    const active = selection.activeRelease === null ? null : await this.validateStoredRelease(selection.activeRelease)
    const previous = selection.previousRelease === null ? null : await this.validateStoredRelease(selection.previousRelease)
    return {
      selection,
      active,
      previous,
      activeValid: selection.activeRelease === null ? false : active !== null,
      previousValid: selection.previousRelease === null ? false : previous !== null,
      lastAudit: await lastAudit(this.paths),
    }
  }

  async rollbackToPrevious(): Promise<RuntimeActivation> {
    await this.prepareRoots()
    return withLock(this.paths.stateRoot, async () => {
      const selection = await readSelection(this.paths)
      if (selection.previousRelease === null) {
        throw new RuntimeFailure('no-recovery-release', '没有可回滚的已验证 runtime release；请重新运行 tenon setup --<host>')
      }
      const manifest = await this.validateStoredRelease(selection.previousRelease)
      if (manifest === null) {
        throw new RuntimeFailure('no-recovery-release', 'previous runtime release 无法通过完整性校验；请重新运行 tenon setup --<host>')
      }
      const previousRoot = this.releaseRoot(manifest.releaseId)
      const next: RuntimeSelection = {
        version: 1,
        revision: selection.revision + 1,
        activeRelease: manifest.releaseId,
        previousRelease: selection.activeRelease,
        updatedAt: this.now(),
      }
      try {
        // Write-ahead audit: an audit failure must occur before either bootstrap or selection moves.
        await this.auditWriter(this.paths, {
          version: 1,
          at: this.now(),
          kind: 'rolled-back',
          releaseId: manifest.releaseId,
          previousRelease: selection.activeRelease,
          detail: 'verified rollback prepared; selection publication follows under the same lock',
        })
        await this.installBootstrap(previousRoot)
        await atomicWriteFile(this.paths.selectionPath, stableJson(next))
        return { selection: next, release: manifest, releaseRoot: previousRoot }
      } catch (error) {
        await this.auditWriter(this.paths, {
          version: 1,
          at: this.now(),
          kind: 'rollback-rejected',
          releaseId: manifest.releaseId,
          previousRelease: selection.activeRelease,
          detail: error instanceof Error ? error.message : String(error),
        }).catch(() => {})
        throw error
      }
    })
  }

  async recordUpdateFailure(detail: string): Promise<void> {
    await this.prepareRoots()
    await withLock(this.paths.stateRoot, async () => {
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'update-rejected',
        detail,
      })
    })
  }

  private async stageAndActivateUnderLock(candidateRoot: string, host: RuntimeReleaseSource['host']): Promise<RuntimeActivation> {
    const stageRoot = join(this.paths.stagingRoot, `release-${randomUUID()}`)
    const payloadRoot = join(stageRoot, 'payload')
    let releaseId: string | null = null
    try {
      await mkdir(payloadRoot, { recursive: true })
      await copyPayload(candidateRoot, payloadRoot)
      await verifyPayload(payloadRoot, this.runner)
      const payloadDigest = await hashTree(payloadRoot)
      releaseId = `sha256-${payloadDigest}`
      const source: RuntimeReleaseSource = { host, pluginVersion: await candidateVersion(candidateRoot) }
      const manifest: RuntimeReleaseManifest = {
        version: 1,
        releaseId,
        payloadDigest,
        createdAt: this.now(),
        source,
      }
      await atomicWriteFile(join(stageRoot, 'release.json'), stableJson(manifest))

      const finalRoot = this.releaseRoot(releaseId)
      let effectiveManifest = manifest
      try {
        await rename(stageRoot, finalRoot)
      } catch (error) {
        if (!isExistingReleaseCollision(error)) throw error
        const existing = await this.validateStoredRelease(releaseId)
        if (existing === null) throw new RuntimeFailure('runtime-corrupt', `现有 release 无法验证: ${releaseId}`)
        effectiveManifest = existing
      }

      const selection = await readSelection(this.paths)
      const next: RuntimeSelection = {
        version: 1,
        revision: selection.revision + 1,
        activeRelease: releaseId,
        previousRelease: selection.activeRelease === releaseId ? selection.previousRelease : selection.activeRelease,
        updatedAt: this.now(),
      }
      // Write-ahead audit: do not return an activation failure after selection already changed.
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'activated',
        releaseId,
        previousRelease: selection.activeRelease,
        detail: `verified ${host} candidate activation prepared; publication follows under the same lock`,
      })
      await this.installBootstrap(finalRoot)
      await atomicWriteFile(this.paths.selectionPath, stableJson(next))
      // Retention is post-commit housekeeping. A pruning/audit problem must not turn a successful
      // activation into a reported failure after the canonical selection has already changed.
      await this.prune(next).catch(() => {})
      return { selection: next, release: effectiveManifest, releaseRoot: finalRoot }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'activation-rejected',
        ...(releaseId === null ? {} : { releaseId }),
        detail,
      }).catch(() => {})
      throw error
    } finally {
      await rm(stageRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async prepareRoots(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.dataRoot, { recursive: true }),
      mkdir(this.paths.stateRoot, { recursive: true }),
      mkdir(this.paths.configRoot, { recursive: true }),
      mkdir(this.paths.releasesRoot, { recursive: true }),
      mkdir(this.paths.stagingRoot, { recursive: true }),
      mkdir(this.paths.bootstrapRoot, { recursive: true }),
    ])
  }

  private releaseRoot(releaseId: string): string {
    if (!validReleaseId(releaseId)) throw new RuntimeFailure('runtime-corrupt', `非法 runtime release id: ${releaseId}`)
    return join(this.paths.releasesRoot, releaseId)
  }

  private async validateStoredRelease(releaseId: string): Promise<RuntimeReleaseManifest | null> {
    if (!validReleaseId(releaseId)) return null
    const root = this.releaseRoot(releaseId)
    const manifest = await readReleaseManifest(root)
    if (manifest === null || manifest.releaseId !== releaseId) return null
    const payloadRoot = join(root, 'payload')
    try {
      if ((await hashTree(payloadRoot)) !== manifest.payloadDigest) return null
      await verifyPayload(payloadRoot, this.runner)
      return manifest
    } catch {
      return null
    }
  }

  private async installBootstrap(releaseRoot: string): Promise<void> {
    const source = join(releaseRoot, 'payload', 'runtime', 'tenon-bootstrap.mjs')
    await assertFile(source, 'runtime bootstrap')
    await runChecked(this.runner, process.execPath, ['--check', source], releaseRoot, 'runtime bootstrap syntax')
    const active = join(this.paths.bootstrapRoot, 'active.mjs')
    const previous = join(this.paths.bootstrapRoot, 'previous.mjs')
    try {
      await stat(active)
      await atomicWriteFile(previous, await readFile(active, 'utf8'))
      await chmod(previous, 0o755)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await atomicWriteFile(active, await readFile(source, 'utf8'))
    await chmod(active, 0o755)
  }

  private async prune(selection: RuntimeSelection): Promise<void> {
    const protectedIds = new Set([selection.activeRelease, selection.previousRelease].filter((value): value is string => value !== null))
    const entries = await readdir(this.paths.releasesRoot, { withFileTypes: true })
    const candidates: Array<{ id: string; modifiedAt: number }> = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !validReleaseId(entry.name) || protectedIds.has(entry.name)) continue
      try {
        candidates.push({ id: entry.name, modifiedAt: (await stat(join(this.paths.releasesRoot, entry.name))).mtimeMs })
      } catch {
        // A concurrently removed unprotected release is already absent.
      }
    }
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
    const keep = Math.max(0, this.retainedReleases - protectedIds.size)
    for (const candidate of candidates.slice(keep)) {
      await rm(this.releaseRoot(candidate.id), { recursive: true, force: true })
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'pruned',
        releaseId: candidate.id,
        detail: 'unprotected verified release exceeded retention limit',
      })
    }
  }
}
