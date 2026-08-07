import { createHash, createHmac } from 'node:crypto'
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import {
  type HostSkillInvocationInteractionReceiptV1,
} from '@tenon/kernel'
import { recordHostSkillInvocationInteraction } from '../../../kernel/dist/skill-invocation/producer-internal.js'
import type { CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

const MAX_PAYLOAD_BYTES = 128 * 1024
const MAX_TEXT_BYTES = 8 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || Buffer.byteLength(value) > MAX_TEXT_BYTES) {
    throw new Error(`${field} must be a bounded non-empty string`)
  }
  return value
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${digest(value).slice(0, 32)}`
}

function questionKey(candidate: Record<string, unknown>, header: string, prompt: string): string {
  const explicit = typeof candidate.id === 'string' && candidate.id !== '' ? candidate.id : header
  const normalized = explicit.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized !== '' && normalized.length <= 160
    ? `host.${normalized}`
    : `host.${digest(`${header}\0${prompt}`).slice(0, 32)}`
}

function answers(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) throw new Error('tool_response.answers must be an object')
  const result: Record<string, string> = {}
  for (const [key, answer] of Object.entries(value)) {
    if (typeof answer !== 'string' || answer.trim() === '') throw new Error(`question '${key}' requires a non-empty answer`)
    result[key] = text(answer, `answer.${key}`)
  }
  return result
}

export function decodeHostInteractionPostToolUse(
  raw: string,
  recordedAt: string,
): HostSkillInvocationInteractionReceiptV1 {
  if (Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES) throw new Error('host interaction payload exceeds byte budget')
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch (error) {
    throw new Error(`host interaction payload is invalid JSON: ${String(error)}`)
  }
  if (!isRecord(decoded)
    || (decoded.tool_name !== 'AskUserQuestion' && decoded.tool_name !== 'request_user_input')
    || !isRecord(decoded.tool_input)
    || !Array.isArray(decoded.tool_input.questions)
    || decoded.tool_input.questions.length === 0
    || decoded.tool_input.questions.length > 3
    || !isRecord(decoded.tool_response)) {
    throw new Error('host interaction payload does not contain a supported structured response')
  }
  const answerByHeader = answers(decoded.tool_response.answers)
  const hasHostIdentity = typeof decoded.session_id === 'string'
    && typeof decoded.turn_id === 'string'
    && typeof decoded.tool_use_id === 'string'
    && decoded.session_id !== '' && decoded.turn_id !== '' && decoded.tool_use_id !== ''
  if (!hasHostIdentity) throw new Error('host interaction lacks exact session, turn, and tool identity')
  const sessionId = decoded.session_id as string
  const hostIdentity = createHash('sha256')
    .update(`${sessionId}\0${String(decoded.turn_id)}\0${String(decoded.tool_use_id)}`).digest()
  const questions = decoded.tool_input.questions.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`question ${index + 1} must be an object`)
    const header = text(candidate.header, `question ${index + 1}.header`)
    const prompt = text(candidate.question, `question ${index + 1}.question`)
    const rawOptions = candidate.options === undefined ? [] : candidate.options
    if (!Array.isArray(rawOptions) || rawOptions.length > 64) throw new Error(`question ${index + 1}.options is invalid`)
    const optionLabels = rawOptions.map((option, optionIndex) => {
      if (!isRecord(option)) throw new Error(`question ${index + 1}.option ${optionIndex + 1} must be an object`)
      return text(option.label, `question ${index + 1}.option ${optionIndex + 1}.label`)
    })
    const optionIds = optionLabels.map((label) => stableId('option', label))
    if (new Set(optionIds).size !== optionIds.length) throw new Error(`question ${index + 1} has duplicate options`)
    const answer = answerByHeader[header]
    if (answer === undefined) throw new Error(`question ${index + 1} requires a non-empty answer`)
    const selected = optionLabels.indexOf(answer)
    const selectedOptionId = selected < 0 ? undefined : optionIds[selected]
    return {
      question: {
        question_id: 'host-question',
        key: questionKey(candidate, header, prompt),
        schema_id: 'host-question/v1',
        option_ids: optionIds,
        requiredness: 'hard-gate' as const,
        shown: true,
      },
      decision: selectedOptionId !== undefined
        ? { selected_option_ids: [selectedOptionId] }
        : {
            selected_option_ids: [],
            free_text: {
              classification: 'user-provided' as const,
              digest: `sha256:${createHmac('sha256', hostIdentity).update(answer).digest('hex')}`,
            },
          },
    }
  })
  const suppliedReceiptId = typeof decoded.tool_use_id === 'string' ? decoded.tool_use_id : ''
  const receiptId = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u.test(suppliedReceiptId)
    ? suppliedReceiptId
    : stableId('host-event', JSON.stringify({ tool: decoded.tool_name, questions }))
  return {
    schema_version: 'host-skill-interaction-receipt/v1',
    receipt_id: receiptId,
    recorded_at: recordedAt,
    binding: { host_session_id: sessionId },
    questions,
  }
}

export async function cmdInternalHostInteraction(
  deps: CliDeps,
  changeName: string,
  payloadPath: string,
): Promise<number> {
  try {
    if (!isValidChangeName(changeName)) throw new Error('change name is invalid')
    const fd = openSync(payloadPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    let raw: string
    try {
      const before = fstatSync(fd)
      if (!before.isFile() || before.size > MAX_PAYLOAD_BYTES) {
        throw new Error('payload must be a bounded regular file')
      }
      raw = readFileSync(fd, 'utf8')
      const after = fstatSync(fd)
      if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
        || after.mtimeMs !== before.mtimeMs || Buffer.byteLength(raw) !== before.size) {
        throw new Error('payload changed during verified read')
      }
    } finally {
      closeSync(fd)
    }
    await recordHostSkillInvocationInteraction(
      changeDir(deps.cwd, changeName),
      decodeHostInteractionPostToolUse(raw, deps.clock()),
    )
    return 0
  } catch (error) {
    deps.io.err(`internal-host-interaction: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
