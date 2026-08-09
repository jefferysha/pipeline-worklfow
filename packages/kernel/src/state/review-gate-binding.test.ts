import { mkdir, readFile, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  emptyFields,
  readReviewGateBinding,
  reviewGateBindingForState,
  reviewGateBindingMatches,
  writeReviewGateBindingUnderLock,
  type PipelineState,
} from '../index.js'
import {
  MAX_REVIEW_GATE_BINDING_BYTES,
  REVIEW_GATE_BINDING_FILE,
} from './review-gate-binding.js'

function stateFixture(): PipelineState {
  const fields = emptyFields()
  fields.phase = 'explore'
  fields.workflow = 'default'
  fields.review_requested_at = '2026-08-10T00:00:00.000Z'
  return {
    fields,
    opaqueTail: '',
    runMetadata: { runId: 'run-review', transitionSequence: 0 },
  }
}

async function bindingFixture(prefix: string): Promise<{
  readonly root: string
  readonly changeDir: string
  readonly sidecar: string
  readonly raw: string
}> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const changeDir = join(root, 'change')
  await mkdir(changeDir)
  const state = stateFixture()
  const binding = reviewGateBindingForState(
    state,
    'explore',
    'explore-complete',
    state.fields.review_requested_at as string,
  )
  const sidecar = join(changeDir, REVIEW_GATE_BINDING_FILE)
  const raw = `${JSON.stringify(binding)}\n`
  await writeFile(sidecar, raw, 'utf8')
  return { root, changeDir, sidecar, raw }
}

