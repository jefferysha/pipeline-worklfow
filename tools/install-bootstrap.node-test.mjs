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

async function prepareReleasedBootstrapFixture(
  fixture,
  host,
  {
    initiallyInstalled = false,
    initialMarketplaceKind = 'exact',
    reportedVersion = '1.0.2',
    reportedEnabled = true,
    remoteTagProofFails = false,
  } = {},
) {
  const bin = join(fixture, 'bin')
  const plugin = join(fixture, 'plugin')
  const log = join(fixture, 'host.log')
  const setupArgs = join(fixture, 'setup-args.json')
  const pluginState = join(fixture, 'plugin-present')
  const marketplaceState = join(fixture, 'marketplace-present')
  const legacyMarketplaceState = join(fixture, 'marketplace-legacy')
  await mkdir(bin, { recursive: true })
  for (const directory of [
    '.claude-plugin',
    '.codex-plugin',
    'adapters',
    'hooks',
    'packages/cli/dist',
    'packages/dashboard-app/dist',
    'packages/server/dist',
    'runtime',
    'skills',
    'templates',
    'tools',
  ]) await mkdir(join(plugin, directory), { recursive: true })
  const manifest = `${JSON.stringify({ name: 'tenon', version: '1.0.2' })}\n`
  await writeFile(join(plugin, '.claude-plugin', 'plugin.json'), manifest)
  await writeFile(join(plugin, '.codex-plugin', 'plugin.json'), manifest)
  await writeFile(join(plugin, 'packages', 'server', 'dist', 'dashboard.mjs'), 'export {}\n')
  await writeFile(join(plugin, 'packages', 'dashboard-app', 'dist', 'index.html'), '<!doctype html>\n')
  await writeFile(join(plugin, 'runtime', 'tenon-bootstrap.mjs'), 'export {}\n')
  await writeFile(join(plugin, 'packages', 'cli', 'dist', 'tenon.mjs'), `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.env.TENON_TEST_SETUP_ARGS, JSON.stringify(process.argv.slice(2)))
`)
  await writeFile(join(plugin, 'tools', 'verify-skills.sh'), '#!/usr/bin/env bash\nexit 0\n')
  await chmod(join(plugin, 'tools', 'verify-skills.sh'), 0o755)

  await exec('/usr/bin/git', ['-C', plugin, 'init', '--quiet'])
  await exec('/usr/bin/git', ['-C', plugin, 'config', 'user.email', 'tenon-test@example.com'])
  await exec('/usr/bin/git', ['-C', plugin, 'config', 'user.name', 'Tenon Test'])
  await exec('/usr/bin/git', ['-C', plugin, 'add', '.'])
  await exec('/usr/bin/git', ['-C', plugin, 'commit', '--quiet', '-m', 'release'])
  await exec('/usr/bin/git', ['-C', plugin, 'tag', 'v1.0.2'])
  await exec('/usr/bin/git', ['-C', plugin, 'remote', 'add', 'origin', 'https://github.com/jefferysha/tenon.git'])
  await exec('/usr/bin/git', ['-C', plugin, 'checkout', '--quiet', '--detach', 'v1.0.2'])
  const { stdout: commitOut } = await exec('/usr/bin/git', ['-C', plugin, 'rev-parse', 'HEAD'])
  const commit = commitOut.trim()
  if (host === 'codex') {
    await writeFile(
      join(plugin, '.codex-marketplace-install.json'),
      `${JSON.stringify({ ref_name: 'v1.0.2' })}\n`,
    )
  }
  if (initialMarketplaceKind === 'main' || initialMarketplaceKind === 'local') {
    await exec('/usr/bin/git', ['-C', plugin, 'checkout', '--quiet', '-B', 'main'])
    if (host === 'codex') {
      await writeFile(
        join(plugin, '.codex-marketplace-install.json'),
        `${JSON.stringify({ ref_name: 'main' })}\n`,
      )
    }
  }

  await writeFile(join(bin, 'git'), `#!/usr/bin/env bash
set -eu
if [ "${'$'}{1:-}" = "ls-remote" ]; then
  ${remoteTagProofFails
    ? 'echo "injected stable tag proof failure" >&2; exit 73'
    : `printf '%s\\trefs/tags/v1.0.2\\n' "${commit}"`}
  exit 0
fi
exec /usr/bin/git "${'$'}@"
`)
  await chmod(join(bin, 'git'), 0o755)

  const hostScript = host === 'codex'
    ? `#!/usr/bin/env bash
set -eu
printf '%s\\n' "${'$'}*" >> "${'$'}TENON_TEST_HOST_LOG"
case "${'$'}*" in
  "plugin list --json")
    if [ -f "${'$'}TENON_TEST_PLUGIN_STATE" ]; then
      printf '{"installed":[{"pluginId":"tenon@tenon","name":"tenon","marketplaceName":"tenon","version":"${reportedVersion}","enabled":${reportedEnabled},"source":{"path":"%s"}}]}\\n' "${'$'}TENON_TEST_PLUGIN_ROOT"
    else
      printf '{"installed":[]}\\n'
    fi ;;
  "plugin marketplace list --json")
    if [ -f "${'$'}TENON_TEST_MARKETPLACE_STATE" ]; then
      if [ -f "${'$'}TENON_TEST_LEGACY_MARKETPLACE_STATE" ]; then
        printf '{"marketplaces":[{"name":"tenon","root":"%s","marketplaceSource":{"sourceType":"local","source":"/legacy/local/tenon"}}]}\\n' "${'$'}TENON_TEST_PLUGIN_ROOT"
      else
        printf '{"marketplaces":[{"name":"tenon","root":"%s","marketplaceSource":{"sourceType":"git","source":"jefferysha/tenon"}}]}\\n' "${'$'}TENON_TEST_PLUGIN_ROOT"
      fi
    else
      printf '{"marketplaces":[]}\\n'
    fi ;;
  "plugin remove tenon@tenon --json") rm -f "${'$'}TENON_TEST_PLUGIN_STATE" ;;
  "plugin marketplace remove tenon --json") rm -f "${'$'}TENON_TEST_MARKETPLACE_STATE" "${'$'}TENON_TEST_LEGACY_MARKETPLACE_STATE" ;;
  "plugin marketplace add jefferysha/tenon --ref v1.0.2 --json")
    /usr/bin/git -C "${'$'}TENON_TEST_PLUGIN_ROOT" checkout --quiet --detach v1.0.2
    printf '{"ref_name":"v1.0.2"}\\n' > "${'$'}TENON_TEST_PLUGIN_ROOT/.codex-marketplace-install.json"
    : > "${'$'}TENON_TEST_MARKETPLACE_STATE" ;;
  "plugin add tenon@tenon --json") : > "${'$'}TENON_TEST_PLUGIN_STATE" ;;
  *) echo "unexpected codex command: ${'$'}*" >&2; exit 90 ;;
esac
`
    : `#!/usr/bin/env bash
set -eu
printf '%s\\n' "${'$'}*" >> "${'$'}TENON_TEST_HOST_LOG"
case "${'$'}*" in
  "plugin list --json")
    if [ -f "${'$'}TENON_TEST_PLUGIN_STATE" ]; then
      printf '[{"id":"tenon@tenon","version":"${reportedVersion}","enabled":${reportedEnabled},"scope":"user","installPath":"%s"}]\\n' "${'$'}TENON_TEST_PLUGIN_ROOT"
    else
      printf '[]\\n'
    fi ;;
  "plugin marketplace list --json")
    if [ -f "${'$'}TENON_TEST_MARKETPLACE_STATE" ]; then
      printf '[{"name":"tenon","installLocation":"%s","repo":"jefferysha/tenon","source":"github"}]\\n' "${'$'}TENON_TEST_PLUGIN_ROOT"
    else
      printf '[]\\n'
    fi ;;
  "plugin uninstall tenon@tenon --scope user") rm -f "${'$'}TENON_TEST_PLUGIN_STATE" ;;
  "plugin marketplace remove tenon") rm -f "${'$'}TENON_TEST_MARKETPLACE_STATE" "${'$'}TENON_TEST_LEGACY_MARKETPLACE_STATE" ;;
  "plugin marketplace add jefferysha/tenon@v1.0.2")
    /usr/bin/git -C "${'$'}TENON_TEST_PLUGIN_ROOT" checkout --quiet --detach v1.0.2
    : > "${'$'}TENON_TEST_MARKETPLACE_STATE" ;;
  "plugin install tenon@tenon") : > "${'$'}TENON_TEST_PLUGIN_STATE" ;;
  *) echo "unexpected claude command: ${'$'}*" >&2; exit 90 ;;
esac
`
  await writeFile(join(bin, host), hostScript)
  await chmod(join(bin, host), 0o755)
  if (initiallyInstalled) {
    await writeFile(pluginState, '')
    await writeFile(marketplaceState, '')
  }
  if (initialMarketplaceKind === 'local') await writeFile(legacyMarketplaceState, '')
  return {
    bin,
    plugin,
    log,
    setupArgs,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      TENON_TEST_HOST_LOG: log,
      TENON_TEST_PLUGIN_ROOT: plugin,
      TENON_TEST_PLUGIN_STATE: pluginState,
      TENON_TEST_MARKETPLACE_STATE: marketplaceState,
      TENON_TEST_LEGACY_MARKETPLACE_STATE: legacyMarketplaceState,
      TENON_TEST_SETUP_ARGS: setupArgs,
    },
  }
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

    assert.match(result.stdout, /codex plugin marketplace add jefferysha\/tenon --ref v1\.0\.2/)
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

