/**
 * skillBundleAssembly —— H10 §8任务7：CLI 生产装配的物理原语（供 afk.ts 的 cmdAfk('run') 与
 * loop-run.ts 的 --dry-run wiring 预览共用，避免各写一份漂移）：
 *
 *   · productionSkillContentRoots —— content-locator 的物理根枚举。顺序是 bundled 根（若有）→
 *     Codex 主 tier（`~/.codex/skills`、`.system`、真实
 *     `~/.codex/plugins/cache/<authority>/<plugin>/<version>/skills`，`version=local` 亦同）→
 *     Claude/agents 兼容根。cache 层级只对 ENOENT fail-soft；访问错误、非法目录段、坏 remote-plugin
 *     元数据、普通文件或悬空 symlink 等 schema 损坏全部 fail-loud。
 *
 *   · installedPluginSkillRoots / createProductionSkillContentLocator —— 裸 id 与 `plugin:skill` 都按
 *     两阶段定位：先在 bundled+Codex 固定/cache roots 内完成候选折叠/歧义判断；只有整个 Codex tier
 *     报 `SkillContentNotFoundError` 才回退 Claude/agents。Claude versioned plugin roots 以
 *     `~/.claude/plugins/installed_plugins.json` 的绝对 `installPath` 为真相源；该 registry 只有
 *     ENOENT 可视为空，读失败、坏 JSON 或坏 schema 均 fail-loud。stat/realpath/内容歧义仍全部委托
 *     automation 的 `createFsSkillContentLocator`。AFK 与 loop-run 生产调用点直接使用本 locator。
 *
 *   · createExecutionCoordinatePort —— `ExecutionCoordinatePort` 的生产实现（设计 §3 步骤2/步骤7、
 *     execution-context.ts 头注「生产实现属 H10 任务7」）：claim 后在 change lock 下读取并固定
 *     workflow 归属（default 走 `resolveWorkflowName`+当前 phase；custom 走真实
 *     `loadWorkflow`+`compileWorkflow`+`resolveStep`），随 store.withLock 回调返回即释放锁；
 *     `readCurrentInputsDigest` 供步骤7 复核单独调用，不重新持锁读取整份坐标。
 *
 *     custom workflow 名无对应 `.pipeline/workflows/<id>.yaml` 文件时的口径与
 *     `commands/effective-artifacts.ts::effectiveArtifactFields` 同一既有先例：文件缺失 ≠
 *     "corrupted"，视为该 step 无技能声明可内省（产出空 skills 的 StepIR），不 fail-loud——真正
 *     损坏（文件存在但 parse/compile 失败，或编译后 step 不在图里）才让 `loadWorkflow`/
 *     `resolveStep` 的异常/本函数的 throw 原样冒出（未捕获，交给调用方 `createExecutionPreparation`
 *     所在的 scheduler.ts::handlePreparationThrow 兜底，同 activate() 对 ledger I/O 的既有处置）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  createFsSkillContentLocator, createRunnerSkillContentLocator, SkillContentNotFoundError,
  type SkillContentLocator,
} from '@tenon/automation'
import {
  createProvenanceAwareBundledLocator,
  loadSkillAliases,
} from './skill-provenance-locator.js'
export {
  createExecutionCoordinatePort,
  type ExecutionCoordinatePortDeps,
} from './executionCoordinatePort.js'

// ── productionSkillContentRoots ─────────────────────────────────────────────────

export class SkillCacheAccessError extends Error {
  override readonly name = 'SkillCacheAccessError'
  readonly _tag = 'SkillCacheAccessError'
}

export class SkillCacheSchemaError extends Error {
  override readonly name = 'SkillCacheSchemaError'
  readonly _tag = 'SkillCacheSchemaError'
}

function nodeErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : 'unknown'
}

function validateCodexRemotePluginMetadata(path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new SkillCacheAccessError(
      `读取 Codex plugin cache 元数据失败（${path}，${nodeErrorCode(error)}）：${error instanceof Error ? error.message : String(error)}`,
    )
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new SkillCacheSchemaError(
      `skill cache schema 损坏：${path} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SkillCacheSchemaError(`skill cache schema 损坏：${path} 顶层必须是对象`)
  }
  const record = data as Record<string, unknown>
  if (record.schema_version !== 1 || typeof record.remote_plugin_id !== 'string' || record.remote_plugin_id.trim() === '') {
    throw new SkillCacheSchemaError(
      `skill cache schema 损坏：${path} 必须含 schema_version=1 与非空 remote_plugin_id`,
    )
  }
}

/** 枚举某目录下的直接子目录/符号链接名；只有目录不存在（ENOENT）才按空列表处理。 */
function realReaddirDirNames(absDir: string): string[] {
  try {
    const entries = readdirSync(absDir, { withFileTypes: true })
    const invalid = entries.find((entry) => (
      !entry.isDirectory()
      && !entry.isSymbolicLink()
      && entry.name !== '.codex-remote-plugin-install.json'
    ))
    if (invalid !== undefined) {
      throw new SkillCacheSchemaError(
        `skill cache schema 损坏：${absDir} 下的 ${JSON.stringify(invalid.name)} 不是目录或符号链接`,
      )
    }
    for (const entry of entries) {
      if (entry.name === '.codex-remote-plugin-install.json') {
        validateCodexRemotePluginMetadata(join(absDir, entry.name))
      }
    }
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue
      let target: ReturnType<typeof statSync>
      try {
        target = statSync(join(absDir, entry.name))
      } catch (error) {
        const code = nodeErrorCode(error)
        if (code === 'ENOENT' || code === 'ELOOP') {
          throw new SkillCacheSchemaError(
            `skill cache schema 损坏：${absDir} 下的符号链接 ${JSON.stringify(entry.name)} 悬空或成环（${code}）`,
          )
        }
        throw new SkillCacheAccessError(
          `读取 skill cache 符号链接失败（${join(absDir, entry.name)}，${code}）：${error instanceof Error ? error.message : String(error)}`,
        )
      }
      if (!target.isDirectory()) {
        throw new SkillCacheSchemaError(
          `skill cache schema 损坏：${absDir} 下的符号链接 ${JSON.stringify(entry.name)} 未指向目录`,
        )
      }
    }
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
  } catch (error) {
    if (error instanceof SkillCacheSchemaError || error instanceof SkillCacheAccessError) throw error
    if (nodeErrorCode(error) === 'ENOENT') return []
    throw new SkillCacheAccessError(
      `读取 skill cache 目录失败（${absDir}，${nodeErrorCode(error)}）：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function checkedCacheDirNames(
  list: (absDir: string) => string[],
  absDir: string,
): string[] {
  const names: unknown = list(absDir)
  if (!Array.isArray(names)) {
    throw new SkillCacheSchemaError(`skill cache schema 损坏：${absDir} 的目录枚举结果不是数组`)
  }
  const seen = new Set<string>()
  for (const name of names) {
    if (
      typeof name !== 'string'
      || name.trim() === ''
      || name === '.'
      || name === '..'
      || name.includes('/')
      || name.includes('\\')
      || name.includes('\0')
    ) {
      throw new SkillCacheSchemaError(
        `skill cache schema 损坏：${absDir} 含非法目录段 ${JSON.stringify(name)}`,
      )
    }
    if (seen.has(name)) {
      throw new SkillCacheSchemaError(
        `skill cache schema 损坏：${absDir} 重复枚举目录段 ${JSON.stringify(name)}`,
      )
    }
    seen.add(name)
  }
  return names
}

export interface SkillContentRootsOptions {
  /** 插件仓根（main.ts::pluginRoot()）；给定时把 `<pluginRoot>/skills`（本仓自带 bundled skills）纳入首位根。 */
  readonly pluginRoot?: string
  /** 用户主目录（生产传 `os.homedir()`；测试传固定字符串，纯函数不内部调用 os）。 */
  readonly home: string
  /** 目录枚举注入面（测试用；返回值同样接受 cache schema 校验）。 */
  readonly readdirDirNames?: (absDir: string) => string[]
}

/**
 * content-locator 根枚举：`<pluginRoot>/skills`（若给定）→ Codex 固定根 +
 * `<authority>/<plugin>/<version>/skills` cache roots → Claude/agents 兼容根。调用方若需要真正的
 * tier fallback 语义，使用 createProductionSkillContentLocator；本函数只暴露有序物理根清单。
 */
export function productionSkillContentRoots(opts: SkillContentRootsOptions): string[] {
  const readdirDirNames = opts.readdirDirNames ?? realReaddirDirNames
  const roots: string[] = []
  if (opts.pluginRoot !== undefined) roots.push(join(opts.pluginRoot, 'skills'))
  // Codex-first：Codex 固定根构成主 tier；Claude/agents 只作为后置兼容层。
  roots.push(join(opts.home, '.codex', 'skills'))
  roots.push(join(opts.home, '.codex', 'skills', '.system'))
  roots.push(...flattenPluginRoots(codexPluginSkillRoots(opts)))
  roots.push(join(opts.home, '.claude', 'skills'))
  roots.push(join(opts.home, '.agents', 'skills'))
  const cacheRoot = join(opts.home, '.claude', 'plugins', 'cache')
  for (const marketplace of checkedCacheDirNames(readdirDirNames, cacheRoot)) {
    const mktDir = join(cacheRoot, marketplace)
    for (const plugin of checkedCacheDirNames(readdirDirNames, mktDir)) {
      roots.push(join(mktDir, plugin, 'skills'))
    }
  }
  return roots
}

// ── installedPluginSkillRoots / createProductionSkillContentLocator ────────────

/** 真读 `~/.claude/plugins/installed_plugins.json` 原始文本；仅 ENOENT → null，其余读取错误 fail-loud。 */
function realReadInstalledPluginsJson(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new InstalledPluginRegistryError(`读取 installed_plugins.json 失败（${path}）：${e instanceof Error ? e.message : String(e)}`)
  }
}

export class InstalledPluginRegistryError extends Error {
  override readonly name = 'InstalledPluginRegistryError'
  readonly _tag = 'InstalledPluginRegistryError'
}

/**
 * 把 installed_plugins.json 的原始文本解析成「插件名 → 真实 skills/ 根目录列表」。全程把解析值
 * 当 unknown 逐层验证：仅 null（读取器对 ENOENT 的显式哨兵）产出空表；空文件、坏 JSON、坏 key/
 * entry/installPath schema 一律 InstalledPluginRegistryError，绝不伪装成插件未安装。
 */
function parseInstalledPluginSkillRoots(json: string | null): Map<string, string[]> {
  const roots = new Map<string, string[]>()
  if (json === null) return roots
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (e) {
    throw new InstalledPluginRegistryError(`installed_plugins.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new InstalledPluginRegistryError('installed_plugins.json 顶层必须是对象')
  }
  const plugins = (data as Record<string, unknown>).plugins
  if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) {
    throw new InstalledPluginRegistryError('installed_plugins.json 缺少对象形状的 plugins 字段')
  }

  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    // key 形如 '<plugin>@<marketplace>'（本机实测 installed_plugins.json 的真实键形状，见
    // ~/.claude/plugins/installed_plugins.json）。用最后一个 '@' 切分，兼容潜在 scoped plugin 名。
    const at = key.lastIndexOf('@')
    if (at <= 0 || at === key.length - 1) {
      throw new InstalledPluginRegistryError(
        `installed_plugins.json 的 plugin key 必须是 <plugin>@<marketplace>：${JSON.stringify(key)}`,
      )
    }
    const pluginName = key.slice(0, at)
    if (!Array.isArray(entries)) {
      throw new InstalledPluginRegistryError(`installed_plugins.json 的 plugins.${key} 必须是数组`)
    }
    for (const [index, entry] of entries.entries()) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new InstalledPluginRegistryError(`installed_plugins.json 的 plugins.${key}[${index}] 必须是对象`)
      }
      const installPath = (entry as Record<string, unknown>).installPath
      if (typeof installPath !== 'string' || installPath.trim() === '' || !isAbsolute(installPath)) {
        throw new InstalledPluginRegistryError(
          `installed_plugins.json 的 plugins.${key}[${index}].installPath 必须是非空绝对路径`,
        )
      }
      const skillsRoot = join(installPath, 'skills')
      const existing = roots.get(pluginName)
      if (existing) existing.push(skillsRoot)
      else roots.set(pluginName, [skillsRoot])
    }
  }
  return roots
}

