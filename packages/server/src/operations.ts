/**
 * Dashboard Operations -> production CLI adapter.
 *
 * H11/H12/H13/H14 and the G1/G2 maintenance commands already have one
 * production implementation in `packages/cli`.  The dashboard must not grow a
 * second, subtly different executor, so the HTTP layer invokes the built CLI
 * with an argv array (never a shell string) and returns the real process exit
 * code plus stdout/stderr.  Tests inject the same narrow port.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface PipelineCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type PipelineCliRunner = (
  repoRoot: string,
  args: readonly string[],
) => Promise<PipelineCliResult>

/** Works from both `src/operations.ts` and the bundled `dist/dashboard.mjs`. */
export function pipelineCliBundlePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cli', 'dist', 'tenon.mjs')
}

export function pipelineCliAvailable(): boolean {
  return existsSync(pipelineCliBundlePath())
}

export const runPipelineCli: PipelineCliRunner = (repoRoot, args) =>
  new Promise((resolve, reject) => {
    const bundle = pipelineCliBundlePath()
    if (!existsSync(bundle)) {
      reject(new Error(`Tenon CLI bundle 不存在：${bundle}；请先执行 npm run bundle`))
      return
    }
    execFile(
      process.execPath,
      [bundle, ...args],
      {
        cwd: repoRoot,
        env: process.env,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 15 * 60 * 1000,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr })
          return
        }
        const code = typeof error.code === 'number' ? error.code : 1
        // A normal non-zero command result is data, not an adapter failure.
        if (typeof error.code === 'number') {
          resolve({ exitCode: code, stdout, stderr })
          return
        }
        reject(error)
      },
    )
  })

/** CLI JSON modes are either one JSON document or one JSON line. */
export function parsePipelineCliJson(stdout: string): unknown | null {
  const trimmed = stdout.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (line === undefined) continue
      try {
        return JSON.parse(line) as unknown
      } catch {
        // Keep searching: human-readable prelude lines are allowed.
      }
    }
    return null
  }
}

export function cliExitHttpStatus(exitCode: number): number {
  if (exitCode === 0) return 200
  if (exitCode === 3) return 409
  return 400
}
