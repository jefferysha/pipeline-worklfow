import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HistoryWriter } from '@pipeline-lite/kernel'
import {
  cmdInternalCodexSkillReceipt,
  reconcileCodexSkillEvidence as reconcileCodexSkillEvidenceRaw,
} from './codexSkillReceipt.js'
import type { CodexSkillEvidenceInput, CodexSkillEvidenceResult } from './codexSkillReceipt.js'
import { trustedCodexSkillPath } from './codexSkillTrust.js'
import type { CodexSkillTrustRoots } from './codexSkillTrust.js'
import { makeDeps } from './test-support.js'

let root = ''
let home = ''
let changeDir = ''
let selectedPluginRoot = ''
let skillPath = ''
let writingPlansPath = ''
let transcript = ''

const turnId = 'turn-verified-1'
const sessionId = 'session-verified-1'
const toolUseId = 'call-skill-read'
const LEGACY_RECEIPT_TRANSCRIPT_LIMIT = 64 * 1024 * 1024

function reconcileCodexSkillEvidence(
  input: Omit<CodexSkillEvidenceInput, 'selectedPluginRoot'> & { readonly selectedPluginRoot?: string },
): Promise<CodexSkillEvidenceResult> {
  return reconcileCodexSkillEvidenceRaw({ selectedPluginRoot, ...input })
}

