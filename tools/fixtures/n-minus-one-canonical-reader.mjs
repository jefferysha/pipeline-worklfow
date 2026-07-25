#!/usr/bin/env node
/**
 * Frozen N-1 strict canonical reader.
 *
 * This fixture intentionally models the previous release's closed-schema boundary. It must not
 * import current kernel code: the release gate uses it to detect accidental new canonical keys
 * even on a clean CI machine where no managed previous runtime is installed.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const FIELD_ORDER = [
  'track', 'preset', 'created_by', 'assignee', 'phase', 'phase_status', 'design_doc',
  'plan', 'verification_report', 'build_mode', 'isolation', 'build_sha',
  'agent_review_result', 'codex_review_result', 'verify_result', 'branch_status',
  'direct_override', 'prd_path', 'pr_url', 'automation', 'automation_queued_at',
  'automation_sandbox', 'automation_worktree', 'automation_attempts',
  'automation_last_error', 'automation_preserved_path', 'branch', 'base_branch', 'scope',
  'related_files', 'spec_scope', 'depends_on', 'created_at', 'updated_at', 'verified_at',
  'archived_at', 'archived', 'workflow', 'automation_current_phase', 'automation_cause',
  'review_gate_phase', 'review_gate_status', 'review_gate_event', 'review_requested_at',
  'review_acknowledged_at',
]

function record(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value
}

function exactKeys(value, required, optional, label) {
  const observed = Object.keys(record(value, label))
  const allowed = new Set([...required, ...optional])
  const unknown = observed.filter((key) => !allowed.has(key))
  const missing = required.filter((key) => !observed.includes(key))
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${label} 闭集不兼容（unknown=${unknown.join(',') || '-'}; missing=${missing.join(',') || '-'}）`,
    )
  }
}

function validateRevision(value) {
  exactKeys(
    value,
    ['schemaVersion', 'hookState', 'revision', 'revisionId', 'state', 'mutation', 'stateDigest'],
    ['previousRevisionId'],
    'revision',
  )
  if (value.schemaVersion !== 1) throw new Error('schemaVersion 不是 1')
  exactKeys(
    value.hookState,
    ['phase', 'workflow', 'track', 'archived', 'automation'],
    [],
    'hookState',
  )
  exactKeys(value.state, ['fields', 'runMetadata', 'opaqueTail'], [], 'state')
  exactKeys(value.state.fields, FIELD_ORDER, [], 'state.fields')
  exactKeys(
    value.state.runMetadata,
    ['runId', 'transitionSequence'],
    ['transitionHead', 'automationPolicy', 'loopId', 'iterationId'],
    'state.runMetadata',
  )
  exactKeys(
    value.mutation,
    ['kind', 'observedAt', 'effects'],
    ['transitionRecordId', 'transitionRecordDigest'],
    'mutation',
  )
  const body = { ...value }
  delete body.stateDigest
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  if (digest !== value.stateDigest) throw new Error('stateDigest 不匹配')
  return value.state.fields.phase
}

const source = process.argv[2]
if (!source) {
  console.error('usage: node n-minus-one-canonical-reader.mjs <current.json>')
  process.exit(2)
}

try {
  const phase = validateRevision(JSON.parse(await readFile(source, 'utf8')))
  process.stdout.write(`${phase}\n`)
} catch (error) {
  console.error(`[n-minus-one-reader] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
