/**
 * server 测试基座 —— 真 fs / 真 HTTP 客户端工具（GOAL C9：绝不 mock，真起真请求）。
 * 非 *.test.ts（会被 tsc 编入 dist），但仅测试引用；生产 index.ts 不导出。
 */
import { request as httpRequest, get as httpGet, type IncomingHttpHeaders } from 'node:http'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  builtinTrack,
  createFlowEngine,
  createStateStore,
  createTransitionRecordStore,
  createWorkflowRunRepository,
  ensureDocumentLedger,
  loadManifest,
  recordDocument,
  recordDocumentReads,
} from '@tenon/kernel'
import type { FlowEngine, InitOptions, StateStore } from '@tenon/kernel'

/** 新仓根 templates/manifest.yaml（src 下运行时：src → server → packages → 根）。 */
export function repoManifestPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'manifest.yaml')
}

/**
 * config 写端点测试用：把仓库真 templates/manifest.yaml 拷贝到独立临时文件，返回其路径。
 * 绝不让测试直接写仓库真文件（config.test.ts / server.test.ts 的写端点用例都经此隔离）。
 */
export async function makeTempManifest(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pl-dash-manifest-'))
  const dest = join(dir, 'manifest.yaml')
  await copyFile(repoManifestPath(), dest)
  return dest
}

export function testFlow(): FlowEngine {
  return createFlowEngine(loadManifest(repoManifestPath()))
}

export function newStore(): StateStore {
  return createStateStore()
}

export async function makeTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-home-'))
}

/** 真建一个临时项目根（含 .git/HEAD 让 base_branch 探测有稳定值）。 */
export async function makeProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-proj-'))
}

/**
 * 真建一个临时目录，代表某 change 当前的 automation worktree 根（afk-workbench Task 4：
 * cancelAfkRun 往这个目录真落 .cancel-requested 标记文件，目录必须真实存在于磁盘）。
 */
export async function makeWorktreeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-worktree-'))
}

/** 真 init 一个 change；simple 轨从内建 workflow 的 change step 开始，其余缺省 phase=open。 */
export async function initChange(
  store: StateStore,
  root: string,
  name: string,
  opts?: {
    track?: 'chat' | 'simple' | 'pm' | 'frontend' | 'backend'
    preset?: string
    legacyWithoutRunIdentity?: boolean
    initialWorkflow?: InitOptions['initialWorkflow']
  },
): Promise<string> {
  const track = opts?.track ?? 'backend'
  const init = {
    repoRoot: root,
    name,
    track,
    reviewSeed: builtinTrack(track).policyProfile.reviewSeed,
    preset: opts?.preset ?? 'full',
    clock: () => '2026-07-07T00:00:00Z',
    ...(opts?.initialWorkflow !== undefined
      ? { initialWorkflow: opts.initialWorkflow }
      : track === 'simple'
      ? { initialWorkflow: { workflow: 'simple', phase: 'change', openspecContract: false } }
      : {}),
  }
  if (opts?.legacyWithoutRunIdentity === true) return store.init(init)
  return (await createWorkflowRunRepository({
    store,
    recordStore: createTransitionRecordStore(),
    clock: () => '2026-07-07T00:00:00Z',
  }).initChange(init)).changeDir
}

const GOVERNED_DESIGN = `# governed design

\`\`\`coverage
touches:
L1_api: filled
L2_data: filled
L3_rules: filled
L4_state: filled
L5_errors: filled
L6_security: filled
L7_perf: filled
L8_deps: filled
L10_terms: filled
\`\`\`
`

/** Seed real ledger/hash/read evidence for tests whose subject is not document authoring. */
export async function seedGovernedDocumentEvidence(root: string, changeDir: string, name: string): Promise<void> {
  const docs = {
    proposal: `openspec/changes/${name}/proposal.md`,
    design: `openspec/changes/${name}/design.md`,
    tasks: `openspec/changes/${name}/tasks.md`,
    superpowerDesign: `docs/superpowers/specs/${name}-design.md`,
    adr: `docs/adr/${name}.md`,
    delta: `openspec/changes/${name}/specs/capability/spec.md`,
    plan: `docs/superpowers/plans/${name}.md`,
    report: `docs/superpowers/reports/${name}.md`,
    applied: 'openspec/specs/capability/spec.md',
  }
  const contents: Readonly<Record<keyof typeof docs, string>> = {
    proposal: '# proposal\n', design: GOVERNED_DESIGN, tasks: '- [x] scope\n- [x] implementation\n- [x] verification\n',
    superpowerDesign: '# Superpower design\n', adr: '# ADR\n', delta: '# Delta spec\n', plan: '# Superpower plan\n',
    report: '# Verification report\n', applied: '# Applied spec\n',
  }
  for (const key of Object.keys(docs) as Array<keyof typeof docs>) {
    const target = join(root, docs[key])
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, contents[key], 'utf8')
  }
  const historyPath = join(changeDir, '.pipeline-history.jsonl')
  let originalHistory: string | undefined
  try {
    originalHistory = await readFile(historyPath, 'utf8')
  } catch {
    // A fresh change has no history until its first transition.
  }
  const skillLines = [
    'openspec-propose', 'brainstorming', 'writing-plans', 'verification-before-completion', 'openspec-apply-change',
  ].map((skill) => JSON.stringify({ kind: 'tool', raw: `Skill: ${skill}` })).join('\n')
  await writeFile(historyPath, `${originalHistory ?? ''}${skillLines}\n`, 'utf8')
  try {
    const recordedAt = '2026-07-07T00:00:00Z'
    await createWorkflowRunRepository({
      store: createStateStore(),
      recordStore: createTransitionRecordStore(),
      clock: () => recordedAt,
    }).establishRun(changeDir)
    // StateStore.init is intentionally storage-only. The CLI's `init` command creates this
    // migration-safe sidecar, but server fixtures use StateStore directly, so establish the
    // same real ledger before registering hash-bound documents.
    await ensureDocumentLedger(changeDir, recordedAt)
    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'proposal', path: docs.proposal, producer: 'openspec-propose', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'openspec-design', path: docs.design, producer: 'openspec-propose', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'open', kind: 'tasks', path: docs.tasks, producer: 'openspec-propose', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'explore', kind: 'superpower-design', path: docs.superpowerDesign, producer: 'brainstorming', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'explore', kind: 'adr', path: docs.adr, producer: 'brainstorming', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'spec', kind: 'delta-spec', path: docs.delta, producer: 'openspec-propose', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'spec', kind: 'superpower-plan', path: docs.plan, producer: 'writing-plans', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'spec', kind: 'plan', path: docs.plan, producer: 'writing-plans', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'verify', kind: 'verification-report', path: docs.report, producer: 'verification-before-completion', recordedAt })
    await recordDocument({ repoRoot: root, changeDir, phase: 'ship', kind: 'applied-spec', path: docs.applied, producer: 'openspec-apply-change', recordedAt })
    await readGovernedDocumentsForCurrentVisit(root, changeDir, recordedAt)
  } finally {
    if (originalHistory === undefined) await rm(historyPath, { force: true })
    else await writeFile(historyPath, originalHistory, 'utf8')
  }
}

