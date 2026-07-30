function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function explicitExitCodes(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap((item) => explicitExitCodes(item))
  if (!isRecord(value)) return []
  const nested = Object.entries(value)
    .filter(([key]) => key !== 'exit_code')
    .flatMap(([, item]) => explicitExitCodes(item))
  return typeof value.exit_code === 'number' ? [value.exit_code, ...nested] : nested
}

function outputStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((item) => outputStrings(item))
  if (!isRecord(value)) return []
  return Object.values(value).flatMap((item) => outputStrings(item))
}

function hostEnvelopeStrings(value: unknown): string[] {
  const marker = '\nOutput:\n'
  return outputStrings(value).map((text) => {
    const boundary = text.indexOf(marker)
    return boundary === -1 ? text : text.slice(0, boundary)
  })
}

function scriptStates(value: unknown): string[] {
  return hostEnvelopeStrings(value).flatMap((text) =>
    [...text.matchAll(/(?:^|\n)Script (completed|failed)(?=\n|$)/g)]
      .map((match) => match[1] ?? ''),
  )
}

function customHostHeaderState(item: unknown): 'completed' | 'failed' | undefined {
  const text = typeof item === 'string'
    ? item
    : isRecord(item) && item.type === 'input_text'
      ? asString(item.text)
      : undefined
  if (text === undefined) return undefined
  const marker = '\nOutput:\n'
  const boundary = text.indexOf(marker)
  if (boundary === -1 || boundary !== text.length - marker.length) return undefined
  const states = [...text.slice(0, boundary).matchAll(
    /(?:^|\n)Script (completed|failed)(?=\n|$)/g,
  )].map((match) => match[1])
  if (states.length !== 1) return undefined
  return states[0] as 'completed' | 'failed'
}

export function successfulFunctionOutput(value: unknown): boolean {
  if (scriptStates(value).includes('failed')) return false
  const textExitCodes = hostEnvelopeStrings(value).flatMap((text) =>
    [...text.matchAll(
      /(?:Process exited with code|exit_code["']?\s*:)\s*(\d+)\b/g,
    )].map((match) => Number(match[1])),
  )
  const exitCodes = [...explicitExitCodes(value), ...textExitCodes]
  if (exitCodes.some((status) => status !== 0)) return false
  if (new Set(exitCodes).size > 1) return false
  return exitCodes.length > 0
}

function topLevelExitCode(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.exit_code === 'number' && Number.isInteger(value.exit_code)
    ? value.exit_code
    : undefined
}

function completeResultEnvelopeExitCode(value: unknown): number | undefined {
  if (
    !isRecord(value)
    || typeof value.chunk_id !== 'string'
    || value.chunk_id.length === 0
    || typeof value.output !== 'string'
    || typeof value.wall_time_seconds !== 'number'
    || !Number.isFinite(value.wall_time_seconds)
    || value.wall_time_seconds < 0
    || typeof value.original_token_count !== 'number'
    || !Number.isInteger(value.original_token_count)
    || value.original_token_count < 0
  ) return undefined
  return topLevelExitCode(value)
}

interface CompleteResultEnvelope {
  readonly exitCode: number
  readonly output: string
}

function parsedCompleteResultEnvelope(text: string): CompleteResultEnvelope | undefined {
  try {
    const value = JSON.parse(text) as unknown
    const exitCode = completeResultEnvelopeExitCode(value)
    if (exitCode === undefined || !isRecord(value) || typeof value.output !== 'string') return undefined
    return { exitCode, output: value.output }
  } catch {
    return undefined
  }
}

interface CustomCompletion {
  readonly exitCode: number
  readonly stdout: string
}

function parsedCustomCompletion(value: unknown): CustomCompletion | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  if (customHostHeaderState(value[0]) !== 'completed') return undefined

  const typedResultIndexes = value.flatMap((item, index) =>
    isRecord(item) && item.type === 'execution_result' ? [index] : [],
  )
  if (typedResultIndexes.length > 0) {
    const resultIndex = typedResultIndexes[0]
    if (
      typedResultIndexes.length !== 1
      || resultIndex !== value.length - 1
      || value.slice(1, resultIndex).some((item) =>
        !isRecord(item) || item.type !== 'input_text' || typeof item.text !== 'string'
      )
    ) return undefined
    const exitCode = topLevelExitCode(value[resultIndex])
    if (exitCode === undefined) return undefined
    return {
      exitCode,
      stdout: value.slice(1, resultIndex)
        .map((item) => (item as { readonly text: string }).text)
        .join(''),
    }
  }

  if (value.length !== 2) return undefined
  const payload = value[1]
  const text = typeof payload === 'string'
    ? payload
    : isRecord(payload) && payload.type === 'input_text'
      ? asString(payload.text)
      : undefined
  if (text === undefined) return undefined
  const envelope = parsedCompleteResultEnvelope(text)
  return envelope === undefined
    ? undefined
    : { exitCode: envelope.exitCode, stdout: envelope.output }
}

/**
 * `text(result)` is surfaced by current Codex as `Script completed` plus a JSON serialization of
 * the complete nested result. Only that envelope's own numeric exit_code (or the older typed
 * execution_result sibling) is authoritative; stdout is untrusted and cannot manufacture it.
 */
export function successfulCustomOutput(value: unknown): boolean {
  return parsedCustomCompletion(value)?.exitCode === 0
}

/** Return only the stdout bytes forwarded by a successful function-call exec envelope. */
export function successfulFunctionStdout(value: unknown): string | undefined {
  if (typeof value !== 'string' || !successfulFunctionOutput(value)) return undefined
  const marker = '\nOutput:\n'
  const boundary = value.indexOf(marker)
  return boundary === -1 ? undefined : value.slice(boundary + marker.length)
}

/** Return only the stdout bytes forwarded by a successful custom exec envelope. */
export function successfulCustomStdout(value: unknown): string | undefined {
  const completion = parsedCustomCompletion(value)
  return completion?.exitCode === 0 ? completion.stdout : undefined
}