function eventLines(
  output?: string,
  outputTurn = turnId,
  skillPaths: readonly string[] = [skillPath],
  timestamp = '2026-07-24T00:02:00Z',
  options: {
    readonly transcriptSessionId?: string
    readonly callId?: string
    readonly outputCallId?: string
  } = {},
): string {
  const callId = options.callId ?? toolUseId
  const command = skillPaths.map((path) => `sed -n '1,120p' ${path}`).join(' && ')
  const events: unknown[] = [
    {
      type: 'session_meta',
      timestamp,
      payload: {
        cwd: root,
        session_id: options.transcriptSessionId ?? sessionId,
        id: options.transcriptSessionId ?? sessionId,
      },
    },
    {
      type: 'response_item',
      timestamp,
      payload: {
        type: 'custom_tool_call',
        status: 'completed',
        call_id: callId,
        name: 'exec',
        input: `const r = await tools.exec_command({"cmd":"${command}"});`,
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  if (output !== undefined) {
    events.push({
      type: 'response_item',
      timestamp,
      payload: {
        type: 'custom_tool_call_output',
        call_id: options.outputCallId ?? callId,
        output,
        internal_chat_message_metadata_passthrough: { turn_id: outputTurn },
      },
    })
  }
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

function sessionScopedEventLines(
  sessionCwd: string,
  output = 'Process exited with code 0\nWall time 0.1 seconds\n',
  skillPaths: readonly string[] = [skillPath],
  transcriptSessionId?: string,
): string {
  const effectiveSessionId = transcriptSessionId ?? sessionId
  return eventLines(output, turnId, skillPaths, '2026-07-24T00:02:00Z', {
    transcriptSessionId: effectiveSessionId,
  }).replace(`"cwd":"${root}"`, `"cwd":"${sessionCwd}"`)
}

/** Mirrors the normal Codex transcript shape: `cmd` is JSON-encoded inside JavaScript source. */
function multilineSessionScopedEventLines(sessionCwd: string): string {
  const command = [
    `wc -l ${skillPath}`,
    `sed -n '1,120p' ${skillPath}`,
  ].join('\n')
  const events: unknown[] = [
    {
      type: 'session_meta',
      timestamp: '2026-07-24T00:02:00Z',
      payload: { cwd: sessionCwd, session_id: sessionId, id: sessionId },
    },
    {
      type: 'response_item',
      timestamp: '2026-07-24T00:02:00Z',
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
      timestamp: '2026-07-24T00:02:00Z',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call-multiline-skill-read',
        output: 'Process exited with code 0\nWall time 0.1 seconds\n',
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

/** Current custom exec ABI can serialize a JavaScript object literal with unquoted safe keys. */
function unquotedObjectSessionScopedEventLines(sessionCwd: string): string {
  const command = `wc -l ${skillPath}\nsed -n '1,120p' ${skillPath}`
  const events: unknown[] = [
    {
      type: 'session_meta',
      timestamp: '2026-07-24T00:02:00Z',
      payload: { cwd: sessionCwd, session_id: sessionId, id: sessionId },
    },
    {
      type: 'response_item',
      timestamp: '2026-07-24T00:02:00Z',
      payload: {
        type: 'custom_tool_call',
        status: 'completed',
        call_id: 'call-unquoted-object-skill-read',
        name: 'exec',
        input: `const result = await tools.exec_command({cmd:${JSON.stringify(command)},workdir:${JSON.stringify(sessionCwd)}});`,
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-07-24T00:02:00Z',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call-unquoted-object-skill-read',
        output: 'Process exited with code 0\nWall time 0.1 seconds\n',
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
  ]
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

/** Current Codex Desktop ABI: function_call(exec_command) + function_call_output. */
function functionCallSessionScopedEventLines(sessionCwd: string, workdir?: string): string {
  const command = `wc -l ${skillPath} && sed -n '1,120p' ${skillPath}`
  const events: unknown[] = [
    {
      type: 'session_meta',
      timestamp: '2026-07-24T00:02:00Z',
      payload: { cwd: sessionCwd, session_id: sessionId, id: sessionId },
    },
    {
      type: 'response_item',
      timestamp: '2026-07-24T00:02:00Z',
      payload: {
        type: 'function_call',
        call_id: 'call-function-skill-read',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: command, ...(workdir === undefined ? {} : { workdir }) }),
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-07-24T00:02:00Z',
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

async function recordPendingReceipt(receiptToolUseId = toolUseId): Promise<void> {
  const deps = { ...makeDeps({ cwd: root }), clock: (): string => '2026-07-24T00:02:00Z' }
  expect(await cmdInternalCodexSkillReceipt(
    deps,
    'receipt-proof',
    'openspec-propose',
    skillPath,
    transcript,
    sessionId,
    turnId,
    receiptToolUseId,
    {
      homeDir: () => home,
      codexHomeDir: () => join(home, '.codex'),
      selectedPluginRoot: () => selectedPluginRoot,
    },
  )).toBe(0)
}

async function bindHostSession(bindingSessionId = sessionId): Promise<void> {
  const bindingsDir = join(root, '.pipeline', 'terminal-sessions')
  await mkdir(bindingsDir, { recursive: true })
  await writeFile(join(bindingsDir, `${bindingSessionId}.json`), `${JSON.stringify({
    protocol: 'pipeline-terminal-session-v1',
    session_id: bindingSessionId,
    change: 'receipt-proof',
    bound_at: '2026-07-24T00:01:00Z',
  })}\n`, 'utf8')
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
    selectedPluginRoot = join(home, '.codex', 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite', '0.2.0')
    skillPath = join(selectedPluginRoot, 'skills', 'openspec-propose', 'SKILL.md')
    writingPlansPath = join(selectedPluginRoot, 'skills', 'writing-plans', 'SKILL.md')
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

  it('accepts only the exact selected Codex cache root', async () => {
    await expect(trustedCodexSkillPath(
      { selectedCacheRoot: selectedPluginRoot },
      'openspec-propose',
      home,
      join(home, '.codex'),
    )).resolves.toBe(skillPath)
  })

  it.each(['active-release', 'direct-development'] as const)(
    'accepts an exact %s trust root and reconciles only its completed host call',
    async (kind) => {
      const runtimeDataRoot = join(root, 'runtime-data')
      const runtimeStateRoot = join(root, 'runtime-state')
      const releaseId = `sha256-${'a'.repeat(64)}`
      const pluginRoot = kind === 'active-release'
        ? join(runtimeDataRoot, 'releases', releaseId, 'payload')
        : join(root, 'pipeline-direct-development')
      skillPath = join(pluginRoot, 'skills', 'openspec-propose', 'SKILL.md')
      await mkdir(dirname(skillPath), { recursive: true })
      await writeFile(skillPath, '# trusted root skill\n', 'utf8')
      if (kind === 'active-release') {
        await mkdir(runtimeStateRoot, { recursive: true })
        await writeFile(join(runtimeStateRoot, 'selection.json'), `${JSON.stringify({
          version: 1,
          revision: 1,
          activeRelease: releaseId,
          previousRelease: null,
          updatedAt: '2026-07-24T00:00:00Z',
        })}\n`, 'utf8')
        await writeFile(join(runtimeDataRoot, 'releases', releaseId, 'release.json'), `${JSON.stringify({
          version: 1,
          releaseId,
          payloadDigest: 'a'.repeat(64),
          createdAt: '2026-07-24T00:00:00Z',
        })}\n`, 'utf8')
      }
      if (kind === 'direct-development') {
        for (const required of [
          join(pluginRoot, '.codex-plugin', 'plugin.json'),
          join(pluginRoot, 'hooks', 'codex-skill-receipt.sh'),
          join(pluginRoot, 'packages', 'cli', 'dist', 'pipeline.mjs'),
        ]) {
          await mkdir(dirname(required), { recursive: true })
          await writeFile(
            required,
            required.endsWith(join('.codex-plugin', 'plugin.json'))
              ? `${JSON.stringify({ name: 'pipeline-lite', version: '0.2.0' })}\n`
              : '{}\n',
            'utf8',
          )
        }
      }
      const trustRoots: CodexSkillTrustRoots = kind === 'active-release'
        ? {
            activeReleaseRoot: pluginRoot,
            executingPluginRoot: pluginRoot,
            runtimeDataRoot,
            runtimeStateRoot,
          }
        : {
            directDevelopmentRoot: pluginRoot,
            executingPluginRoot: pluginRoot,
          }
      await writeFile(transcript, eventLines('Process exited with code 0'), 'utf8')
      const deps = { ...makeDeps({ cwd: root }), clock: (): string => '2026-07-24T00:02:00Z' }
      expect(await cmdInternalCodexSkillReceipt(
        deps,
        'receipt-proof',
        'openspec-propose',
        skillPath,
        transcript,
        sessionId,
        turnId,
        toolUseId,
        {
          homeDir: () => home,
          codexHomeDir: () => join(home, '.codex'),
          trustRoots: () => trustRoots,
        },
      )).toBe(0)

      const result = await reconcileCodexSkillEvidenceRaw({
        repoRoot: root,
        changeDir,
        producer: 'openspec-propose',
        recordedAt: '2026-07-24T00:03:00Z',
        history: historyWriter,
        homeDir: home,
        codexHomeDir: join(home, '.codex'),
        trustRoots,
      })

      expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    },
  )

  it('rejects a claimed direct-development root that is not the physically executing packaged root', async () => {
    const forgedRoot = join(root, 'forged-direct-root')
    const forgedSkill = join(forgedRoot, 'skills', 'openspec-propose', 'SKILL.md')
    await mkdir(dirname(forgedSkill), { recursive: true })
    await writeFile(forgedSkill, '# forged\n', 'utf8')

    await expect(trustedCodexSkillPath({
      directDevelopmentRoot: forgedRoot,
      executingPluginRoot: selectedPluginRoot,
    }, 'openspec-propose', home, join(home, '.codex'))).resolves.toBeUndefined()
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

    await writeFile(transcript, eventLines('Process exited with code 0\nWall time 0.1 seconds\n'), 'utf8')
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

  it('rejects outer custom-tool completion when the nested exec failed before the Skill read', async () => {
    const read = `sed -n '1,120p' ${skillPath}`
    await writeFile(
      transcript,
      eventLines('Script completed\nexit_code: 1\n').replace(read, `false && ${read}`),
      'utf8',
    )
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('rejects a successful shell command whose Skill read is unreachable behind OR', async () => {
    const read = `sed -n '1,120p' ${skillPath}`
    await writeFile(
      transcript,
      eventLines('Process exited with code 0\n').replace(read, `true || ${read}`),
      'utf8',
    )
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('rejects mixed AND and sequence control flow that can skip the Skill read but exit zero', async () => {
    const read = `sed -n '1,120p' ${skillPath}`
    await writeFile(
      transcript,
      eventLines('Process exited with code 0\n').replace(read, `false && ${read}; true`),
      'utf8',
    )
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('treats an explicit nested non-zero exit as authoritative over success-looking stdout', async () => {
    await writeFile(
      transcript,
      eventLines('exit_code: 1\nstdout: Process exited with code 0\n'),
      'utf8',
    )
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('rejects a successful early shell exit before the nominal Skill read', async () => {
    const read = `sed -n '1,120p' ${skillPath}`
    await writeFile(
      transcript,
      eventLines('Process exited with code 0\n').replace(read, `exit 0; ${read}`),
      'utf8',
    )
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })
    expect(result.confirmedSkillIds).toEqual([])
  })

  it('rejects a receipt received before the current workflow visit began', async () => {
    await writeFile(transcript, eventLines('Process exited with code 0\nWall time 0.1 seconds\n'), 'utf8')
    await writeFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'transition', from: 'build', to: 'spec' }),
      '',
    ].join('\n'), 'utf8')
    const oldClockDeps = { ...makeDeps({ cwd: root }), clock: (): string => '2026-07-24T00:00:00Z' }
    expect(await cmdInternalCodexSkillReceipt(
      oldClockDeps,
      'receipt-proof',
      'openspec-propose',
      skillPath,
      transcript,
      'session-verified-1',
      turnId,
      'exec-verified-1',
      {
        homeDir: () => home,
        codexHomeDir: () => join(home, '.codex'),
        selectedPluginRoot: () => selectedPluginRoot,
      },
    )).toBe(0)

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      evidenceScope: 'spec',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual([])
  })

  it('discovers unresolved skills after another skill in the same batched exec has a strict receipt', async () => {
    await writeFile(transcript, sessionScopedEventLines(root, undefined, [skillPath, writingPlansPath]), 'utf8')
    await recordPendingReceipt()
    await bindHostSession()

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
    await writeFile(transcript, eventLines('Process exited with code 0', 'turn-other'), 'utf8')
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

  it.each([
    {
      label: 'session id',
      transcriptText: (): string => eventLines(
        'Process exited with code 0',
        turnId,
        [skillPath],
        '2026-07-24T00:02:00Z',
        { transcriptSessionId: 'session-other' },
      ),
      receiptToolUseId: toolUseId,
    },
    {
      label: 'tool use id / call id',
      transcriptText: (): string => eventLines('Process exited with code 0'),
      receiptToolUseId: 'call-other',
    },
    {
      label: 'call id / output id',
      transcriptText: (): string => eventLines(
        'Process exited with code 0',
        turnId,
        [skillPath],
        '2026-07-24T00:02:00Z',
        { outputCallId: 'output-for-another-call' },
      ),
      receiptToolUseId: toolUseId,
    },
  ])('rejects a receipt when the exact host $label does not match', async ({
    transcriptText,
    receiptToolUseId,
  }) => {
    await writeFile(transcript, transcriptText(), 'utf8')
    await recordPendingReceipt(receiptToolUseId)

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual([])
    await expect(readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never evaluates transcript tool-program expressions to recover a command', async () => {
    const timestamp = '2026-07-24T00:02:00Z'
    await writeFile(transcript, [
      JSON.stringify({
        type: 'session_meta',
        timestamp,
        payload: { cwd: root, session_id: sessionId, id: sessionId },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp,
        payload: {
          type: 'custom_tool_call',
          status: 'completed',
          call_id: toolUseId,
          name: 'exec',
          input: `const r = await tools.exec_command({cmd:(globalThis.__pipelinePwned=true, ${JSON.stringify(`sed -n '1,40p' ${skillPath}`)})});`,
          internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp,
        payload: {
          type: 'custom_tool_call_output',
          call_id: toolUseId,
          output: 'Process exited with code 0\nWall time 0.1 seconds\n',
          internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
      }),
      '',
    ].join('\n'), 'utf8')
    await recordPendingReceipt()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual([])
    expect((globalThis as Record<string, unknown>).__pipelinePwned).toBeUndefined()
  })

  it('never lets a receipt bound to one Change satisfy another Change', async () => {
    await writeFile(transcript, eventLines('Process exited with code 0'), 'utf8')
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

  it('rejects a selected plugin whose skills parent is a symlink escaping CODEX_HOME', async () => {
    const escapedPluginRoot = join(home, '.codex', 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite', '0.3.0')
    const foreignSkills = join(root, 'outside-codex-home', 'skills')
    const escapedSkill = join(escapedPluginRoot, 'skills', 'openspec-propose', 'SKILL.md')
    await mkdir(join(foreignSkills, 'openspec-propose'), { recursive: true })
    await mkdir(escapedPluginRoot, { recursive: true })
    await writeFile(join(foreignSkills, 'openspec-propose', 'SKILL.md'), '# escaped\n', 'utf8')
    await symlink(foreignSkills, join(escapedPluginRoot, 'skills'))
    const deps = { ...makeDeps({ cwd: root }), clock: (): string => '2026-07-24T00:02:00Z' }

    expect(await cmdInternalCodexSkillReceipt(
      deps,
      'receipt-proof',
      'openspec-propose',
      escapedSkill,
      transcript,
      'session-verified-1',
      turnId,
      'exec-verified-1',
      {
        homeDir: () => home,
        codexHomeDir: () => join(home, '.codex'),
        selectedPluginRoot: () => escapedPluginRoot,
      },
    )).toBe(1)
  })

  it('reconciles a completed host session when Codex omits the PreToolUse receipt identity', async () => {
    await writeFile(transcript, sessionScopedEventLines(root), 'utf8')
    await bindHostSession()

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

  it('does not discover a completed read from an unselected old plugin cache version', async () => {
    const oldPluginRoot = join(home, '.codex', 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite', '0.1.0')
    const oldSkillPath = join(oldPluginRoot, 'skills', 'openspec-propose', 'SKILL.md')
    await mkdir(dirname(oldSkillPath), { recursive: true })
    await writeFile(oldSkillPath, '# stale cache\n', 'utf8')
    await writeFile(transcript, sessionScopedEventLines(root, undefined, [oldSkillPath]), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual([])
  })

  it('does not reuse a transcript read from an earlier visit to the same workflow step', async () => {
    await writeFile(transcript, sessionScopedEventLines(root).replaceAll(
      '2026-07-24T00:02:00Z',
      '2026-07-24T00:00:00Z',
    ), 'utf8')
    await writeFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'transition', from: 'build', to: 'spec' }),
      '',
    ].join('\n'), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      evidenceScope: 'spec',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual([])
  })

  it('fails closed when history has transitions but none establishes the current step visit', async () => {
    await writeFile(transcript, sessionScopedEventLines(root), 'utf8')
    await writeFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-24T00:00:00Z', kind: 'init' }),
      JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'transition', from: 'open', to: 'explore' }),
      '',
    ].join('\n'), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      evidenceScope: 'spec',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual([])
  })

  it('accepts a selected-plugin read from the current initial-step visit', async () => {
    await writeFile(transcript, functionCallSessionScopedEventLines(root), 'utf8')
    await bindHostSession()
    await writeFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-24T00:01:00Z', kind: 'init' }),
      '',
    ].join('\n'), 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      evidenceScope: 'open',
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
  })

  it('reconciles a later multiline read from Codex JSON-encoded tool-program source', async () => {
    await writeFile(transcript, multilineSessionScopedEventLines(root), 'utf8')
    await bindHostSession()

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

  it('reconciles the current custom exec ABI when safe object keys are unquoted', async () => {
    await writeFile(transcript, unquotedObjectSessionScopedEventLines(root), 'utf8')
    await bindHostSession()

    const result = await reconcileCodexSkillEvidence({
      repoRoot: root,
      changeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(changeDir, '.pipeline-history.jsonl'), 'utf8'))
      .toContain('CodexSkillRead: openspec-propose')
  })

  it('reconciles the current Codex Desktop function_call exec ABI', async () => {
    await writeFile(transcript, functionCallSessionScopedEventLines(root), 'utf8')
    await bindHostSession()

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

  it('accepts an explicit sibling-worktree read from the same Git common directory', async () => {
    const linkedRoot = join(root, 'linked-worktree')
    const linkedGitDir = join(root, '.git', 'worktrees', 'linked-worktree')
    const linkedChangeDir = join(linkedRoot, 'openspec', 'changes', 'receipt-proof')
    await mkdir(linkedGitDir, { recursive: true })
    await mkdir(linkedChangeDir, { recursive: true })
    await writeFile(join(linkedRoot, '.git'), `gitdir: ${linkedGitDir}\n`, 'utf8')
    await writeFile(join(linkedGitDir, 'commondir'), '../..\n', 'utf8')
    await writeFile(transcript, functionCallSessionScopedEventLines(root, linkedRoot), 'utf8')
    const bindingsDir = join(linkedRoot, '.pipeline', 'terminal-sessions')
    await mkdir(bindingsDir, { recursive: true })
    await writeFile(join(bindingsDir, `${sessionId}.json`), `${JSON.stringify({
      protocol: 'pipeline-terminal-session-v1',
      session_id: sessionId,
      change: 'receipt-proof',
      bound_at: '2026-07-24T00:01:00Z',
    })}\n`, 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: linkedRoot,
      changeDir: linkedChangeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual(['openspec-propose'])
    expect(await readFile(join(linkedChangeDir, '.pipeline-history.jsonl'), 'utf8'))
      .toContain('CodexSkillRead: openspec-propose')
  })

  it('rejects a sibling-worktree session when the skill read omits the target workdir', async () => {
    const linkedRoot = join(root, 'linked-worktree-no-target')
    const linkedGitDir = join(root, '.git', 'worktrees', 'linked-worktree-no-target')
    const linkedChangeDir = join(linkedRoot, 'openspec', 'changes', 'receipt-proof')
    await mkdir(linkedGitDir, { recursive: true })
    await mkdir(linkedChangeDir, { recursive: true })
    await writeFile(join(linkedRoot, '.git'), `gitdir: ${linkedGitDir}\n`, 'utf8')
    await writeFile(join(linkedGitDir, 'commondir'), '../..\n', 'utf8')
    await writeFile(transcript, functionCallSessionScopedEventLines(root), 'utf8')
    const bindingsDir = join(linkedRoot, '.pipeline', 'terminal-sessions')
    await mkdir(bindingsDir, { recursive: true })
    await writeFile(join(bindingsDir, `${sessionId}.json`), `${JSON.stringify({
      protocol: 'pipeline-terminal-session-v1',
      session_id: sessionId,
      change: 'receipt-proof',
      bound_at: '2026-07-24T00:01:00Z',
    })}\n`, 'utf8')

    const result = await reconcileCodexSkillEvidence({
      repoRoot: linkedRoot,
      changeDir: linkedChangeDir,
      producer: 'openspec-propose',
      recordedAt: '2026-07-24T00:03:00Z',
      history: historyWriter,
      homeDir: home,
      codexHomeDir: join(home, '.codex'),
      selectedPluginRoot,
    })

    expect(result.confirmedSkillIds).toEqual([])
    await expect(readFile(join(linkedChangeDir, '.pipeline-history.jsonl'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
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
    await bindHostSession()
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
    await bindHostSession()
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
