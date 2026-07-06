/**
 * task lifecycle —— 依赖图 / 子任务反查 / 级联 / canonical 规范化。
 *
 * 老仓真相源：skills/pipeline/scripts/state-task.sh（被 pipeline-state.sh source，无 main）。
 * 逐子命令行号（dispatch = pipeline-state.sh 行）：
 *   add-dep     state-task.sh:147-172   （dispatch pipeline-state.sh:86）
 *   remove-dep  state-task.sh:174-183   （dispatch pipeline-state.sh:87）
 *   children    state-task.sh:263-295   （dispatch pipeline-state.sh:90）
 *   cascade     state-task.sh:299-325   （dispatch pipeline-state.sh:91）
 *   canonical   state-task.sh:341-422   （dispatch pipeline-state.sh:93）
 *   底座：_deps_read:141-145 / _tree_all_changes:201-221 / _tree_deps_of:225-229 /
 *        _tree_name_matches:233-241 / _tree_direct_children:243-261 / resolve_task_dir:115-127
 *
 * 语义对位（逐条锚定老仓行为）：
 *  1. depends_on 表示：老仓 CSV 标量 "a,b,c"/"null"；新仓是 list 字段（block seq / [] / 'null'
 *     哨兵，见 parse.ts + CONTRACT §1）。normalizeDeps 把三态统一成成员数组；写回用空数组 []
 *     表达空集（新仓 list 约定，对齐老仓 "null" 哨兵语义、非字节）。
 *  2. add-dep（:147-172）：去重幂等 + 防自环（dep==name 拒，对标 subtask.ts 不可挂自身）+
 *     尾接保序（新成员追加到列表尾）。
 *  3. remove-dep（:174-183）：精确整名移除（老仓 grep -vxF）；清空回空集。
 *  4. children（:263-295）：反查所有 depends_on 指向 target 的 change（活跃 archived=false +
 *     归档任意深度 archived=true）。归档 dependent 仍算子（children_progress 不回退）。
 *  5. 名匹配宽松（:233-241）：兼容 NN-NN-slug 目录名 vs slug 短名——相等 / target 尾 -dep /
 *     dep 尾 -target。
 *  6. cascade（:299-325）：BFS 传递闭包，visited 防环，逐节点标 active/archived（无 --json）。
 *  7. canonical（:341-422）：投影 Trellis 24 字段 canonical task.json（字段顺序即 schema）；
 *     nz 空 / "null" 哨兵 → null；subtasks←depends_on、children←反查、relatedFiles←related_files。
 *
 * kernel 零第三方依赖（仅 node:fs 内建，同 store.ts / lock.ts）。
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { FieldName, PipelineState, StateStore } from '../types.js'
import { STATE_FILE_NAME } from './store.js'

/** 老仓空集哨兵：depends_on/scope 等整字段取值 "null" 视为空（_deps_read state-task.sh:143） */
const NULL_SENTINEL = 'null'

/**
 * depends_on 字段值 → 规范成员数组（老仓 _deps_read state-task.sh:141-145 口径）。
 * - 整值 "null" / "" / undefined → 空集；
 * - CSV 标量 → split(',') + trim + 去空（兼容老仓 CSV 存储与 IFS=',' 消费方）；
 * - 数组（新仓 list 存储）→ trim + 去空。
 */
export function normalizeDeps(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  if (Array.isArray(value)) {
    return value.map((s) => s.trim()).filter((s) => s !== '')
  }
  const v = value.trim()
  if (v === '' || v === NULL_SENTINEL) return []
  return v.split(',').map((s) => s.trim()).filter((s) => s !== '')
}

export interface AddDepResult {
  deps: string[]
  /** false = 已含（去重幂等，未追加） */
  added: boolean
}

/** add-dep 集合操作（老仓 cmd_add_dep:158-171）：已含→幂等；否则尾接保序。 */
export function addDependency(current: readonly string[], dep: string): AddDepResult {
  if (current.includes(dep)) return { deps: [...current], added: false }
  return { deps: [...current, dep], added: true }
}

