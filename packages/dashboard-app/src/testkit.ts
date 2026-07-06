/** 测试工厂（非 *.test.*，不被收集）——构造 server 契约形状的 snapshot/change 供真组件测试喂数据。 */
import type { ChangeSnapshot, ProjectSnapshot, Snapshot } from './types'

export function makeChange(name: string, phase: string, over: Partial<ChangeSnapshot> = {}): ChangeSnapshot {
  return {
    name,
    path: `/repo/openspec/changes/${name}`,
    phase,
    phase_status: 'in_progress',
    track: 'backend',
    preset: 'full',
    archived: 'false',
    updated_at: '2026-07-07T00:00:00Z',
    fields: {},
    ...over,
  }
}

export function makeProject(root: string, changes: ChangeSnapshot[], over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return { root, ok: true, changes, ...over }
}

export function makeSnapshot(projects: ProjectSnapshot[], over: Partial<Snapshot> = {}): Snapshot {
  const change_count = projects.reduce((n, p) => n + p.changes.length, 0)
  return {
    version: '0.1.0',
    generated_at: '2026-07-07T00:00:00Z',
    capabilities: { snapshot: true, health: true, stream: true, transition: true },
    project_count: projects.length,
    change_count,
    projects,
    ...over,
  }
}
