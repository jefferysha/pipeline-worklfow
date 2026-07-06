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
import { access, appendFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommanderError } from 'commander'
import { createFlowEngine, createStateStore, loadManifest } from '@pipeline-lite/kernel'
import type { CliDeps } from './deps.js'
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

/**
 * 运行期定位 templates/manifest.yaml：编译产物在 packages/cli/dist/main.js，
 * 插件仓根 = 其上三级（dist → cli → packages → 根）。loadManifest 不猜仓库根（T3 约定）。
 */
function manifestPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'manifest.yaml')
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
    writeBreadcrumb: (dir, content) => writeFile(join(dir, '.breadcrumb'), content, 'utf8'),
    history: {
      append: async (dir, entry) => {
        await appendFile(join(dir, '.pipeline-history.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8')
      },
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
