/**
 * ownership.ts —— 所有权 hash 追踪 + 版本协调纯逻辑（sync/uninstall 子系统内核，BACKLOG #24）。
 * kernel 零第三方依赖（仅 node:crypto 内建，同 history.ts 用 node:fs）。fs 副作用经注入面 OwnedFs。
 *
 * ═══ 老仓语义盘点（真相源逐处，行号为老仓 workflow-plugin/skills/pipeline/scripts/*）═══
 *
 * A. 所有权清单 .pipeline-owned.json（state-write-record.sh，命名对齐 Trellis .template-hashes.json）
 *   ⓪ 清单是 path→contentHash **对象**（非裸路径数组，§0 承重半边，state-write-record.sh:14-19）——
 *      hash 是 uninstall「用户是否改过」判定的承重半边；丢 hash 即丢「保留用户改动」能力。
 *   ① key = POSIX 相对路径；越界（.. 开头 / 绝对）一律丢（record_write ②③，:162-165）。
 *   ② 字节相同→不写不记；skip→不记；append→不记；只有新建/覆盖才记（write_owned_file §B:198-243）。
 *   ③ 幂等 + last-wins：同 key 多次取最后一条（initialize_owned_manifest:266，_emit_owned_json:308-329）。
 *   ④ merge=true(re-init)：并集、同 key 新写覆盖旧 hash；merge=false(主 init)：全量重建（:268-270）。
 *   ⑤ content hash = compute_hash：先 CRLF→LF（**只**替 \r\n、保裸 \r 的 Mac-classic 语义）再 SHA256
 *      小写 hexdigest（template-hash.py compute_hash:71-81 / _compute_owned_hash:82-107）。
 *   ⑥ parse 兼容 legacy 裸数组：value 落空串（uninstall 保守判改过、保留，_read_owned_manifest_pairs:295-306）。
 *
 * B. 用户是否改过 is_template_modified（state-write-record.sh:114-120）
 *   · 文件不存在 → false（非 modified，走 user-deleted 别处，不重建）。
 *   · stored 空 → true（无基线保守判改过 → 保留，绝不误删用户数据）。
 *   · else → computeContentHash(current) != stored。
 *
 * C. 五桶分类 analyze_changes（template-hash.py:325-360）：new / unchanged / auto_update / changed /
 *    user_deleted（静默闸：无文件但有 hash → 尊重删除、不重建、零副作用）。not stored 默认 changed（保守）。
 *
 * D. uninstall（pipeline-uninstall.sh）
 *   · 真相源 = .pipeline-owned.json；只删清单内文件、绝不盲扫 .codex/.claude/（:8-12）。
 *   · prune 四规则（manifest_prune_orphans:109-162 / update-upgrade.py:285-333）：①.pipeline/* 恒留；
 *     ②AGENTS.md 双哨兵 START AND END 才剥离（_should_keep_agents_md:79-91）；③迁移 from/to 保留；
 *     ④余项在 known 集保留否则剪。
 *   · 结构化 vs 不透明二分（_structured_kind_for_key:211-224）：hooks.json/settings.json→scrub 剥条目；
 *     其余整删。scrubber 内核 uninstall-scrubbers.py：nested/flat 真剥离；opencode/pi/codex/tap = stub。
 *   · 受管目录守卫 is_managed_path/is_managed_root_dir（:391-405）；ALL_MANAGED_DIRS（:65）。
 *
 *   ★lite 改进（诚实标注 · 对老仓的偏离）：老仓 uninstall「清单内文件一律删」（不看 hash，:11）；
 *     hash 仅用于 AGENTS.md prune + scrubber 展示。lite 把 hash **升格为删除决策**（对齐 Trellis
 *     isTemplateModified 的本意、state-write-record.sh §0 的承重半边宣称、BACKLOG #24「用户改过的保留」）：
 *     不透明文件 unmodified→删、modified→保留。这是 GOAL「迁移≠平移」的改进承诺，非阉割。
 *
 * E. 版本协调（update-upgrade.py + template-hash.py compare_versions:218-295）
 *   · compare_versions semver+预发布（连字符标识符不误切、无预发布 > 有预发布、数字标识符 < 字符串）。
 *   · unknown 一等态：get_installed_version 缺 → 'unknown'；任何真实版 > unknown（:391-410）。
 *   · guard_downgrade（:150-184）：cli<project 无 allow → reject/proceed=false；有 allow → downgrade。
 *   · should_inject_config_sections（:191-200）：仅 cli>project ∧ project≠unknown。
 *   · migrate_gate_decision（:207-247）：pending>0 ∧ !migrate ∧ cli>project ∧ ≠unknown 进 breaking 判定；
 *     breaking∧recommend → required/exit1（硬闸不可降级为提示）；否则 tip/exit0。
 *   · needs_codex_upgrade（:340-356）：.codex 存在→false；否则裸 manifest 含 codex-only marker→true。
 *   · banner_nudge（:363-398）：纯本地比对、零网络；cli>project→update / cli<project→upgrade / else null。
 *   · derive_upgrade_channel（:81-98）：-beta→beta / -rc→rc（beta 先判）/ else latest；显式 tag 校验 NPM_TAG_RE。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// ════════════════════════════════════════════════════════════════════════════
// 常量
// ════════════════════════════════════════════════════════════════════════════
export const OWNED_MANIFEST = '.pipeline-owned.json'
export const VERSION_FILE = '.pipeline-version'
export const WORKFLOW_DIR = '.pipeline'
export const AGENTS_MD = 'AGENTS.md'
export const MANAGED_BLOCK_START = '<!-- PIPELINE:START -->'
export const MANAGED_BLOCK_END = '<!-- PIPELINE:END -->'
export const UNKNOWN_VERSION = 'unknown'
export const PLUGIN_KEY = 'pipeline-workflow@pipeline-workflow'

/** 受管目录全集（老仓 ALL_MANAGED_DIRS uninstall.sh:65）——cleanup/final_pass 双守卫单一数据源。 */
export const ALL_MANAGED_DIRS = ['.pipeline', '.claude', '.codex', '.agents', '.agents/skills'] as const

