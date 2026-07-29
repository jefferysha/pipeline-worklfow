#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const PREFIX = '# tenon-internal-transition-head-v1: '
const PRE_VERIFY_PREFIX = '# tenon-internal-pre-verify-review-v1: '
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/
const SHA256_RE = /^[0-9a-f]{64}$/

function scalar(lines, key) {
  const prefix = `${key}:`
  const matches = lines.filter((line) => line.startsWith(prefix))
  if (matches.length !== 1) return undefined
  return matches[0].slice(prefix.length).trim()
}

function decodeClosedObject(encoded, expectedKeys) {
  if (!SAFE_ID_RE.test(encoded)) return undefined
  let value
  try {
    const decoded = Buffer.from(encoded, 'base64url')
    if (decoded.toString('base64url') !== encoded) return undefined
    value = JSON.parse(decoded.toString('utf8'))
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (Object.keys(value).sort().join(',') !== [...expectedKeys].sort().join(',')) return undefined
  return value
}

function validPreVerifyAnchor(line, revision, revisionId) {
  if (!line.startsWith(PRE_VERIFY_PREFIX)) return false
  const value = decodeClosedObject(
    line.slice(PRE_VERIFY_PREFIX.length),
    ['schemaVersion', 'revision', 'revisionId', 'payloadDigest'],
  )
  return value !== undefined
    && value.schemaVersion === 1
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0
    && value.revision === revision
    && typeof value.revisionId === 'string'
    && SAFE_ID_RE.test(value.revisionId)
    && value.revisionId === revisionId
    && typeof value.payloadDigest === 'string'
    && SHA256_RE.test(value.payloadDigest)
}

function validTransitionAnchor(line, metadata) {
  if (!line.startsWith(PREFIX)) return false
  const value = decodeClosedObject(
    line.slice(PREFIX.length),
    ['schemaVersion', 'runId', 'sequence', 'recordId', 'recordDigest'],
  )
  return value !== undefined
    && value.schemaVersion === 1
    && typeof value.runId === 'string'
    && SAFE_ID_RE.test(value.runId)
    && value.runId === metadata.runId
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 1
    && value.sequence === metadata.sequence
    && typeof value.recordId === 'string'
    && SAFE_ID_RE.test(value.recordId)
    && value.recordId === metadata.recordId
    && typeof value.recordDigest === 'string'
    && SHA256_RE.test(value.recordDigest)
}

const file = process.argv[2]
if (!file) process.exit(2)

let lines
try {
  lines = readFileSync(file, 'utf8').replace(/\n$/, '').split('\n')
} catch {
  process.exit(2)
}

const anchorIndexes = lines.flatMap((line, index) => line.startsWith(PREFIX) ? [index] : [])
if (anchorIndexes.length === 0) process.exit(3)
if (anchorIndexes.length !== 1) process.exit(2)

const runId = scalar(lines, 'pipeline_run_id')
const sequenceRaw = scalar(lines, 'pipeline_transition_sequence')
const recordId = scalar(lines, 'pipeline_transition_head')
const revisionRaw = scalar(lines, 'pipeline_state_revision')
const revisionId = scalar(lines, 'pipeline_state_revision_id')
const stateDigest = scalar(lines, 'pipeline_state_digest')
const sequence = Number(sequenceRaw)
const revision = Number(revisionRaw)
if (runId === undefined || !SAFE_ID_RE.test(runId)
  || !Number.isSafeInteger(sequence) || sequence < 1
  || recordId === undefined || !SAFE_ID_RE.test(recordId)
  || !Number.isSafeInteger(revision) || revision < 0
  || revisionId === undefined || !SAFE_ID_RE.test(revisionId)
  || stateDigest === undefined || !SHA256_RE.test(stateDigest)) {
  process.exit(2)
}

const digestIndex = lines.findIndex((line) => line.startsWith('pipeline_state_digest:'))
if (digestIndex < 0) process.exit(2)
let expectedIndex = digestIndex + 1
if (lines[expectedIndex]?.startsWith(PRE_VERIFY_PREFIX)) {
  if (!validPreVerifyAnchor(lines[expectedIndex], revision, revisionId)) process.exit(2)
  expectedIndex += 1
}
if (anchorIndexes[0] !== expectedIndex) process.exit(2)
if (!validTransitionAnchor(lines[expectedIndex], { runId, sequence, recordId })) process.exit(2)

process.exit(0)