/** remove-dep 精确移除保序（老仓 cmd_remove_dep:180 `grep -vxF`）。 */
export function removeDependency(current: readonly string[], dep: string): string[] {
  return current.filter((d) => d !== dep)
}

/**
 * 宽松名匹配（老仓 _tree_name_matches state-task.sh:233-241）：
 * 兼容 NN-NN-slug 目录名与 slug 短名——精确相等 / target 尾 -dep / dep 尾 -target。
 */
export function taskNameMatches(dep: string, target: string): boolean {
  if (dep === target) return true
  if (target.endsWith(`-${dep}`)) return true
  if (dep.endsWith(`-${target}`)) return true
  return false
}

/** change 树节点（活跃 + 归档统一表示）。 */
export interface ChangeNode {
  name: string
  archived: boolean
  /** 归一后的 depends_on 成员 */
  deps: string[]
}

export interface ChildRef {
  name: string
  archived: boolean
}

/**
 * 反查直接子（老仓 _tree_direct_children state-task.sh:243-261）：depends_on 含 target 的 change
 * （不含自身，按 nodes 顺序，不去重/不排序——调用方按需 sort -u）。
 */
export function directChildren(nodes: readonly ChangeNode[], target: string): ChildRef[] {
  const out: ChildRef[] = []
  for (const node of nodes) {
    if (node.name === target) continue // 老仓 `[ "$cn" = "$target" ] && continue`（精确不自指）
    if (node.deps.some((dep) => taskNameMatches(dep, target))) {
      out.push({ name: node.name, archived: node.archived })
    }
  }
  return out
}

/**
 * BFS 传递闭包（老仓 cmd_cascade state-task.sh:299-325）：全部后代 dependent，visited 防环，
 * 返回发现顺序（逐层 BFS）。
 */
export function cascadeDependents(nodes: readonly ChangeNode[], target: string): ChildRef[] {
  const visited = new Set<string>([target])
  const result: ChildRef[] = []
  let frontier: string[] = [target]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const nodeName of frontier) {
      for (const child of directChildren(nodes, nodeName)) {
        if (visited.has(child.name)) continue // 防环：已访问跳过
        visited.add(child.name)
        next.push(child.name)
        result.push(child)
      }
    }
    frontier = next
  }
  return result
}

/** Trellis canonical task.json shape（24 字段，字段顺序即 schema，老仓 cmd_canonical:393-418）。 */
export interface CanonicalTask {
  id: string
  name: string
  title: string
  description: string
  status: string
  dev_type: string | null
  scope: string | null
  package: null
  priority: string
  creator: string
  assignee: string
  createdAt: string
  completedAt: string | null
  branch: string | null
  base_branch: string | null
  worktree_path: string | null
  commit: string | null
  pr_url: string | null
  subtasks: string[]
  children: string[]
  parent: null
  relatedFiles: string[]
  notes: string
  meta: Record<string, never>
}

export interface CanonicalInput {
  name: string
  fields: Record<FieldName, string | string[]>
  /** depends_on 成员（它依赖的链） */
  subtasks: string[]
  /** 反查子名（depends_on 指向它的），已 sort -u */
  children: string[]
  /** related_files 成员 */
  relatedFiles: string[]
}

/** nz：空 / "null" 哨兵 → null；否则原值（老仓 cmd_canonical python nz:382-387）。列表值以 CSV 归并。 */
function nz(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value.join(',') : (value ?? '')
  return v === '' || v === NULL_SENTINEL ? null : v
}

/**
 * 投影为 Trellis 24 字段 canonical task.json（老仓 cmd_canonical:393-418）。
 * status/creator/assignee/createdAt 用 `nz(...) ?? ''`（老仓 `nz() or ""`）；
 * 其余可空字段直接 nz（None → JSON null）。
 */
