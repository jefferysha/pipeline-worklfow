import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('builds a release-pinned thin package without repository or test payload', async () => {
  const output = await mkdtemp(join(tmpdir(), 'tenon-npx-package-'))
  try {
    await exec(process.execPath, [
      join(root, 'tools', 'build-npx-package.mjs'),
      '--package-name', '@example/tenon',
      '--ref', 'v1.0.0',
      '--output', output,
    ], { cwd: root })
    const pkg = JSON.parse(await readFile(join(output, 'package.json'), 'utf8'))
    assert.equal(pkg.name, '@example/tenon')
    assert.equal(pkg.bin.tenon, 'bin/tenon-bootstrap.mjs')
    const bootstrap = await readFile(join(output, 'bin', 'tenon-bootstrap.mjs'), 'utf8')
    assert.match(bootstrap, /jefferysha\/tenon/)
    assert.match(bootstrap, /v1\.0\.0/)
    assert.match(bootstrap, /[a-f0-9]{64}/)
    assert.match(bootstrap, /createHash/)
    assert.doesNotMatch(bootstrap, /__TENON_/)
    const generated = await import(`${pathToFileURL(join(output, 'bin', 'tenon-bootstrap.mjs')).href}?test=${Date.now()}`)
    assert.deepEqual(generated.parseArgs(['setup', '--codex', '--dry-run']), {
      help: false,
      installerArgs: ['--codex', '--dry-run'],
    })
    assert.throws(
      () => generated.parseArgs(['setup', '--codex', '--unknown']),
      /unsupported option/,
    )
    await assert.rejects(
      generated.verifyInstaller('#!/usr/bin/env bash\necho tampered\n'),
      /digest mismatch/,
    )
    assert.deepEqual((await readdir(output)).sort(), ['LICENSE', 'README.md', 'bin', 'package.json', 'product'])
    const help = await exec(process.execPath, [join(output, 'bin', 'tenon-bootstrap.mjs'), '--help'])
    assert.match(help.stdout, /tenon setup --codex/)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
