/**
 * living spec 库 —— 细粒度 spec 路由（capability 枚举）+ spec_scope 写值归一 +
 * per-agent jsonl 清单注入（GOAL A1 内核深度 / D2 超越 Trellis 的规范库，BACKLOG #16）。
 *
 * 老仓真相源：skills/pipeline/scripts/state-spec.sh（被 pipeline-state.sh source，无 main）。
 * 逐子命令行号（dispatch = pipeline-state.sh 行）：
 *   specs [--json]          state-spec.sh:32-67    （dispatch pipeline-state.sh:103）
 *   set-spec-scope <c> <s>  state-spec.sh:114-127  （dispatch pipeline-state.sh:104）
 *   inject-jsonl <c> [ag]   state-spec.sh:245-281  （dispatch pipeline-state.sh:114）
 *   底座：_jsonl_path:183-190 / _JSONL_DIR_MAXFILES:28
 *
 * 语义对位（逐条锚定老仓行为）：
 *  1. specs（cmd_specs :32-67）：扁平单 repo capability 模型——capability = openspec/specs/<name>/，
 *     spec.md 是其 main spec（无 package/layer 子树，Trellis get-context-mode-packages 的投影）。
 *     目录回退：openspec/specs 优先；仅当 .openspec/specs 在且 openspec/specs 不在时用 .openspec/specs
 *     （老仓 :36 `[ -d ".openspec/specs" ] && [ ! -d "$sdir" ]`）。specs 目录缺 → exists false。
 *     每 capability：spec.md 存在 → specPath 相对路径 + hasSpec true；不存在 → specPath ""（老仓
 *     `[ -f "$path" ] || path=""`）+ hasSpec false。枚举按 name 排序（老仓 glob 子目录，字典序）。
 *  2. set-spec-scope（cmd_set_spec_scope :114-127）：写值归一——空/清空 归一为 null 哨兵（全扫 fail-open）；
 *     否则原样（list CSV / all sentinel）。老仓委托 cmd_set 走四闸写；新仓 spec_scope 是 list 字段
 *     （CONTRACT 一），但本命令按老仓语义写标量 CSV/哨兵（parse.ts 对 list 字段的 inline 标量保持
 *     string，序列化回 spec_scope 标量行，与老仓字节一致）。写值本身由 CLI 经 store.set 落盘。
 *  3. inject-jsonl（cmd_inject_jsonl :245-281）：注入期容错（fail-open，绝不非零退出）——
 *     · agent 仅 implement/check（_jsonl_path :185-187），否则 bad-agent（老仓 `|| return 0`）；
 *     · jsonl 缺 → missing（老仓 WARN + rc0）；
 *     · 逐行：空行跳过；坏 JSON → 跳过（老仓 jq 失败 `|| continue`）；无 file 字段（seed）→ 跳过；
 *     · file entry：存在 → cat 内容成 chunk；不存在 → warning「file not found」；
 *     · directory entry：存在 → 展开其下一层 *.md（排序，上限 _JSONL_DIR_MAXFILES=20）成多 chunk；
 *       不存在 → warning「directory not found」；
 *     · 整表无真实 entry（只 seed/空）→ sawReal false（CLI 落 stderr WARN）。
 *     jq `.file // empty`：file 为 null/false/缺/空串 → 跳过；`.type // "file"`：缺/null → 'file'。
 *
 * 注：resolve-spec-scope（老仓 :129-135 resolve_spec_scope_set）是 set-spec-scope 的天然消费方，
 *     不在本批交付面（见报告 oracle 对位建议）。
 *
 * kernel 零第三方依赖（仅 node:fs 内建，同 tasks.ts / store.ts）。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const SPECS_DIR = 'openspec/specs'
const DOT_SPECS_DIR = '.openspec/specs'
/** jsonl directory entry 读取上限（老仓 _JSONL_DIR_MAXFILES:28，防目录爆炸塞满 context） */
const JSONL_DIR_MAXFILES = 20
/** per-agent curated manifest（老仓 _jsonl_path:185，对标 Trellis implement/check.jsonl） */
const VALID_AGENTS: ReadonlySet<string> = new Set(['implement', 'check'])

