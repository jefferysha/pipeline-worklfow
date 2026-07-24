/** Runner-aware production skill roots. Codex never enumerates or reads any ~/.claude path. */
import { readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { assertLoopRunner, type LoopRunner } from '@pipeline-lite/kernel'
import {
  createFsSkillContentLocator,
  SkillContentNotFoundError,
  type SkillContentLocator,
} from './content-locator.js'

export class SkillRootRegistryError extends Error {
  override readonly name = 'SkillRootRegistryError'
  readonly _tag = 'SkillRootRegistryError'
}

export interface RunnerSkillContentLocatorOptions {
  readonly runner: LoopRunner | string
  readonly home: string
  /** 仓库/插件自带的 skills 根；不含 skills 的安装根请由调用方先 join。 */
  readonly bundledRoot?: string
  readonly readInstalledPluginsJson?: (path: string) => string | null
  readonly readdirDirNames?: (path: string) => readonly string[]
}

function nodeCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : 'unknown'
}

function realDirNames(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
  } catch (error) {
    if (nodeCode(error) === 'ENOENT') return []
    throw new SkillRootRegistryError(
      `读取 skill root registry 失败（${path}，${nodeCode(error)}）：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function checkedNames(read: (path: string) => readonly string[], path: string): string[] {
  const names = read(path)
  if (!Array.isArray(names)) throw new SkillRootRegistryError(`${path} 的目录枚举结果必须是数组`)
  const seen = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name === '' || name === '.' || name === '..'
      || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      throw new SkillRootRegistryError(`${path} 含非法目录段 ${JSON.stringify(name)}`)
    }
    if (seen.has(name)) throw new SkillRootRegistryError(`${path} 重复目录段 ${JSON.stringify(name)}`)
    seen.add(name)
  }
  return [...seen]
}

function append(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key)
  if (existing === undefined) map.set(key, [value])
  else existing.push(value)
}

function codexPluginRoots(
  home: string,
  read: (path: string) => readonly string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const cache = join(home, '.codex', 'plugins', 'cache')
  for (const authority of checkedNames(read, cache)) {
    const authorityDir = join(cache, authority)
    for (const plugin of checkedNames(read, authorityDir)) {
      const pluginDir = join(authorityDir, plugin)
      for (const version of checkedNames(read, pluginDir)) {
        append(result, plugin, join(pluginDir, version, 'skills'))
      }
    }
  }
  return result
}

function realInstalledJson(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (nodeCode(error) === 'ENOENT') return null
    throw new SkillRootRegistryError(
      `读取 Claude installed_plugins.json 失败（${path}，${nodeCode(error)}）：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function claudeInstalledRoots(raw: string | null): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (raw === null) return result
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new SkillRootRegistryError(
      `Claude installed_plugins.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkillRootRegistryError('Claude installed_plugins.json 顶层必须是对象')
  }
  const plugins = (parsed as Record<string, unknown>).plugins
  if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) {
    throw new SkillRootRegistryError('Claude installed_plugins.json.plugins 必须是对象')
  }
  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    const at = key.lastIndexOf('@')
    if (at <= 0 || at === key.length - 1 || !Array.isArray(entries)) {
      throw new SkillRootRegistryError(`Claude plugin entry 非法：${JSON.stringify(key)}`)
    }
    const plugin = key.slice(0, at)
    for (const [index, entry] of entries.entries()) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new SkillRootRegistryError(`Claude plugins.${key}[${index}] 必须是对象`)
      }
      const installPath = (entry as Record<string, unknown>).installPath
      if (typeof installPath !== 'string' || installPath.trim() === '' || !isAbsolute(installPath)) {
        throw new SkillRootRegistryError(`Claude plugins.${key}[${index}].installPath 必须是绝对路径`)
      }
      append(result, plugin, join(installPath, 'skills'))
    }
  }
  return result
}

function flatten(map: ReadonlyMap<string, readonly string[]>): string[] {
  return [...map.values()].flatMap((roots) => [...roots])
}

function isNotFound(error: unknown): error is SkillContentNotFoundError {
  return (error as { _tag?: string } | null | undefined)?._tag === 'SkillContentNotFoundError'
}

export function createRunnerSkillContentLocator(
  options: RunnerSkillContentLocatorOptions,
): SkillContentLocator {
  const runner = assertLoopRunner(options.runner)
  const readDirs = options.readdirDirNames ?? realDirNames
  const codexPlugins = codexPluginRoots(options.home, readDirs)
  const bundled = options.bundledRoot === undefined
    ? undefined
    : createFsSkillContentLocator([options.bundledRoot])
  const codexFlat = createFsSkillContentLocator([
    join(options.home, '.codex', 'skills'),
    join(options.home, '.codex', 'skills', '.system'),
    // skills CLI 的 Codex/global 安装真落点是 agent-neutral ~/.agents/skills；它不属于
    // Claude 私有面，Codex runner 必须可读，否则 setup/doctor 绿而 H10 readiness 必红。
    join(options.home, '.agents', 'skills'),
    ...flatten(codexPlugins),
  ])

  let claudePlugins: Map<string, string[]> | undefined
  let claudeFlat: SkillContentLocator | undefined
  const getClaudePlugins = (): Map<string, string[]> => {
    claudePlugins ??= claudeInstalledRoots(
      (options.readInstalledPluginsJson ?? realInstalledJson)(
        join(options.home, '.claude', 'plugins', 'installed_plugins.json'),
      ),
    )
    return claudePlugins
  }
  const getClaudeFlat = (): SkillContentLocator => {
    if (claudeFlat !== undefined) return claudeFlat
    const roots = [join(options.home, '.claude', 'skills'), join(options.home, '.agents', 'skills')]
    const cache = join(options.home, '.claude', 'plugins', 'cache')
    for (const marketplace of checkedNames(readDirs, cache)) {
      const marketplaceDir = join(cache, marketplace)
      for (const plugin of checkedNames(readDirs, marketplaceDir)) {
        roots.push(join(marketplaceDir, plugin, 'skills'))
      }
    }
    roots.push(...flatten(getClaudePlugins()))
    claudeFlat = createFsSkillContentLocator([...new Set(roots)])
    return claudeFlat
  }

  return {
    async locate(skillId) {
      const colon = skillId.indexOf(':')
      if (colon < 0) {
        if (bundled !== undefined) {
          try {
            return await bundled.locate(skillId)
          } catch (error) {
            if (!isNotFound(error)) throw error
          }
        }
        try {
          return await codexFlat.locate(skillId)
        } catch (error) {
          if (!isNotFound(error) || runner === 'codex') throw error
          return getClaudeFlat().locate(skillId)
        }
      }

      const plugin = skillId.slice(0, colon)
      const leaf = skillId.slice(colon + 1)
      const codexRoots = codexPlugins.get(plugin) ?? []
      if (codexRoots.length > 0) {
        try {
          const located = await createFsSkillContentLocator(codexRoots).locate(leaf)
          return { skillId, contentDir: located.contentDir }
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      }
      if (runner === 'codex') {
        throw new SkillContentNotFoundError(
          `skill '${skillId}' 在 bundled/Codex roots 中不存在；Codex runner 禁止读取 Claude fallback`,
        )
      }
      const fallback = getClaudePlugins().get(plugin) ?? []
      if (fallback.length === 0) {
        throw new SkillContentNotFoundError(`skill '${skillId}' 的 Claude plugin namespace 未安装`)
      }
      const located = await createFsSkillContentLocator(fallback).locate(leaf)
      return { skillId, contentDir: located.contentDir }
    },
  }
}
