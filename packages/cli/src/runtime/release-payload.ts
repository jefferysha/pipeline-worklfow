import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { RuntimeFailure } from './types.js'
import { isRecord, nonEmptyString, PAYLOAD_ENTRIES } from './release-store-codecs.js'

interface CommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface RuntimeCommandRunner {
  run(file: string, args: readonly string[], cwd: string): Promise<CommandResult>
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

export async function copyReleasePayload(candidateRoot: string, payloadRoot: string): Promise<void> {
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

export async function hashReleasePayload(root: string): Promise<string> {
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

export function defaultRuntimeCommandRunner(): RuntimeCommandRunner {
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

export async function assertFile(path: string, label: string): Promise<void> {
  try {
    const value = await lstat(path)
    if (!value.isFile() || value.isSymbolicLink()) throw new Error('不是普通文件')
  } catch (error) {
    throw new RuntimeFailure('candidate-invalid', `${label} 缺失或不可用: ${String(error)}`)
  }
}

export async function runChecked(
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

export async function verifyReleasePayload(payloadRoot: string, runner: RuntimeCommandRunner): Promise<void> {
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

export async function releaseCandidateVersion(candidateRoot: string): Promise<string> {
  for (const manifest of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(candidateRoot, manifest), 'utf8'))
      const version = isRecord(parsed) ? nonEmptyString(parsed.version) : null
      if (version !== null) return version
    } catch {
      // Try the compatibility manifest; verification later reports a missing manifest precisely.
    }
  }
  throw new RuntimeFailure('candidate-invalid', '候选发布缺少可验证的 plugin manifest version')
}

export interface CandidatePayloadIdentity {
  readonly payloadDigest: string
  readonly pluginVersion: string
}

/** Verify and hash exactly the payload entries that activation would publish, without selection mutation. */
export async function inspectCandidatePayload(candidateRoot: string): Promise<CandidatePayloadIdentity> {
  const stageRoot = await mkdtemp(join(tmpdir(), 'tenon-candidate-inspect-'))
  const payloadRoot = join(stageRoot, 'payload')
  try {
    await mkdir(payloadRoot, { recursive: true })
    await copyReleasePayload(resolve(candidateRoot), payloadRoot)
    await verifyReleasePayload(payloadRoot, defaultRuntimeCommandRunner())
    return {
      payloadDigest: await hashReleasePayload(payloadRoot),
      pluginVersion: await releaseCandidateVersion(candidateRoot),
    }
  } finally {
    await rm(stageRoot, { recursive: true, force: true })
  }
}
