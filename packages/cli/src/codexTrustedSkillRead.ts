import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {
  isCompleteOutputSafeExecArguments,
  transcriptExecInvocations,
  type TranscriptExecInvocation,
} from './codexToolProgram.js'
import {
  successfulCustomStdout,
  successfulFunctionStdout,
} from './codexTranscriptCompletion.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export interface FunctionExecInvocation {
  readonly command: string
  readonly workdir?: string
}

export type OutputAbi = 'custom' | 'function'

export function functionExecInvocation(
  payload: Record<string, unknown>,
): FunctionExecInvocation | undefined {
  if (payload.type !== 'function_call' || asString(payload.name) !== 'exec_command') return undefined
  const argumentsText = asString(payload.arguments)
  if (!argumentsText) return undefined
  try {
    const args = JSON.parse(argumentsText) as unknown
    if (!isRecord(args) || !isCompleteOutputSafeExecArguments(args)) return undefined
    if (args.cmd !== undefined && args.command !== undefined) return undefined
    const command = asString(args.cmd) ?? asString(args.command)
    if (args.workdir !== undefined && typeof args.workdir !== 'string') return undefined
    return command === undefined ? undefined : { command, workdir: asString(args.workdir) }
  } catch {
    return undefined
  }
}

export async function outputMatchesTrustedSkillReads(
  output: unknown,
  outputAbi: OutputAbi,
  readPaths: readonly string[],
): Promise<boolean> {
  const stdout = outputAbi === 'custom'
    ? successfulCustomStdout(output)
    : successfulFunctionStdout(output)
  if (stdout === undefined) return false
  try {
    const expected = Buffer.concat(await Promise.all(readPaths.map((path) => readFile(path))))
    return Buffer.from(stdout, 'utf8').equals(expected)
  } catch {
    return false
  }
}

function decodeSingleShellWord(value: string): string | undefined {
  const singleQuoted = /^'([^'\r\n]*)'$/.exec(value)
  if (singleQuoted) return singleQuoted[1]
  const doubleQuoted = /^"([^"\\$`\r\n]*)"$/.exec(value)
  if (doubleQuoted) return doubleQuoted[1]
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
    ? value
    : undefined
}

/**
 * Decode one deliberately tiny shell grammar: `cat [--] <one literal path>`.
 *
 * A receipt proves that the model received the complete Skill, not merely that a process opened
 * the path. Options, partial readers, redirects, pipelines, substitutions, expansions, and wrapper
 * shells are therefore all outside the grammar and fail closed.
 */
function safeCompleteCatPath(segment: string): string | undefined {
  const match = /^cat[ \t]+(?:(?:--)[ \t]+)?(.+)$/.exec(segment.trim())
  return match?.[1] === undefined ? undefined : decodeSingleShellWord(match[1])
}

/** The decoded command must be a complete, literal read of the exact host-cache asset. */
export function commandTrustedSkillPaths(
  command: string,
  skillPath: string,
): readonly string[] | undefined {
  if (command.includes('||')) return undefined
  const segments = command.split(/&&|\r?\n/)
  if (segments.length === 0 || segments.some((segment) => segment.trim() === '')) return undefined
  const skillsRoot = resolve(skillPath, '..', '..')
  let observedRead = false
  const paths: string[] = []
  for (const segment of segments) {
    const path = safeCompleteCatPath(segment)
    // The transcript must identify the trusted asset independently of whichever cwd later
    // verifies the receipt. Resolving relative operands here would let verifier cwd choose trust.
    if (path === undefined || !isAbsolute(path)) return undefined
    const resolvedPath = resolve(path)
    const siblingPath = relative(skillsRoot, resolvedPath)
    if (
      siblingPath === ''
      || isAbsolute(siblingPath)
      || siblingPath === '..'
      || siblingPath.startsWith(`..${sep}`)
    ) return undefined
    const sibling = siblingPath.split(sep)
    if (sibling.length !== 2 || sibling[0] === '' || sibling[1] !== 'SKILL.md') return undefined
    if (resolvedPath === skillPath) observedRead = true
    paths.push(resolvedPath)
  }
  return observedRead ? paths : undefined
}

/** The transcript stores tool-program source, so inspect only its decoded, executed command values. */
export function transcriptInputTrustedSkillInvocation(
  input: string,
  skillPath: string,
): TranscriptExecInvocation | undefined {
  const invocations = transcriptExecInvocations(input)
  const invocation = invocations.length === 1 ? invocations[0] : undefined
  return invocation && commandTrustedSkillPaths(invocation.command, skillPath) ? invocation : undefined
}