/** Test-only current-visit read; callers invoke it after a real transition before the next exit. */
export async function readGovernedDocumentsForCurrentVisit(
  root: string,
  changeDir: string,
  readAt = '2026-07-07T00:00:00Z',
): Promise<void> {
  const state = await createStateStore().read(changeDir)
  await recordDocumentReads({
    repoRoot: root,
    changeDir,
    phase: String(state.fields.phase),
    kind: 'all',
    readAt,
  })
}

export interface HttpResult {
  status: number
  headers: IncomingHttpHeaders
  body: string
  json: <T = unknown>() => T
}

function toResult(status: number, headers: IncomingHttpHeaders, body: string): HttpResult {
  return { status, headers, body, json: <T,>() => JSON.parse(body) as T }
}

export function reqGet(
  port: number,
  path: string,
  host = '127.0.0.1',
  headers?: Record<string, string>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const r = httpGet({ host, port, path, headers }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, body)))
    })
    r.on('error', reject)
  })
}

export function reqPost(
  port: number,
  path: string,
  payload: unknown,
  opts?: { host?: string; headers?: Record<string, string>; rawBody?: string },
): Promise<HttpResult> {
  const host = opts?.host ?? '127.0.0.1'
  const body = opts?.rawBody ?? JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    ...(opts?.headers ?? {}),
  }
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host, port, path, method: 'POST', headers }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, b)))
    })
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

export function reqPatch(
  port: number,
  path: string,
  payload: unknown,
  opts?: { host?: string; headers?: Record<string, string>; rawBody?: string },
): Promise<HttpResult> {
  const host = opts?.host ?? '127.0.0.1'
  const body = opts?.rawBody ?? JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    ...(opts?.headers ?? {}),
  }
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host, port, path, method: 'PATCH', headers }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, b)))
    })
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

export function reqDelete(
  port: number,
  path: string,
  opts?: { host?: string; headers?: Record<string, string> },
): Promise<HttpResult> {
  const host = opts?.host ?? '127.0.0.1'
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host, port, path, method: 'DELETE', headers: opts?.headers }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, b)))
    })
    r.on('error', reject)
    r.end()
  })
}

/** 真开一条 SSE 连接，累积事件；waitFor 轮询直到命中或超时。 */
export interface SSEConn {
  events: Array<{ event: string; data: string }>
  waitFor(pred: (e: { event: string; data: string }) => boolean, timeoutMs?: number): Promise<{ event: string; data: string }>
  close(): void
}

export function openSSE(port: number, path: string, host = '127.0.0.1'): Promise<SSEConn> {
  return new Promise((resolve, reject) => {
    const events: Array<{ event: string; data: string }> = []
    let buf = ''
    const r = httpGet({ host, port, path, headers: { Accept: 'text/event-stream' } }, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buf += chunk
        let idx: number
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          let ev = 'message'
          const dataLines: string[] = []
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
            // ':'-prefixed comments (heartbeat) ignored
          }
          if (dataLines.length) events.push({ event: ev, data: dataLines.join('\n') })
        }
      })
      const conn: SSEConn = {
        events,
        close: () => r.destroy(),
        waitFor: (pred, timeoutMs = 3000) =>
          new Promise((res2, rej2) => {
            const start = Date.now()
            const tick = () => {
              const hit = events.find(pred)
              if (hit) return res2(hit)
              if (Date.now() - start > timeoutMs) return rej2(new Error('SSE waitFor 超时'))
              setTimeout(tick, 15)
            }
            tick()
          }),
      }
      resolve(conn)
    })
    r.on('error', reject)
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
