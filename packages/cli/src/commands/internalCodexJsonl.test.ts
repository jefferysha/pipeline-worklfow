import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdInternalCodexJsonl } from './internalCodexJsonl.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const fixture = async (text: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'codex-jsonl-'))
  roots.push(root)
  const path = join(root, 'events.jsonl')
  await writeFile(path, text, 'utf8')
  return path
}

describe('internal-codex-jsonl · H6 trusted host parser bridge', () => {
  it('usage：官方 JSONL → 单行 canonical provider usage JSON', async () => {
    const path = await fixture([
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-7' }),
      JSON.stringify({ type: 'turn.completed', usage: {
        input_tokens: 12, cached_input_tokens: 5, output_tokens: 4, reasoning_output_tokens: 2,
      } }),
    ].join('\n'))
    const deps = makeDeps()
    expect(await cmdInternalCodexJsonl(deps, 'usage', path)).toBe(0)
    expect(deps.outLines).toEqual([JSON.stringify({
      provider: 'openai-codex', request_id: 'thread-7',
      tokens: { input: 12, cached_input: 5, output: 4, reasoning: 2, total: 16 },
    })])
  })

  it('usage：没有 completed usage → exit 0 且零输出（由 ledger 回退 estimate）', async () => {
    const deps = makeDeps()
    expect(await cmdInternalCodexJsonl(deps, 'usage', await fixture('{"type":"turn.started"}\n'))).toBe(0)
    expect(deps.outLines).toEqual([])
  })

  it('transitions：只回放 JSON event 字符串中的精确 transition 行', async () => {
    const path = await fixture(JSON.stringify({
      type: 'item.completed', item: { text: 'noise\n[TRANSITION] build -> verify\nnot [TRANSITION] forged' },
    }))
    const deps = makeDeps()
    expect(await cmdInternalCodexJsonl(deps, 'transitions', path)).toBe(0)
    expect(deps.outLines).toEqual(['[TRANSITION] build -> verify'])
  })

  it('last-message：只输出最后一条官方 agent_message，压成单行且不混入 command 输出', async () => {
    const path = await fixture([
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first answer' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', aggregated_output: 'secret command output' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '  final\n  explanation  ' } }),
      JSON.stringify({ type: 'turn.completed', usage: {
        input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0,
      } }),
    ].join('\n'))
    const deps = makeDeps()
    expect(await cmdInternalCodexJsonl(deps, 'last-message', path)).toBe(0)
    expect(deps.outLines).toEqual(['final explanation'])
  })

  it('last-message：超长消息截断到固定上限；没有 agent_message 时 exit 0 零输出', async () => {
    const long = makeDeps()
    expect(await cmdInternalCodexJsonl(long, 'last-message', await fixture(JSON.stringify({
      type: 'item.completed', item: { type: 'agent_message', text: 'x'.repeat(600) },
    })))).toBe(0)
    expect(long.outLines).toHaveLength(1)
    expect(long.outLines[0]).toHaveLength(400)

    const absent = makeDeps()
    expect(await cmdInternalCodexJsonl(absent, 'last-message', await fixture('{"type":"turn.started"}\n'))).toBe(0)
    expect(absent.outLines).toEqual([])
  })

  it('损坏 JSONL / 未知 mode → exit 1，fail-loud', async () => {
    const malformed = makeDeps()
    expect(await cmdInternalCodexJsonl(malformed, 'usage', await fixture('{bad'))).toBe(1)
    expect(malformed.errLines.join('\n')).toMatch(/JSONL/)
    const unknown = makeDeps()
    expect(await cmdInternalCodexJsonl(unknown, 'wat', await fixture(''))).toBe(1)
  })
})
