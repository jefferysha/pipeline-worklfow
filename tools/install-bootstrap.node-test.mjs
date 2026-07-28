import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AUTH_COMMANDS = [
  'codex login',
  'codex login --device-auth',
  'https://platform.openai.com/api-keys',
  'printenv OPENAI_API_KEY | codex login --with-api-key',
  'codex login status',
]

function hasExactCommand(document, command) {
  return document.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim()
    return trimmed === command || trimmed.includes(`\`${command}\``)
  })
}

test('Codex auth commands stay consistent across Chinese, English, troubleshooting, and npm bootstrap docs', async () => {
  const documents = [
    'README.md',
    'docs/usage/installation.md',
    'docs/usage/zh-CN/installation.md',
    'docs/usage/troubleshooting.md',
    'docs/usage/zh-CN/troubleshooting.md',
    'packages/npm-bootstrap/README.md',
  ]
  for (const document of documents) {
    const content = await readFile(join(root, document), 'utf8')
    for (const command of AUTH_COMMANDS) {
      const present = command.startsWith('https://')
        ? content.includes(command)
        : hasExactCommand(content, command)
      assert.ok(present, `${document} is missing exact command ${command}`)
    }
    assert.match(
      content,
      /(?:plan that includes Codex|方案包含 Codex)/u,
      `${document} is missing the conditional ChatGPT plan wording`,
    )
    assert.match(
      content,
      /(?:usage-based billing|按(?:独立的)?(?:用量|量)计费)/u,
      `${document} is missing Platform usage-based billing`,
    )
  }
})

test('one-line dry-run prints the complete host and packaged setup plan without invoking the host or writing HOME', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-dry-run-'))
  try {
    const bin = join(fixture, 'bin')
    const home = join(fixture, 'home')
    const hostLog = join(fixture, 'host.log')
    await mkdir(bin, { recursive: true })
    await mkdir(home, { recursive: true })
    await writeFile(join(bin, 'codex'), `#!/usr/bin/env bash
printf 'unexpected host invocation\\n' >> "$TENON_TEST_HOST_LOG"
exit 97
`)
    await chmod(join(bin, 'codex'), 0o755)

    const result = await exec('bash', [join(root, 'install.sh'), '--codex', '--dry-run'], {
      cwd: fixture,
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TENON_TEST_HOST_LOG: hostLog,
      },
    })

    assert.match(result.stdout, /codex plugin marketplace add jefferysha\/tenon --ref main/)
    assert.match(result.stdout, /codex plugin add tenon@tenon --json/)
    assert.match(result.stdout, /npm install -g @openai\/codex/)
    assert.match(result.stdout, /codex login status/)
    assert.match(result.stdout, /tenon setup --codex --yes --dry-run/)
    await assert.rejects(readFile(hostLog, 'utf8'), /ENOENT/)
    assert.deepEqual(await readdir(home), [])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Codex bootstrap threads an explicit immutable Marketplace ref', async () => {
  const result = await exec(
    'bash',
    [
      join(root, 'install.sh'),
      '--codex',
      '--ref',
      '0123456789abcdef0123456789abcdef01234567',
      '--dry-run',
    ],
  )
  assert.match(
    result.stdout,
    /codex plugin marketplace add jefferysha\/tenon --ref 0123456789abcdef0123456789abcdef01234567/,
  )
})

test('Codex bootstrap fails before mutations when the host CLI is missing and prints the install command', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-no-codex-'))
  try {
    await assert.rejects(
      exec('bash', [join(root, 'install.sh'), '--codex'], {
        cwd: fixture,
        env: { ...process.env, PATH: '/usr/bin:/bin' },
      }),
      (error) => {
        assert.match(error.stderr, /npm install -g @openai\/codex/)
        assert.match(error.stderr, /codex --version/)
        return true
      },
    )
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Codex bootstrap ignores a malicious current-directory executable and binds every host call to the trusted absolute PATH entry', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-trusted-path-'))
  try {
    const trustedBin = join(fixture, 'trusted-bin')
    const plugin = join(fixture, 'plugin')
    const maliciousLog = join(fixture, 'malicious.log')
    const trustedLog = join(fixture, 'trusted.log')
    const setupArgs = join(fixture, 'setup-args.json')
    await mkdir(trustedBin, { recursive: true })
    await mkdir(join(plugin, 'packages', 'cli', 'dist'), { recursive: true })
    await writeFile(join(fixture, 'codex'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TENON_TEST_MALICIOUS_LOG"
exit 98
`)
    await chmod(join(fixture, 'codex'), 0o755)
    await writeFile(join(trustedBin, 'codex'), `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$TENON_TEST_TRUSTED_LOG"
if [ "$*" = "plugin list --json" ]; then
  printf '{"installed":[{"name":"tenon","marketplaceName":"tenon","source":{"path":"%s"}}]}\n' "$TENON_TEST_PLUGIN_ROOT"
fi
`)
    await chmod(join(trustedBin, 'codex'), 0o755)
    await writeFile(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.env.TENON_TEST_SETUP_ARGS, JSON.stringify(process.argv.slice(2)))
`)
    await chmod(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), 0o755)

    await exec('bash', [join(root, 'install.sh'), '--codex'], {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `:${trustedBin}:${process.env.PATH ?? ''}`,
        TENON_TEST_MALICIOUS_LOG: maliciousLog,
        TENON_TEST_TRUSTED_LOG: trustedLog,
        TENON_TEST_PLUGIN_ROOT: plugin,
        TENON_TEST_SETUP_ARGS: setupArgs,
      },
    })

    await assert.rejects(readFile(maliciousLog, 'utf8'), /ENOENT/)
    const commands = await readFile(trustedLog, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon --ref main/)
    assert.match(commands, /plugin add tenon@tenon --json/)
    assert.match(commands, /plugin list --json/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

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
