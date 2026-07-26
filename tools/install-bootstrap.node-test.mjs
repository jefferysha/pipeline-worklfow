import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('Codex one-line bootstrap registers Marketplace and invokes the packaged Tenon setup', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-'))
  try {
    const bin = join(fixture, 'bin')
    const plugin = join(fixture, 'plugin')
    const log = join(fixture, 'host.log')
    const setupArgs = join(fixture, 'setup-args.json')
    await mkdir(bin, { recursive: true })
    await mkdir(join(plugin, 'packages', 'cli', 'dist'), { recursive: true })
    await writeFile(join(bin, 'codex'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$TENON_TEST_HOST_LOG"
if [ "$*" = "plugin list --json" ]; then
  printf '{"installed":[{"name":"tenon","marketplaceName":"tenon","source":{"path":"%s"}}]}\\n' "$TENON_TEST_PLUGIN_ROOT"
fi
`)
    await chmod(join(bin, 'codex'), 0o755)
    await writeFile(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.env.TENON_TEST_SETUP_ARGS, JSON.stringify(process.argv.slice(2)))
`)
    await chmod(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), 0o755)

    const result = await exec('bash', [join(root, 'install.sh'), '--codex', '--auto-update'], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TENON_TEST_HOST_LOG: log,
        TENON_TEST_PLUGIN_ROOT: plugin,
        TENON_TEST_SETUP_ARGS: setupArgs,
      },
    })
    assert.match(result.stdout, /Tenon installed for --codex/)
    const commands = await readFile(log, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon --ref main/)
    assert.match(commands, /plugin add tenon@tenon --json/)
    assert.deepEqual(JSON.parse(await readFile(setupArgs, 'utf8')), [
      'setup', '--codex', '--yes', '--auto-update',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Claude one-line bootstrap uses the same stable Marketplace channel before packaged setup', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-claude-'))
  try {
    const bin = join(fixture, 'bin')
    const plugin = join(fixture, 'plugin')
    const log = join(fixture, 'host.log')
    const setupArgs = join(fixture, 'setup-args.json')
    await mkdir(bin, { recursive: true })
    await mkdir(join(plugin, 'packages', 'cli', 'dist'), { recursive: true })
    await writeFile(join(bin, 'claude'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$TENON_TEST_HOST_LOG"
if [ "$*" = "plugin list --json" ]; then
  printf '[{"id":"tenon@tenon","installPath":"%s"}]\\n' "$TENON_TEST_PLUGIN_ROOT"
fi
`)
    await chmod(join(bin, 'claude'), 0o755)
    await writeFile(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.env.TENON_TEST_SETUP_ARGS, JSON.stringify(process.argv.slice(2)))
`)
    await chmod(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), 0o755)

    const result = await exec('bash', [join(root, 'install.sh'), '--claude'], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TENON_TEST_HOST_LOG: log,
        TENON_TEST_PLUGIN_ROOT: plugin,
        TENON_TEST_SETUP_ARGS: setupArgs,
      },
    })
    assert.match(result.stdout, /Tenon installed for --claude/)
    const commands = await readFile(log, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon/)
    assert.match(commands, /plugin install tenon@tenon/)
    assert.deepEqual(JSON.parse(await readFile(setupArgs, 'utf8')), [
      'setup', '--claude', '--yes',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
