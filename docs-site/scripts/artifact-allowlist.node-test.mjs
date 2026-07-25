import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { auditArtifactFileSet } from './artifact-allowlist.mjs'

test('合法扩展但未被构建 manifest 声明的 asset 仍会被拒绝', async (t) => {
  const dist = await mkdtemp(join(tmpdir(), 'pipeline-docs-artifact-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  await mkdir(join(dist, '.vite'), { recursive: true })
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), '<script src="/assets/app.js"></script>', 'utf8')
  await writeFile(join(dist, 'assets', 'app.js'), 'export {}\n', 'utf8')
  await writeFile(join(dist, 'assets', 'internal-receipt.js'), 'secret\n', 'utf8')
  await writeFile(
    join(dist, '.vite', 'manifest.json'),
    JSON.stringify({ index: { file: 'assets/app.js', isEntry: true } }),
    'utf8',
  )

  const errors = await auditArtifactFileSet(dist, new Set(['index.html']))
  assert.deepEqual(errors, ['assets/internal-receipt.js: 不在当前构建的精确 artifact allowlist'])
})
