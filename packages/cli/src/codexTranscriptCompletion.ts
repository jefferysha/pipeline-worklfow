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

function scriptStates(value: unknown): string[] {
  return outputStrings(value).flatMap((text) =>
    [...text.matchAll(/(?:^|\n)Script (completed|failed)(?=\n|$)/g)]
      .map((match) => match[1] ?? ''),
  )
}

export function successfulFunctionOutput(value: unknown): boolean {
  if (scriptStates(value).includes('failed')) return false
  const textExitCodes = outputStrings(value).flatMap((text) =>
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

function parsedResultEnvelopeExitCode(text: string): number | undefined {
  try {
    const value = JSON.parse(text) as unknown
    if (
      !isRecord(value)
      || typeof value.output !== 'string'
      || typeof value.wall_time_seconds !== 'number'
      || !Number.isFinite(value.wall_time_seconds)
      || value.wall_time_seconds < 0
    ) return undefined
    return topLevelExitCode(value)
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
  const states = scriptStates(value)
  if (!states.includes('completed') || states.includes('failed')) return false
  const values = Array.isArray(value) ? value : [value]
  const exitCodes = values.flatMap((item) => {
    if (typeof item === 'string') {
      const parsed = parsedResultEnvelopeExitCode(item.trim())
      return parsed === undefined ? [] : [parsed]
    }
    if (!isRecord(item)) return []
    if (item.type === 'input_text') {
      const text = asString(item.text)
      const parsed = text === undefined ? undefined : parsedResultEnvelopeExitCode(text.trim())
      return parsed === undefined ? [] : [parsed]
    }
    if (item.type === 'execution_result') {
      const code = topLevelExitCode(item)
      return code === undefined ? [] : [code]
    }
    const code = topLevelExitCode(item)
    return code === undefined ? [] : [code]
  })
  return exitCodes.length > 0 && exitCodes.every((status) => status === 0)
}
