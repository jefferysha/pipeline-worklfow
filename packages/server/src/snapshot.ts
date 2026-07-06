/**
 * snapshot 域 —— 聚合本机所有注册 Project 的 .pipeline.yaml → JSON（GET /api/snapshot）。
 * server 是 kernel 消费方：用 StateStore.read（→ parsePipeline）读盘，绝不自造解析器。
 * 对位老仓 dashboard-generator.build_data 的「聚合所有 Project 的活跃 change」核心面。
 */
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { StateStore } from '@pipeline-lite/kernel'
import type { ChangeSnapshot, ProjectSnapshot, Snapshot } from './types.js'

export interface SnapshotDeps {
  registry: () => string[]
  store: StateStore
  version: string
  clock: () => string
}

function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(',')
  return v ?? ''
}

/** 去重（按规范化路径，保序）。 */
function dedupeRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of roots) {
    if (!r) continue
    const rp = resolve(r)
    if (seen.has(rp)) continue
    seen.add(rp)
    out.push(rp)
  }
  return out
}

async function scanProject(store: StateStore, root: string): Promise<ProjectSnapshot> {
  let isDir = false
  try {
    isDir = (await stat(root)).isDirectory()
  } catch {
    isDir = false
  }
  if (!isDir) return { root, ok: false, changes: [], error: 'root 不存在或不可达' }

  const changesRoot = join(root, 'openspec', 'changes')
  let entries
  try {
    entries = await readdir(changesRoot, { withFileTypes: true })
  } catch {
    // 已注册但尚无 openspec/changes —— 合法空项目
    return { root, ok: true, changes: [] }
  }

  const changes: ChangeSnapshot[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'archive') continue
    const changeDir = join(changesRoot, e.name)
    try {
      const state = await store.read(changeDir)
      const f = state.fields
      changes.push({
        name: e.name,
        path: changeDir,
        phase: str(f.phase),
        phase_status: str(f.phase_status),
        track: str(f.track),
        preset: str(f.preset),
        archived: str(f.archived),
        updated_at: str(f.updated_at),
        fields: f,
      })
    } catch {
      // 无 .pipeline.yaml / 解析失败 → 非 pipeline change，跳过（有界、容错）
    }
  }
  changes.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { root, ok: true, changes }
}

export async function buildSnapshot(deps: SnapshotDeps): Promise<Snapshot> {
  const roots = dedupeRoots(deps.registry())
  const projects = await Promise.all(roots.map((r) => scanProject(deps.store, r)))
  const change_count = projects.reduce((n, p) => n + p.changes.length, 0)
  return {
    version: deps.version,
    generated_at: deps.clock(),
    // 能力声明（GOAL B6 起步）：本 server 真实已接线的域才报 true；未接线域（channel/tap/afk…）不谎报。
    capabilities: { snapshot: true, health: true, stream: true, transition: true },
    project_count: projects.length,
    change_count,
    projects,
  }
}

/**
 * 变更指纹 —— SSE 推送的触发源。每个 .pipeline.yaml 的 path:size:mtimeNs（纳秒精度，
 * 挡同毫秒内两次写）拼接排序；任一 change 改盘 → 指纹变 → 推新快照。
 */
export async function computeFingerprint(roots: string[]): Promise<string> {
  const parts: string[] = []
  for (const root of dedupeRoots(roots)) {
    const changesRoot = join(root, 'openspec', 'changes')
    let entries
    try {
      entries = await readdir(changesRoot, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === 'archive') continue
      const yml = join(changesRoot, e.name, '.pipeline.yaml')
      try {
        const st = await stat(yml, { bigint: true })
        parts.push(`${yml}:${st.size}:${st.mtimeNs}`)
      } catch {
        // 无 yaml —— 跳过
      }
    }
  }
  parts.sort()
  return parts.join('|')
}
