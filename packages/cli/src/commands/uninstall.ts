/**
 * uninstall 命令 —— 安全卸载 + 所有权 scrubber（BACKLOG #24，对标老仓 pipeline-uninstall.sh）。
 * 真相源 = .pipeline-owned.json（path→hash）；只删清单内文件、绝不盲扫用户运行时数据目录。
 * 语义盘点与老仓行号见 kernel/src/state/ownership.ts 顶注（D 段）。
 *
 * lite 流程（对齐老仓 cmd_uninstall，adaptation 诚实标注）：
 *   前置0 homedir 守卫：cwd==$HOME 且无旁路 → HARD STOP exit 1（先于任何写删）。
 *   前置1 未安装幂等：无 .pipeline-owned.json → exit 0（lite 无 .pipeline/ 工作流树，清单是唯一安装 marker）。
 *   前置2 损坏硬失败：清单存在但空/0 键 → exit 1（拒绝盲删，与前置1 退出码区分）。
 *   prune：known=清单自身（老仓 R14 纪律：record 有节制、清单即权威）→ 退化为 AGENTS.md 哨兵去毒 + .pipeline 恒留。
 *   build plan：不透明 unmodified→删 / user-modified→保留（★lite hash 升格删除决策）；
 *               结构化 nested/flat→scrub 写回（剥空转整删）；stub kind→保留+标注（fail-safe，降级可见 B8）；
 *               磁盘缺失→missing 跳过。
 *   render：删/改/保留/stub/missing 五分（前四 stdout，状态 stderr）。
 *   dry-run：render 后 exit 0，不动文件。
 *   confirm：非 dry-run 必须 --yes（fail-closed，等价老仓非 TTY 分支）。
 *   execute：写回 mods → unlink dels → rm -rf .pipeline（存在才） → cleanup 空受管子目录 → final_pass 删空根。
 *   finalize：删 .pipeline-owned.json + .pipeline-version（lite 元数据收尾，卸载后不留残清单）。
 */
import {
  AGENTS_MD,
  OWNED_MANIFEST,
  VERSION_FILE,
  WORKFLOW_DIR,
  createOwnedFs,
  isManagedPath,
  isManagedRootDir,
  isOwnedModified,
  isStubScrubKind,
  parseOwnedManifest,
  pruneOwnedManifest,
  readOwnedManifestText,
  saveOwnedManifest,
  scrubStructured,
  structuredKindForKey,
  type OwnedFs,
} from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'

export interface UninstallOpts {
  yes?: boolean
  dryRun?: boolean
}

interface Modification { key: string; content: string; reason: string }
interface Note { key: string; reason: string }

interface UninstallPlan {
  deletions: string[] // present 整删（不透明 unmodified / 结构化剥空）
  modifications: Modification[] // 结构化 scrub 写回
  preserved: Note[] // user-modified 不透明 → 保留
  stubbed: Note[] // 诚实 stub kind → 保留（降级可见）
  missing: string[] // 清单内但磁盘缺失 → 跳过
}

const norm = (p: string): string => p.replace(/\/+$/, '')
const posix = (cwd: string, key: string): string => `${norm(cwd)}/${key}`

const REASON_FOR_KIND: Record<string, string> = {
  nested: 'Strip pipeline hooks; preserve user fields',
  flat: 'Strip pipeline hooks; preserve user fields',
}

/** 从（剪后）清单建计划（老仓 build_uninstall_plan:283-339，lite hash 升格删除决策）。 */
async function buildPlan(fs: OwnedFs, cwd: string, kept: Record<string, string>): Promise<UninstallPlan> {
  const plan: UninstallPlan = { deletions: [], modifications: [], preserved: [], stubbed: [], missing: [] }
  // hooks 命令末位 token 匹配用的 deleted_paths = 清单内非 .pipeline 键。
  const deletedPaths = Object.keys(kept).filter((k) => k !== WORKFLOW_DIR && !k.startsWith(`${WORKFLOW_DIR}/`))

  for (const [key, hash] of Object.entries(kept)) {
    if (key === WORKFLOW_DIR || key.startsWith(`${WORKFLOW_DIR}/`)) continue // .pipeline/ 走整删
    const abs = posix(cwd, key)
    const content = await fs.readText(abs)
    if (content === undefined) {
      if (await fs.exists(abs)) plan.preserved.push({ key, reason: 'unreadable — conservatively preserved' })
      else plan.missing.push(key)
      continue
    }
    const kind = structuredKindForKey(key)
    if (kind === null) {
      // 不透明文件：unmodified → 删；user-modified → 保留（★lite hash 升格删除决策）。
      if (isOwnedModified(content, hash)) plan.preserved.push({ key, reason: 'user-modified' })
      else plan.deletions.push(key)
      continue
    }
    if (isStubScrubKind(kind)) {
      // 诚实 stub（opencode/pi/codex/tap）：保守保留、标注（fail-safe，降级可见 B8）。
      plan.stubbed.push({ key, reason: `scrubber not implemented in lite (honest stub: ${kind})` })
      continue
    }
    const { content: scrubbed, fullyEmpty } = scrubStructured(kind, content, deletedPaths)
    if (fullyEmpty) plan.deletions.push(key)
    else plan.modifications.push({ key, content: scrubbed, reason: REASON_FOR_KIND[kind] ?? 'Strip pipeline entries' })
  }
  return plan
}

