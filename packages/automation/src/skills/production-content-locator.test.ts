import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SkillContentNotFoundError } from './content-locator.js'
import { createRunnerSkillContentLocator } from './production-content-locator.js'

const roots: string[] = []

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'runner-skill-locator-'))
  roots.push(root)
  return root
}

async function skill(root: string, relativeRoot: string, id: string): Promise<string> {
  const dir = join(root, relativeRoot, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `# ${id}\n`, 'utf8')
  return realpath(dir)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('createRunnerSkillContentLocator', () => {
  test('runner=codex：只存在于 ~/.claude/skills 的 skill 不可见', async () => {
    const root = await home()
    await skill(root, '.claude/skills', 'claude-only')
    const readClaudeRegistry = vi.fn(() => null)
    const locator = createRunnerSkillContentLocator({
      runner: 'codex', home: root, readInstalledPluginsJson: readClaudeRegistry,
    })

    await expect(locator.locate('claude-only')).rejects.toBeInstanceOf(SkillContentNotFoundError)
    expect(readClaudeRegistry).not.toHaveBeenCalled()
  })

  test('runner=codex：namespaced skill 不读取 Claude installed_plugins.json', async () => {
    const root = await home()
    const installed = await skill(root, 'claude-plugin-install/skills', 'leaf')
    const readClaudeRegistry = vi.fn(() => JSON.stringify({
      plugins: { 'vendor@market': [{ installPath: join(installed, '..', '..') }] },
    }))
    const locator = createRunnerSkillContentLocator({
      runner: 'codex', home: root, readInstalledPluginsJson: readClaudeRegistry,
    })

    await expect(locator.locate('vendor:leaf')).rejects.toBeInstanceOf(SkillContentNotFoundError)
    expect(readClaudeRegistry).not.toHaveBeenCalled()
  })

  test('runner=codex：可定位 ~/.codex/skills 与 Codex plugin cache', async () => {
    const root = await home()
    const flat = await skill(root, '.codex/skills', 'flat')
    const plugin = await skill(root, '.codex/plugins/cache/openai/plugin-a/1.0.0/skills', 'leaf')
    const locator = createRunnerSkillContentLocator({ runner: 'codex', home: root })

    await expect(locator.locate('flat')).resolves.toMatchObject({ contentDir: flat })
    await expect(locator.locate('plugin-a:leaf')).resolves.toMatchObject({ contentDir: plugin })
  })

  test('runner=codex：可定位 agent-neutral 的 ~/.agents/skills（skills CLI 的 Codex 全局安装落点）', async () => {
    const root = await home()
    const installed = await skill(root, '.agents/skills', 'grill-with-docs')
    const locator = createRunnerSkillContentLocator({ runner: 'codex', home: root })

    await expect(locator.locate('grill-with-docs')).resolves.toMatchObject({ contentDir: installed })
  })

  test('runner=claude-code：保留 Claude flat 兼容根', async () => {
    const root = await home()
    const dir = await skill(root, '.claude/skills', 'compat')
    const locator = createRunnerSkillContentLocator({ runner: 'claude-code', home: root })

    await expect(locator.locate('compat')).resolves.toMatchObject({ contentDir: dir })
  })

  test('未知 runner 构造即 fail-loud', async () => {
    const root = await home()
    expect(() => createRunnerSkillContentLocator({ runner: 'codxe', home: root })).toThrow(/runner.*codxe/i)
  })
})
