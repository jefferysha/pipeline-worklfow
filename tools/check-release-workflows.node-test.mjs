import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function text(path) {
  return readFile(join(root, path), 'utf8')
}

test('release publishing is callable only from the default-branch writer workflow', async () => {
  const [candidate, writer, release] = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release-writer.yml'),
    text('.github/workflows/release.yml'),
  ])

  assert.match(candidate, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(candidate, /uses: \.\/\.github\/workflows\/release\.yml/)
  assert.match(writer, /^\s{2}workflow_run:\s*$/m)
  assert.match(writer, /uses: \.\/\.github\/workflows\/release\.yml/)
  assert.match(release, /^\s{2}workflow_call:\s*$/m)
  assert.doesNotMatch(release, /^\s{2}(push|workflow_dispatch):\s*$/m)
})

test('manual dispatch stays read-only and only a default-branch workflow_run can reach release writers', async () => {
  const [candidate, writer] = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release-writer.yml'),
  ])

  assert.match(candidate, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(candidate, /contents: write/)
  assert.doesNotMatch(candidate, /repos\/\$GITHUB_REPOSITORY\/git\/(?:tags|refs)/)
  assert.doesNotMatch(candidate, /uses: \.\/\.github\/workflows\/release\.yml/)

  assert.match(writer, /^\s{2}workflow_run:\s*$/m)
  assert.match(writer, /workflows: \[Release candidate \(pre-tag\)\]/)
  assert.match(writer, /types: \[completed\]/)
  assert.match(writer, /github\.ref == 'refs\/heads\/main'/)
  assert.match(writer, /github\.event\.repository\.default_branch == 'main'/)
  assert.match(writer, /github\.event\.workflow_run\.head_branch == 'main'/)
  assert.match(writer, /github\.event\.workflow_run\.event == 'workflow_dispatch'/)
  assert.match(writer, /github\.event\.workflow_run\.conclusion == 'success'/)
  assert.match(
    writer,
    /\.github\/workflows\/release-candidate\.yml@refs\/heads\/main/,
  )
  assert.match(
    writer,
    /WRITER_WORKFLOW_REF.*\n[\s\S]*release-writer\.yml@refs\/heads\/main/,
  )
  assert.match(writer, /\[ "\$WRITER_WORKFLOW_SHA" = "\$WRITER_SHA" \]/)
  assert.match(writer, /\[ "\$UPSTREAM_REPOSITORY_ID" = "\$CURRENT_REPOSITORY_ID" \]/)
  assert.match(writer, /\[ "\$UPSTREAM_HEAD_REPOSITORY_ID" = "\$CURRENT_REPOSITORY_ID" \]/)
  assert.match(writer, /repos\/\$GITHUB_REPOSITORY\/actions\/workflows\/release-candidate\.yml/)
  assert.match(writer, /\[ "\$UPSTREAM_WORKFLOW_ID" = "\$canonical_workflow_id" \]/)
  assert.match(writer, /gh run download "\$UPSTREAM_RUN_ID"/)
  assert.match(writer, /\[ "\$SOURCE_RUN_ID" = "\$UPSTREAM_RUN_ID" \]/)
  assert.match(writer, /\[ "\$SOURCE_WORKFLOW_SHA" = "\$UPSTREAM_HEAD_SHA" \]/)
  assert.match(writer, /contents: write/)
  assert.match(writer, /repos\/\$GITHUB_REPOSITORY\/git\/tags/)
  assert.match(writer, /repos\/\$GITHUB_REPOSITORY\/git\/refs/)
  assert.match(writer, /uses: \.\/\.github\/workflows\/release\.yml/)
})

test('every release stage accepts only a complete stable v-prefixed SemVer tag', async () => {
  const workflows = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release-writer.yml'),
    text('.github/workflows/release.yml'),
  ])
  const strictStableSemver =
    '[[ "$RELEASE_TAG" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$ ]]'

  for (const workflow of workflows) {
    assert.ok(workflow.includes(strictStableSemver))
    assert.doesNotMatch(workflow, /v\[0-9\]\*\.\[0-9\]\*\.\[0-9\]\*/)
  }
})

