import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const root = resolve(new URL('..', import.meta.url).pathname)

test('legacy bridge build is isolated from the Tenon product payload and pins its installer bytes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'tenon-legacy-bridge-'))
  const out = join(temp, 'bridge')
  const result = spawnSync(process.execPath, ['tools/build-legacy-bridge.mjs', '--out-dir', out], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)

  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  const installer = await readFile(join(out, 'tenon-install.sh'))
  assert.equal(manifest.migrationOnly, true)
  assert.equal(manifest.tenonInstallerSha256, createHash('sha256').update(installer).digest('hex'))
  assert.equal((await stat(join(out, 'bridge.sh'))).mode & 0o111, 0o111)
  assert.match(await readFile(join(out, '.codex-plugin', 'plugin.json'), 'utf8'), /"name": "pipeline-lite"/)
  const bridge = await readFile(join(out, 'bridge.sh'), 'utf8')
  assert.doesNotMatch(bridge, /packages\/cli\/dist\/pipeline\.mjs/)
  assert.match(bridge, /release_id=/)
  assert.match(bridge, /proof_host/)
  assert.match(bridge, /Tenon install failed; preserving legacy registration/)
  const syntax = spawnSync('bash', ['-n', join(out, 'bridge.sh')], { cwd: root, encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
})
