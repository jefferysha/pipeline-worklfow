import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

test('legacy identity policy explicitly separates immutable protocol, history, migration and forbidden current surfaces', async () => {
  const policy = JSON.parse(await readFile(new URL('product/legacy-identity-policy.json', root), 'utf8'))
  assert.equal(policy.schemaVersion, 1)
  assert.deepEqual(Object.keys(policy.classes), [
    'immutable-protocol',
    'historical-evidence',
    'migration-only',
    'compatibility-fixture',
    'forbidden-current-product',
  ])
  assert.equal(policy.classes['migration-only'].activeUntil, '2026-10-31')
  assert.match(policy.classes['forbidden-current-product'].description, /Tenon/)
})