/** render 计划（老仓 render_uninstall_plan:348-379 + lite preserved/stub 两栏，降级可见 B8）。 */
async function renderPlan(deps: CliDeps, fs: OwnedFs, cwd: string, plan: UninstallPlan): Promise<void> {
  const hasWorkflow = await fs.isDir(posix(cwd, WORKFLOW_DIR))
  const nDel = plan.deletions.length + (hasWorkflow ? 1 : 0)
  deps.io.out(`Will be deleted (${nDel} entries):`)
  for (const k of plan.deletions) deps.io.out(`  - ${k}`)
  if (hasWorkflow) deps.io.out(`  - ${WORKFLOW_DIR}/  (entire directory)`)

  if (plan.modifications.length > 0) {
    deps.io.out(`Will be modified (${plan.modifications.length} files):`)
    for (const m of plan.modifications) deps.io.out(`  ~ ${m.key}  (${m.reason})`)
  }
  if (plan.preserved.length > 0) {
    deps.io.out(`Preserved / kept (${plan.preserved.length}):`)
    for (const p of plan.preserved) deps.io.out(`  = ${p.key}  (${p.reason})`)
  }
  if (plan.stubbed.length > 0) {
    // 降级可见（GOAL B8）：明示哪些卸载面此刻未生效（诚实 stub）。
    deps.io.out(`Skipped — scrubber stub not implemented in lite (${plan.stubbed.length}):`)
    for (const s of plan.stubbed) deps.io.out(`  ? ${s.key}  (${s.reason})`)
  }
  if (plan.missing.length > 0) {
    deps.io.out(`(${plan.missing.length} manifest entries already missing on disk — skipped.)`)
  }
}

interface ExecResult { deletedFiles: number; modifiedFiles: number; deletedDirs: number }

/** 双守卫递归 rmdir 空受管子目录（老仓 cleanup_empty_dirs:411-425；不计 deletedDirs）。 */
async function cleanupEmptyDirs(fs: OwnedFs, cwd: string, dir: string): Promise<void> {
  if (!dir || dir === '.') return
  if (!isManagedPath(dir)) return // 守卫1：树外拒绝
  if (isManagedRootDir(dir)) return // 守卫2：平台根拒绝
  const abs = posix(cwd, dir)
  if (!(await fs.isDir(abs))) return
  if ((await fs.listDir(abs)).length !== 0) return
  if (!(await fs.rmdirEmpty(abs))) return
  const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '.'
  if (parent !== '.' && parent !== dir && !isManagedRootDir(parent)) await cleanupEmptyDirs(fs, cwd, parent)
}

/** 删空平台根（老仓 final_pass_remove_empty_roots:433-458；段数降序、每 rmdir 计 deletedDirs）。 */
async function finalPassRemoveEmptyRoots(fs: OwnedFs, cwd: string): Promise<number> {
  let dirs = 0
  const managed = ['.pipeline', '.claude', '.codex', '.agents', '.agents/skills']
    .filter((d) => d !== WORKFLOW_DIR) // .pipeline 已 rm -rf
    .sort((a, b) => b.split('/').length - a.split('/').length) // 段数降序
  for (const md of managed) {
    const abs = posix(cwd, md)
    if (!(await fs.isDir(abs))) continue
    if ((await fs.listDir(abs)).length !== 0) continue
    if (!(await fs.rmdirEmpty(abs))) continue
    dirs++
    let parent = md.includes('/') ? md.slice(0, md.lastIndexOf('/')) : '.'
    while (parent !== '.' && parent) {
      const pabs = posix(cwd, parent)
      if (!(await fs.exists(pabs))) break
      if ((await fs.listDir(pabs)).length !== 0) break
      if (!(await fs.rmdirEmpty(pabs))) break
      dirs++
      parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '.'
    }
  }
  return dirs
}

