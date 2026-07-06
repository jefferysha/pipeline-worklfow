/**
 * 真实 e2e 测试 harness（GOAL C9：无伪测试）——共享给所有 *.integration.test.ts。
 * 零 mock：真 kernel（createStateStore/FlowEngine/loadManifest/HistoryWriter）+ 真临时 fs +
 * 真 buildProgram 解析路径（与 main.ts 同款装配，仅 io 收数组、clock 固定、gitHeadSha 定桩）。
 *
 * 并行开发约定：每个功能各写 <feature>.integration.test.ts，import 本 harness 的 makeHarness，
 * 互不碰 integration.test.ts / program.ts（收编点由主会话统一接线新命令）。
 * 注意：文件名 *-harness.ts 不带 .test.，不会被 vitest 当测试收集（无用例）。
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createFlowEngine,
  createHistoryWriter,
  createStateStore,
  loadManifest,
  type GuardContext,
} from '@pipeline-lite/kernel'
import type { CliDeps } from './deps.js'
import { buildProgram, CliExit } from './program.js'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const MANIFEST = join(REPO_ROOT, 'templates', 'manifest.yaml')
export const FIXED_CLOCK = '2026-07-07T00:00:00Z'

export interface Harness {
  cwd: string
  out: string[]
  err: string[]
  /** 跑一条 CLI（argv 风格，无 node/script 前缀）；返回 exit code，每次清空 out/err */
  run: (args: string[]) => Promise<number>
  /** 读某 change 的 .pipeline.yaml 原文 */
  read: (name: string) => Promise<string>
  /** 读某 change 目录下任意文件（相对 change 目录）；不存在 → 抛 */
  readIn: (name: string, rel: string) => Promise<string>
}

/** 真实 deps：与 main.ts 同款 fs 副作用，只把 io 收进数组、clock 固定、gitHeadSha 定桩。 */
export function realDeps(cwd: string, out: string[], err: string[]): CliDeps {
  const manifest = loadManifest(MANIFEST)
  const abs = (p: string) => join(cwd, p)
  const guardCtx = (name: string): GuardContext => ({
    changeDirRel: `openspec/changes/${name}`,
    fileExists: (p) => { try { return statSync(abs(p)).isFile() } catch { return false } },
    fileNonempty: (p) => { try { const s = statSync(abs(p)); return s.isFile() && s.size > 0 } catch { return false } },
    readFile: (p) => { try { return readFileSync(abs(p), 'utf8') } catch { return undefined } },
    dirExists: (p) => { try { return statSync(abs(p)).isDirectory() } catch { return false } },
    changeArchived: (dep) => {
      try {
        return readdirSync(abs('openspec/changes/archive'), { withFileTypes: true })
          .some((e) => e.isDirectory() && e.name.endsWith(`-${dep}`))
      } catch { return false }
    },
    automationRunner: false,
  })
  return {
    store: createStateStore(),
    flow: createFlowEngine(manifest),
    cwd,
    io: { out: (l) => out.push(l), err: (l) => err.push(l) },
    clock: () => FIXED_CLOCK,
    listChanges: async (root) => {
      try {
        return readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name !== 'archive')
          .filter((e) => { try { return statSync(join(root, e.name, '.pipeline.yaml')).isFile() } catch { return false } })
          .map((e) => e.name).sort()
      } catch { return [] }
    },
    guardCtx,
    readGateMarkers: async () => {
      const res = []
      for (const kind of ['confirm', 'review', 'interaction'] as const) {
        try {
          const p = join(cwd, `.pipeline-pending-${kind}`)
          const st = await stat(p)
          res.push({ kind, ageMs: Math.max(0, Date.now() - st.mtimeMs), raw: await readFile(p, 'utf8') })
        } catch { /* 缺失 */ }
      }
      return res
    },
    readHistoryRaw: async (dir) => { try { return await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8') } catch { return '' } },
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: createHistoryWriter(),
    gitHeadSha: async () => 'DEADBEEF',
    writeReviewMarker: (content) => writeFile(join(cwd, '.pipeline-pending-review'), content, 'utf8'),
    pluginVersion: '0.1.0',
    readInstalledPlugins: async () => undefined,
    doctor: {
      nodeVersion: () => process.version,
      gitAvailable: async () => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false } },
      pluginRoot: REPO_ROOT,
      manifestError: () => { try { loadManifest(MANIFEST); return null } catch (e) { return e instanceof Error ? e.message : String(e) } },
      fileExists: (p) => { try { return statSync(p).isFile() } catch { return false } },
      fileExecutable: (p) => { try { return (statSync(p).mode & 0o111) !== 0 } catch { return false } },
      dirExists: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
      env: (name) => process.env[name],
      statuslineConfigured: () => false,
      runVerifySkills: async () => {
        try {
          const output = execFileSync('bash', [join(REPO_ROOT, 'tools', 'verify-skills.sh')], { encoding: 'utf8' })
          return { code: 0, output }
        } catch (e) {
          const er = e as { status?: number; stdout?: string; stderr?: string }
          return { code: er.status ?? 1, output: `${er.stdout ?? ''}${er.stderr ?? ''}` }
        }
      },
    },
  }
}

/** 建一个真实临时项目 harness。用毕请 rm(h.cwd)。 */
export function makeHarness(cwd: string): Harness {
  const out: string[] = []
  const err: string[] = []
  return {
    cwd, out, err,
    run: async (args) => {
      out.length = 0
      err.length = 0
      try {
        await buildProgram(realDeps(cwd, out, err)).parseAsync(args, { from: 'user' })
        return 0
      } catch (e) {
        if (e instanceof CliExit) return e.code
        throw e
      }
    },
    read: (name) => readFile(join(cwd, 'openspec', 'changes', name, '.pipeline.yaml'), 'utf8'),
    readIn: (name, rel) => readFile(join(cwd, 'openspec', 'changes', name, rel), 'utf8'),
  }
}

/** 便捷：mkdtemp + makeHarness（调用方负责 rm(h.cwd)）。 */
export async function freshHarness(): Promise<Harness> {
  return makeHarness(await mkdtemp(join(tmpdir(), 'lite-e2e-')))
}

export { rm }
