import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const bundlePath = join(repoRoot, 'packages', 'cli', 'dist', 'pipeline.mjs')
// `sandcastle:test` 固定 WITH_CODEX=false，只服务 deterministic fallback；真 agent 只能跑生产镜像。
const image = 'sandcastle:local'

function isRealCodexRequired(env: NodeJS.ProcessEnv): boolean {
  return env.PIPELINE_REQUIRE_REAL_CODEX === '1'
}

const requireRealCodex = isRealCodexRequired(process.env)
const branchFor = (change: string): string => `sandcastle-pipeline/${change}`
const worktreeFor = (root: string, change: string): string =>
  join(root, '.sandcastle', 'worktrees', branchFor(change).replaceAll('/', '-'))

interface ProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

function runProcess(
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly timeoutMs?: number },
): Promise<ProcessResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${file} timed out after ${options.timeoutMs ?? 120_000}ms`))
    }, options.timeoutMs ?? 120_000)
    timeout.unref()

    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      if (code === null) {
        reject(new Error(`${file} exited by signal ${signal ?? 'unknown'}\n${stderr}`))
        return
      }
      resolveRun({ code, stdout, stderr })
    })
  })
}

function processFailure(label: string, result: ProcessResult): Error {
  return new Error(
    `${label} exited ${result.code}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
  )
}

async function runSuccessfully(
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly timeoutMs?: number },
  label = `${file} ${args.join(' ')}`,
): Promise<ProcessResult> {
  const result = await runProcess(file, args, options)
  if (result.code !== 0) throw processFailure(label, result)
  return result
}

async function git(root: string, args: readonly string[]): Promise<string> {
  return (await runSuccessfully('git', args, { cwd: root }, `git ${args.join(' ')}`)).stdout.trim()
}

interface LedgerLine {
  readonly kind?: string
  readonly change?: string
  readonly loop_id?: string
  readonly level?: string
  readonly runner?: string
  readonly result?: string
  readonly reason?: string
  readonly reservation_id?: string
  readonly artifacts?: {
    readonly build_sha?: string
    readonly build_sha_source?: string
    readonly branch?: string
    readonly commit_shas?: readonly string[]
  }
  readonly verification?: {
    readonly verdict?: string
    readonly subject?: { readonly revision?: { readonly kind?: string; readonly sha?: string } }
    readonly issuer?: { readonly kind?: string; readonly verifier?: string; readonly trusted?: boolean }
  }
  readonly expected_base_sha?: string
  readonly expected_branch_sha?: string
  readonly merged_commit_sha?: string
  readonly base_before_sha?: string
  readonly branch_sha?: string
  readonly host_synced?: boolean
}

async function readLedger(root: string): Promise<LedgerLine[]> {
  const raw = await readFile(join(root, '.pipeline', 'loops', 'ledger.jsonl'), 'utf8')
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LedgerLine)
}

function onlyRun(records: readonly LedgerLine[], change: string): LedgerLine {
  const matches = records.filter((record) => record.kind === 'run' && record.change === change)
  expect(matches, `terminal run records for ${change}`).toHaveLength(1)
  return matches[0]!
}

function registryLoop(input: {
  readonly id: string
  readonly prefix: string
  readonly level: 'L1' | 'L3'
  readonly maxRuns: number
}): string {
  return `  - id: ${input.id}
    name: ${input.id} real integration loop
    kind: executor
    goal: execute the H14 black-box fixture through the real Codex sandbox
    cadence: 1h
    risk: low
    runner: codex
    change_prefix: ${input.prefix}
    skill_bundle_id: _all
    phases:
      - explore
      - build
    human_gates:
      - explore
    state: .superpowers/loops/${input.id}.md
    design_doc: AGENTS.md
    status: active
    budget:
      max_runs_per_day: ${input.maxRuns}
      max_in_flight: 1
      on_exceed: skip
    kill_criteria:
      - no-change-3
    autonomy_level: ${input.level}
    allowlist:
      - deliverables/**
    denylist: []`
}