/** codex-only marker（老仓 CODEX_UPGRADE_MARKERS update-upgrade.py:66-69）。 */
export const CODEX_UPGRADE_MARKERS = [
  '.agents/skills/pipeline-continue/SKILL.md',
  '.agents/skills/pipeline-finish-work/SKILL.md',
] as const

/** npm dist-tag 合法字符集（老仓 NPM_TAG_RE:60）。 */
const NPM_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// ════════════════════════════════════════════════════════════════════════════
// A. content hash + key 归一
// ════════════════════════════════════════════════════════════════════════════

/** SHA256(CRLF→LF 归一后)，小写 hex（老仓 compute_hash:71-81）。只替 \r\n，保裸 \r。 */
export function computeContentHash(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * POSIX 相对 key 归一 + 越界守卫（老仓 record_write ②③ + _rel_to_root:171-196）。
 * 反斜杠→正斜杠、词法规整 ./ 与 ..；绝对 / 越界（.. 逃逸）/ 空 → undefined（uninstall 永不删 cwd 外）。
 */
export function normalizeOwnedKey(rel: string): string | undefined {
  if (!rel) return undefined
  const posix = rel.replace(/\\/g, '/')
  if (posix.startsWith('/')) return undefined // 绝对
  const out: string[] = []
  for (const seg of posix.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return undefined // 逃逸 cwd → 丢
      out.pop()
      continue
    }
    out.push(seg)
  }
  if (out.length === 0) return undefined
  return out.join('/')
}

// ════════════════════════════════════════════════════════════════════════════
// B. 清单读写 + 记录 + merge
// ════════════════════════════════════════════════════════════════════════════

/** 解析 .pipeline-owned.json → path→hash 对象。兼容 legacy 裸数组（hash 空串）；malformed → {}。 */
export function parseOwnedManifest(text: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (Array.isArray(parsed)) {
    // legacy 裸路径数组 → 各 key hash 空串（无基线，uninstall 保守保留）。
    const out: Record<string, string> = {}
    for (const p of parsed) if (typeof p === 'string' && p) out[p] = ''
    return out
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = typeof v === 'string' ? v : ''
  }
  return out
}