describe('review gate binding bounded reader', () => {
  it('round-trips writer bytes through the canonical reader', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-review-gate-binding-'))
    const changeDir = join(root, 'change')
    const state = stateFixture()
    await mkdir(changeDir)
    const binding = reviewGateBindingForState(
      state,
      'explore',
      'explore-complete',
      state.fields.review_requested_at as string,
    )
    try {
      await writeReviewGateBindingUnderLock(changeDir, binding)
      await expect(readFile(join(changeDir, REVIEW_GATE_BINDING_FILE), 'utf8'))
        .resolves.toBe(`${JSON.stringify(binding)}\n`)
      await expect(readReviewGateBinding(changeDir)).resolves.toEqual(binding)
      expect(reviewGateBindingMatches(binding, state, 'explore', 'explore-complete')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns undefined for a missing sidecar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-review-gate-binding-missing-'))
    try {
      await expect(readReviewGateBinding(root)).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects symlink and oversize sidecars before parsing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-review-gate-binding-negative-'))
    const changeDir = join(root, 'change')
    const outside = join(root, 'outside.json')
    const sidecar = join(changeDir, REVIEW_GATE_BINDING_FILE)
    await mkdir(changeDir)
    try {
      await writeFile(outside, '{"version":1}\n', 'utf8')
      await symlink(outside, sidecar)
      await expect(readReviewGateBinding(changeDir)).rejects.toThrow()

      await rm(sidecar)
      await writeFile(sidecar, 'x'.repeat(MAX_REVIEW_GATE_BINDING_BYTES + 1), 'utf8')
      await expect(readReviewGateBinding(changeDir)).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects valid JSON that is not the canonical byte encoding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-review-gate-binding-canonical-'))
    const changeDir = join(root, 'change')
    await mkdir(changeDir)
    const state = stateFixture()
    const binding = reviewGateBindingForState(
      state,
      'explore',
      'explore-complete',
      state.fields.review_requested_at as string,
    )
    const reordered = JSON.stringify({
      event: binding.event,
      version: binding.version,
      phase: binding.phase,
      requestedAt: binding.requestedAt,
      decisionStateDigest: binding.decisionStateDigest,
      runId: binding.runId,
    }) + '\n'
    try {
      await writeFile(join(changeDir, REVIEW_GATE_BINDING_FILE), reordered, 'utf8')
      await expect(readReviewGateBinding(changeDir)).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate, unknown, missing, whitespace and trailing encodings', async () => {
    const fixture = await bindingFixture('tenon-review-gate-binding-ambiguous-')
    const variants = [
      fixture.raw.replace('{"version":1,', '{"version":1,"version":1,'),
      fixture.raw.replace('}\n', ',"unknown":"secret-sidecar-content"}\n'),
      fixture.raw.replace(/,"event":"[^"]+"/u, ''),
      ` ${fixture.raw}`,
      `${fixture.raw}\n`,
      `\uFEFF${fixture.raw}`,
    ]
    try {
      for (const raw of variants) {
        await writeFile(fixture.sidecar, raw, 'utf8')
        await expect(readReviewGateBinding(fixture.changeDir)).rejects.toThrow()
        await expect(readReviewGateBinding(fixture.changeDir)).rejects.not.toThrow('secret-sidecar-content')
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it('rejects malformed JSON, invalid UTF-8, directories and oversized files', async () => {
    const fixture = await bindingFixture('tenon-review-gate-binding-shape-')
    try {
      await writeFile(fixture.sidecar, '{', 'utf8')
      await expect(readReviewGateBinding(fixture.changeDir)).rejects.toThrow()

      await writeFile(fixture.sidecar, Buffer.from([0xc3, 0x28]))
      await expect(readReviewGateBinding(fixture.changeDir)).rejects.toThrow(/UTF-8/u)

      await rm(fixture.sidecar)
      await mkdir(fixture.sidecar)
      await expect(readReviewGateBinding(fixture.changeDir)).rejects.toThrow()

      await rm(fixture.sidecar, { recursive: true })
      await writeFile(fixture.sidecar, `${fixture.raw}${'x'.repeat(MAX_REVIEW_GATE_BINDING_BYTES)}`, 'utf8')
      await expect(readReviewGateBinding(fixture.changeDir)).rejects.toThrow()
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it('rejects same-inode mutation and growth during the bounded read window', async () => {
    const fixture = await bindingFixture('tenon-review-gate-binding-race-')
    try {
      const sameSize = fixture.raw.replace('explore', 'exporE')
      await expect(readReviewGateBinding(fixture.changeDir, async () => {
        await writeFile(fixture.sidecar, sameSize, 'utf8')
        return Buffer.from(fixture.raw)
      })).rejects.toThrow(/读取期间变化/u)

      await writeFile(fixture.sidecar, fixture.raw, 'utf8')
      await expect(readReviewGateBinding(fixture.changeDir, async () => {
        await writeFile(fixture.sidecar, `${fixture.raw}${'x'.repeat(32)}`, 'utf8')
        return Buffer.from(fixture.raw)
      })).rejects.toThrow(/读取期间变化|bytes 上限/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it('rejects path replacement, symlink replacement and disappearance during the read window', async () => {
    const fixture = await bindingFixture('tenon-review-gate-binding-replace-')
    const outside = join(fixture.root, 'outside.json')
    try {
      await expect(readReviewGateBinding(fixture.changeDir, async () => {
        await rm(fixture.sidecar)
        await writeFile(fixture.sidecar, fixture.raw, 'utf8')
        return Buffer.from(fixture.raw)
      })).rejects.toThrow(/读取期间变化/u)

      await writeFile(outside, fixture.raw, 'utf8')
      await writeFile(fixture.sidecar, fixture.raw, 'utf8')
      await expect(readReviewGateBinding(fixture.changeDir, async () => {
        await rm(fixture.sidecar)
        await symlink(outside, fixture.sidecar)
        return Buffer.from(fixture.raw)
      })).rejects.toThrow(/读取期间变化|symlink/u)

      await rm(fixture.sidecar)
      await writeFile(fixture.sidecar, fixture.raw, 'utf8')
      await expect(readReviewGateBinding(fixture.changeDir, async () => {
        await rm(fixture.sidecar)
        return Buffer.from(fixture.raw)
      })).rejects.toThrow(/读取期间变化/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
})
