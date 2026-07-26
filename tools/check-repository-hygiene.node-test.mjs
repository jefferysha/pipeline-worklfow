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

test('rejects reference identities in both tracked paths and text without exemptions', async () => {
  const root = await fixture()
  const firstIdentity = String.fromCharCode(116, 114, 101, 108, 108, 105, 115)
  const secondIdentity = String.fromCharCode(99, 111, 109, 101, 116)
  const contentPath = 'docs/reference.md'
  await writeFile(join(root, contentPath), `derived from ${secondIdentity}\n`)
  try {
    const failures = checkReferenceIdentities(root, [
      `docs/${firstIdentity}-layout.md`,
      contentPath,
    ])
    assert.equal(failures.length, 2)
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(firstIdentity)))
    assert.ok(failures.every((failure) => !failure.toLowerCase().includes(secondIdentity)))
    assert.match(failures[0], /路径/)
    assert.match(failures[1], /文本/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
