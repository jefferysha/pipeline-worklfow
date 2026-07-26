import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const serverBundle = fileURLToPath(new URL('../dist/dashboard.mjs', import.meta.url))

describe('Dashboard server bundle process contract', () => {
  test('help writes real line feeds and exits without starting the server', () => {
    const result = spawnSync(process.execPath, [serverBundle, '--help'], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      'Tenon Dashboard server is an internal managed-runtime entrypoint.\n'
      + 'Use `tenon dashboard` to start or inspect the product.\n',
    )
    expect(result.stderr).toBe('')
  })

  test('unknown arguments fail with one newline-terminated stderr record', () => {
    const result = spawnSync(process.execPath, [serverBundle, '--unknown'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      '[dashboard-server] unsupported direct server arguments: --unknown\n',
    )
  })
})