async function isDirAbs(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}
async function isFileAbs(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

// === specs：capability 枚举 ===

export interface SpecEntry {
  name: string
  /** capability spec.md 相对路径；spec.md 不存在 → ''（老仓 `[ -f ] || path=""`） */
  specPath: string
  hasSpec: boolean
}

export interface SpecListing {
  /** 命中的 specs 目录（openspec/specs 或 .openspec/specs 回退） */
  dir: string
  exists: boolean
  entries: SpecEntry[]
}

/**
 * specs 目录定位（老仓 cmd_specs :35-36 / _all_capabilities :78-79）：
 * openspec/specs 优先；仅当 .openspec/specs 存在且 openspec/specs 不存在时回退 .openspec/specs。
 */
export async function resolveSpecsDir(cwd: string): Promise<{ dir: string; exists: boolean }> {
  let dir = SPECS_DIR
  const primaryExists = await isDirAbs(path.join(cwd, SPECS_DIR))
  if (!primaryExists && (await isDirAbs(path.join(cwd, DOT_SPECS_DIR)))) dir = DOT_SPECS_DIR
  const exists = await isDirAbs(path.join(cwd, dir))
  return { dir, exists }
}

/**
 * 枚举 main capability（老仓 cmd_specs :32-67）：specs 目录下每子目录一个 capability，
 * spec.md 有无双态，按 name 排序（老仓 glob 字典序）。specs 目录缺 → exists false + 空集。
 */
export async function listSpecEntries(cwd: string): Promise<SpecListing> {
  const { dir, exists } = await resolveSpecsDir(cwd)
  if (!exists) return { dir, exists: false, entries: [] }
  const abs = path.join(cwd, dir)
  let names: string[] = []
  try {
    names = (await readdir(abs, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    names = []
  }
  const entries: SpecEntry[] = []
  for (const name of names) {
    const hasSpec = await isFileAbs(path.join(cwd, dir, name, 'spec.md'))
    entries.push({ name, specPath: hasSpec ? `${dir}/${name}/spec.md` : '', hasSpec })
  }
  return { dir, exists: true, entries }
}

// === set-spec-scope：写值归一 ===

/**
 * spec_scope 写值归一（老仓 cmd_set_spec_scope :119-126）：空/清空 → 'null' 哨兵（全扫 fail-open）；
 * 否则原样（list CSV / 'all' sentinel）。老仓不 trim scope（空定义 = 严格空串）。
 */
export function specScopeWriteValue(scope: string | undefined): string {
  return scope === undefined || scope === '' ? 'null' : scope
}

// === inject-jsonl：per-agent 清单注入 ===

export interface JsonlEntry {
  file: string
  /** 'file'（默认）或 'directory'（老仓 jq `.type // "file"`） */
  type: string
}

/**
 * 容错解析单行 jsonl（老仓 cmd_inject_jsonl :258-261 的 jq 语义）：
 * - 坏 JSON → null（注入期 `|| continue`）；
 * - `.file // empty`：file 为 null/false/缺/空串 → null（seed / 无 file 字段静默跳过）；
 * - `.type // "file"`：type 为 null/false/缺 → 'file'。
 */
export function parseJsonlLine(line: string): JsonlEntry | null {
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const rec = obj as Record<string, unknown>
  const file = rec.file
  if (file === undefined || file === null || file === false || file === '') return null
  const fileStr = typeof file === 'string' ? file : String(file)
  const t = rec.type
  const type = t === undefined || t === null || t === false ? 'file' : typeof t === 'string' ? t : String(t)
  return { file: fileStr, type }
}

/** <change> <agent> → openspec/changes/<change>/<agent>.jsonl（老仓 _jsonl_path:189）。 */
export function jsonlRelPath(name: string, agent: string): string {
  return `openspec/changes/${name}/${agent}.jsonl`
}

export type InjectKind = 'bad-agent' | 'missing' | 'ok'

export interface InjectChunk {
  /** 展示路径（file entry = fp 原值；dir entry = <dir>/<md>） */
  path: string
  /** 文件真实内容（老仓 cat） */
  content: string
}

export interface InjectOutcome {
  kind: InjectKind
  /** jsonl 相对路径（bad-agent → ''） */
  jsonlPath: string
  /** 待注入 chunk（stdout），按 entry 序 */
  chunks: InjectChunk[]
  /** 逐 entry not-found WARN（stderr），按 entry 序、含老仓前缀格式 */
  warnings: string[]
  /** 是否见到真实 entry（false → CLI 落「only seed」WARN） */
  sawReal: boolean
}

/** 列目录下一层 *.md 常规文件，按展示路径排序（老仓 `find <dir> -maxdepth 1 -name '*.md' -type f | sort`）。 */
async function listMdFiles(cwd: string, dirRel: string): Promise<string[]> {
  let ents
  try {
    ents = await readdir(path.join(cwd, dirRel), { withFileTypes: true })
  } catch {
    return []
  }
  const base = dirRel.replace(/\/+$/, '')
  return ents
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => `${base}/${e.name}`)
    .sort()
}

/**
 * 注入期读取 per-agent jsonl 清单（老仓 cmd_inject_jsonl :245-281）：fail-open，绝不抛。
 * 返回结构化 outcome（chunks / warnings / sawReal），呈现（header / stderr WARN）由 CLI 负责。
 */
export async function injectJsonl(cwd: string, name: string, agent: string): Promise<InjectOutcome> {
  if (!VALID_AGENTS.has(agent)) {
    return { kind: 'bad-agent', jsonlPath: '', chunks: [], warnings: [], sawReal: false }
  }
  const rel = jsonlRelPath(name, agent)
  const abs = path.join(cwd, rel)
  if (!(await isFileAbs(abs))) {
    return { kind: 'missing', jsonlPath: rel, chunks: [], warnings: [], sawReal: false }
  }
  let text: string
  try {
    text = await readFile(abs, 'utf8')
  } catch {
    return { kind: 'missing', jsonlPath: rel, chunks: [], warnings: [], sawReal: false }
  }

  const chunks: InjectChunk[] = []
  const warnings: string[] = []
  let sawReal = false

  for (const line of text.split('\n')) {
    if (line === '') continue
    const entry = parseJsonlLine(line)
    if (entry === null) continue // 坏 JSON / seed / 无 file → 跳过
    sawReal = true
    const fp = entry.file
    if (entry.type === 'directory') {
      if (await isDirAbs(path.join(cwd, fp))) {
        let cnt = 0
        for (const mf of await listMdFiles(cwd, fp)) {
          if (cnt >= JSONL_DIR_MAXFILES) break
          const absMf = path.join(cwd, mf)
          if (!(await isFileAbs(absMf))) continue
          let content = ''
          try {
            content = await readFile(absMf, 'utf8')
          } catch {
            content = ''
          }
          chunks.push({ path: mf, content })
          cnt++
        }
      } else {
        warnings.push(`  > [WARN] directory not found（注入期跳过）: ${fp}`)
      }
    } else {
      if (await isFileAbs(path.join(cwd, fp))) {
        let content = ''
        try {
          content = await readFile(path.join(cwd, fp), 'utf8')
        } catch {
          content = ''
        }
        chunks.push({ path: fp, content })
      } else {
        warnings.push(`  > [WARN] file not found（注入期跳过）: ${fp}`)
      }
    }
  }
  return { kind: 'ok', jsonlPath: rel, chunks, warnings, sawReal }
}
