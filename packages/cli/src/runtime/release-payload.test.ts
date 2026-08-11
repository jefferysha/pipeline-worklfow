import { describe, expect, test } from 'vitest'
import { TENON_RELEASE_VERSION } from '../commands/plugin-host.js'
import { defaultRuntimeCommandRunner, inspectCandidatePayload } from './release-payload.js'
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
    const stableTarget = { version: TENON_RELEASE_VERSION, tag: `v${TENON_RELEASE_VERSION}`, commit: 'a'.repeat(40) }
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

  test('uses and revalidates a frozen Node path before every candidate Node spawn', async () => {
    const frozenNode = '/trusted/frozen/node'
    const frozenBash = '/trusted/frozen/bash'
    let nodeProofs = 0
    const nodeSpawns: Array<{ readonly file: string; readonly proof: number }> = []
    let verifierArgs: readonly string[] | undefined
    const events: string[] = []

    await inspectCandidatePayload(process.cwd(), {
      nodePath: frozenNode,
      bashPath: frozenBash,
      verifyBash: () => { events.push('bash-proof') },
      verifyNode: () => { nodeProofs += 1; events.push('node-proof') },
      runner: {
        run: async (file, args) => {
          if (file === frozenBash && args.some((arg) => arg.endsWith('verify-skills.sh'))) {
            events.push('verifier-spawn')
            verifierArgs = args
          }
          if (file === frozenNode || file === process.execPath) {
            events.push('node-spawn')
            nodeSpawns.push({ file, proof: nodeProofs })
          }
          return { code: 0, stdout: '', stderr: '' }
        },
      },
    })

    expect(nodeSpawns).toHaveLength(4)
    expect(nodeSpawns.every(({ file }) => file === frozenNode)).toBe(true)
    expect(nodeSpawns.map(({ proof }) => proof)).toEqual([2, 3, 4, 5])
    expect(events.slice(0, 3)).toEqual(['bash-proof', 'node-proof', 'verifier-spawn'])
    expect(verifierArgs).toEqual(expect.arrayContaining(['--node', frozenNode]))
  }, 30_000)
})
