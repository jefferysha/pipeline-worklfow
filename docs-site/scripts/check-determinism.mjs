import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const docsSiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function snapshot() {
  const roots = ['.generated', 'public']
  const observed = new Map()
  for (const root of roots) {
    const absoluteRoot = resolve(docsSiteRoot, root)
    for (const entry of await readdir(absoluteRoot, { recursive: true }).catch(() => [])) {
      const relative = `${root}/${String(entry)}`
      const absolute = resolve(docsSiteRoot, relative)
      if (!(await stat(absolute)).isFile()) continue
      observed.set(relative, createHash('sha256').update(await readFile(absolute)).digest('hex'))
    }
  }
  return observed
}

function serialized(snapshotValue) {
  return JSON.stringify([...snapshotValue.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

await run(process.execPath, ['scripts/sync-content.mjs'], { cwd: docsSiteRoot })
const first = await snapshot()
await run(process.execPath, ['scripts/sync-content.mjs'], { cwd: docsSiteRoot })
const second = await snapshot()

if (serialized(first) !== serialized(second)) {
  console.error('[docs-determinism] 重复同步后的文件清单或 SHA-256 不一致')
  process.exitCode = 1
} else {
  console.log(`[docs-determinism] PASS: ${first.size} 个公开源产物重复同步保持逐字节一致`)
}