export interface InstalledPluginSkillRootsOptions {
  /** 用户主目录（生产传 `os.homedir()`；测试传固定字符串）。 */
  readonly home: string
  /** 读取 installed_plugins.json 原始文本的注入面（测试用；缺省真 fs 读取，见
   *  realReadInstalledPluginsJson）。 */
  readonly readInstalledPluginsJson?: (path: string) => string | null
  /** Codex plugin cache 目录枚举注入面（与 SkillContentRootsOptions 同一语义）。 */
  readonly readdirDirNames?: (absDir: string) => string[]
}

function codexPluginSkillRoots(opts: InstalledPluginSkillRootsOptions): Map<string, string[]> {
  const roots = new Map<string, string[]>()
  const list = opts.readdirDirNames ?? realReaddirDirNames
  const codexCache = join(opts.home, '.codex', 'plugins', 'cache')
  for (const authority of checkedCacheDirNames(list, codexCache)) {
    const authorityDir = join(codexCache, authority)
    for (const plugin of checkedCacheDirNames(list, authorityDir)) {
      const pluginDir = join(authorityDir, plugin)
      for (const version of checkedCacheDirNames(list, pluginDir)) {
        const skillRoot = join(pluginDir, version, 'skills')
        const existing = roots.get(plugin)
        if (existing) existing.push(skillRoot)
        else roots.set(plugin, [skillRoot])
      }
    }
  }
  return roots
}

