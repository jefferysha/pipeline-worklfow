/**
 * scaffold 命令 —— Trellis parity 收尾（BACKLOG #33 / GOAL B16）。三/四子命令：
 *   scaffold <type> [--strategy skip|overwrite|append] [--spec-dir <dir>]
 *       按项目类型（web/cli/lib）铺分层空 spec 文档集（Trellis spec-template-scaffold ①）。
 *       三态写盘对标老仓 registry-source.sh apply_strategy（②的三态半边）。
 *   resolve-workflow <id> [--source-index <path>] [--marker] [--apply-hash] [--fallback-native]
 *       解析 workflow id（多 id + native offline-first，③）+ 可选写来源 marker + removeHash 更新契约。
 *
 * ★template-strategy-and-spec-conflict 的 AskUserQuestion 交互（②的交互半边）——lite 无交互 picker：
 *   缺省冲突（spec 目录已有文件且未显式传 strategy）→ 不弹 picker，改「信号 + 三选一指引」：
 *   读 TENON_SPEC_STRATEGY 信号（上层 AskUserQuestion 决策后注入）或 --strategy；两者皆缺且有冲突
 *   → 呈现 skip/overwrite/append 三选一指引到 stderr 后 return exit 2（对齐 reinit-fast-path 的
 *   TENON_REINIT 信号风格：shell/子-agent 语境不弹无可靠 TTY 的 picker）。
 *
 * stdout/exit 对齐仓内风格（session.ts）：数据（写入清单/解析结果）走 stdout；状态/指引/错误走 stderr。
 *   exit：成功=0；非法参数/未知 id（无 --fallback-native）/未知子命令=1；缺省冲突需决策=2（信号）。
 */
import { lstat, mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  atomicLinkPublish,
  OWNED_MANIFEST,
  parseOwnedManifest,
  serializeOwnedManifest,
} from '@tenon/kernel'
import type { DocumentLocale } from '@tenon/kernel'
import {
  DEFAULT_SPEC_DIR,
  DOC_STRATEGIES,
  PROJECT_TYPES,
  WORKFLOW_MD_REL,
  WORKFLOW_SOURCE_MARKER,
  applyWorkflowHashContract,
  buildSpecScaffold,
  isDocStrategy,
  isProjectType,
  parseWorkflowIds,
  planDocScaffold,
  resolveWorkflow,
  workflowHashAction,
  workflowSourceMarkerContent,
  type DocStrategy,
} from '@tenon/kernel'
import { splitFlags } from '../argv.js'
import { errMsg, type CliDeps } from '../deps.js'
import { ensureSafeDocumentParent, ordinaryDocumentFile } from './documentScaffoldSafety.js'
import { publishSpecScaffoldTransaction } from './specScaffoldTransaction.js'

/**
 * scaffold fs 注入面（默认真 fs；mock 层注入 fake，见 scaffold.test.ts）。
 * env 读信号（TENON_SPEC_STRATEGY）；exists/readText/writeText/rmrf 真副作用。
 */
export interface ScaffoldFs {
  exists: (abs: string) => Promise<boolean>
  readText: (abs: string) => Promise<string | undefined>
  writeText: (abs: string, content: string) => Promise<void>
  rmrf: (abs: string) => Promise<void>
  env: (name: string) => string | undefined
}

export const REAL_FS: ScaffoldFs = {
  exists: async (abs) => {
    try {
      await stat(abs)
      return true
    } catch {
      return false
    }
  },
  readText: async (abs) => {
    try {
      return await readFile(abs, 'utf8')
    } catch {
      return undefined
    }
  },
  writeText: async (abs, content) => {
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  },
  rmrf: async (abs) => {
    await rm(abs, { recursive: true, force: true }).catch(() => {})
  },
  env: (name) => process.env[name],
}

// flag 解析共享 argv.ts splitFlags。哨兵变更：旧本地 parseFlags 裸 --flag → ''（falsy），splitFlags
// 裸 → true（truthy）——凡「带值取值、否则回落默认」的消费点必须 typeof 守卫，不能再靠 || 的 falsy 回落。

const SPEC_STRATEGY_SIGNAL = 'TENON_SPEC_STRATEGY'

