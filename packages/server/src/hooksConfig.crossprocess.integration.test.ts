/**
 * Hook 配置跨进程锁验收：holder 先持有真实 kernel lock 并更新 matrix；并发 writer
 * 必须等待锁释放，再在锁内重读并更新 keyword。最终两个字段都保留。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readHooksConfig } from './hooksConfig.js'

const HOLDER_SOURCE = `
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { withLock } from '@tenon/kernel'

const [root, releasePath] = process.argv.slice(2)
const pipelineDir = join(root, '.pipeline')
await mkdir(pipelineDir, { recursive: true })
await withLock(pipelineDir, async () => {
  process.stdout.write('ready\\n')
  while (!existsSync(releasePath)) await sleep(5)
  await writeFile(join(pipelineDir, 'hooks.json'), JSON.stringify({
    version: 1,
    prompt_skip_keyword: 'no-tenon',
    matrix: { 'router.build': false },
  }, null, 2) + '\\n', 'utf8')
})
`

const WRITER_SOURCE = `
import { writePromptRoutingBypass } from './hooksConfig.ts'

const [root] = process.argv.slice(2)
process.stdout.write('attempting\\n')
await writePromptRoutingBypass(root, { promptSkipKeyword: 'skip-tenon' })
process.stdout.write('done\\n')
`

async function bundle(source: string, dir: string, name: string): Promise<string> {
  const outfile = join(dir, name)
  await build({
    stdin: {
      contents: source,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
  })
  return outfile
}

function start(script: string, args: string[]): {
  child: ChildProcess
  output: (marker: string) => Promise<void>
  exit: Promise<number>
} {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  const waiters: Array<{ marker: string; resolve: () => void }> = []
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8')
    for (const waiter of waiters) {
      if (stdout.includes(waiter.marker)) waiter.resolve()
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(0)
      else reject(new Error(`child exit=${code ?? -1}\n${stderr}`))
    })
  })
  exit.catch(() => {})
  return {
    child,
    output: (marker) => stdout.includes(marker)
      ? Promise.resolve()
      : new Promise<void>((resolve) => waiters.push({ marker, resolve })),
    exit,
  }
}

describe('Hook config 跨进程 read-modify-rename', () => {
  let scriptDir: string
  let holderScript: string
  let writerScript: string

  beforeAll(async () => {
    scriptDir = await mkdtemp(join(tmpdir(), 'hooks-config-xproc-script-'))
    holderScript = await bundle(HOLDER_SOURCE, scriptDir, 'holder.mjs')
    writerScript = await bundle(WRITER_SOURCE, scriptDir, 'writer.mjs')
  })

  afterAll(async () => {
    await rm(scriptDir, { recursive: true, force: true })
  })

  test('并发 matrix/keyword writer 在同一锁内互保字段', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hooks-config-xproc-root-'))
    const releasePath = join(root, 'release')
    try {
      const holder = start(holderScript, [root, releasePath])
      await holder.output('ready')
      const writer = start(writerScript, [root])
      await writer.output('attempting')
      await sleep(100)
      expect(writer.child.exitCode).toBeNull()

      await writeFile(releasePath, 'release\n', 'utf8')
      await Promise.all([holder.exit, writer.exit])
      expect(readHooksConfig(root)).toEqual({
        promptSkipKeyword: 'skip-tenon',
        matrix: { 'router.build': false },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
