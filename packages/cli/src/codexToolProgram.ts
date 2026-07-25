interface ParsedString {
  readonly value: string
  readonly end: number
}

function jsonStringAt(source: string, start: number): ParsedString | undefined {
  if (source[start] !== '"') return undefined
  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char !== '"') continue
    try {
      const value = JSON.parse(source.slice(start, index + 1)) as unknown
      return typeof value === 'string' ? { value, end: index + 1 } : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function commandFromSafeObjectLiteral(source: string): string | undefined {
  let cursor = 1
  while (cursor < source.length - 1) {
    while (/[\s,]/.test(source[cursor] ?? '')) cursor += 1
    const quotedKey = jsonStringAt(source, cursor)
    let key: string
    if (quotedKey) {
      key = quotedKey.value
      cursor = quotedKey.end
    } else {
      const identifier = /^[$A-Z_a-z][$\w]*/.exec(source.slice(cursor))
      if (!identifier) return undefined
      key = identifier[0]
      cursor += key.length
    }
    while (/\s/.test(source[cursor] ?? '')) cursor += 1
    if (source[cursor] !== ':') return undefined
    cursor += 1
    while (/\s/.test(source[cursor] ?? '')) cursor += 1
    const stringValue = jsonStringAt(source, cursor)
    if (key === 'cmd' || key === 'command') return stringValue?.value
    if (!stringValue) return undefined
    cursor = stringValue.end
  }
  return undefined
}

function commandFromObjectLiteral(source: string): string | undefined {
  try {
    const parsed = JSON.parse(source) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    const command = record.cmd ?? record.command
    return typeof command === 'string' ? command : undefined
  } catch {
    return commandFromSafeObjectLiteral(source)
  }
}

/**
 * Decode only the bounded `tools.exec_command({ ... })` object literal emitted by Codex.
 * Both JSON objects and the current ABI's unquoted safe keys are accepted; expressions,
 * computed keys, template literals, and non-string command values fail closed.
 */
export function transcriptExecCommands(input: string): readonly string[] {
  const marker = 'tools.exec_command('
  const commands: string[] = []
  let cursor = 0

  while (cursor < input.length) {
    const markerAt = input.indexOf(marker, cursor)
    if (markerAt < 0) break
    let objectStart = markerAt + marker.length
    while (/\s/.test(input[objectStart] ?? '')) objectStart += 1
    if (input[objectStart] !== '{') {
      cursor = markerAt + marker.length
      continue
    }

    let depth = 0
    let inString = false
    let escaped = false
    let objectEnd: number | undefined
    for (let index = objectStart; index < input.length; index += 1) {
      const char = input[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          objectEnd = index + 1
          break
        }
        if (depth < 0) break
      }
    }

    if (objectEnd === undefined) {
      cursor = markerAt + marker.length
      continue
    }
    const command = commandFromObjectLiteral(input.slice(objectStart, objectEnd))
    if (command) commands.push(command)
    cursor = objectEnd
  }
  return commands
}