/** 序列化为确定性 JSON（key 排序 + 2 空格缩进 + 尾换行）；空对象 → {}\n。 */
export function serializeOwnedManifest(map: Record<string, string>): string {
  const sorted: Record<string, string> = {}
  for (const k of Object.keys(map).sort()) sorted[k] = map[k] ?? ''
  return `${JSON.stringify(sorted, null, 2)}\n`
}

/** 记一条写入 key→hash（越界丢；同 key last-wins）。返回新 map（纯，不改入参）。 */
export function recordOwned(map: Record<string, string>, rel: string, hash: string): Record<string, string> {
  const key = normalizeOwnedKey(rel)
  if (key === undefined) return { ...map }
  return { ...map, [key]: hash }
}

/** 从写入列表（rel + 落盘内容）构建清单（真算 content hash，last-wins）。 */
export function buildOwnedManifest(writes: ReadonlyArray<{ rel: string; content: string }>): Record<string, string> {
  let m: Record<string, string> = {}
  for (const w of writes) m = recordOwned(m, w.rel, computeContentHash(w.content))
  return m
}

/** 并集 merge（incoming 同 key 覆盖 base，老仓 merge=true re-init:268-270）。 */
export function mergeOwned(base: Record<string, string>, incoming: Record<string, string>): Record<string, string> {
  return { ...base, ...incoming }
}

// ════════════════════════════════════════════════════════════════════════════
// C. 用户是否改过 + 五桶分类
// ════════════════════════════════════════════════════════════════════════════

/** is_template_modified 承重谓词（老仓:114-120）。current undefined→false；stored 空→true；else 比 hash。 */
export function isOwnedModified(currentContent: string | undefined, storedHash: string | undefined): boolean {
  if (currentContent === undefined) return false // 文件不存在 → 走 user-deleted 别处
  if (!storedHash) return true // 无基线 → 保守判改过（保留）
  return computeContentHash(currentContent) !== storedHash
}

export type OwnedBucket = 'new' | 'unchanged' | 'auto_update' | 'changed' | 'user_deleted'

/** 单条五桶分类（老仓 analyze_changes:325-360）。fileContent undefined = 文件不存在。 */
export function classifyOwned(opts: {
  fileContent?: string
  templateContent?: string
  storedHash?: string
}): OwnedBucket {
  const { fileContent, templateContent, storedHash } = opts
  if (fileContent === undefined) {
    return storedHash ? 'user_deleted' : 'new' // 静默闸 vs 全新
  }
  if (fileContent === templateContent) return 'unchanged'
  const current = computeContentHash(fileContent)
  if (storedHash && storedHash === current) return 'auto_update' // 用户没动 → 安全自动更新
  return 'changed' // 用户改过 / 无 hash → 保守需确认
}

// ════════════════════════════════════════════════════════════════════════════
// D. AGENTS.md 托管 + prune 四规则
// ════════════════════════════════════════════════════════════════════════════

/** START AND END 双哨兵都在 → 托管（老仓 is_managed_agents 判据）。 */
export function isManagedAgentsMd(content: string | undefined): boolean {
  if (content === undefined) return false
  return content.includes(MANAGED_BLOCK_START) && content.includes(MANAGED_BLOCK_END)
}

/**
 * prune 阶段 AGENTS.md 保留判定（老仓 _should_keep_agents_md uninstall.sh:79-91 / update-upgrade.py:269-282）。
 * 不在磁盘（undefined）→ keep（true）；双哨兵 → keep；否则（用户自带/单哨兵）→ prune（false）。
 */
export function shouldKeepAgentsMd(content: string | undefined): boolean {
  if (content === undefined) return true // 不在磁盘 / 读失败 → 保守 keep
  return isManagedAgentsMd(content)
}

/**
 * prune 孤儿清单键（老仓四规则 manifest_prune_orphans:109-162 / prune_orphan_manifest_keys:285-333）。
 * ①.pipeline/* 与 .pipeline 恒留 ②AGENTS.md 双哨兵才剥离 ③迁移 from/to 保留 ④余项 in known 保留否则剪。
 */
