import { cp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import process from 'node:process'

const root = resolve(new URL('..', import.meta.url).pathname)
const template = join(root, 'migration', 'legacy-channel')
const outputIndex = process.argv.indexOf('--out-dir')
const out = resolve(outputIndex >= 0 && process.argv[outputIndex + 1]
  ? process.argv[outputIndex + 1]
  : join(root, '.release', 'legacy-bridge'))

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await cp(template, out, { recursive: true, force: true })
await cp(join(root, 'install.sh'), join(out, 'tenon-install.sh'))
await Promise.all([
  chmod(join(out, 'bridge.sh'), 0o755),
  chmod(join(out, 'tenon-install.sh'), 0o755),
])

const installer = await readFile(join(out, 'tenon-install.sh'))
const manifestPath = join(out, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.tenonInstallerSha256 = createHash('sha256').update(installer).digest('hex')
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${out}\n`)