function appendPluginRoots(target: Map<string, string[]>, source: ReadonlyMap<string, readonly string[]>): void {
  for (const [plugin, sourceRoots] of source) {
    const existing = target.get(plugin)
    if (existing) existing.push(...sourceRoots)
    else target.set(plugin, [...sourceRoots])
  }
}

function flattenPluginRoots(roots: ReadonlyMap<string, readonly string[]>): string[] {
  return [...roots.values()].flatMap((pluginRoots) => [...pluginRoots])
}

function claudePluginSkillRoots(opts: InstalledPluginSkillRootsOptions): Map<string, string[]> {
  const readJson = opts.readInstalledPluginsJson ?? realReadInstalledPluginsJson
  const path = join(opts.home, '.claude', 'plugins', 'installed_plugins.json')
  return parseInstalledPluginSkillRoots(readJson(path))
}

/**
 * 已装插件名 → Claude registry 与 Codex cache 的真实 `skills/` 根目录合集。该函数用于枚举/诊断；
 * 真正定位必须走 createProductionSkillContentLocator，以免把两个 tier 混在同一次歧义判定里。
 */
export function installedPluginSkillRoots(
  opts: InstalledPluginSkillRootsOptions,
): ReadonlyMap<string, readonly string[]> {
  const roots = claudePluginSkillRoots(opts)
  // Codex plugin cache：<authority>/<plugin>/<version>/skills。它没有 Claude 的
  // installed_plugins.json，故按实际 cache 层级枚举；命名空间仍以 plugin 目录名为键。
  appendPluginRoots(roots, codexPluginSkillRoots(opts))
  return roots
}

