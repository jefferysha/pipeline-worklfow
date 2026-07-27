import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { projectInteractionContract } from './generate-skill-interaction-contract.mjs'

const root = new URL('../', import.meta.url)

test('所有治理 Skill 消费同一份持续授权交互契约', async () => {
  const template = (await readFile(
    new URL('templates/skill-interaction-contract.md', root),
    'utf8',
  )).trimEnd()
  const ids = [
    'tenon', 'tenon-open', 'tenon-explore', 'tenon-spec',
    'tenon-build', 'tenon-verify', 'tenon-ship', 'tenon-archive',
  ]
  for (const id of ids) {
    const source = await readFile(new URL(`skills/${id}/SKILL.md`, root), 'utf8')
    assert.equal(projectInteractionContract(source, template), source, `${id} projection drift`)
    assert.equal(source.split('<!-- TENON:INTERACTION-MODE:START -->').length - 1, 1)
    assert.equal(source.split('<!-- TENON:INTERACTION-MODE:END -->').length - 1, 1)
  }
})

test('生成器拒绝不成对或重复的 managed marker', () => {
  assert.throws(
    () => projectInteractionContract(
      '---\nname: x\n---\n<!-- TENON:INTERACTION-MODE:START -->',
      'contract',
    ),
    /malformed/,
  )
})
