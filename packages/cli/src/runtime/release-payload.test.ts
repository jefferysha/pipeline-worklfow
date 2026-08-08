import { describe, expect, test } from 'vitest'
import { defaultRuntimeCommandRunner } from './release-payload.js'
import { parseManifest, runtimeReleaseIdV2 } from './release-store-codecs.js'

describe('release payload subprocess boundary', () => {
  test('preserves a bounded spawn cause when the verifier executable is missing', async () => {
    const result = await defaultRuntimeCommandRunner().run(
      '/definitely-missing/tenon-verifier',
      [],
      process.cwd(),
    )

    expect(result.code).not.toBe(0)
    expect(result.stderr).toMatch(/ENOENT|no such file/iu)
  })

  test('kills a verifier that exceeds the bounded command timeout', async () => {
    const started = Date.now()
    const result = await defaultRuntimeCommandRunner(25).run(
      '/bin/sh',
      ['-c', 'while :; do :; done'],
      process.cwd(),
    )

    expect(result.code).toBe(124)
    expect(result.stderr).toMatch(/killed=true|SIGKILL|timed out/iu)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  test('rejects a v2 manifest whose stable target version contradicts its source version', () => {
    const payloadDigest = 'b'.repeat(64)
    const source = { host: 'codex' as const, pluginVersion: '1.0.2' }
    const stableTarget = { version: '1.0.3', tag: 'v1.0.3', commit: 'a'.repeat(40) }
    const releaseId = runtimeReleaseIdV2(payloadDigest, source, stableTarget)

    expect(parseManifest(JSON.stringify({
      version: 2,
      releaseId,
      payloadDigest,
      createdAt: '2026-08-08T00:00:00Z',
      source,
      stableTarget,
    }))).toBeNull()
  })
})