test('candidate proves exact main before and after all gates, then publishes bounded approval evidence', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const firstIdentity = candidate.indexOf('Prove exact current main candidate and compatible tag')
  const fullTests = candidate.indexOf('Full runtime, Dashboard, hook, adapter, migration, and oracle verification')
  const secondIdentity = candidate.indexOf('Re-prove main identity immediately before approval')
  const ciProof = candidate.indexOf('Prove canonical CI passed for exact candidate SHA')
  const approval = candidate.indexOf('Write approval evidence for the default-branch writer')

  assert.ok(firstIdentity >= 0)
  assert.ok(fullTests > firstIdentity)
  assert.ok(secondIdentity > fullTests)
  assert.ok(ciProof > secondIdentity)
  assert.ok(approval > ciProof)
  assert.match(candidate, /\[ "\$\(git rev-parse origin\/main\)" = "\$CANDIDATE_SHA" \]/)
  assert.match(candidate, /name: release-candidate-approval/)
  assert.match(candidate, /source_workflow_sha: \$source_workflow_sha/)
  assert.doesNotMatch(candidate, /gh api --method POST/)
})

test('CI and the read-only candidate share advisory and full dependency-tree gates', async () => {
  const [packageJson, ci, candidate] = await Promise.all([
    text('package.json'),
    text('.github/workflows/ci.yml'),
    text('.github/workflows/release-candidate.yml'),
  ])
  const scripts = JSON.parse(packageJson).scripts

  assert.equal(scripts['check:dependency-tree'], 'npm ls --all')
  assert.equal(
    scripts['check:dependencies'],
    'npm audit --audit-level=high && npm run check:dependency-tree',
  )
  for (const workflow of [ci, candidate]) {
    assert.match(workflow, /npm run check:dependencies/)
    assert.match(workflow, /npm run check:release-workflows/)
  }
})

test('untrusted candidate verification is read-only and tag creation is a minimal isolated writer', async () => {
  const [candidate, writer] = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release-writer.yml'),
  ])
  const preTagStart = candidate.indexOf('\n  pre-tag:')
  const createTagStart = writer.indexOf('\n  create-tag:')
  const releaseStart = writer.indexOf('\n  release:')

  assert.ok(preTagStart >= 0)
  assert.ok(createTagStart >= 0)
  assert.ok(releaseStart > createTagStart)

  const preTag = candidate.slice(preTagStart)
  const createTag = writer.slice(createTagStart, releaseStart)
  assert.match(preTag, /permissions:\s*\n\s+contents: read\s*\n\s+actions: read/)
  assert.match(preTag, /persist-credentials: false/)
  assert.doesNotMatch(preTag, /contents: write/)

  assert.match(createTag, /permissions:\s*\n\s+contents: write/)
  assert.doesNotMatch(createTag, /actions\/checkout|npm (?:ci|run|test)|node packages\//)
  assert.match(createTag, /actions\/workflows\/release-candidate\.yml/)
  assert.match(createTag, /repos\/\$GITHUB_REPOSITORY\/git\/tags/)
  assert.match(createTag, /repos\/\$GITHUB_REPOSITORY\/git\/refs/)
})

test('candidate fails closed unless canonical push CI succeeded for the exact approved SHA', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const ciProof = candidate.indexOf('Prove canonical CI passed for exact candidate SHA')
  const approval = candidate.indexOf('Write approval evidence for the default-branch writer')

  assert.ok(ciProof >= 0)
  assert.ok(approval > ciProof)
  assert.match(candidate, /actions\/workflows\/ci\.yml\/runs\?head_sha=\$CANDIDATE_SHA/)
  assert.match(candidate, /event=push/)
  assert.match(candidate, /status=completed/)
  assert.match(candidate, /conclusion == "success"/)
  assert.match(candidate, /grep -Fqx -- "\$CANDIDATE_SHA"/)
})

