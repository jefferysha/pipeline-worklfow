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

function customHostEnvelopeStrings(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  const item = values[0]
  const text = typeof item === 'string'
    ? item
    : isRecord(item) && item.type === 'input_text'
      ? asString(item.text)
      : undefined
  if (text === undefined || !/^Script (?:completed|failed)(?:\n|$)/.test(text)) return []
  const boundary = text.indexOf('\nOutput:\n')
  return boundary === -1 ? [] : [text.slice(0, boundary)]
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

/**
 * `text(result)` is surfaced by current Codex as `Script completed` plus a JSON serialization of
 * the complete nested result. Only that envelope's own numeric exit_code (or the older typed
 * execution_result sibling) is authoritative; stdout is untrusted and cannot manufacture it.
 */
export function successfulCustomOutput(value: unknown): boolean {
  const states = customHostEnvelopeStrings(value).flatMap((text) =>
    [...text.matchAll(/(?:^|\n)Script (completed|failed)(?=\n|$)/g)]
      .map((match) => match[1] ?? ''),
  )
  if (!states.includes('completed') || states.includes('failed')) return false
  const values = Array.isArray(value) ? value : [value]
  const typedResults = values.filter((item) => isRecord(item) && item.type === 'execution_result')
  if (typedResults.length > 0) {
    return typedResults.length === 1 && topLevelExitCode(typedResults[0]) === 0
  }
  const exitCodes = values.flatMap((item) => {
    if (typeof item === 'string') {
      const parsed = parsedCompleteResultEnvelope(item.trim())
      return parsed === undefined ? [] : [parsed.exitCode]
    }
    if (!isRecord(item)) return []
    if (item.type === 'input_text') {
      const text = asString(item.text)
      const parsed = text === undefined ? undefined : parsedCompleteResultEnvelope(text.trim())
      return parsed === undefined ? [] : [parsed.exitCode]
    }
    return []
  })
  return exitCodes.length === 1 && exitCodes[0] === 0
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
  if (!successfulCustomOutput(value)) return undefined
  const values = Array.isArray(value) ? value : [value]
  const typedResults = values.filter((item) => isRecord(item) && item.type === 'execution_result')
  if (typedResults.length > 0) {
    if (typedResults.length !== 1 || topLevelExitCode(typedResults[0]) !== 0) return undefined
    return values.slice(1).flatMap((item) =>
      isRecord(item)
      && item.type === 'input_text'
      && typeof item.text === 'string'
        ? [item.text]
        : [],
    ).join('')
  }
  const envelopes = values.flatMap((item) => {
    if (typeof item === 'string') {
      const parsed = parsedCompleteResultEnvelope(item.trim())
      return parsed === undefined ? [] : [parsed]
    }
    if (!isRecord(item) || item.type !== 'input_text') return []
    const text = asString(item.text)
    const parsed = text === undefined ? undefined : parsedCompleteResultEnvelope(text.trim())
    return parsed === undefined ? [] : [parsed]
  })
  if (envelopes.length > 0) {
    return envelopes.length === 1 ? envelopes[0]?.output : undefined
  }

  return undefined
}
