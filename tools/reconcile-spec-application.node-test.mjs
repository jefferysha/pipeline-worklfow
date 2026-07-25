import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateReceipt } from './reconcile-spec-application.mjs'

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'historical-spec-application-migration',
    change: 'docs-change',
    capability: 'docs-experience',
    baseCommit: 'abc123',
    mainSpecPath: 'openspec/specs/docs-experience/spec.md',
    deltaSpecPath: 'openspec/changes/docs-change/specs/docs-experience/spec.md',
    rawBeforeDigest: 'raw',
    normalizedBeforeDigest: 'normalized',
    observedCurrentDigest: 'observed',
    expectedAfterDigest: 'expected',
    deltaDigest: 'delta',
    baseNormalization: {
      fromHeader: '## Requirements',
      purpose: 'Purpose',
    },
    ...overrides,
  }
}

test('migration receipt 必须绑定 CLI 指定 Change', () => {
  assert.throws(
    () => validateReceipt(receipt({ change: 'another-change' }), 'docs-change'),
    /receipt\.change 与 --change 不一致/,
  )
})

test('migration receipt 的主规格和 delta 路径由 Change/capability 唯一推导', () => {
  assert.throws(
    () => validateReceipt(receipt({
      deltaSpecPath: 'openspec/changes/another-change/specs/docs-experience/spec.md',
    }), 'docs-change'),
    /规格路径与 Change\/capability 不一致/,
  )
  assert.throws(
    () => validateReceipt(receipt({
      mainSpecPath: '/tmp/outside/spec.md',
    }), 'docs-change'),
    /规格路径与 Change\/capability 不一致/,
  )
})

test('一次性 reconcile 只输出结果，不以 pathname writer 覆盖治理 evidence', async () => {
  const source = await readFile(new URL('./reconcile-spec-application.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /writeApplicationResult|spec-application-result-\$\{process\.pid\}/)
  assert.doesNotMatch(source, /rename\(temporary,\s*resultPath\)/)
})