/** 执行计划（老仓 execute_uninstall_plan:487-535，五步严格保序）。 */
async function executePlan(fs: OwnedFs, cwd: string, plan: UninstallPlan): Promise<ExecResult> {
  const res: ExecResult = { deletedFiles: 0, modifiedFiles: 0, deletedDirs: 0 }
  // Step1：写回 mods（最先，保用户数据）。
  for (const m of plan.modifications) {
    await fs.writeText(posix(cwd, m.key), m.content)
    res.modifiedFiles++
  }
  // Step2：unlink present deletions（per-file best-effort；收父目录供 step4）。
  const dirCandidates = new Set<string>()
  for (const key of plan.deletions) {
    const abs = posix(cwd, key)
    if (!(await fs.exists(abs))) continue
    if (await fs.unlink(abs)) {
      res.deletedFiles++
      if (key.includes('/')) dirCandidates.add(key.slice(0, key.lastIndexOf('/')))
    }
  }
  // Step3：rm -rf .pipeline（存在才；计 1 个 dir）。
  const wfAbs = posix(cwd, WORKFLOW_DIR)
  if (await fs.exists(wfAbs)) {
    await fs.rmrf(wfAbs)
    res.deletedDirs++
  }
  // Step4：cleanup 空受管子目录（双守卫；不计 dir）。
  for (const dp of [...dirCandidates].sort()) await cleanupEmptyDirs(fs, cwd, dp)
  // Step5：删空平台根（计 dir）。
  res.deletedDirs += await finalPassRemoveEmptyRoots(fs, cwd)
  return res
}

/**
 * uninstall 主入口（纯函数 + deps 注入 + OwnedFs 注入，风格同 task.ts）。
 * fs 缺省真 node:fs（integration 走真路径）；mock 层注入 fake 快速回归。
 */
export async function cmdUninstall(deps: CliDeps, opts: UninstallOpts, fs: OwnedFs = createOwnedFs()): Promise<number> {
  const cwd = deps.cwd

  // 前置0：homedir 守卫（先于任何写删）。
  if (norm(cwd) === norm(fs.homeDir()) && !fs.homedirBypass()) {
    deps.io.err('[uninstall] HARD STOP: 拒绝在 $HOME 根卸载（会牵连 ~ 的运行时数据）。PIPELINE_ALLOW_HOMEDIR=1 严格旁路。')
    return 1
  }

  // 前置1：未安装幂等（清单不存在）。
  let manifestText: string | undefined
  try {
    manifestText = await readOwnedManifestText(fs, cwd)
  } catch (e) {
    deps.io.err(`[uninstall] 读清单失败: ${errMsg(e)}`)
    return 1
  }
  if (manifestText === undefined) {
    deps.io.err(`[uninstall] pipeline 未安装于此目录（无 ${OWNED_MANIFEST}）——无需卸载。`)
    return 0
  }

  // 前置2：损坏/空硬失败（键数 < 1）。
  const manifest = parseOwnedManifest(manifestText)
  if (manifestText.trim() === '' || Object.keys(manifest).length === 0) {
    deps.io.err(`[uninstall] 所有权清单无有效条目（空对象/损坏）: ${OWNED_MANIFEST}——拒绝盲删。`)
    return 1
  }

  // prune：known=清单自身（老仓 R14 纪律）；AGENTS.md 哨兵去毒 + .pipeline 恒留。
  const agentsMdContent = await fs.readText(posix(cwd, AGENTS_MD))
  const { kept, pruned } = pruneOwnedManifest(manifest, {
    knownKeys: Object.keys(manifest),
    agentsMdContent,
  })
  if (pruned.length > 0) {
    deps.io.err(`[uninstall] 剪除 ${pruned.length} 条孤儿清单项（去毒中毒清单）: ${pruned.join(', ')}`)
    if (!opts.dryRun) await saveOwnedManifest(fs, cwd, kept)
  }

  // build + render。
  const plan = await buildPlan(fs, cwd, kept)
  await renderPlan(deps, fs, cwd, plan)

  // dry-run 短路。
  if (opts.dryRun) {
    deps.io.err('[uninstall] Dry run — 未修改任何文件。')
    return 0
  }

  // confirm（fail-closed，等价老仓非 TTY 分支）。
  if (!opts.yes) {
    deps.io.err('[uninstall] 需 --yes/-y 确认卸载（脚本/非交互环境必需），或 --dry-run 预览——拒绝无确认删除。')
    return 1
  }

  // execute + finalize。
  const res = await executePlan(fs, cwd, plan)
  // finalize：删 lite 元数据（卸载后不留残清单/版本戳）。
  await fs.unlink(posix(cwd, OWNED_MANIFEST))
  await fs.unlink(posix(cwd, VERSION_FILE))

  deps.io.out(
    `[uninstall] 卸载完成：${res.deletedFiles} files deleted, ${res.modifiedFiles} files modified, ` +
      `${res.deletedDirs} directories removed, ${plan.preserved.length} preserved, ${plan.stubbed.length} stub-skipped.`,
  )
  return 0
}