export function pruneOwnedManifest(
  map: Record<string, string>,
  opts: {
    knownKeys?: readonly string[]
    migrationPaths?: readonly string[]
    workflowDir?: string
    agentsMdContent?: string
  },
): { kept: Record<string, string>; pruned: string[] } {
  const wf = opts.workflowDir ?? WORKFLOW_DIR
  const known = new Set<string>()
  for (const k of opts.knownKeys ?? []) { const n = normalizeOwnedKey(k); if (n) known.add(n) }
  for (const m of opts.migrationPaths ?? []) { const n = normalizeOwnedKey(m); if (n) known.add(n) }

  const kept: Record<string, string> = {}
  const pruned: string[] = []
  for (const [key, val] of Object.entries(map)) {
    if (key === wf || key.startsWith(`${wf}/`)) { kept[key] = val; continue } // 规则1
    if (key === AGENTS_MD) { // 规则3（AGENTS.md 特判）
      if (shouldKeepAgentsMd(opts.agentsMdContent)) kept[key] = val
      else pruned.push(key)
      continue
    }
    if (known.has(key)) kept[key] = val // 规则2/4
    else pruned.push(key)
  }
  return { kept, pruned }
}

// ════════════════════════════════════════════════════════════════════════════
// E. 结构化文件分发 + hooks scrubber
// ════════════════════════════════════════════════════════════════════════════

export type StructuredKind = 'nested' | 'flat' | 'opencode-package' | 'pi-settings' | 'codex-config' | 'tap-cleanup'

/** 结构化文件 kind 分发（老仓 _structured_kind_for_key:211-224）。命不中 → null（= 不透明整删）。 */
export function structuredKindForKey(key: string): StructuredKind | null {
  switch (key) {
    case '.cursor/hooks.json':
    case '.github/copilot/hooks.json':
      return 'flat'
    case '.opencode/package.json':
      return 'opencode-package'
    case '.pi/settings.json':
      return 'pi-settings'
    case '.codex/config.toml':
      return 'codex-config'
  }
  if (key === 'hooks.json' || key.endsWith('/hooks.json') || key === 'settings.json' || key.endsWith('/settings.json')) {
    return 'nested' // CC/codex 平台 schema 兜底
  }
  return null
}

