import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const wrapper = await readFile(new URL('./check-openspec.mjs', import.meta.url), 'utf8')

test('canonical OpenSpec validation is pinned, strict, non-interactive, and telemetry-free', () => {
  assert.equal(packageJson.devDependencies['@fission-ai/openspec'], '1.6.0')
  assert.equal(
    packageJson.scripts['check:openspec'],
    'node --test tools/check-openspec.node-test.mjs && node tools/check-openspec.mjs',
  )
  assert.match(wrapper, /'validate', '--all', '--strict', '--no-interactive'/)
  assert.match(wrapper, /DO_NOT_TRACK: '1'/)
  assert.match(wrapper, /OPENSPEC_TELEMETRY: '0'/)
  assert.match(wrapper, /node_modules', '@fission-ai', 'openspec', 'bin', 'openspec\.js'/)
})