test('Codex bootstrap accepts only an explicit complete stable SemVer Marketplace tag', async () => {
  const result = await exec(
    'bash',
    [
      join(root, 'install.sh'),
      '--codex',
      '--ref',
      'v1.0.2',
      '--dry-run',
    ],
  )
  assert.match(
    result.stdout,
    /codex plugin marketplace add jefferysha\/tenon --ref v1\.0\.2/,
  )
})

test('a versioned installer rejects a different stable release tag', async () => {
  await assert.rejects(
    exec('bash', [join(root, 'install.sh'), '--codex', '--ref', 'v1.2.3', '--dry-run']),
    (error) => {
      assert.match(error.stderr, /can only install v1\.0\.2/)
      return true
    },
  )
})

for (const forbiddenRef of ['main', '0123456789abcdef0123456789abcdef01234567', 'v1.2.3-rc.1']) {
  test(`Codex bootstrap rejects non-stable release ref ${forbiddenRef}`, async () => {
    await assert.rejects(
      exec('bash', [join(root, 'install.sh'), '--codex', '--ref', forbiddenRef, '--dry-run']),
      (error) => {
        assert.match(error.stderr, /complete stable tag vX\.Y\.Z/)
        return true
      },
    )
  })
}

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
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex')
    const maliciousLog = join(fixture, 'malicious.log')
    await writeFile(join(fixture, 'codex'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TENON_TEST_MALICIOUS_LOG"
exit 98
`)
    await chmod(join(fixture, 'codex'), 0o755)

    await exec('bash', [join(root, 'install.sh'), '--codex'], {
      cwd: fixture,
      env: {
        ...prepared.env,
        PATH: `:${prepared.bin}:${process.env.PATH ?? ''}`,
        TENON_TEST_MALICIOUS_LOG: maliciousLog,
      },
    })

    await assert.rejects(readFile(maliciousLog, 'utf8'), /ENOENT/)
    const commands = await readFile(prepared.log, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon --ref v1\.0\.2/)
    assert.match(commands, /plugin add tenon@tenon --json/)
    assert.match(commands, /plugin list --json/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('the documented one-line installer starts curl and the bootstrap from absolute system paths', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-documented-bash-'))
  try {
    const maliciousLog = join(fixture, 'malicious-runtime.log')
    const installer = join(fixture, 'installer.sh')
    await writeFile(join(fixture, 'bash'), `#!/bin/sh
printf 'malicious bash invoked\n' >> "$TENON_TEST_MALICIOUS_RUNTIME_LOG"
exit 97
`)
    await chmod(join(fixture, 'bash'), 0o755)
    await writeFile(join(fixture, 'curl'), `#!/bin/sh
printf 'malicious curl invoked\n' >> "$TENON_TEST_MALICIOUS_RUNTIME_LOG"
exit 96
`)
    await chmod(join(fixture, 'curl'), 0o755)
    await writeFile(installer, '#!/bin/bash\nexit 0\n')
    for (const document of ['README.md', 'README.en.md']) {
      const readme = await readFile(join(root, document), 'utf8')
      const documented = readme.split(/\r?\n/u).find((line) =>
        line.includes('/v1.0.2/install.sh') && line.includes('--codex'))
      assert.equal(typeof documented, 'string', document)
      assert.match(documented, /^\/usr\/bin\/curl .*\| \/bin\/bash -s -- --codex$/u, document)
      const command = documented.replace(
        'https://raw.githubusercontent.com/jefferysha/tenon/v1.0.2/install.sh',
        `file://${installer}`,
      )

      await exec('/bin/sh', ['-c', command], {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: '.:/usr/bin:/bin',
          TENON_TEST_MALICIOUS_RUNTIME_LOG: maliciousLog,
        },
      })
    }
    await assert.rejects(readFile(maliciousLog, 'utf8'), /ENOENT/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('bootstrap freezes absolute bash and node paths before plugin mutation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-trusted-runtimes-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex')
    const maliciousLog = join(fixture, 'malicious-runtime.log')
    await writeFile(join(fixture, 'bash'), `#!/bin/sh
printf 'bash:%s\\n' "$*" >> "$TENON_TEST_MALICIOUS_RUNTIME_LOG"
exec /bin/bash "$@"
`)
    await writeFile(join(fixture, 'node'), `#!/bin/sh
printf 'node:%s\\n' "$*" >> "$TENON_TEST_MALICIOUS_RUNTIME_LOG"
exec '${process.execPath}' "$@"
`)
    await chmod(join(fixture, 'bash'), 0o755)
    await chmod(join(fixture, 'node'), 0o755)

    await exec('/bin/bash', [join(root, 'install.sh'), '--codex'], {
      cwd: fixture,
      env: {
        ...prepared.env,
        PATH: `:relative-bin:${prepared.bin}:${process.env.PATH ?? ''}`,
        TENON_TEST_MALICIOUS_RUNTIME_LOG: maliciousLog,
      },
    })

    await assert.rejects(readFile(maliciousLog, 'utf8'), /ENOENT/)
    assert.deepEqual(JSON.parse(await readFile(prepared.setupArgs, 'utf8')), [
      'setup', '--codex', '--yes',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Codex one-line bootstrap registers Marketplace and invokes the packaged Tenon setup', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex')

    const result = await exec('bash', [join(root, 'install.sh'), '--codex', '--auto-update'], {
      cwd: fixture,
      env: prepared.env,
    })
    assert.match(result.stdout, /Tenon installed for --codex/)
    const commands = await readFile(prepared.log, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon --ref v1\.0\.2/)
    assert.match(commands, /plugin add tenon@tenon --json/)
    assert.deepEqual(JSON.parse(await readFile(prepared.setupArgs, 'utf8')), [
      'setup', '--codex', '--yes', '--auto-update',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

for (const initialMarketplaceKind of ['exact', 'main', 'local']) {
  test(`Codex bootstrap transactionally replaces an existing ${initialMarketplaceKind} marketplace with v1.0.2`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), `tenon-install-bootstrap-rebind-${initialMarketplaceKind}-`))
    try {
      const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex', {
        initiallyInstalled: true,
        initialMarketplaceKind,
      })
      await exec('bash', [join(root, 'install.sh'), '--codex'], {
        cwd: fixture,
        env: prepared.env,
      })
      const commands = (await readFile(prepared.log, 'utf8')).trim().split(/\r?\n/u)
      const pluginRemove = commands.indexOf('plugin remove tenon@tenon --json')
      const marketplaceRemove = commands.indexOf('plugin marketplace remove tenon --json')
      const marketplaceAdd = commands.indexOf('plugin marketplace add jefferysha/tenon --ref v1.0.2 --json')
      const pluginAdd = commands.indexOf('plugin add tenon@tenon --json')
      assert.ok(pluginRemove >= 0)
      assert.ok(marketplaceRemove > pluginRemove)
      assert.ok(marketplaceAdd > marketplaceRemove)
      assert.ok(pluginAdd > marketplaceAdd)
      assert.deepEqual(JSON.parse(await readFile(prepared.setupArgs, 'utf8')), [
        'setup', '--codex', '--yes',
      ])
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })
}