export function projectCanonical(input: CanonicalInput): CanonicalTask {
  const f = input.fields
  return {
    id: input.name,
    name: input.name,
    title: input.name,
    description: '',
    status: nz(f.phase) ?? '',
    dev_type: nz(f.track),
    scope: nz(f.scope),
    package: null,
    priority: 'normal',
    creator: nz(f.created_by) ?? '',
    assignee: nz(f.assignee) ?? '',
    createdAt: nz(f.created_at) ?? '',
    completedAt: nz(f.archived_at),
    branch: nz(f.branch),
    base_branch: nz(f.base_branch),
    worktree_path: nz(f.automation_worktree),
    commit: nz(f.build_sha),
    pr_url: nz(f.pr_url),
    subtasks: input.subtasks,
    children: input.children,
    parent: null,
    relatedFiles: input.relatedFiles,
    notes: '',
    meta: {},
  }
}

// === 真 fs 枚举（基于 StateStore 复用窄解析器；对齐老仓 _tree_all_changes） ===

function changesRootOf(cwd: string): string {
  return path.join(cwd, 'openspec', 'changes')
}

/** 读某 change 目录的 depends_on 成员；无状态文件/读失败 → undefined（老仓 `[ -f ] || continue`）。 */
async function readDepsSafe(store: StateStore, dir: string): Promise<string[] | undefined> {
  try {
    const state = await store.read(dir)
    return normalizeDeps(state.fields.depends_on)
  } catch {
    return undefined
  }
}

/** 递归收集归档区任意深度的 .pipeline.yaml（老仓 `find archive -name .pipeline.yaml`），name=父目录名。 */
async function walkArchive(dir: string, store: StateStore, nodes: ChangeNode[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walkArchive(full, store, nodes)
    } else if (e.isFile() && e.name === STATE_FILE_NAME) {
      const deps = await readDepsSafe(store, dir)
      if (deps !== undefined) nodes.push({ name: path.basename(dir), archived: true, deps })
    }
  }
}

/**
 * 枚举全量 change 树（老仓 _tree_all_changes state-task.sh:201-221）：
 * 活跃 openspec/changes/<n>（排除 archive 子目录，archived=false）+ 归档 archive/** 任意深度
 * （archived=true，name=父目录名）。用 store.read 复用窄解析器真读每个 depends_on。
 * 按 name 稳定排序（老仓 glob+find 无稳定序，本实现确定化确保可测/可复现）。
 */
export async function loadTaskTree(cwd: string, store: StateStore): Promise<ChangeNode[]> {
  const root = changesRootOf(cwd)
  const nodes: ChangeNode[] = []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return nodes
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'archive') continue
    const deps = await readDepsSafe(store, path.join(root, e.name))
    if (deps === undefined) continue // 无 .pipeline.yaml → 跳过
    nodes.push({ name: e.name, archived: false, deps })
  }
  await walkArchive(path.join(root, 'archive'), store, nodes)
  nodes.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return nodes
}

/**
 * 定位 change 目录（老仓 resolve_task_dir state-task.sh:115-127）：
 * ① 精确 openspec/changes/<name> 是目录 → 用之；② 否则首个 openspec/changes/*-<name>；
 * ③ 都不中 → 回退精确路径（让调用方 store.read fail-loud）。
 */
export async function resolveChangeDir(cwd: string, name: string): Promise<string> {
  const root = changesRootOf(cwd)
  const exact = path.join(root, name)
  try {
    if ((await stat(exact)).isDirectory()) return exact
  } catch {
    // 精确不存在，尝试前缀匹配
  }
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const hit = entries.find((e) => e.isDirectory() && e.name.endsWith(`-${name}`))
    if (hit) return path.join(root, hit.name)
  } catch {
    // 无 changesRoot
  }
  return exact
}

/** canonical children 名列（反查 + sort -u，老仓 cmd_canonical:367 `_tree_direct_children | cut -f1 | sort -u`）。 */
export function canonicalChildNames(nodes: readonly ChangeNode[], target: string): string[] {
  return [...new Set(directChildren(nodes, target).map((c) => c.name))].sort()
}

/** 供 CLI 复用的 PipelineState → subtasks/relatedFiles 抽取（保持 normalizeDeps 单一口径）。 */
export function stateSubtasks(state: PipelineState): string[] {
  return normalizeDeps(state.fields.depends_on)
}
export function stateRelatedFiles(state: PipelineState): string[] {
  return normalizeDeps(state.fields.related_files)
}
