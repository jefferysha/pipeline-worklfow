import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AFK_RUN_SCRIPT_SHA256, StructuredOutputError, buildAfkRunCommand, parseSandboxReport, runPipeline } from './runner.js'

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

/** v5 T20：runner 分派——命令构造点按 runner 注入 PIPELINE_RUNNER（沙箱脚本据此选 agent CLI）。 */
describe('buildAfkRunCommand · runner 分派（v5 T20 双 runner）', () => {
  it('缺省 / claude-code → 命令尾不变（既有 Claude 路径零回归），且不注入 PIPELINE_RUNNER', () => {
    expect(buildAfkRunCommand('x').endsWith('PIPELINE_AFK=1 pipeline-afk-run x')).toBe(true)
    expect(buildAfkRunCommand('x')).not.toContain('PIPELINE_RUNNER')
    expect(buildAfkRunCommand('x', 'claude-code')).toBe(buildAfkRunCommand('x'))
  })

  it('codex → 注入 PIPELINE_RUNNER=codex（沙箱内 pipeline-afk-run 据此起 codex exec 无头会话）', () => {
    expect(buildAfkRunCommand('x', 'codex').endsWith('PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run x')).toBe(true)
  })

  it('历史自由值（cron/cron-session 等非 agent runner）→ 不注入，走缺省路径', () => {
    expect(buildAfkRunCommand('x', 'cron')).toBe(buildAfkRunCommand('x'))
    expect(buildAfkRunCommand('x', 'cron-session')).toBe(buildAfkRunCommand('x'))
  })
})

/**
 * 真机验收 P1（2026-07-11）：现役 sandcastle:local 镜像内 /usr/local/bin/pipeline-afk-run 是旧版
 * （无 codex/PIPELINE_RUNNER 分支），runner: codex 被静默降级走确定性路径并「成功」结算 paused——
 * exit 96 诚实报错路径在陈旧镜像里不可达。镜像与仓库脚本此前无任何版本对账机制。
 * 机制（两道闸）：
 *   ① 本文件的 sha 同步测试：仓库脚本一改，AFK_RUN_SCRIPT_SHA256 不 bump 就红——常量永远钉住脚本现内容；
 *   ② buildAfkRunCommand 前置守卫：run 前在容器内 sha256sum 对账，不符 → exit 95 + 指引重建镜像，
 *      错误经 ports.ts runWork 的非零退出 throw 流进 automation_last_error，漂移当场可见，绝不静默跑旧脚本。
 */
describe('镜像 ↔ 仓库脚本版本对账（真机 P1：sandcastle 镜像漂移不可见）', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const scriptPath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh')

  it('AFK_RUN_SCRIPT_SHA256 与仓库 tools/sandcastle/pipeline-afk-run.sh 现内容逐字一致（改脚本必须同步 bump 常量）', () => {
    const actual = createHash('sha256').update(readFileSync(scriptPath)).digest('hex')
    expect(AFK_RUN_SCRIPT_SHA256).toBe(actual)
  })

  it('buildAfkRunCommand 含 sha256 对账守卫：不符 → exit 95 + 重建指引，且守卫先于真命令执行', () => {
    const cmd = buildAfkRunCommand('x')
    expect(cmd).toContain('sha256sum /usr/local/bin/pipeline-afk-run')
    expect(cmd).toContain(AFK_RUN_SCRIPT_SHA256)
    expect(cmd).toContain('exit 95')
    expect(cmd).toContain('tools/sandcastle/build.sh') // 报错文案给出重建入口
    expect(cmd.indexOf('sha256sum')).toBeLessThan(cmd.indexOf('pipeline-afk-run x')) // 守卫在前
  })

  it('codex 路径同样带对账守卫（正是漂移受害路径）', () => {
    expect(buildAfkRunCommand('x', 'codex')).toContain(AFK_RUN_SCRIPT_SHA256)
  })
})
