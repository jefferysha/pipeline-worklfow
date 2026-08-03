import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = join(root, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js')
const result = spawnSync(
  process.execPath,
  [cli, 'validate', '--all', '--strict', '--no-interactive'],
  {
    cwd: root,
    env: {
      ...process.env,
      DO_NOT_TRACK: '1',
      OPENSPEC_TELEMETRY: '0',
    },
    stdio: 'inherit',
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
