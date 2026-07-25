import type {
  ChangeSnapshot,
  DocumentEvidenceSnapshot,
  PipelineTodoProjection,
  PipelineTodoStage,
  ProjectSnapshot,
  Snapshot,
  TerminalActivitySnapshot,
} from '../types'
import { isRecord, optionalString, recordOfBooleans, stringArray } from './transport'

function decodeTerminalActivity(value: unknown): TerminalActivitySnapshot | undefined {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || typeof value.heartbeatAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || !optionalString(value.turnId)) return undefined
  return {
    sessionId: value.sessionId,
    heartbeatAt: value.heartbeatAt,
    expiresAt: value.expiresAt,
    ...(value.turnId === undefined ? {} : { turnId: value.turnId }),
  }
}

function decodeTodoStage(value: unknown): PipelineTodoStage | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.label !== 'string'
    || (value.status !== 'done' && value.status !== 'current' && value.status !== 'pending')
    || !Array.isArray(value.tasks)) return null
  const tasks = []
  for (const task of value.tasks) {
    if (!isRecord(task) || typeof task.text !== 'string' || typeof task.completed !== 'boolean') return null
    tasks.push({ text: task.text, completed: task.completed })
  }
  return { id: value.id, label: value.label, status: value.status, tasks }
}

function decodeTodo(value: unknown): PipelineTodoProjection | undefined {
  if (!isRecord(value) || typeof value.hasTaskSource !== 'boolean' || !Array.isArray(value.stages)) return undefined
  const stages: PipelineTodoStage[] = []
  for (const stage of value.stages) {
    const decoded = decodeTodoStage(stage)
    if (!decoded) return undefined
    stages.push(decoded)
  }
  return { hasTaskSource: value.hasTaskSource, stages }
}

function decodeDocuments(value: unknown): DocumentEvidenceSnapshot | undefined {
  if (!isRecord(value) || typeof value.governed !== 'boolean' || !stringArray(value.blockers) || !Array.isArray(value.items)) {
    return undefined
  }
  const items: DocumentEvidenceSnapshot['items'] = []
  for (const item of value.items) {
    if (!isRecord(item)
      || typeof item.kind !== 'string'
      || !['recorded', 'missing', 'stale', 'unread'].includes(String(item.status))
      || typeof item.requiredRead !== 'boolean'
      || !stringArray(item.paths)
      || !stringArray(item.producers)) return undefined
    const status = item.status
    if (status !== 'recorded' && status !== 'missing' && status !== 'stale' && status !== 'unread') return undefined
    items.push({
      kind: item.kind,
      status,
      requiredRead: item.requiredRead,
      paths: item.paths,
      producers: item.producers,
    })
  }
  return {
    governed: value.governed,
    ...(typeof value.phase === 'string' ? { phase: value.phase } : {}),
    ...(typeof value.ledgerPresent === 'boolean' ? { ledgerPresent: value.ledgerPresent } : {}),
    ...(typeof value.pass === 'boolean' ? { pass: value.pass } : {}),
    blockers: value.blockers,
    items,
  }
}

function decodeFields(value: unknown): Record<string, string | string[]> | null {
  if (!isRecord(value)) return null
  const fields: Record<string, string | string[]> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') fields[key] = item
    else if (stringArray(item)) fields[key] = item
    else return null
  }
  return fields
}

function decodeChange(value: unknown): ChangeSnapshot | null {
  if (!isRecord(value)) return null
  const fields = decodeFields(value.fields)
  if (typeof value.name !== 'string'
    || typeof value.path !== 'string'
    || typeof value.phase !== 'string'
    || typeof value.phase_status !== 'string'
    || typeof value.track !== 'string'
    || typeof value.preset !== 'string'
    || typeof value.archived !== 'string'
    || typeof value.updated_at !== 'string'
    || !fields) return null
  const todo = value.todo === undefined ? undefined : decodeTodo(value.todo)
  const documents = value.documents === undefined ? undefined : decodeDocuments(value.documents)
  const terminalActivity = value.terminalActivity === undefined ? undefined : decodeTerminalActivity(value.terminalActivity)
  if ((value.todo !== undefined && !todo)
    || (value.documents !== undefined && !documents)
    || (value.terminalActivity !== undefined && !terminalActivity)) return null
  return {
    name: value.name,
    path: value.path,
    phase: value.phase,
    phase_status: value.phase_status,
    track: value.track,
    preset: value.preset,
    archived: value.archived,
    updated_at: value.updated_at,
    fields,
    ...(todo ? { todo } : {}),
    ...(documents ? { documents } : {}),
    ...(terminalActivity ? { terminalActivity } : {}),
  }
}

function decodeProject(value: unknown): ProjectSnapshot | null {
  if (!isRecord(value)
    || typeof value.root !== 'string'
    || typeof value.ok !== 'boolean'
    || !optionalString(value.error)
    || !Array.isArray(value.changes)) return null
  const changes: ChangeSnapshot[] = []
  for (const change of value.changes) {
    const decoded = decodeChange(change)
    if (!decoded) return null
    changes.push(decoded)
  }
  return {
    root: value.root,
    ok: value.ok,
    changes,
    ...(value.error === undefined ? {} : { error: value.error }),
  }
}

export function decodeSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value)
    || typeof value.version !== 'string'
    || typeof value.generated_at !== 'string'
    || !recordOfBooleans(value.capabilities)
    || typeof value.project_count !== 'number'
    || typeof value.change_count !== 'number'
    || !Array.isArray(value.projects)) return null
  const projects: ProjectSnapshot[] = []
  for (const project of value.projects) {
    const decoded = decodeProject(project)
    if (!decoded) return null
    projects.push(decoded)
  }
  return {
    version: value.version,
    generated_at: value.generated_at,
    capabilities: value.capabilities,
    project_count: value.project_count,
    change_count: value.change_count,
    projects,
  }
}
