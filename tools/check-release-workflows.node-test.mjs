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

test('candidate proves exact main before and after all gates, then delegates tag creation', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const firstIdentity = candidate.indexOf('Prove exact current main candidate and unused tag')
  const fullTests = candidate.indexOf('Full runtime, Dashboard, hook, adapter, migration, and oracle verification')
  const secondIdentity = candidate.indexOf('Re-prove main identity immediately before tagging')
  const ciProof = candidate.indexOf('Prove canonical CI passed for exact candidate SHA')
  const tagCreation = candidate.indexOf('\n  create-tag:')

  assert.ok(firstIdentity >= 0)
  assert.ok(fullTests > firstIdentity)
  assert.ok(secondIdentity > fullTests)
  assert.ok(ciProof > secondIdentity)
  assert.ok(tagCreation > ciProof)
  assert.match(candidate, /\[ "\$\(git rev-parse origin\/main\)" = "\$CANDIDATE_SHA" \]/)
  assert.match(candidate, /gh api --method POST "repos\/\$GITHUB_REPOSITORY\/git\/tags"/)
  assert.match(candidate, /gh api --method POST "repos\/\$GITHUB_REPOSITORY\/git\/refs"/)
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

test('untrusted candidate verification is read-only and tag creation is a minimal isolated writer', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const preTagStart = candidate.indexOf('\n  pre-tag:')
  const createTagStart = candidate.indexOf('\n  create-tag:')
  const releaseStart = candidate.indexOf('\n  release:')

  assert.ok(preTagStart >= 0)
  assert.ok(createTagStart > preTagStart)
  assert.ok(releaseStart > createTagStart)

  const preTag = candidate.slice(preTagStart, createTagStart)
  const createTag = candidate.slice(createTagStart, releaseStart)
  assert.match(preTag, /permissions:\s*\n\s+contents: read\s*\n\s+actions: read/)
  assert.match(preTag, /persist-credentials: false/)
  assert.doesNotMatch(preTag, /contents: write/)

  assert.match(createTag, /needs: pre-tag/)
  assert.match(createTag, /permissions:\s*\n\s+contents: write/)
  assert.doesNotMatch(createTag, /actions\/checkout|npm (?:ci|run|test)|node packages\//)
  assert.match(createTag, /repos\/\$GITHUB_REPOSITORY\/git\/tags/)
  assert.match(createTag, /repos\/\$GITHUB_REPOSITORY\/git\/refs/)
})

test('candidate fails closed unless canonical push CI succeeded for the exact approved SHA', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const ciProof = candidate.indexOf('Prove canonical CI passed for exact candidate SHA')
  const createTag = candidate.indexOf('\n  create-tag:')

  assert.ok(ciProof >= 0)
  assert.ok(createTag > ciProof)
  assert.match(candidate, /actions\/workflows\/ci\.yml\/runs\?head_sha=\$CANDIDATE_SHA/)
  assert.match(candidate, /event=push/)
  assert.match(candidate, /status=completed/)
  assert.match(candidate, /conclusion == "success"/)
  assert.match(candidate, /grep -Fqx -- "\$CANDIDATE_SHA"/)
})

test('reusable packaging is pinned to the approved SHA and never persists checkout credentials', async () => {
  const [candidate, release] = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release.yml'),
  ])

  assert.match(candidate, /expected_sha: \$\{\{ needs\.create-tag\.outputs\.sha \}\}/)
  const releaseCall = candidate.slice(candidate.indexOf('\n  release:'))
  assert.match(releaseCall, /permissions:\s*\n\s+contents: write/)
  assert.match(release, /expected_sha:\s*\n\s+description: Approved candidate commit SHA/)
  assert.match(release, /persist-credentials: false/)
  assert.match(release, /EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/)
  assert.match(release, /git rev-parse HEAD\)" = "\$EXPECTED_SHA"/)
  assert.match(release, /git rev-list -n 1 "\$RELEASE_TAG"\)" = "\$EXPECTED_SHA"/)
})
