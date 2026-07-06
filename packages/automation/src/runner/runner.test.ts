import { describe, expect, it } from 'vitest'
import { StructuredOutputError, parseSandboxReport, runPipeline } from './runner.js'

/** 结构化握手解析（老仓 scheduler/runChange.ts:447-545）。 */
describe('parseSandboxReport', () => {
  it('解析合法 <output>{...}</output>', () => {
    const r = parseSandboxReport('noise\n<output>{"verify_result":"pass","build_sha":"abc","phase_event":"verify-pass"}</output>')
    expect(r).toEqual({ verify_result: 'pass', build_sha: 'abc', branch: undefined, phase_event: 'verify-pass' })
  })

  it('取最后一个 tag（verbose agent 多次 emit）', () => {
    const r = parseSandboxReport('<output>{"verify_result":"fail"}</output>\n<output>{"verify_result":"pass"}</output>')
    expect(r.verify_result).toBe('pass')
  })

  it('容忍 ```json fence 包裹', () => {
    const r = parseSandboxReport('<output>```json\n{"verify_result":"pass"}\n```</output>')
    expect(r.verify_result).toBe('pass')
  })

  it('缺 <output> tag → StructuredOutputError', () => {
    expect(() => parseSandboxReport('no tag here')).toThrow(StructuredOutputError)
  })

  it('tag 内非 JSON → StructuredOutputError 且带 rawMatched', () => {
    try {
      parseSandboxReport('<output>not json</output>')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(StructuredOutputError)
      expect((e as StructuredOutputError).rawMatched).toBe('not json')
    }
  })

  it('verify_result 非法枚举 → StructuredOutputError', () => {
    expect(() => parseSandboxReport('<output>{"verify_result":"maybe"}</output>')).toThrow(StructuredOutputError)
  })

  it('缺 phase_event → 缺省 verify-pass', () => {
    expect(parseSandboxReport('<output>{"verify_result":"pass"}</output>').phase_event).toBe('verify-pass')
  })
})

describe('runPipeline（注入 exec 面驱动 build→verify→ship）', () => {
  it('exec 返回带握手的 stdout → 解析成 report', async () => {
    const exec = async () => ({
      stdout: '<output>{"verify_result":"pass","phase_event":"verify-pass"}</output>',
      stderr: '',
      exitCode: 0,
    })
    const r = await runPipeline(exec, 'x', new AbortController().signal)
    expect(r.verify_result).toBe('pass')
  })

  it('exec 非零退出（build/verify 真失败）→ 抛错（不伪造 pass）', async () => {
    const exec = async () => ({ stdout: '', stderr: 'boom', exitCode: 1 })
    await expect(runPipeline(exec, 'x', new AbortController().signal)).rejects.toThrow()
  })
})