export interface ProductionSkillContentLocatorOptions extends SkillContentRootsOptions, InstalledPluginSkillRootsOptions {
  /** 给定时启用 runner 隔离：codex 路径绝不枚举/读取 ~/.claude；缺席保留旧诊断兼容行为。 */
  readonly runner?: string
}

function withLogicalSkillAliases(locator: SkillContentLocator, aliases: ReadonlyMap<string, string>): SkillContentLocator {
  if (aliases.size === 0) return locator
  return {
    async locate(skillId) {
      const physicalId = aliases.get(skillId) ?? skillId
      const located = await locator.locate(physicalId)
      return physicalId === skillId ? located : { skillId, contentDir: located.contentDir }
    },
  }
}

/**
 * 生产 `SkillContentLocator`：裸与 namespaced token 都先查 Codex tier；只有 NotFound 才查
 * Claude/agents fallback。每个 tier 内部仍用 createFsSkillContentLocator 做访问错误分类、realpath、
 * 同内容折叠与异内容歧义拒绝。namespaced 返回值回填完整原始 token，而非内部 leaf。
 *
 * 两个 tier 都无候选 → SkillContentNotFoundError，让 selectFirstLocatable 可继续尝试 manifest `a|b`
 * 的下一个 alternative；任何 access/schema/registry/ambiguity 错误都原样 fail-loud，不触发回退。
 */
