import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listAllSkills } from './skillsRegistry.js'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skills-reg-'))
  await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# pipeline-open\n', 'utf8')
  await mkdir(join(root, 'skills', 'pipeline-build'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-build', 'SKILL.md'), '# pipeline-build\n', 'utf8')
  await writeFile(
    join(root, 'skills', 'EXTERNAL-SKILLS.md'),
    '# External\n\n## 已声明依赖\n\n- superpowers:brainstorming\n- grill-with-docs\n',
    'utf8',
  )
  return root
}

describe('listAllSkills', () => {
  it('合并本地 skills/*/SKILL.md 目录名 + EXTERNAL-SKILLS.md 已声明依赖列表，去重排序', async () => {
    const root = await makeRepo()
    const result = listAllSkills(root)
    expect(result).toEqual(['grill-with-docs', 'pipeline-build', 'pipeline-open', 'superpowers:brainstorming'])
  })

  it('EXTERNAL-SKILLS.md 不存在时不报错，只返回本地目录', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-reg-nolocal-'))
    await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
    await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# x\n', 'utf8')
    expect(listAllSkills(root)).toEqual(['pipeline-open'])
  })
})
