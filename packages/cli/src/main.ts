#!/usr/bin/env node
/**
 * bin 入口：装配 kernel 实现 + fs 副作用，交给 buildProgram。
 *
 * ⚠️ 集成接缝（T7）：createStateStore / createFlowEngine / loadManifest 由 T2/T3 落地后
 * 从 '@pipeline-lite/kernel' re-export——在那之前本文件编译失败是预期的（plan T4 明示）。
 * 若 kernel 侧签名不同（如 loadManifest 需要 manifest.yaml 路径参数），仅调整此处装配，
 * 命令模块与测试不受影响。
 */
import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants, readdirSync, readFileSync, statSync } from 'node:fs'
import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommanderError } from 'commander'
import { createFlowEngine, createHistoryWriter, createStateStore, loadManifest } from '@pipeline-lite/kernel'
import type { GuardContext } from '@pipeline-lite/kernel'
import type { CliDeps, DoctorProbes, GateMarkerInfo } from './deps.js'
import { buildProgram, CliExit } from './program.js'

/** ISO8601 UTC 秒级（对齐老内核 date -u +%Y-%m-%dT%H:%M:%SZ 口径） */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * `git rev-parse HEAD` 的 stdout（失败也取 stdout——对齐老内核
 * `$(git rev-parse HEAD 2>/dev/null || echo "")`：unborn 仓捕获字面 "HEAD"，T6 实测怪癖）。
 */
function gitHeadSha(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd }, (_err, stdout) => {
      resolve((stdout ?? '').trim())
    })
  })
}

async function listChanges(changesRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(changesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    try {
      await access(join(changesRoot, entry.name, '.pipeline.yaml'))
      names.push(entry.name)
    } catch {
      // 无 .pipeline.yaml 的目录不算 pipeline change
    }
  }
  return names.sort()
}

/** 项目根三门 marker（缺失即不在收件箱；新鲜判定归 inbox 命令） */
async function readGateMarkers(cwd: string): Promise<GateMarkerInfo[]> {
  const out: GateMarkerInfo[] = []
  for (const kind of ['confirm', 'review', 'interaction'] as const) {
    try {
      const p = join(cwd, `.pipeline-pending-${kind}`)
      const st = await stat(p)
      out.push({ kind, ageMs: Date.now() - st.mtimeMs, raw: await readFile(p, 'utf8') })
    } catch {
      // 缺失 = 无该门等待
    }
  }
  return out
}

/**
 * check 命令的 guard 文件面（BACKLOG #12）：GuardContext 的 node:fs 落地。
 * 老 guard 在项目根跑 bash `[ -f ]` 等谓词——此处以 cwd 为根做同义解析；
 * 谓词为同步纯读（guardCheck 是纯函数签名），任何 fs 异常一律按「不存在」处理。
 */
function makeGuardCtx(cwd: string): (name: string) => GuardContext {
  const abs = (relPath: string) => join(cwd, relPath)
  return (name: string): GuardContext => ({
    changeDirRel: `openspec/changes/${name}`,
    fileExists: (p) => {
      try { return statSync(abs(p)).isFile() } catch { return false }
    },
    fileNonempty: (p) => {
      try { const st = statSync(abs(p)); return st.isFile() && st.size > 0 } catch { return false }
    },
    readFile: (p) => {
      try { return readFileSync(abs(p), 'utf8') } catch { return undefined }
    },
    dirExists: (p) => {
      try { return statSync(abs(p)).isDirectory() } catch { return false }
    },
    // 老 guard：find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d -name "*-<dep>"
    changeArchived: (dep) => {
      try {
        return readdirSync(abs('openspec/changes/archive'), { withFileTypes: true })
          .some((e) => e.isDirectory() && e.name.endsWith(`-${dep}`))
      } catch { return false }
    },
    // 调度器执行路径旁路（老 guard PIPELINE_AUTOMATION_RUNNER=1 语义）
    automationRunner: process.env.PIPELINE_AUTOMATION_RUNNER === '1',
  })
}

/**
 * 运行期定位插件仓根：编译产物在 packages/cli/dist/main.js，
 * 根 = 其上三级（dist → cli → packages → 根）。loadManifest 不猜仓库根（T3 约定）。
 */
function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function manifestPath(): string {
  return join(pluginRoot(), 'templates', 'manifest.yaml')
}

/**
 * doctor 探针（BACKLOG #26b）：环境/fs 事实采集的 node 落地，裁决归 cmdDoctor。
 * 各探针独立 fail-safe（fs 异常按「不存在/不可执行」处理）——doctor 要能在坏环境里跑完。
 */
function makeDoctorProbes(): DoctorProbes {
  const root = pluginRoot()
  return {
    nodeVersion: () => process.version,
    gitAvailable: () =>
      new Promise((resolve) => {
        execFile('git', ['--version'], (err) => resolve(!err))
      }),
    pluginRoot: root,
    manifestError: () => {
      try {
        loadManifest(manifestPath())
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    fileExists: (p) => {
      try { return statSync(p).isFile() } catch { return false }
    },
    fileExecutable: (p) => {
      try { accessSync(p, fsConstants.X_OK); return true } catch { return false }
    },
    dirExists: (p) => {
      try { return statSync(p).isDirectory() } catch { return false }
    },
    env: (name) => process.env[name],
    // 接入判定与 statusline.sh 头注释的接入方式同口径：settings.json 里引用了该脚本即算接入
    statuslineConfigured: () => {
      try {
        return readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8').includes('statusline.sh')
      } catch {
        return false
      }
    },
    runVerifySkills: () =>
      new Promise((resolve) => {
        execFile(
          'bash',
          [join(root, 'tools', 'verify-skills.sh'), '--quiet'],
          { timeout: 30_000 },
          (err, stdout, stderr) => {
            const errCode = (err as { code?: unknown } | null)?.code
            const code = err ? (typeof errCode === 'number' ? errCode : 1) : 0
            resolve({ code, output: `${stdout ?? ''}${stderr ?? ''}` })
          },
        )
      }),
  }
}

async function main(): Promise<void> {
  const manifest = loadManifest(manifestPath())
  const deps: CliDeps = {
    store: createStateStore(),
    flow: createFlowEngine(manifest),
    cwd: process.cwd(),
    io: {
      out: (line: string) => process.stdout.write(`${line}\n`),
      err: (line: string) => process.stderr.write(`${line}\n`),
    },
    clock: isoNow,
    listChanges,
    guardCtx: makeGuardCtx(process.cwd()),
    doctor: makeDoctorProbes(),
    readGateMarkers: () => readGateMarkers(process.cwd()),
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: createHistoryWriter(),
    readHistoryRaw: async (dir) => {
      try {
        return await readFile(join(dir, '.pipeline-history.jsonl'), 'utf8')
      } catch {
        return ''
      }
    },
    gitHeadSha: () => gitHeadSha(process.cwd()),
    writeReviewMarker: (content) => writeFile(join(process.cwd(), '.pipeline-pending-review'), content, 'utf8'),
  }

  try {
    await buildProgram(deps).parseAsync(process.argv)
  } catch (e) {
    if (e instanceof CliExit) {
      process.exitCode = e.code
    } else if (e instanceof CommanderError) {
      // usage error / help 展示；commander 已把消息写去 stderr（configureOutput）
      process.exitCode = e.exitCode
    } else {
      process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exitCode = 1
    }
  }
}

void main()