test('Codex bootstrap repairs an exact but disabled Tenon registration through official remove and add', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-disabled-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex', {
      initiallyInstalled: true,
      reportedEnabled: false,
    })
    await exec('/bin/bash', [join(root, 'install.sh'), '--codex'], {
      cwd: fixture,
      env: prepared.env,
    })
    const commands = (await readFile(prepared.log, 'utf8')).trim().split(/\r?\n/u)
    const pluginRemove = commands.indexOf('plugin remove tenon@tenon --json')
    const pluginAdd = commands.indexOf('plugin add tenon@tenon --json')
    assert.ok(pluginRemove >= 0)
    assert.ok(pluginAdd > pluginRemove)
    assert.deepEqual(JSON.parse(await readFile(prepared.setupArgs, 'utf8')), [
      'setup', '--codex', '--yes',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Codex bootstrap proves the immutable remote tag before changing an existing installation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-tag-proof-first-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex', {
      initiallyInstalled: true,
      remoteTagProofFails: true,
    })
    await assert.rejects(
      exec('/bin/bash', [join(root, 'install.sh'), '--codex'], {
        cwd: fixture,
        env: prepared.env,
      }),
      (error) => {
        assert.match(error.stderr, /stable tag proof/i)
        return true
      },
    )
    const commands = await readFile(prepared.log, 'utf8').catch(() => '')
    assert.doesNotMatch(commands, /plugin remove|marketplace remove|marketplace add|plugin add/u)
    await readFile(prepared.env.TENON_TEST_PLUGIN_STATE)
    await readFile(prepared.env.TENON_TEST_MARKETPLACE_STATE)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Codex bootstrap fails closed when the host reports a different installed version', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-wrong-version-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'codex', {
      reportedVersion: '1.0.1',
    })
    await assert.rejects(
      exec('bash', [join(root, 'install.sh'), '--codex'], {
        cwd: fixture,
        env: prepared.env,
      }),
      (error) => {
        assert.match(error.stderr, /installed plugin version 1\.0\.1 does not equal release 1\.0\.2/)
        return true
      },
    )
    await assert.rejects(readFile(prepared.setupArgs, 'utf8'), /ENOENT/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Claude one-line bootstrap uses the same stable Marketplace channel before packaged setup', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenon-install-bootstrap-claude-'))
  try {
    const prepared = await prepareReleasedBootstrapFixture(fixture, 'claude')

    const result = await exec('bash', [join(root, 'install.sh'), '--claude'], {
      cwd: fixture,
      env: prepared.env,
    })
    assert.match(result.stdout, /Tenon installed for --claude/)
    const commands = await readFile(prepared.log, 'utf8')
    assert.match(commands, /plugin marketplace add jefferysha\/tenon@v1\.0\.2/)
    assert.match(commands, /plugin install tenon@tenon/)
    assert.deepEqual(JSON.parse(await readFile(prepared.setupArgs, 'utf8')), [
      'setup', '--claude', '--yes',
    ])
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