test('candidate packages a digest-bound payload before publishing approval evidence', async () => {
  const candidate = await text('.github/workflows/release-candidate.yml')
  const packagePayload = candidate.indexOf('Package the verified release payload')
  const uploadPayload = candidate.indexOf('Upload the digest-bound release payload')
  const approval = candidate.indexOf('Write approval evidence for the default-branch writer')

  assert.ok(packagePayload >= 0)
  assert.ok(uploadPayload > packagePayload)
  assert.ok(approval > uploadPayload)
  assert.match(candidate, /npm run build:legacy-bridge/)
  assert.match(candidate, /npm pack \.release\/npx-package/)
  assert.match(candidate, /SHA256SUMS/)
  assert.match(candidate, /id: payload/)
  assert.match(candidate, /payload_artifact_id: \$payload_artifact_id/)
  assert.match(candidate, /payload_artifact_digest: \$payload_artifact_digest/)
  assert.match(candidate, /payload_manifest_sha256: \$payload_manifest_sha256/)
  assert.match(candidate, /steps\.payload\.outputs\.artifact-id/)
  assert.match(candidate, /steps\.payload\.outputs\.artifact-digest/)
  assert.doesNotMatch(candidate, /\$\{\{\s*secrets\./)
  assert.doesNotMatch(candidate, /npm publish/)
})

test('privileged workflows never checkout or execute candidate code and inherit no secrets', async () => {
  const [writer, release] = await Promise.all([
    text('.github/workflows/release-writer.yml'),
    text('.github/workflows/release.yml'),
  ])

  assert.match(writer, /expected_sha: \$\{\{ needs\.create-tag\.outputs\.sha \}\}/)
  const releaseCall = writer.slice(writer.indexOf('\n  release:'))
  assert.match(releaseCall, /permissions:\s*\n\s+contents: write\s*\n\s+actions: read/)
  assert.doesNotMatch(writer, /secrets: inherit/)
  assert.doesNotMatch(writer, /\$\{\{\s*secrets\./)
  assert.doesNotMatch(release, /\$\{\{\s*secrets\./)
  assert.doesNotMatch(release, /actions\/checkout|actions\/setup-node/)
  assert.doesNotMatch(release, /npm (?:ci|run|test|publish|pack)|node (?:tools|packages)\//)
  assert.doesNotMatch(writer, /actions\/checkout|actions\/setup-node/)
  assert.doesNotMatch(writer, /npm (?:ci|run|test|publish|pack)|node (?:tools|packages)\//)
  assert.match(release, /expected_sha:\s*\n\s+description: Approved candidate commit SHA/)
  assert.match(release, /EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/)
  assert.match(release, /contents: write/)
  assert.match(release, /actions: read/)
})

test('writer accepts an existing tag only when its peeled commit is the approved SHA', async () => {
  const writer = await text('.github/workflows/release-writer.yml')

  assert.match(writer, /resolve_tag_commit/)
  assert.match(writer, /existing_commit="\$\(resolve_tag_commit/)
  assert.match(writer, /\[ "\$existing_commit" = "\$CANDIDATE_SHA" \]/)
  assert.match(writer, /existing tag points to a different commit/)
  assert.match(writer, /main advanced before tag creation/)
  assert.match(writer, /tag already exists at approved commit; continuing/)
})

test('privileged release verifies the exact artifact and recovers an existing release', async () => {
  const [writer, release] = await Promise.all([
    text('.github/workflows/release-writer.yml'),
    text('.github/workflows/release.yml'),
  ])

  assert.match(writer, /payload_artifact_id/)
  assert.match(writer, /payload_artifact_digest/)
  assert.match(writer, /payload_manifest_sha256/)
  assert.match(release, /actions\/artifacts\/\$PAYLOAD_ARTIFACT_ID/)
  assert.match(release, /\[ "\$artifact_digest" = "\$PAYLOAD_ARTIFACT_DIGEST" \]/)
  assert.match(release, /SHA256SUMS/)
  assert.match(release, /sha256sum --check --strict/)
  assert.match(release, /resolve_tag_commit/)
  assert.match(release, /\[ "\$tag_commit" = "\$EXPECTED_SHA" \]/)
  assert.match(release, /gh release view "\$RELEASE_TAG"/)
  assert.match(release, /gh release download "\$RELEASE_TAG"/)
  assert.match(release, /existing release asset digest mismatch/)
  assert.match(release, /gh release upload "\$RELEASE_TAG"/)
  assert.match(release, /gh release create "\$RELEASE_TAG"/)
})

test('release automation never publishes to npm', async () => {
  const workflows = await Promise.all([
    text('.github/workflows/release-candidate.yml'),
    text('.github/workflows/release-writer.yml'),
    text('.github/workflows/release.yml'),
  ])

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /npm publish/)
    assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/)
  }
})
