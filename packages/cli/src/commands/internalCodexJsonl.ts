/** Host-owned bridge from `codex exec --json` JSONL to trusted runner facts. */
import { readFileSync } from 'node:fs'
import { parseCodexJsonlUsage } from '@pipeline-lite/automation'
import type { CliDeps } from '../deps.js'

const visitStrings = (value: unknown, emit: (value: string) => void): void => {
  if (typeof value === 'string') {
    emit(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) visitStrings(item, emit)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) visitStrings(item, emit)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const diagnosticMessage = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 400)

export async function cmdInternalCodexJsonl(
  deps: CliDeps,
  mode: string,
  jsonlPath: string,
): Promise<number> {
  if (mode !== 'usage' && mode !== 'transitions' && mode !== 'last-message') {
    deps.io.err(`internal-codex-jsonl: unsupported mode '${mode}'`)
    return 1
  }
  try {
    const jsonl = readFileSync(jsonlPath, 'utf8')
    if (mode === 'usage') {
      const usage = parseCodexJsonlUsage(jsonl)
      if (usage !== undefined) deps.io.out(JSON.stringify(usage))
      return 0
    }
    let lastAgentMessage: string | undefined
    for (const [index, rawLine] of jsonl.split(/\r?\n/).entries()) {
      const line = rawLine.trim()
      if (line.length === 0) continue
      let event: unknown
      try {
        event = JSON.parse(line)
      } catch (error) {
        throw new Error(`Codex JSONL line ${index + 1} is invalid: ${String(error)}`)
      }
      if (mode === 'transitions') {
        visitStrings(event, (text) => {
          for (const embeddedLine of text.split(/\r?\n/)) {
            if (embeddedLine.startsWith('[TRANSITION] ')) deps.io.out(embeddedLine)
          }
        })
      } else if (isRecord(event) && event.type === 'item.completed' && isRecord(event.item)
        && event.item.type === 'agent_message' && typeof event.item.text === 'string') {
        const message = diagnosticMessage(event.item.text)
        if (message.length > 0) lastAgentMessage = message
      }
    }
    if (mode === 'last-message' && lastAgentMessage !== undefined) deps.io.out(lastAgentMessage)
    return 0
  } catch (error) {
    deps.io.err(`internal-codex-jsonl: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
