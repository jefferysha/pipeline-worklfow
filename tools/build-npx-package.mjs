#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'packages', 'npm-bootstrap')

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function packageName(value) {
  if (typeof value !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    throw new Error('--package-name must be an owned npm package name')
  }
  return value
}

const name = packageName(valueAfter('--package-name'))
const output = resolve(valueAfter('--output') ?? join(root, '.release', 'npm'))
const plugin = JSON.parse(await readFile(join(root, '.codex-plugin', 'plugin.json'), 'utf8'))
const identity = JSON.parse(await readFile(join(root, 'product', 'identity.json'), 'utf8'))
const version = String(plugin.version)
const releaseRef = valueAfter('--ref') ?? `v${version}`
if (!/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(releaseRef)) {
  throw new Error('--ref must be a complete stable release tag vX.Y.Z')
}
const installerDigest = createHash('sha256')
  .update(await readFile(join(root, 'install.sh')))
  .digest('hex')

await rm(output, { recursive: true, force: true })
await mkdir(join(output, 'bin'), { recursive: true })
await mkdir(join(output, 'product'), { recursive: true })

const bootstrap = (await readFile(join(source, 'bin', 'tenon-bootstrap.mjs'), 'utf8'))
  .replace('__TENON_REPOSITORY__', identity.repository)
  .replace('__TENON_RELEASE_REF__', releaseRef)
  .replace('__TENON_INSTALLER_SHA256__', installerDigest)
await writeFile(join(output, 'bin', 'tenon-bootstrap.mjs'), bootstrap, { encoding: 'utf8', mode: 0o755 })
await cp(join(root, 'product', 'identity.json'), join(output, 'product', 'identity.json'))
await cp(join(root, 'LICENSE'), join(output, 'LICENSE'))
await cp(join(source, 'README.md'), join(output, 'README.md'))
await writeFile(join(output, 'package.json'), `${JSON.stringify({
  name,
  version,
  description: 'Thin npx bootstrap for the complete Tenon Marketplace plugin.',
  type: 'module',
  bin: { tenon: 'bin/tenon-bootstrap.mjs' },
  files: ['bin/tenon-bootstrap.mjs', 'product/identity.json', 'README.md', 'LICENSE'],
  engines: { node: '>=22' },
  license: 'MIT',
  repository: { type: 'git', url: `git+${identity.repositoryUrl}.git` },
}, null, 2)}\n`)
process.stdout.write(`${output}\n`)
