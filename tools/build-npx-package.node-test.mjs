import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
    assert.match(bootstrap, /INSTALLER_NETWORK_TIMEOUT_MS = 30_000/u)
    assert.match(bootstrap, /signal:\s*AbortSignal\.timeout\(INSTALLER_NETWORK_TIMEOUT_MS\)/u)
    assert.match(bootstrap, /if \(!response\.ok\) throw new Error\(`installer download failed/u)
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
      generated.verifyInstaller('#!/bin/bash\necho tampered\n'),
      /digest mismatch/,
    )
    assert.deepEqual((await readdir(output)).sort(), ['LICENSE', 'README.md', 'bin', 'package.json', 'product'])
    const help = await exec(process.execPath, [join(output, 'bin', 'tenon-bootstrap.mjs'), '--help'])
    assert.match(help.stdout, /tenon setup --codex/)

    const probe = await mkdtemp(join(tmpdir(), 'tenon-npx-bootstrap-fetch-'))
    try {
      const timeoutPath = join(probe, 'timeout-ms')
      const preload = join(probe, 'preload.mjs')
      await writeFile(preload, `import { writeFileSync } from 'node:fs'
const timeoutPath = process.env.TENON_BOOTSTRAP_TIMEOUT_PATH
const originalTimeout = AbortSignal.timeout
AbortSignal.timeout = ((milliseconds) => {
  writeFileSync(timeoutPath, String(milliseconds))
  return originalTimeout(milliseconds)
})
globalThis.fetch = async () => { throw new Error('synthetic installer fetch failure') }
`)
      await assert.rejects(
        exec(process.execPath, [join(output, 'bin', 'tenon-bootstrap.mjs'), 'setup', '--codex'], {
          env: {
            ...process.env,
            NODE_OPTIONS: `--import=${preload}`,
            TENON_BOOTSTRAP_TIMEOUT_PATH: timeoutPath,
          },
        }),
        (error) => {
          assert.match(error.stderr, /synthetic installer fetch failure/u)
          return true
        },
      )
      assert.equal(await readFile(timeoutPath, 'utf8'), '30000')
    } finally {
      await rm(probe, { recursive: true, force: true })
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

test('rejects mutable branch, commit, and prerelease refs', async () => {
  const output = await mkdtemp(join(tmpdir(), 'tenon-npx-package-ref-'))
  try {
    for (const ref of ['main', 'a'.repeat(40), 'v1.0.2-rc.1']) {
      await assert.rejects(exec(process.execPath, [
        join(root, 'tools', 'build-npx-package.mjs'),
        '--package-name', '@example/tenon',
        '--ref', ref,
        '--output', output,
      ], { cwd: root }), /complete stable release tag/)
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