/** hook 命令末位 token 去引号 === p 或 endsWith("/"+p)（老仓:46-68，绝不 substring）。 */
export function commandMatchesDeletedPath(command: unknown, deletedPaths: readonly string[]): boolean {
  if (typeof command !== 'string') return false
  const trimmed = command.trim()
  if (!trimmed) return false
  const tokens = trimmed.split(/\s+/)
  const last = (tokens[tokens.length - 1] ?? '').replace(/^["']+|["']+$/g, '')
  if (!last) return false
  for (const p of deletedPaths) {
    if (!p) continue
    if (last === p || last.endsWith(`/${p}`)) return true
  }
  return false
}

/** 从 hook entry 取命令：command → bash → powershell（老仓 get_entry_command:71-87）。 */
function entryCommand(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const e = entry as Record<string, unknown>
  for (const k of ['command', 'bash', 'powershell']) {
    if (typeof e[k] === 'string') return e[k] as string
  }
  return undefined
}

export interface ScrubResult { content: string; fullyEmpty: boolean }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** JSON 回写：indent=2 + 尾换行（老仓 _dump:336-337）。 */
function dumpJson(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`
}

function scrubHooks(content: string, deletedPaths: readonly string[], mode: 'nested' | 'flat'): ScrubResult {
  let root: unknown
  try {
    root = JSON.parse(content)
  } catch {
    return { content, fullyEmpty: false } // malformed → 原文不动
  }
  if (!isPlainObject(root)) return { content, fullyEmpty: false }

  const hooksObj = root.hooks
  if (hooksObj === undefined) {
    return { content: dumpJson(root), fullyEmpty: Object.keys(root).length === 0 }
  }
  if (!isPlainObject(hooksObj)) return { content, fullyEmpty: false } // hooks 形状异常 → 不动

  for (const eventName of Object.keys(hooksObj)) {
    const arr = hooksObj[eventName]
    if (!Array.isArray(arr)) continue // event 形状异常 → 保留
    const filtered: unknown[] = []
    for (const entry of arr) {
      if (mode === 'nested') {
        const kept = scrubNestedMatcher(entry, deletedPaths)
        if (kept !== null) filtered.push(kept)
      } else {
        const cmd = entryCommand(entry)
        if (!(cmd !== undefined && commandMatchesDeletedPath(cmd, deletedPaths))) filtered.push(entry)
      }
    }
    if (filtered.length === 0) delete hooksObj[eventName] // event 空 → 删
    else hooksObj[eventName] = filtered
  }
  if (Object.keys(hooksObj).length === 0) delete root.hooks // hooks 全空 → 删顶层键

  return { content: dumpJson(root), fullyEmpty: Object.keys(root).length === 0 }
}

/** nested 第 2 层 matcher block { matcher?, hooks:[...] }。返回保留后 block 或 null（应丢弃）。 */
function scrubNestedMatcher(entry: unknown, deletedPaths: readonly string[]): unknown | null {
  if (!isPlainObject(entry)) return entry // 异常形状原样保留
  const inner = entry.hooks
  if (!Array.isArray(inner)) return entry // 无 hooks 数组 → 原样保留
  const filtered = inner.filter((sub) => {
    const cmd = entryCommand(sub)
    return !(cmd !== undefined && commandMatchesDeletedPath(cmd, deletedPaths))
  })
  if (filtered.length === 0) return null // inner 全删空 → 丢整个 block
  return { ...entry, hooks: filtered } // 展开保留 matcher 等其它键
}

export function scrubHooksNested(content: string, deletedPaths: readonly string[]): ScrubResult {
  return scrubHooks(content, deletedPaths, 'nested')
}

export function scrubHooksFlat(content: string, deletedPaths: readonly string[]): ScrubResult {
  return scrubHooks(content, deletedPaths, 'flat')
}

/**
 * 结构化 scrub 分发（老仓 _DISPATCH:376-383）。
 * ★诚实 stub（BACKLOG #24 诚实门）：opencode-package / pi-settings / codex-config / tap-cleanup 在 lite
 *   **未实现**——lite 随包只装于 CC/codex，不投递 opencode/pi，codex-config.toml 注入面与 tap 采集面
 *   均属 A5/A7 里程碑未收编子系统。老仓这四面已是真剥离，但 lite 移植它们需要各平台真实注入 fixture
 *   才能真测（无真 fixture 的「真剥离」= 伪测试）。故此处保守 stub：原文不动、fullyEmpty=false——
 *   uninstall 遇到这些文件会**保留不删**（fail-safe，绝不误删用户数据），并由 uninstall 显式标注「stub 跳过」。
 */
export function scrubStructured(kind: StructuredKind, content: string, deletedPaths: readonly string[]): ScrubResult {
  switch (kind) {
    case 'nested':
      return scrubHooksNested(content, deletedPaths)
    case 'flat':
      return scrubHooksFlat(content, deletedPaths)
    default:
      // opencode-package / pi-settings / codex-config / tap-cleanup —— 诚实 stub（见上）。
      return { content, fullyEmpty: false }
  }
}

/** kind 是否为诚实 stub 面（uninstall 据此在计划里标注「stub 跳过」，降级可见 GOAL B8）。 */
export function isStubScrubKind(kind: StructuredKind): boolean {
  return kind !== 'nested' && kind !== 'flat'
}

// ════════════════════════════════════════════════════════════════════════════
// F. 受管目录守卫
// ════════════════════════════════════════════════════════════════════════════

/** 路径在任一受管树内（== d 或 d/ 前缀）→ true（老仓 is_managed_path:391-397）。反斜杠归一。 */
export function isManagedPath(dir: string): boolean {
  const p = dir.replace(/\\/g, '/')
  return ALL_MANAGED_DIRS.some((d) => p === d || p.startsWith(`${d}/`))
}

/** 精确等于某受管根 → true（老仓 is_managed_root_dir:399-405）。cleanup 永不删平台根。 */
export function isManagedRootDir(dir: string): boolean {
  const p = dir.replace(/\\/g, '/')
  return (ALL_MANAGED_DIRS as readonly string[]).includes(p)
}

// ════════════════════════════════════════════════════════════════════════════
// G. 版本协调
// ════════════════════════════════════════════════════════════════════════════

export function isUnknownVersion(v: string): boolean {
  return v === UNKNOWN_VERSION
}

function isNumericIdentifier(p: string): boolean {
  if (!p || !/^[0-9]+$/.test(p)) return false
  return String(parseInt(p, 10)) === p // 排除 "01"
}

/** semver + 预发布比较（老仓 compare_versions:218-295）。返回 -1/0/1。 */
export function compareVersions(a: string, b: string): number {
  const splitFirstHyphen = (v: string): [string, string | null] => {
    const idx = v.indexOf('-')
    return idx === -1 ? [v, null] : [v.slice(0, idx), v.slice(idx + 1)]
  }
  const parseBase = (v: string): number[] =>
    v.split('.').map((n) => {
      const x = parseInt(n, 10)
      return Number.isNaN(x) ? 0 : x
    })

  const [aBase, aPre] = splitFirstHyphen(a)
  const [bBase, bPre] = splitFirstHyphen(b)
  const ap = parseBase(aBase)
  const bp = parseBase(bBase)
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0
    const bv = bp[i] ?? 0
    if (av < bv) return -1
    if (av > bv) return 1
  }
  if (!aPre && bPre) return 1 // 无预发布 > 有预发布
  if (aPre && !bPre) return -1
  if (!aPre && !bPre) return 0
  const aIds = (aPre as string).split('.')
  const bIds = (bPre as string).split('.')
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1 // 更短预发布在前
    if (i >= bIds.length) return 1
    const ai = aIds[i] as string
    const bi = bIds[i] as string
    const aNum = isNumericIdentifier(ai)
    const bNum = isNumericIdentifier(bi)
    if (aNum && !bNum) return -1 // 数字标识符 < 字符串标识符
    if (!aNum && bNum) return 1
    if (aNum && bNum) {
      const an = parseInt(ai, 10)
      const bn = parseInt(bi, 10)
      if (an < bn) return -1
      if (an > bn) return 1
    } else {
      if (ai < bi) return -1
      if (ai > bi) return 1
    }
  }
  return 0
}

/** 降级守卫（老仓 guard_downgrade:150-184）。 */
export interface DowngradeGuard {
  action: 'ok' | 'reject' | 'downgrade'
  proceed: boolean
  messages: string[]
}
export function guardDowngrade(cliVersion: string, projectVersion: string, allowDowngrade: boolean): DowngradeGuard {
  const cmp = compareVersions(cliVersion, projectVersion)
  if (cmp < 0) {
    if (!allowDowngrade) {
      return {
        action: 'reject',
        proceed: false,
        messages: [
          'Cannot sync: this would DOWNGRADE the project pipeline assets.',
          `  CLI version:     ${cliVersion}`,
          `  Project version: ${projectVersion}`,
          'Two ways forward:',
          '  1. Upgrade the plugin to match the project.',
          '  2. Pass --allow-downgrade to force the downgrade.',
        ],
      }
    }
    return { action: 'downgrade', proceed: true, messages: ['Proceeding with downgrade (--allow-downgrade)...'] }
  }
  return { action: 'ok', proceed: true, messages: [] }
}

/** config-section 注入门（老仓 should_inject_config_sections:191-200）。仅 cli>project ∧ ≠unknown。 */
export function shouldInjectConfigSections(cliVersion: string, projectVersion: string): boolean {
  if (isUnknownVersion(projectVersion)) return false
  return compareVersions(cliVersion, projectVersion) > 0
}

/** --migrate 硬闸决策（老仓 migrate_gate_decision:207-247）。 */
export interface MigrateGate {
  decision: 'ok' | 'required' | 'tip'
  exitCode: 0 | 1
  messages: string[]
}
export function migrateGateDecision(
  pendingCount: number,
  migrate: boolean,
  cliVersion: string,
  projectVersion: string,
  metadata: { breaking?: boolean; recommend_migrate?: boolean },
): MigrateGate {
  const inWindow =
    pendingCount > 0 &&
    !migrate &&
    !isUnknownVersion(projectVersion) &&
    compareVersions(cliVersion, projectVersion) > 0
  if (!inWindow) return { decision: 'ok', exitCode: 0, messages: [] }
  if (metadata.breaking && metadata.recommend_migrate) {
    return {
      decision: 'required',
      exitCode: 1,
      messages: [
        'MIGRATION REQUIRED: this is a breaking upgrade with structural migrations.',
        'Re-run with --migrate to apply renames/deletions (a full backup is taken first).',
        'Refusing to proceed without --migrate would leave a half-migrated tree.',
      ],
    }
  }
  return { decision: 'tip', exitCode: 0, messages: ['Tip: Use --migrate to apply pending path migrations.'] }
}

/** 旧 codex 布局探测（老仓 needs_codex_upgrade:340-356）。★必须读裸未剪 manifest，先于 prune。 */
export function needsCodexUpgrade(hasCodexDir: boolean, manifestKeys: readonly string[]): boolean {
  if (hasCodexDir) return false
  const keys = new Set(manifestKeys.map((k) => k.replace(/\\/g, '/')))
  return CODEX_UPGRADE_MARKERS.some((m) => keys.has(m))
}

/** 启动横幅落后 nudge（老仓 banner_nudge:363-398，纯本地零网络）。 */
export interface BannerNudge {
  direction: 'update' | 'upgrade'
  projectVersion: string
  cliVersion: string
  message: string
}
export function bannerNudge(projectVersion: string, cliVersion: string): BannerNudge | null {
  if (isUnknownVersion(projectVersion)) return null
  const cmp = compareVersions(cliVersion, projectVersion)
  if (cmp > 0) {
    return {
      direction: 'update',
      projectVersion,
      cliVersion,
      message: `pipeline assets are out of date: ${projectVersion} -> ${cliVersion}. Run: pipeline sync`,
    }
  }
  if (cmp < 0) {
    return {
      direction: 'upgrade',
      projectVersion,
      cliVersion,
      message: `Your pipeline plugin (${cliVersion}) is older than this project (${projectVersion}). Run: pipeline upgrade`,
    }
  }
  return null
}

/** 预发布后缀派生 channel（老仓 derive_upgrade_channel:81-98）。显式 tag 校验 NPM_TAG_RE。 */
export function deriveUpgradeChannel(currentVersion: string, requestedTag?: string): string {
  if (requestedTag !== undefined) {
    if (!NPM_TAG_RE.test(requestedTag)) throw new Error(`Invalid upgrade tag: ${JSON.stringify(requestedTag)}`)
    return requestedTag
  }
  if (currentVersion.includes('-beta')) return 'beta' // beta 先于 rc（同 TS 序）
  if (currentVersion.includes('-rc')) return 'rc'
  return 'latest'
}

/** 从 installed_plugins.json 文本读指定插件版本（老仓 get_installed_plugin_version:105-131）。坏结构 → null。 */
export function getInstalledPluginVersion(installedJsonText: string, pluginKey: string = PLUGIN_KEY): string | null {
  let data: unknown
  try {
    data = JSON.parse(installedJsonText)
  } catch {
    return null
  }
  if (!isPlainObject(data)) return null
  const plugins = data.plugins
  if (!isPlainObject(plugins)) return null
  const entry = plugins[pluginKey]
  if (!Array.isArray(entry) || entry.length === 0) return null
  const first = entry[0]
  if (!isPlainObject(first)) return null
  const version = first.version
  return typeof version === 'string' && version ? version : null
}

/** 从 installed_plugins.json 派生 channel（老仓 derive_channel_from_installed:134-143）。缺版本 → latest。 */
export function deriveChannelFromInstalled(installedJsonText: string, pluginKey: string = PLUGIN_KEY): string {
  const version = getInstalledPluginVersion(installedJsonText, pluginKey)
  if (!version) return 'latest'
  return deriveUpgradeChannel(version)
}

// ════════════════════════════════════════════════════════════════════════════
// H. 注入 fs 面（清单/文件读写 + 目录操作）—— 命令层用真实现，mock 层注入 fake
// ════════════════════════════════════════════════════════════════════════════

/** 所有权 fs 注入面（默认 createOwnedFs 真 node:fs；测试注入 fake，同 task.ts TaskFs 风格）。 */
export interface OwnedFs {
  /** 读文本；不存在/读失败 → undefined。 */
  readText: (abs: string) => Promise<string | undefined>
  /** 写文本（父目录不存在自动建）。 */
  writeText: (abs: string, content: string) => Promise<void>
  /** 存在（文件或目录）。 */
  exists: (abs: string) => Promise<boolean>
  /** 是目录。 */
  isDir: (abs: string) => Promise<boolean>
  /** unlink 文件；成功 true，失败/缺失 false（best-effort）。 */
  unlink: (abs: string) => Promise<boolean>
  /** rm -rf 目录（best-effort，不抛）。 */
  rmrf: (abs: string) => Promise<void>
  /** 删空目录；成功 true（非空/缺失/失败 false）。 */
  rmdirEmpty: (abs: string) => Promise<boolean>
  /** 列目录条目名；缺失 → []。 */
  listDir: (abs: string) => Promise<string[]>
  /** 用户主目录（homedir 守卫用）。 */
  homeDir: () => string
  /** homedir 守卫旁路是否开启（PIPELINE_ALLOW_HOMEDIR=1）。 */
  homedirBypass: () => boolean
}

/** 清单绝对路径。 */
export function ownedManifestPath(cwd: string): string {
  return join(cwd, OWNED_MANIFEST)
}

/** 读清单原文（不存在 → undefined，供 uninstall 区分「未安装」vs「损坏」）。 */
export function readOwnedManifestText(fs: OwnedFs, cwd: string): Promise<string | undefined> {
  return fs.readText(ownedManifestPath(cwd))
}

/** 读并解析清单（不存在 → {}）。 */
export async function loadOwnedManifest(fs: OwnedFs, cwd: string): Promise<Record<string, string>> {
  const text = await readOwnedManifestText(fs, cwd)
  return text === undefined ? {} : parseOwnedManifest(text)
}

/** 序列化落盘清单。 */
export function saveOwnedManifest(fs: OwnedFs, cwd: string, map: Record<string, string>): Promise<void> {
  return fs.writeText(ownedManifestPath(cwd), serializeOwnedManifest(map))
}

/** 读项目版本戳 .pipeline-version（缺失/空 → 'unknown' 一等态，老仓 get_installed_version:391-405）。 */
export async function readVersionFile(fs: OwnedFs, cwd: string): Promise<string> {
  const t = await fs.readText(join(cwd, VERSION_FILE))
  if (t === undefined) return UNKNOWN_VERSION
  return t.trim() || UNKNOWN_VERSION
}

/** 真实 node:fs 实现（同 createHistoryWriter/createStateStore 风格；命令层默认注入）。 */
export function createOwnedFs(): OwnedFs {
  return {
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
    exists: async (abs) => {
      try {
        await stat(abs)
        return true
      } catch {
        return false
      }
    },
    isDir: async (abs) => {
      try {
        return (await stat(abs)).isDirectory()
      } catch {
        return false
      }
    },
    unlink: async (abs) => {
      try {
        await unlink(abs)
        return true
      } catch {
        return false
      }
    },
    rmrf: async (abs) => {
      await rm(abs, { recursive: true, force: true }).catch(() => {})
    },
    rmdirEmpty: async (abs) => {
      try {
        await rmdir(abs)
        return true
      } catch {
        return false
      }
    },
    listDir: async (abs) => {
      try {
        return await readdir(abs)
      } catch {
        return []
      }
    },
    homeDir: () => homedir(),
    homedirBypass: () => process.env.PIPELINE_ALLOW_HOMEDIR === '1',
  }
}
