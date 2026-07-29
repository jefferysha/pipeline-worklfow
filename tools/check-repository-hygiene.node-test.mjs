import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  checkMarkdownImages,
  checkReferenceIdentities,
  checkTrackedFiles,
} from './check-repository-hygiene.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tenon-repository-hygiene-'))
  await mkdir(join(root, 'docs-site', 'public', 'images'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'docs-site', 'public', 'images', 'dashboard-progress.webp'), 'webp')
  return root
}

test('rejects old QA images and accepts bounded official dashboard WebP assets', async () => {
  const root = await fixture()
  try {
    assert.deepEqual(checkTrackedFiles(root, ['docs-site/public/images/dashboard-progress.webp']), [])
    assert.match(
      checkTrackedFiles(root, ['design-demos/shots/qa.png'])[0],
      /禁止跟踪/,
    )
    assert.match(checkTrackedFiles(root, ['random.png'])[0], /allowlist/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('resolves README and Pages-style image links and rejects dangling links', async () => {
  const root = await fixture()
  try {
    await writeFile(
      join(root, 'README.md'),
      '![进度](docs-site/public/images/dashboard-progress.webp)\n',
    )
    await writeFile(
      join(root, 'docs', 'guide.md'),
      '![进度](/images/dashboard-progress.webp)\n',
    )
    assert.deepEqual(checkMarkdownImages(root, ['README.md', 'docs/guide.md']), [])
    await writeFile(join(root, 'README.md'), '![丢失](docs-site/public/images/missing.webp)\n')
    assert.match(checkMarkdownImages(root, ['README.md'])[0], /不存在/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects reference identities in tracked paths and ordinary managed text', async () => {
  const root = await fixture()
  const firstIdentity = String.fromCharCode(116, 114, 101, 108, 108, 105, 115)
  const secondIdentity = String.fromCharCode(99, 111, 109, 101, 116)
  const thirdIdentity = String.fromCharCode(
    97, 119, 101, 115, 111, 109, 101, 45, 100, 101, 115, 105, 103, 110, 45, 109, 100,
  )
  const contentPath = 'docs/reference.md'
  const additionalContentPath = 'docs/additional-reference.md'
  await writeFile(join(root, contentPath), `derived from ${secondIdentity}\n`)
  await writeFile(join(root, additionalContentPath), `derived from ${thirdIdentity}\n`)
  try {
    const failures = checkReferenceIdentities(root, [
      `docs/${firstIdentity}-layout.md`,
      contentPath,
      additionalContentPath,
    ])
    assert.equal(failures.length, 3)
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(firstIdentity)))
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(secondIdentity)))
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(thirdIdentity)))
    assert.match(failures[0], /路径/)
    assert.match(failures[1], /文本/)
    assert.match(failures[2], /文本/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows external identities only as text inside governed source-evidence documents', async () => {
  const root = await fixture()
  const identity = String.fromCharCode(116, 114, 101, 108, 108, 105, 115)
  const evidenceFiles = [
    'docs/adr/trace-timeline.md',
    'docs/superpowers/specs/trace-timeline-design.md',
    'openspec/changes/trace-timeline/proposal.md',
    'openspec/changes/trace-timeline/tasks.md',
  ]
  for (const path of evidenceFiles) {
    await mkdir(join(root, path.split('/').slice(0, -1).join('/')), { recursive: true })
    await writeFile(join(root, path), `pinned upstream: ${identity}\n`)
  }
  const identityInPath = `docs/adr/${identity}.md`
  await writeFile(join(root, identityInPath), 'evidence\n')
  try {
    assert.deepEqual(checkReferenceIdentities(root, evidenceFiles), [])
    const failures = checkReferenceIdentities(root, [identityInPath])
    assert.equal(failures.length, 1)
    assert.match(failures[0], /路径/)
    assert.ok(!failures[0].toLowerCase().includes(identity))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reference identity matching is case-insensitive and diagnostics never echo the identity', async () => {
  const root = await fixture()
  const identity = String.fromCharCode(116, 114, 101, 108, 108, 105, 115)
  const mixedCase = identity
    .split('')
    .map((character, index) => index % 2 === 0 ? character.toUpperCase() : character)
    .join('')
  const path = `docs/${mixedCase}-notes.md`
  await writeFile(join(root, path), `${mixedCase}\n`)
  try {
    const failures = checkReferenceIdentities(root, [path])
    assert.equal(failures.length, 2)
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(identity)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects historical test-project identities from tracked paths', async () => {
  const root = await fixture()
  const testProjectIdentity = String.fromCharCode(
    112, 101, 116, 45, 97, 100, 111, 112, 116, 105, 111, 110, 45, 99, 101, 110, 116, 101, 114,
  )
  try {
    const failures = checkTrackedFiles(root, [
      `design-demos/${testProjectIdentity}.html`,
    ])
    assert.equal(failures.length, 1)
    assert.match(failures[0], /历史测试项目/)
    assert.ok(!failures[0].toLowerCase().includes(testProjectIdentity))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