const REAL_LOOP_REGISTRY = `version: 1
loops:
${registryLoop({ id: 'h14-parent', prefix: 'h14-', level: 'L1', maxRuns: 8 })}
${registryLoop({ id: 'h14-foreign', prefix: 'h14-foreign-', level: 'L1', maxRuns: 8 })}
${registryLoop({ id: 'h14-l3', prefix: 'h14-l3-', level: 'L3', maxRuns: 1 })}
`

const AGENT_INSTRUCTIONS = `# H14 real-agent fixture

This repository is an intentionally tiny integration fixture. When asked to run the pipeline build phase
for a change, read \`openspec/changes/<change>/REAL_AGENT_TASK.md\` and perform exactly that task.

- Create only the requested file under \`deliverables/\`.
- Do not edit \`.pipeline/\`, \`openspec/\`, \`AGENTS.md\`, or existing files.
- Do not run pipeline transitions and do not invent extra work.
- Stop after the requested file exists. The surrounding real AFK wrapper owns Git commit creation.
`

const markerFor = (change: string): string => `${change} produced by real Codex agent`

function handleMissingRealCodexPrerequisite(input: {
  readonly prerequisite: string
  readonly required: boolean
  readonly skip?: () => void
  readonly warn?: (message: string) => void
}): void {
  if (input.required) {
    throw new Error(`[REQUIRED REAL CODEX] missing ${input.prerequisite}`)
  }
  const warn = input.warn ?? console.warn
  warn(
    `[HONEST SKIP] missing ${input.prerequisite}; H14 real-Codex acceptance case did not run`,
  )
  input.skip?.()
}

function topLevelWorkflowJob(workflow: string, jobId: string): string | undefined {
  const lines = workflow.split(/\r?\n/)
  const start = lines.indexOf('  ' + jobId + ':')
  if (start === -1) return undefined
  const nextJob = lines.findIndex((line, index) =>
    index > start && /^  [A-Za-z0-9_-]+:$/.test(line),
  )
  return lines.slice(start, nextJob === -1 ? lines.length : nextJob).join('\n')
}