export function createProductionSkillContentLocator(opts: ProductionSkillContentLocatorOptions): SkillContentLocator {
  const aliases = opts.runner === undefined ? new Map<string, string>() : loadSkillAliases(opts.pluginRoot)
  if (opts.runner !== undefined) {
    const runnerLocator = createRunnerSkillContentLocator({
      runner: opts.runner,
      home: opts.home,
      // Bundled content is wrapped below so runner-specific resolution cannot bypass the
      // canonical provenance/hash check.
      bundledRoot: undefined,
      readInstalledPluginsJson: opts.readInstalledPluginsJson,
      readdirDirNames: opts.readdirDirNames,
    })
    const bundledLocator = opts.pluginRoot === undefined
      ? undefined
      : createProvenanceAwareBundledLocator(opts.pluginRoot)
    const locator: SkillContentLocator = bundledLocator === undefined
      ? runnerLocator
      : {
          async locate(skillId) {
            try {
              return await bundledLocator.locate(skillId)
            } catch (error) {
              if (!(error instanceof SkillContentNotFoundError)) throw error
              return runnerLocator.locate(skillId)
            }
          },
        }
    return withLogicalSkillAliases(locator, aliases)
  }
  const bundledRoot = opts.pluginRoot === undefined ? undefined : join(opts.pluginRoot, 'skills')
  const bundledLocator = bundledRoot === undefined || opts.pluginRoot === undefined
    ? undefined
    : createProvenanceAwareBundledLocator(opts.pluginRoot)
  let cachedCodexPluginRoots: Map<string, string[]> | undefined
  let cachedCodexFlatRoots: string[] | undefined
  let cachedCodexFlatLocator: SkillContentLocator | undefined
  let cachedClaudePluginRoots: Map<string, string[]> | undefined
  let cachedFallbackFlatLocator: SkillContentLocator | undefined
  const getCodexPluginRoots = (): Map<string, string[]> => {
    cachedCodexPluginRoots ??= codexPluginSkillRoots(opts)
    return cachedCodexPluginRoots
  }
  const getCodexFlatRoots = (): string[] => {
    cachedCodexFlatRoots ??= [
      join(opts.home, '.codex', 'skills'),
      join(opts.home, '.codex', 'skills', '.system'),
      ...flattenPluginRoots(getCodexPluginRoots()),
    ]
    return cachedCodexFlatRoots
  }
  const getCodexFlatLocator = (): SkillContentLocator => {
    cachedCodexFlatLocator ??= createFsSkillContentLocator(getCodexFlatRoots())
    return cachedCodexFlatLocator
  }
  const getClaudePluginRoots = (): Map<string, string[]> => {
    cachedClaudePluginRoots ??= claudePluginSkillRoots(opts)
    return cachedClaudePluginRoots
  }
  const getFallbackFlatLocator = (): SkillContentLocator => {
    const codexFlatRoots = getCodexFlatRoots()
    cachedFallbackFlatLocator ??= createFsSkillContentLocator(
      [...new Set([
        ...productionSkillContentRoots(opts).filter((root) => root !== bundledRoot && !codexFlatRoots.includes(root)),
        ...flattenPluginRoots(getClaudePluginRoots()),
      ])],
    )
    return cachedFallbackFlatLocator
  }
  const locator: SkillContentLocator = {
    async locate(skillId) {
      const colonIdx = skillId.indexOf(':')
      if (colonIdx < 0) {
        if (bundledLocator !== undefined) {
          try {
            return await bundledLocator.locate(skillId)
          } catch (e) {
            if (!(e instanceof SkillContentNotFoundError)) throw e
          }
        }
        try {
          return await getCodexFlatLocator().locate(skillId)
        } catch (e) {
          if (!(e instanceof SkillContentNotFoundError)) throw e
          return getFallbackFlatLocator().locate(skillId)
        }
      }

      const pluginName = skillId.slice(0, colonIdx)
      const leaf = skillId.slice(colonIdx + 1)
      const codexRoots = getCodexPluginRoots().get(pluginName)
      if (codexRoots !== undefined && codexRoots.length > 0) {
        try {
          const located = await createFsSkillContentLocator(codexRoots).locate(leaf)
          return { skillId, contentDir: located.contentDir }
        } catch (e) {
          if (!(e instanceof SkillContentNotFoundError)) throw e
        }
      }

      const fallbackRoots = getClaudePluginRoots().get(pluginName)
      if (fallbackRoots === undefined || fallbackRoots.length === 0) {
        throw new SkillContentNotFoundError(
          `skill '${skillId}' 的插件命名空间 '${pluginName}' 在 Codex cache 与 installed_plugins.json 中均无可用候选`,
        )
      }
      const located = await createFsSkillContentLocator(fallbackRoots).locate(leaf)
      return { skillId, contentDir: located.contentDir }
    },
  }
  return withLogicalSkillAliases(locator, aliases)
}
