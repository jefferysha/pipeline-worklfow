import { appendFile, mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HistoryWriter } from '@pipeline-lite/kernel'
import {
  cmdInternalCodexSkillReceipt,
  reconcileCodexSkillEvidence,
} from './codexSkillReceipt.js'
import { makeDeps } from './test-support.js'

let root = ''
let home = ''
let changeDir = ''
let skillPath = ''
let writingPlansPath = ''
let transcript = ''

const turnId = 'turn-verified-1'
const LEGACY_RECEIPT_TRANSCRIPT_LIMIT = 64 * 1024 * 1024

function eventLines(
  output?: string,
  outputTurn = turnId,
  skillPaths: readonly string[] = [skillPath],
): string {
  const command = skillPaths.map((path) => `sed -n '1,120p' ${path}`).join(' && ')
  const events: unknown[] = [
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        status: 'completed',
        call_id: 'call-skill-read',
        name: 'exec',
        input: `const r = await tools.exec_command({"cmd":"${command}"});`,
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  if (output !== undefined) {
    events.push({
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call-skill-read',
        output,
        internal_chat_message_metadata_passthrough: { turn_id: outputTurn },
      },
    })
  }
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

function sessionScopedEventLines(
  sessionCwd: string,
  output = 'Script completed\nWall time 0.1 seconds\n',
  skillPaths: readonly string[] = [skillPath],
  sessionId?: string,
): string {
  const payload = sessionId === undefined ? { cwd: sessionCwd } : { cwd: sessionCwd, session_id: sessionId, id: sessionId }
  return `${JSON.stringify({ type: 'session_meta', payload })}\n${eventLines(output, turnId, skillPaths)}`
}

/** Mirrors the normal Codex transcript shape: `cmd` is JSON-encoded inside JavaScript source. */
function multilineSessionScopedEventLines(sessionCwd: string): string {
  const command = [
    'pipeline internal-skill-gate receipt-proof openspec-propose',
    `wc -l ${skillPath}`,
    `sed -n '1,120p' ${skillPath}`,
  ].join('\n')
  const events: unknown[] = [
    { type: 'session_meta', payload: { cwd: sessionCwd } },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        status: 'completed',
        call_id: 'call-multiline-skill-read',
        name: 'exec',
        input: `const result = await tools.exec_command(${JSON.stringify({ cmd: command })});`,
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call-multiline-skill-read',
        output: 'Script completed\nWall time 0.1 seconds\n',
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

/** Current Codex Desktop ABI: function_call(exec_command) + function_call_output. */
function functionCallSessionScopedEventLines(sessionCwd: string): string {
  const command = `wc -l ${skillPath} && sed -n '1,120p' ${skillPath}`
  const events: unknown[] = [
    { type: 'session_meta', payload: { cwd: sessionCwd } },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call-function-skill-read',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: command }),
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call-function-skill-read',
        output: 'Chunk ID: abc123\nWall time: 0.001 seconds\nProcess exited with code 0\n',
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

async function recordPendingReceipt(): Promise<void> {
  const deps = makeDeps({ cwd: root })
  expect(await cmdInternalCodexSkillReceipt(
    deps,
    'receipt-proof',
    'openspec-propose',
    skillPath,
    transcript,
    'session-verified-1',
    turnId,
    'exec-verified-1',
    { homeDir: () => home, codexHomeDir: () => join(home, '.codex') },
  )).toBe(0)
}

const historyWriter: HistoryWriter = {
  append: async (dir, entry): Promise<void> => {
    await appendFile(join(dir, '.pipeline-history.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8')
  },
}

describe('Codex transcript skill receipt', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-skill-receipt-'))
    home = join(root, 'home')
    changeDir = join(root, 'openspec', 'changes', 'receipt-proof')
    skillPath = join(home, '.codex', 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite', '0.2.0', 'skills', 'openspec-propose', 'SKILL.md')
    writingPlansPath = join(home, '.codex', 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite', '0.2.0', 'skills', 'writing-plans', 'SKILL.md')
    transcript = join(home, '.codex', 'sessions', '2026', '07', '24', 'receipt.jsonl')
    await Promise.all([
      mkdir(changeDir, { recursive: true }),
      mkdir(dirname(skillPath), { recursive: true }),
      mkdir(dirname(writingPlansPath), { recursive: true }),
      mkdir(dirname(transcript), { recursive: true }),
    ])
    await writeFile(skillPath, '# OpenSpec Propose\n', 'utf8')
    await writeFile(writingPlansPath, '# Writing Plans\n', 'utf8')
  })

  afterEach(async () => {
    if (root !== '') await rm(root, { recursive: true, force: true })
  })

  it('does not turn a PreToolUse receipt into evidence until the host transcript has a matching successful completion', async () => {
    await writeFile(transcript, eventLines(), 'utf8')
    await recordPendingReceipt()

    const pending = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(pending.confirmedSkillIds).toEqual([])
    await expect(readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(transcript, eventLines('Script completed\nWall time 0.1 seconds\n'), 'utf8')
    const confirmed = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:01Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(confirmed.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).toContain('CodexSkillRead: openspec-propose')
  })

  it('discovers unresolved skills after another skill in the same batched exec has a strict receipt', async () => {
    await writeFile(transcript, sessionScopedEventLines(root, undefined, [skillPath, writingPlansPath]), 'utf8')
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      candidateSkillIds: ['openspec-propose', 'writing-plans'],
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose', 'writing-plans'])
    const history = await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')
    expect(history).toContain('CodexSkillRead: openspec-propose')
    expect(history).toContain('CodexSkillRead: writing-plans')
  })

  it('fails closed for a successful-looking output from another turn', async () => {
    await writeFile(transcript, eventLines('Script completed', 'turn-other'), 'utf8')
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('never lets a receipt bound to one Change satisfy another Change', async () => {
    await writeFile(transcript, eventLines('Script completed'), 'utf8')
    await recordPendingReceipt()
    const otherChangeDir = join(root, 'openspec', 'changes', 'other-change')
    await mkdir(otherChangeDir, { recursive: true })

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir: otherChangeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual([])
    await expect(readFile(join(otherChangeDir, '.pipeline-history.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a project-controlled SKILL.md path before it can enter the receipt journal', async () => {
    const projectSkill = join(root, 'skills', 'openspec-propose', 'SKILL.md')
    await mkdir(dirname(projectSkill), { recursive: true })
    await writeFile(projectSkill, '# forged\n', 'utf8')
    const deps = makeDeps({ cwd: root })
    expect(await cmdInternalCodexSkillReceipt(
      deps,
      'receipt-proof',
      'openspec-propose',
      projectSkill,
      transcript,
      'session-verified-1',
      turnId,
      'exec-verified-1',
    { homeDir: () => home, codexHomeDir: () => join(home, '.codex') },
    )).toBe(1)
    await expect(readFile(join(root, '.pipeline', 'codex-skill-receipts.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reconciles a completed host session when Codex omits the PreToolUse receipt identity', async () => {
    await writeFile(transcript, sessionScopedEventLines(root), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).toContain('CodexSkillRead: openspec-propose')
  })

  it('reconciles a later multiline read from Codex JSON-encoded tool-program source', async () => {
    await writeFile(transcript, multilineSessionScopedEventLines(root), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).toContain('CodexSkillRead: openspec-propose')
  })

  it('reconciles the current Codex Desktop function_call exec ABI', async () => {
    await writeFile(transcript, functionCallSessionScopedEventLines(root), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).toContain('CodexSkillRead: openspec-propose')
  })

  it('uses the exact router-bound host session when fallback discovery has no receipt identity', async () => {
    const boundTranscript = join(home, '.codex', 'sessions', '2026', '07', '24', 'bound.jsonl')
    await writeFile(transcript, sessionScopedEventLines(root, undefined, [skillPath], 'session-old'), 'utf8')
    await writeFile(boundTranscript, sessionScopedEventLines(root, undefined, [], 'session-current'), 'utf8')
    const bindingsDir = join(root, '.pipeline', 'terminal-sessions')
    await mkdir(bindingsDir, { recursive: true })
    await writeFile(join(bindingsDir, 'session-current.json'), `${JSON.stringify({
      protocol: 'pipeline-terminal-session-v1',
      session_id: 'session-current',
      change: 'receipt-proof',
      bound_at: '2026-07-24T00:01:00Z',
    })}\n`, 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:02:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual([])
    await expect(readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('proves the skill again after a workflow loop re-enters the same phase, then deduplicates within that visit', async () => {
    await writeFile(transcript, sessionScopedEventLines(root), 'utf8')
    await writeFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-24T00:00:00Z', kind: 'tool', raw: 'CodexSkillRead: openspec-propose' }),
      JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'transition', from: 'build', to: 'spec', event: 'requirements-changed' }),
      '',
    ].join('\n'), 'utf8')

    const first = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:02:00Z',
      history: historyWriter,
      evidenceScope: 'spec',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(first.confirmedSkillIds).toEqual(['openspec-propose'])

    const second = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      evidenceScope: 'spec',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(second.confirmedSkillIds).toEqual([])
    const history = await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')
    expect(history.match(/CodexSkillRead: openspec-propose/g)).toHaveLength(2)
  })

  it('reconciles a current host session larger than the direct-receipt cap', async () => {
    await writeFile(transcript, sessionScopedEventLines(root), 'utf8')
    // A long-lived Codex task can legitimately pass the strict 64 MiB direct-receipt cap.  The
    // discovery route must still accept its host-owned, completed read within its larger budget.
    await truncate(transcript, LEGACY_RECEIPT_TRANSCRIPT_LIMIT + 1)

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).toContain('CodexSkillRead: openspec-propose')
  })

  it('does not discover a matching read from a host session belonging to another project', async () => {
    const otherProject = join(root, 'other-project')
    await mkdir(otherProject, { recursive: true })
    await writeFile(transcript, sessionScopedEventLines(otherProject), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:00:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual([])
    await expect(readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