describe('H14 required real-Codex prerequisite policy', () => {
  it('activates fail-closed mode only for PIPELINE_REQUIRE_REAL_CODEX=1', () => {
    expect(isRealCodexRequired({ PIPELINE_REQUIRE_REAL_CODEX: '1' })).toBe(true)
    expect(isRealCodexRequired({ PIPELINE_REQUIRE_REAL_CODEX: '0' })).toBe(false)
    expect(isRealCodexRequired({})).toBe(false)
  })

  it('throws for every acceptance prerequisite and records zero skips', () => {
    const prerequisites = [
      'Docker daemon',
      'sandcastle:local image',
      'sandcastle:local attestation',
      'Codex CLI in sandcastle:local',
      'Codex authentication',
    ] as const
    let skips = 0

    for (const prerequisite of prerequisites) {
      expect(() => handleMissingRealCodexPrerequisite({
        prerequisite,
        required: true,
        skip: () => { skips += 1 },
      })).toThrow(`[REQUIRED REAL CODEX] missing ${prerequisite}`)
    }
    expect(skips).toBe(0)
  })

  it('keeps the default local mode as an explicit honest skip', () => {
    const prerequisites = [
      'Docker daemon',
      'sandcastle:local image',
      'sandcastle:local attestation',
      'Codex CLI in sandcastle:local',
      'Codex authentication',
    ] as const
    const warnings: string[] = []
    let skips = 0

    for (const prerequisite of prerequisites) {
      handleMissingRealCodexPrerequisite({
        prerequisite,
        required: false,
        skip: () => { skips += 1 },
        warn: (message) => { warnings.push(message) },
      })
    }

    expect(skips).toBe(5)
    expect(warnings).toEqual(prerequisites.map((prerequisite) =>
      `[HONEST SKIP] missing ${prerequisite}; H14 real-Codex acceptance case did not run`,
    ))
  })

  it('wires fail-closed real-Codex acceptance into the canonical verify job', async () => {
    const workflow = await readFile(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
    const verify = topLevelWorkflowJob(workflow, 'verify')
    if (verify === undefined) throw new Error('ci.yml is missing the canonical verify job')

    const bundleStep = verify.indexOf('run: npm run bundle')
    const imageStep = verify.indexOf('run: bash tools/sandcastle/build.sh local')
    const requiredMode = verify.indexOf("PIPELINE_REQUIRE_REAL_CODEX: '1'")
    const secretEnv = verify.indexOf('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    const nonEmptySecretGate = verify.indexOf('test -n "$OPENAI_API_KEY"')
    const acceptanceStep = verify.indexOf(
      'npx vitest run packages/cli/src/loop-run.real.integration.test.ts',
    )

    expect(bundleStep, 'verify must build the CLI bundle').toBeGreaterThan(-1)
    expect(imageStep, 'verify must build and attest sandcastle:local after bundling').toBeGreaterThan(bundleStep)
    expect(requiredMode, 'verify must enable required real-Codex mode').toBeGreaterThan(imageStep)
    expect(secretEnv, 'verify must inject only the GitHub secret').toBeGreaterThan(imageStep)
    expect(nonEmptySecretGate, 'an empty OPENAI_API_KEY must fail verify').toBeGreaterThan(secretEnv)
    expect(acceptanceStep, 'verify must run only the real-Codex acceptance file').toBeGreaterThan(nonEmptySecretGate)
    expect(verify).not.toContain('continue-on-error')
    expect(verify).not.toMatch(/^\s+if:/m)
    expect(verify).not.toMatch(/(?:echo|printf|printenv)[^\n]*OPENAI_API_KEY/i)
    expect(topLevelWorkflowJob(workflow, 'real-codex-acceptance')).toBeUndefined()
  })
})

let dockerReady = false
let cliEnv: NodeJS.ProcessEnv = { ...process.env, PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK: '0' }

async function readable(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findCodexHome(): Promise<string | undefined> {
  const candidates = [process.env.CODEX_HOME, join(homedir(), '.codex')]
    .filter((candidate): candidate is string => candidate !== undefined && candidate !== '')
  for (const candidate of [...new Set(candidates)]) {
    if (await readable(join(candidate, 'auth.json'))) return candidate
  }
  return undefined
}

async function prepareRealCodexEnvironment(): Promise<string | undefined> {
  const bundle = await readFile(bundlePath)
  const bundleSha256 = createHash('sha256').update(bundle).digest('hex')

  try {
    dockerReady = (await runProcess('docker', ['info'], { cwd: repoRoot, timeoutMs: 30_000 })).code === 0
  } catch {
    dockerReady = false
  }
  if (!dockerReady) return 'Docker daemon'

  const imageInspection = await runProcess(
    'docker',
    ['image', 'inspect', image],
    { cwd: repoRoot, timeoutMs: 30_000 },
  ).catch(() => undefined)
  if (imageInspection === undefined || imageInspection.code !== 0) return 'sandcastle:local image'

  const codexProbe = await runProcess('docker', [
    'run', '--rm', '--entrypoint', 'sh', image, '-c',
    'command -v codex >/dev/null && codex --version',
  ], { cwd: repoRoot, timeoutMs: 60_000 }).catch(() => undefined)
  if (codexProbe === undefined || codexProbe.code !== 0) return 'Codex CLI in sandcastle:local'

  await runSuccessfully('docker', [
    'run', '--rm', '--entrypoint', 'sh', image, '-c',
    'test "${PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK:-}" = "0"',
  ], { cwd: repoRoot, timeoutMs: 60_000 }, 'verify sandcastle:local deterministic fallback is disabled')

  const attestationProbe = await runProcess('docker', [
    'run', '--rm', '--entrypoint', 'cat', image, '/opt/pipeline/image-attestation.env',
  ], { cwd: repoRoot, timeoutMs: 60_000 }).catch(() => undefined)
  if (attestationProbe === undefined || attestationProbe.code !== 0) {
    return 'sandcastle:local attestation'
  }
  const attestedBundle = attestationProbe.stdout.match(/^pipeline_cli_dist_sha256=([0-9a-f]{64})$/m)?.[1]
  if (attestedBundle === undefined) return 'sandcastle:local attestation'
  if (attestedBundle !== bundleSha256) {
    throw new Error('sandcastle:local attestation is stale for the current CLI bundle')
  }

  const codexHome = await findCodexHome()
  if (!process.env.OPENAI_API_KEY && codexHome === undefined) {
    return 'Codex authentication (OPENAI_API_KEY or readable CODEX_HOME/auth.json)'
  }
  cliEnv = {
    ...process.env,
    PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK: '0',
    NO_COLOR: '1',
  }
  if (codexHome === undefined) delete cliEnv.CODEX_HOME
  else cliEnv.CODEX_HOME = codexHome
  return undefined
}

async function runCli(root: string, args: readonly string[], timeoutMs = 120_000): Promise<ProcessResult> {
  return runProcess(process.execPath, [bundlePath, ...args], { cwd: root, env: cliEnv, timeoutMs })
}

async function requireCli(root: string, args: readonly string[]): Promise<ProcessResult> {
  const result = await runCli(root, args)
  if (result.code !== 0) throw processFailure(`pipeline ${args.join(' ')}`, result)
  return result
}

async function seedChange(root: string, change: string, queue: boolean): Promise<void> {
  await requireCli(root, ['init', change, '--track', 'backend', '--preset', 'full'])
  await requireCli(root, ['set', change, 'phase', 'build'])
  await writeFile(
    join(root, 'openspec', 'changes', change, 'REAL_AGENT_TASK.md'),
    `# ${change}\n\nCreate \`deliverables/${change}.txt\` containing exactly this one line:\n\n${markerFor(change)}\n`,
    'utf8',
  )
  if (queue) await requireCli(root, ['afk', 'enqueue', change])
}

async function dockerCreateEvents(since: string, until: string): Promise<string[]> {
  const result = await runSuccessfully('docker', [
    'events', '--since', since, '--until', until,
    '--filter', 'type=container', '--filter', 'event=create', '--filter', `image=${image}`,
    '--format', '{{json .}}',
  ], { cwd: repoRoot, timeoutMs: 15_000 }, 'docker events (sandcastle:local container creates)')
  return result.stdout.split(/\r?\n/).filter((line) => line.trim() !== '')
}

async function ownedSandboxContainerIds(ownedRoots: readonly string[]): Promise<string[]> {
  if (!dockerReady || ownedRoots.length === 0) return []
  const listed = await runSuccessfully('docker', ['ps', '-aq', '--filter', 'name=sandcastle-'], {
    cwd: repoRoot,
    timeoutMs: 15_000,
  }, 'docker ps (H14 owned-container cleanup)')

  const ids = listed.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const inspected = await Promise.all(ids.map(async (id) => {
    const result = await runSuccessfully('docker', ['inspect', '--format', '{{.Config.WorkingDir}}', id], {
      cwd: repoRoot,
      timeoutMs: 15_000,
    }, `docker inspect ${id} (H14 owned-container cleanup)`)
    const workingDir = result.stdout.trim()
    return ownedRoots.some((root) => workingDir === root || workingDir.startsWith(`${root}/`)) ? id : undefined
  }))
  return inspected.filter((id): id is string => id !== undefined)
}

async function cleanupOwnedSandboxContainers(ownedRoots: readonly string[]): Promise<void> {
  const owned = await ownedSandboxContainerIds(ownedRoots)
  await Promise.all(owned.map((id) =>
    runSuccessfully(
      'docker',
      ['rm', '-f', id],
      { cwd: repoRoot, timeoutMs: 30_000 },
      `docker rm ${id} (H14 owned-container cleanup)`,
    ),
  ))
  const survivors = await ownedSandboxContainerIds(ownedRoots)
  if (survivors.length > 0) {
    throw new Error(`H14 real integration leaked owned Docker containers: ${survivors.join(', ')}`)
  }
}

describe('H14 real integration owned-container cleanup', () => {
  const fixtureDirs: string[] = []
  const originalPath = process.env.PATH

  async function installFakeDocker(body: string): Promise<string> {
    const binDir = await mkdtemp(join(tmpdir(), 'pipeline-h14-fake-docker-'))
    fixtureDirs.push(binDir)
    const executable = join(binDir, 'docker')
    await writeFile(executable, '#!/bin/sh\n' + body + '\n', 'utf8')
    await chmod(executable, 0o755)
    process.env.PATH = originalPath === undefined ? binDir : binDir + ':' + originalPath
    return executable
  }

  afterEach(async () => {
    dockerReady = false
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await Promise.all(fixtureDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('dockerReady 后 docker ps 核验失败必须使 cleanup 失败', async () => {
    await installFakeDocker('if [ "$1" = "ps" ]; then exit 17; fi\nexit 0')
    dockerReady = true

    await expect(cleanupOwnedSandboxContainers(['/owned-root'])).rejects.toThrow(/docker ps|exited 17/i)
  })

  it('dockerReady 后任一 docker inspect 核验失败必须使 cleanup 失败', async () => {
    await installFakeDocker(
      'if [ "$1" = "ps" ]; then printf "sandbox-a\\n"; exit 0; fi\n' +
      'if [ "$1" = "inspect" ]; then exit 18; fi\n' +
      'exit 0',
    )
    dockerReady = true

    await expect(cleanupOwnedSandboxContainers(['/owned-root'])).rejects.toThrow(/docker inspect|exited 18/i)
  })

  it('dockerReady 后任一 docker rm 失败都必须直接使 cleanup 失败', async () => {
    await installFakeDocker(
      'if [ "$1" = "ps" ]; then\n' +
      '  if [ ! -f "$0.rm-attempted" ]; then printf "sandbox-a\\n"; fi\n' +
      '  exit 0\n' +
      'fi\n' +
      'if [ "$1" = "inspect" ]; then printf "/owned-root/worktree\\n"; exit 0; fi\n' +
      'if [ "$1" = "rm" ]; then : > "$0.rm-attempted"; exit 19; fi\n' +
      'exit 0',
    )
    dockerReady = true

    await expect(cleanupOwnedSandboxContainers(['/owned-root'])).rejects.toThrow(/docker rm|exited 19/i)
  })

  it('只删除 working dir 落在本测试 owned roots 下的容器', async () => {
    const fakeDocker = await installFakeDocker(
      'if [ "$1" = "ps" ]; then\n' +
      '  if [ ! -f "$0.removed" ]; then printf "owned-id\\n"; fi\n' +
      '  printf "foreign-id\\n"\n' +
      '  exit 0\n' +
      'fi\n' +
      'if [ "$1" = "inspect" ]; then\n' +
      '  if [ "$4" = "owned-id" ]; then printf "/owned-root/worktree\\n"; else printf "/foreign-root/worktree\\n"; fi\n' +
      '  exit 0\n' +
      'fi\n' +
      'if [ "$1" = "rm" ]; then printf "%s\\n" "$3" >> "$0.removed"; exit 0; fi\n' +
      'exit 0',
    )
    dockerReady = true

    await cleanupOwnedSandboxContainers(['/owned-root'])

    await expect(readFile(fakeDocker + '.removed', 'utf8')).resolves.toBe('owned-id\n')
  })
})

const EMPTY_LOOP_REGISTRY = `version: 1
loops:
  - id: h14-empty
    name: H14 empty selector
    kind: executor
    goal: prove the dist real-run path is wired without inventing work
    cadence: 1h
    risk: low
    runner: codex
    change_prefix: h14-empty-
    skill_bundle_id: _all
    phases:
      - explore
      - build
    human_gates:
      - explore
    state: .superpowers/loops/h14-empty.md
    design_doc: GOAL.md
    status: active
    budget:
      max_runs_per_day: 1
      max_in_flight: 1
      on_exceed: skip
    kill_criteria:
      - no-change-3
    autonomy_level: L1
    allowlist: []
    denylist: []
`

describe('H14 loop run · sandcastle:local real-Codex dist black-box integration', () => {
  const roots: string[] = []

  afterEach(async () => {
    const ownedRoots = roots.splice(0)
    try {
      await cleanupOwnedSandboxContainers(ownedRoots)
    } finally {
      await Promise.all(ownedRoots.map((root) => rm(root, { recursive: true, force: true })))
    }
  })

  it('real-run is wired: an owned selector with no ready change exits 0 without fabricating execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pipeline-h14-empty-'))
    roots.push(root)
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'loops.yaml'), EMPTY_LOOP_REGISTRY, 'utf8')

    const result = await runProcess(process.execPath, [bundlePath, 'loop', 'run', 'h14-empty', '--commit'], {
      cwd: root,
    })

    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).not.toMatch(/real-run.*(?:未实现|未装配)/i)
  })

  it('selector preserves natural ownership; real L1 pauses with a Git-derived commit, real L3 verifies and merges, then budget blocks before Docker', async (ctx) => {
    const unavailablePrerequisite = await prepareRealCodexEnvironment()
    if (unavailablePrerequisite !== undefined) {
      handleMissingRealCodexPrerequisite({
        prerequisite: unavailablePrerequisite,
        required: requireRealCodex,
        skip: () => { ctx.skip() },
      })
      return
    }

    const root = await mkdtemp(join(tmpdir(), 'pipeline-h14-real-'))
    roots.push(root)
    cliEnv = { ...cliEnv, PIPELINE_DASHBOARD_HOME: join(root, '.pipeline-dashboard-home') }
    await git(root, ['init', '-q', '-b', 'main'])
    await git(root, ['config', 'user.email', 'h14@pipeline.local'])
    await git(root, ['config', 'user.name', 'H14 Real Integration'])
    await git(root, ['config', 'commit.gpgsign', 'false'])

    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'loops.yaml'), REAL_LOOP_REGISTRY, 'utf8')
    await writeFile(join(root, '.pipeline', 'automation.json'), JSON.stringify({
      version: 1,
      image,
      max_parallel: 1,
      max_retries: 0,
      default_opt_in: true,
    }, null, 2) + '\n', 'utf8')
    await writeFile(join(root, 'AGENTS.md'), AGENT_INSTRUCTIONS, 'utf8')
    await writeFile(join(root, 'README.md'), '# H14 real loop fixture\n', 'utf8')
    await writeFile(join(root, '.gitignore'), [
      '.sandcastle/',
      '.pipeline/loops/*.lock',
      '.pipeline/loops/ledger.jsonl',
      '.pipeline/loops/skill-snapshots/',
      '.pipeline-dashboard-home/',
      '',
    ].join('\n'), 'utf8')

    const l1Change = 'h14-owned'
    const foreignChange = 'h14-foreign-owned'
    const l3Change = 'h14-l3-first'
    const budgetChange = 'h14-l3-second'
    await seedChange(root, l1Change, true)
    await seedChange(root, foreignChange, true)
    await seedChange(root, l3Change, true)
    await seedChange(root, budgetChange, false)
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-q', '-m', 'seed H14 real integration fixture'])

    // 选宽前缀 h14-parent；更长的 h14-foreign-/h14-l3- 是它们的自然 owner，不能被 selector 强塞。
    const l1Result = await runCli(root, ['loop', 'run', 'h14-parent', '--level', 'L1', '--commit'], 720_000)
    expect(l1Result.code, `${l1Result.stdout}\n${l1Result.stderr}`).toBe(0)

    const l1State = await readFile(join(root, 'openspec', 'changes', l1Change, '.pipeline.yaml'), 'utf8')
    const foreignState = await readFile(join(root, 'openspec', 'changes', foreignChange, '.pipeline.yaml'), 'utf8')
    const l3QueuedState = await readFile(join(root, 'openspec', 'changes', l3Change, '.pipeline.yaml'), 'utf8')
    expect(l1State).toMatch(/^automation: paused$/m)
    expect(foreignState).toMatch(/^automation: queued$/m)
    expect(l3QueuedState).toMatch(/^automation: queued$/m)

    const l1Branch = branchFor(l1Change)
    const l1BranchSha = await git(root, ['rev-parse', `refs/heads/${l1Branch}^{commit}`])
    expect(l1BranchSha).toMatch(/^[0-9a-f]{40,64}$/)
    expect(await git(root, ['show', `${l1Branch}:deliverables/${l1Change}.txt`])).toContain(markerFor(l1Change))
    expect((await runProcess('git', ['show', `main:deliverables/${l1Change}.txt`], { cwd: root })).code).not.toBe(0)
    expect((await runProcess('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchFor(foreignChange)}`], { cwd: root })).code).not.toBe(0)
    expect((await runProcess('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchFor(l3Change)}`], { cwd: root })).code).not.toBe(0)
    expect(await readable(worktreeFor(root, l1Change))).toBe(false)

    const l1Log = await readFile(join(root, 'openspec', 'changes', l1Change, '.sandcastle-run.log'), 'utf8')
    expect(l1Log).toContain('"execution_mode":"agent/codex"')
    expect(l1Log).toContain('[tap] codex (forward)')
    expect(l1Log).not.toContain('deterministic-test-fallback')

    const afterL1 = await readLedger(root)
    expect(afterL1.filter((record) => record.kind === 'change-loop-binding')).toEqual([
      expect.objectContaining({
        change: l1Change,
        loop_id: 'h14-parent',
        source: 'longest-prefix',
      }),
    ])
    expect(afterL1.filter((record) => record.kind === 'run').map((record) => record.change)).toEqual([l1Change])
    const l1Run = onlyRun(afterL1, l1Change)
    expect(l1Run).toMatchObject({ loop_id: 'h14-parent', level: 'L1', runner: 'codex', result: 'paused' })
    expect(l1Run.artifacts).toMatchObject({
      build_sha: l1BranchSha,
      build_sha_source: 'named-branch-head',
      branch: l1Branch,
    })
    expect(l1Run.artifacts?.commit_shas?.at(-1)).toBe(l1BranchSha)

    // L3 仍调用同一个发布 bundle；host verifier 对命名分支 SHA 做真实 Git 检查后才允许 merge-back。
    const baseBeforeL3 = await git(root, ['rev-parse', 'main^{commit}'])
    const l3Result = await runCli(root, ['loop', 'run', 'h14-l3', '--level', 'L3', '--commit'], 720_000)
    expect(l3Result.code, `${l3Result.stdout}\n${l3Result.stderr}`).toBe(0)

    const l3Branch = branchFor(l3Change)
    const l3BranchSha = await git(root, ['rev-parse', `refs/heads/${l3Branch}^{commit}`])
    const baseAfterL3 = await git(root, ['rev-parse', 'main^{commit}'])
    const l3State = await readFile(join(root, 'openspec', 'changes', l3Change, '.pipeline.yaml'), 'utf8')
    const l3Log = await readFile(join(root, 'openspec', 'changes', l3Change, '.sandcastle-run.log'), 'utf8')
    const l3DiagnosticLedger = await readLedger(root)
    const l3Diagnostic = JSON.stringify({
      cli: l3Result,
      state: l3State,
      records: l3DiagnosticLedger.filter((record) =>
        record.change === l3Change || record.loop_id === 'h14-l3'),
      logTail: l3Log.slice(-4_000),
    }, null, 2)
    expect(baseAfterL3, l3Diagnostic).not.toBe(baseBeforeL3)
    expect((await runProcess('git', ['merge-base', '--is-ancestor', l3BranchSha, baseAfterL3], { cwd: root })).code).toBe(0)
    expect((await git(root, ['rev-list', '--parents', '-n', '1', baseAfterL3])).split(/\s+/)).toEqual([
      baseAfterL3,
      baseBeforeL3,
      l3BranchSha,
    ])
    expect(await git(root, ['show', `main:deliverables/${l3Change}.txt`])).toContain(markerFor(l3Change))
    expect(await readFile(join(root, 'deliverables', `${l3Change}.txt`), 'utf8')).toContain(markerFor(l3Change))
    expect(await git(root, ['status', '--porcelain', '--', `deliverables/${l3Change}.txt`])).toBe('')
    expect(await readable(worktreeFor(root, l3Change))).toBe(false)

    expect(l3State).toMatch(/^automation: merged$/m)
    expect(l3Log).toContain('"execution_mode":"agent/codex"')
    expect(l3Log).toContain('[tap] codex (forward)')
    expect(l3Log).not.toContain('deterministic-test-fallback')

    const afterL3 = await readLedger(root)
    const l3Run = onlyRun(afterL3, l3Change)
    expect(l3Run).toMatchObject({ loop_id: 'h14-l3', level: 'L3', runner: 'codex', result: 'merged' })
    expect(l3Run.artifacts).toMatchObject({
      build_sha: l3BranchSha,
      build_sha_source: 'named-branch-head',
      branch: l3Branch,
    })
    expect(l3Run.artifacts?.commit_shas?.at(-1)).toBe(l3BranchSha)
    expect(l3Run.verification).toMatchObject({
      verdict: 'passed',
      subject: { revision: { kind: 'named-branch-head', sha: l3BranchSha } },
      issuer: { kind: 'host-verifier', verifier: 'pipeline-git-integrity', trusted: true },
    })
    expect(afterL3.find((record) => record.kind === 'merge-intent' && record.change === l3Change)).toMatchObject({
      expected_base_sha: baseBeforeL3,
      expected_branch_sha: l3BranchSha,
      merged_commit_sha: baseAfterL3,
    })
    const l3Landed = afterL3.filter((record) => record.kind === 'merge-landed' && record.change === l3Change)
    expect(l3Landed.length).toBeGreaterThan(0)
    expect(l3Landed.at(-1)).toMatchObject({
      base_before_sha: baseBeforeL3,
      branch_sha: l3BranchSha,
      merged_commit_sha: baseAfterL3,
      host_synced: true,
    })

    // 同 loop 当日额度已被上一轮原子 reservation 消耗。第二个自然归属 change 必须在 Docker 前被拒。
    await requireCli(root, ['afk', 'enqueue', budgetChange])
    const ledgerBeforeBudget = await readLedger(root)
    const eventSince = new Date().toISOString()
    const budgetResult = await runCli(root, ['loop', 'run', 'h14-l3', '--level', 'L3', '--commit'], 720_000)
    const eventUntil = new Date(Date.now() + 1_000).toISOString()
    expect(budgetResult.code, `${budgetResult.stdout}\n${budgetResult.stderr}`).toBe(0)
    expect(`${budgetResult.stdout}\n${budgetResult.stderr}`).toContain('max-runs-per-day')

    const createEvents = await dockerCreateEvents(eventSince, eventUntil)
    expect(createEvents, 'budget-denied round must create zero sandcastle:local containers').toHaveLength(0)
    expect(await readFile(join(root, 'openspec', 'changes', budgetChange, '.pipeline.yaml'), 'utf8'))
      .toMatch(/^automation: queued$/m)
    expect((await runProcess('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchFor(budgetChange)}`], { cwd: root })).code).not.toBe(0)
    const finalLedger = await readLedger(root)
    expect(finalLedger.slice(0, ledgerBeforeBudget.length)).toEqual(ledgerBeforeBudget)
    expect(finalLedger.slice(ledgerBeforeBudget.length)).toEqual([
      expect.objectContaining({
        kind: 'change-loop-binding',
        change: budgetChange,
        loop_id: 'h14-l3',
        source: 'longest-prefix',
      }),
    ])
    expect(finalLedger.filter((record) => record.kind === 'budget-reservation' && record.change === budgetChange)).toHaveLength(0)
    expect(finalLedger.filter((record) => record.kind === 'run' && record.change === budgetChange)).toHaveLength(0)
    expect(finalLedger.filter((record) => record.kind === 'run' && record.loop_id === 'h14-l3')).toHaveLength(1)
  }, 1_500_000)
})
