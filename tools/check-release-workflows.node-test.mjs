import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function text(path) {
  return readFile(join(root, path), 'utf8')
}

test('release packaging is callable only from the pre-tag candidate workflow', async () => {
  const [candidate, release] = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release.yml'),
  ])

  assert.match(candidate, /^\s{2}workflow_dispatch:\s*$/m)
  assert.match(candidate, /uses: \.\/\.github\/workflows\/release\.yml/)
  assert.match(release, /^\s{2}workflow_call:\s*$/m)
  assert.doesNotMatch(release, /^\s{2}(push|workflow_dispatch):\s*$/m)
})

test('candidate proves exact main before and after all gates, then creates the tag', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const firstIdentity = candidate.indexOf('Prove exact current main candidate and unused tag')
  const fullTests = candidate.indexOf('Full runtime, Dashboard, hook, adapter, migration, and oracle verification')
  const secondIdentity = candidate.indexOf('Re-prove main identity immediately before tagging')
  const tagCreation = candidate.indexOf('Create tag only after every pre-tag gate passes')

  assert.ok(firstIdentity >= 0)
  assert.ok(fullTests > firstIdentity)
  assert.ok(secondIdentity > fullTests)
  assert.ok(tagCreation > secondIdentity)
  assert.match(candidate, /\[ "\$\(git rev-parse origin\/main\)" = "\$CANDIDATE_SHA" \]/)
  assert.match(candidate, /git tag -a "\$RELEASE_TAG" "\$CANDIDATE_SHA"/)
})

test('CI and both release stages share advisory and full dependency-tree gates', async () => {
  const [packageJson, ci, candidate, release] = await Promise.all([
    text('package.json'),
    text('.github/workflows/ci.yml'),
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release.yml'),
  ])
  const scripts = JSON.parse(packageJson).scripts

  assert.equal(scripts['check:dependency-tree'], 'npm ls --all')
  assert.equal(
    scripts['check:dependencies'],
    'npm audit --audit-level=high && npm run check:dependency-tree',
  )
  for (const workflow of [ci, candidate, release]) {
    assert.match(workflow, /npm run check:dependencies/)
    assert.match(workflow, /npm run check:release-workflows/)
  }
})