function safeSpecDir(cwd: string, specDir: string): boolean {
  if (isAbsolute(specDir)) return false
  const rel = relative(resolve(cwd), resolve(cwd, specDir))
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function assertExistingParentsSafe(cwd: string, target: string): Promise<void> {
  const root = resolve(cwd)
  const parent = dirname(target)
  const rel = relative(root, parent)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`scaffold 路径越过项目根: ${target}`)
  }
  let cursor = root
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    try {
      const info = await lstat(cursor)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`scaffold 父路径必须是非 symlink 目录: ${cursor}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

async function removeScaffoldFile(cwd: string, target: string): Promise<void> {
  await assertExistingParentsSafe(cwd, target)
  try {
    const info = await lstat(target)
    if (!ordinaryDocumentFile(info)) {
      throw new Error(`scaffold overwrite 目标必须是非 symlink 普通文件: ${target}`)
    }
    await unlink(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function publishScaffoldFile(cwd: string, target: string, content: string): Promise<void> {
  const parent = await ensureSafeDocumentParent(cwd, target)
  await atomicLinkPublish(parent, '.tenon-spec-scaffold.tmp', target, content)
}

/** 三选一指引（对标 reinit-fast-path 的三选一指引，替代 AskUserQuestion picker）。 */
function conflictGuidance(deps: CliDeps, specDir: string): void {
  deps.io.err(`[SPEC-CONFLICT] ${specDir} 已存在文件——需选择模板策略（缺省冲突，未弹交互 picker）：`)
  deps.io.err('  skip      —— 存在则整体不动，保留你的既有文档')
  deps.io.err('  overwrite —— 先删现存再全量重铺（丢弃既有）')
  deps.io.err('  append    —— 只补缺失文件，保留既有')
  deps.io.err(`  传参决策：--strategy <skip|overwrite|append>  或  ${SPEC_STRATEGY_SIGNAL}=<...>（上层 AskUserQuestion 后注入）`)
}

/** scaffold <type>：按类型铺分层空文档集，三态写盘。 */
async function cmdScaffoldSpec(deps: CliDeps, args: string[], fs: ScaffoldFs): Promise<number> {
  const { positional: positionals, flags } = splitFlags(args)
  const type = positionals[0]
  if (type === undefined || !isProjectType(type)) {
    deps.io.err(`ERROR: 非法 project type '${type ?? ''}'，允许: ${PROJECT_TYPES.join(' | ')}`)
    return 1
  }
  // typeof 守卫（非 || falsy）：带值取值；裸 --spec-dir（true）/缺省/空值 → 回落默认，行为同旧 '' 哨兵。
  const specDir = typeof flags['spec-dir'] === 'string' && flags['spec-dir'] !== '' ? flags['spec-dir'] : DEFAULT_SPEC_DIR
  if (!safeSpecDir(deps.cwd, specDir)) {
    deps.io.err(`ERROR: --spec-dir 必须位于项目根内: '${specDir}'`)
    return 1
  }
  if (flags['document-locale'] === true || flags['document-locale'] === '') {
    deps.io.err('ERROR: --document-locale 必须提供 zh-CN 或 en')
    return 1
  }
  const locale = typeof flags['document-locale'] === 'string' && flags['document-locale'] !== ''
    ? flags['document-locale']
    : 'zh-CN'
  if (locale !== 'zh-CN' && locale !== 'en') {
    deps.io.err(`ERROR: document locale 非法: '${locale}'（允许: zh-CN | en）`)
    return 1
  }
  // 策略信号：--strategy > TENON_SPEC_STRATEGY env > 未定（裸 --strategy 视同未给，回落 env——同旧行为）
  const rawStrategy =
    typeof flags['strategy'] === 'string' && flags['strategy'] !== '' ? flags['strategy'] : fs.env(SPEC_STRATEGY_SIGNAL) || ''
  const files = buildSpecScaffold(type, specDir, locale as DocumentLocale)
  const abs = (rel: string) => resolve(deps.cwd, rel)

  // 探测冲突（哪些目标已存在）
  const existing = new Set<string>()
  for (const f of files) {
    if (fs === REAL_FS) {
      try {
        const target = abs(f.rel)
        await assertExistingParentsSafe(deps.cwd, target)
        try {
          const info = await lstat(target)
          if (!ordinaryDocumentFile(info)) {
            throw new Error(`scaffold 目标必须是非 symlink 普通文件: ${target}`)
          }
          existing.add(f.rel)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      } catch (error) {
        deps.io.err(`ERROR: scaffold 路径不安全: ${errMsg(error)}`)
        return 1
      }
      continue
    }
    if (await fs.exists(abs(f.rel))) existing.add(f.rel)
  }

  let strategy: DocStrategy
  if (rawStrategy === '') {
    if (existing.size > 0) {
      // 缺省冲突 + 无策略信号 → 三选一指引 + exit 2（AskUserQuestion 替代信号）
      conflictGuidance(deps, specDir)
      return 2
    }
    strategy = 'skip' // 无冲突 → 任意策略等价，取 skip（全量写）
  } else {
    if (!isDocStrategy(rawStrategy)) {
      deps.io.err(`ERROR: 非法 strategy '${rawStrategy}'，允许: ${DOC_STRATEGIES.join(' | ')}`)
      return 1
    }
    strategy = rawStrategy
  }

  const plan = planDocScaffold(files, existing, strategy)
  try {
    if (fs === REAL_FS && strategy === 'overwrite') {
      const specRoot = resolve(deps.cwd, specDir)
      await publishSpecScaffoldTransaction({
        repoRoot: deps.cwd,
        specDirectory: specRoot,
        files: plan.writes.map((file) => ({
          relativePath: relative(specRoot, abs(file.rel)),
          content: file.content,
        })),
      })
    } else if (fs === REAL_FS) {
      for (const rel of plan.removes) await removeScaffoldFile(deps.cwd, abs(rel))
      for (const f of plan.writes) await publishScaffoldFile(deps.cwd, abs(f.rel), f.content)
    } else {
      for (const rel of plan.removes) await fs.rmrf(abs(rel))
      for (const f of plan.writes) await fs.writeText(abs(f.rel), f.content)
    }
  } catch (e) {
    deps.io.err(`ERROR: scaffold 写盘失败: ${errMsg(e)}`)
    return 1
  }

  if (plan.skippedAll) {
    deps.io.err(`[SCAFFOLD] skip：${specDir} 已有文档，保留 ${plan.skipped.length} 项、未写入（strategy=skip）`)
    return 0
  }
  for (const f of plan.writes) deps.io.out(f.rel)
  deps.io.err(
    `[SCAFFOLD] ${type}：写入 ${plan.writes.length} 项` +
      (plan.removes.length ? `（覆盖删 ${plan.removes.length}）` : '') +
      (plan.skipped.length ? `，保留既有 ${plan.skipped.length}` : '') +
      `（strategy=${strategy}, spec-dir=${specDir}）`,
  )
  return 0
}

/** resolve-workflow <id>：多 id 解析 + 可选 marker + removeHash 契约。 */
async function cmdResolveWorkflow(deps: CliDeps, args: string[], fs: ScaffoldFs): Promise<number> {
  const { positional: positionals, flags } = splitFlags(args)
  const requested = positionals[0]
  const abs = (rel: string) => join(deps.cwd, rel)

  // 源索引（本地文件，无网络）→ 多 workflow id。裸 --source-index（true）折叠为 undefined：
  // 旧 '' 哨兵同样 falsy 跳读；marker 内容 `source ?? ''` 下 '' 与 undefined 同字节——行为不变。
  let available: string[] = []
  const sourceIdx = typeof flags['source-index'] === 'string' ? flags['source-index'] : undefined
  if (sourceIdx) {
    const text = await fs.readText(abs(sourceIdx))
    if (text === undefined) {
      deps.io.err(`ERROR: source index 不存在: ${sourceIdx}`)
      return 1
    }
    available = parseWorkflowIds(text)
  }

  let res = resolveWorkflow(requested, available)
  if (!res.ok) {
    if ('fallback-native' in flags) {
      deps.io.err(`[WORKFLOW] ${res.error} → 降级 native（--fallback-native）`)
      res = resolveWorkflow('native', available)
    } else {
      deps.io.err(`ERROR: ${res.error}`)
      return 1
    }
  }
  if (!res.ok) {
    // 理论不可达（native 恒解析成功）；防御
    deps.io.err(`ERROR: ${res.error}`)
    return 1
  }

  // 数据 → stdout：解析结果 + hash 契约动作
  const action = workflowHashAction(res.isNative)
  deps.io.out(`id=${res.id}`)
  deps.io.out(`native=${res.isNative}`)
  deps.io.out(`source=${res.source}`)
  deps.io.out(`hash-contract=${action}`)

  // 可选：写来源 marker（升级不还原 native 的可见信号）
  if ('marker' in flags && !res.isNative) {
    try {
      await fs.writeText(abs(WORKFLOW_SOURCE_MARKER), workflowSourceMarkerContent(res.id, sourceIdx, deps.clock()))
      deps.io.err(`[WORKFLOW] 写来源 marker ${WORKFLOW_SOURCE_MARKER}（id=${res.id}）`)
    } catch (e) {
      deps.io.err(`[WORKFLOW] marker 写入失败（degraded）: ${errMsg(e)}`)
    }
  }

  // 可选：removeHash 更新契约落到 .pipeline-owned.json（native 记 hash / 非 native 删条目）
  if ('apply-hash' in flags) {
    try {
      const manifestAbs = abs(OWNED_MANIFEST)
      const text = await fs.readText(manifestAbs)
      const map = text === undefined ? {} : parseOwnedManifest(text)
      const workflowContent = res.isNative ? await fs.readText(abs(WORKFLOW_MD_REL)) : undefined
      const next = applyWorkflowHashContract(map, WORKFLOW_MD_REL, res.isNative, workflowContent)
      await fs.writeText(manifestAbs, serializeOwnedManifest(next))
      deps.io.err(`[WORKFLOW] hash 契约已落盘（${action} ${WORKFLOW_MD_REL} in ${OWNED_MANIFEST}）`)
    } catch (e) {
      deps.io.err(`[WORKFLOW] hash 契约落盘失败（degraded）: ${errMsg(e)}`)
    }
  }
  return 0
}

/**
 * scaffold 子命令分派（纯函数 + deps 注入，风格同 session.ts）。
 * fs 缺省真 fs（integration 走真路径）；mock 层注入 fake ScaffoldFs 快速回归。
 */
export async function cmdScaffold(
  deps: CliDeps,
  sub: string,
  args: string[],
  fs: ScaffoldFs = REAL_FS,
): Promise<number> {
  switch (sub) {
    case 'scaffold':
    case 'spec': // 别名（更可读的顶层命名）
      return cmdScaffoldSpec(deps, args, fs)
    case 'resolve-workflow':
      return cmdResolveWorkflow(deps, args, fs)
    default:
      deps.io.err(`ERROR: 未知 scaffold 子命令: ${sub}（支持: scaffold resolve-workflow）`)
      return 1
  }
}
