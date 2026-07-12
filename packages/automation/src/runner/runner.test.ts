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

  // B10：沙箱自报字段不可信——phase_event 必须校验 PHASE_EVENTS 枚举（非法值不透传污染下游），
  // build_sha/branch 必须校验 string 类型（非 string 视缺失）。`?? 'verify-pass'` 只兜 null/undefined，
  // 兜不住非法字符串；build_sha 权威源本就是命名分支 HEAD（barrier.ts），这里只做形状诚实化。
  it('B10 · phase_event 非法枚举 → 回退 verify-pass（不透传越界值）', () => {
    expect(parseSandboxReport('<output>{"verify_result":"pass","phase_event":"garbage"}</output>').phase_event).toBe('verify-pass')
  })

  it('B10 · phase_event 合法非缺省值（build-complete / ship-complete）原样保留', () => {
    expect(parseSandboxReport('<output>{"verify_result":"pass","phase_event":"build-complete"}</output>').phase_event).toBe('build-complete')
    expect(parseSandboxReport('<output>{"verify_result":"pass","phase_event":"ship-complete"}</output>').phase_event).toBe('ship-complete')
  })

  it('B10 · build_sha 非 string（数字 / 对象）→ 视缺失（undefined）', () => {
    expect(parseSandboxReport('<output>{"verify_result":"pass","build_sha":123}</output>').build_sha).toBeUndefined()
    expect(parseSandboxReport('<output>{"verify_result":"pass","build_sha":{"x":1}}</output>').build_sha).toBeUndefined()
  })

  it('B10 · branch 非 string → 视缺失（undefined）', () => {
    expect(parseSandboxReport('<output>{"verify_result":"pass","branch":42}</output>').branch).toBeUndefined()
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

/**
 * 观察项③（决议 #14②）：codex 认证失效可见度——此前 codex 非零退出只写进 worktree 内
 * `.sandcastle-build.agent.log`，脚本继续确定性兜底 commit 并 0 退出，host 侧流面完全看不见，
 * automation_last_error 永远不落（「agent 跑过了」的假象）。脚本 codex 分支现在把 agent_exit≠0
 * 以 `[AGENT_EXIT] codex <exit>` 标记行回放到 stdout（与 [TRANSITION] 回放同风格；
 * parseSandboxReport 容忍多余行，不干扰末行 <output> 握手）；exit=0 零噪音。**确定性兜底与退出
 * 码语义不变**（run 仍成功——可见度，不是改判）。文本层钉住脚本逻辑（同 sha 测试的「脚本逐字
 * 一致」口径）。
 */
describe('脚本 codex 分支 · agent 非零退出标记行（观察项③）', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const script = readFileSync(join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh'), 'utf8')

  it('agent_exit≠0 → stdout 回放 [AGENT_EXIT] codex <exit> 标记行（exit=0 不输出）', () => {
    expect(script).toContain('if [ "$agent_exit" -ne 0 ]')
    expect(script).toContain(`printf '[AGENT_EXIT] codex %s\\n' "$agent_exit"`)
  })

  it('标记行输出位于 codex 分支内（claude-code 分支不动，决议 #14② 范围仅 codex）', () => {
    const markerIdx = script.indexOf(`printf '[AGENT_EXIT] codex %s\\n'`)
    const codexBranchIdx = script.indexOf('PIPELINE_RUNNER:-')
    const claudeBranchIdx = script.indexOf('elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN')
    expect(markerIdx).toBeGreaterThan(codexBranchIdx) // codex 分支入口之后
    expect(markerIdx).toBeLessThan(claudeBranchIdx) // claude 分支入口之前
  })

  it('parseSandboxReport 容忍标记行（不干扰末行 <output> 握手解析）', () => {
    const r = parseSandboxReport(
      '[AGENT_EXIT] codex 96\n<output>{"verify_result":"pass","build_sha":"abc","phase_event":"verify-pass"}</output>',
    )
    expect(r.verify_result).toBe('pass')
    expect(r.build_sha).toBe('abc')
  })
})

/**
 * P1-T1 / 观察项③ 对齐（批 3 R2）：claude-code 路径此前「最不诚实」——① agent 非零退出（认证失效 /
 * tap 未起 agent_exit=97）只落 worktree 内 .sandcastle-build.agent.log，脚本继续确定性兜底 commit 且
 * 0 退出，host 侧流面完全不可见；② 凭证/CLI 缺失时无 else 分支，径直静默走确定性兜底伪装 agent 跑过。
 * 本批把 claude 分支补齐到 codex 同款可见度：非零退出回放 [AGENT_EXIT] claude <exit>（host 侧
 * createAgentExitWatch 检出落 automation_last_error；该 watcher AGENT_EXIT_LINE_RE 按 (\S+) 抓 runner
 * 名、runner 无关，无需改 lifecycle），且加 else 诚实 stderr（让用户看见「本轮没真跑 agent」，但刻意
 * **不发** EXIT 标记——「没起 agent」不是「agent 失败」，发标记会被 watcher 误报成非零退出污染
 * last_error）。文本层钉住脚本逻辑（同 sha 测试的「脚本逐字」口径）。**不改 codex 分支、不改
 * verify_result 语义。**
 */
describe('脚本 claude 分支 · agent 非零退出标记行 + 凭证缺失诚实 else（P1-T1，批 3 R2）', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const script = readFileSync(join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh'), 'utf8')

  it('claude 分支 agent_exit≠0 → stdout 回放 [AGENT_EXIT] claude <exit>（对齐 codex，exit=0 不输出）', () => {
    expect(script).toContain(`printf '[AGENT_EXIT] claude %s\\n' "$agent_exit"`)
    expect(script).toContain('if [ "$agent_exit" -ne 0 ]') // 受 exit≠0 守卫（零噪音，同 codex 口径）
  })

  it('claude 回放位于 claude 分支内（elif 入口之后）', () => {
    const claudeMarkerIdx = script.indexOf(`printf '[AGENT_EXIT] claude %s\\n'`)
    const claudeBranchIdx = script.indexOf('elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN')
    expect(claudeMarkerIdx).toBeGreaterThan(claudeBranchIdx)
  })

  it('凭证/CLI 缺失 else 分支：打可操作 stderr（本轮未真跑 agent），落 >&2、位于 claude elif 之后', () => {
    const elseLine = script.split('\n').find((l) => l.includes('agent 未真跑'))
    expect(elseLine).toBeDefined()
    expect(elseLine).toContain('printf')
    expect(elseLine).toContain('未检测到 CLAUDE_CODE_OAUTH_TOKEN')
    expect(elseLine).toContain('>&2') // 落 stderr，不污染末行 <output> 握手
    const elseIdx = script.indexOf('agent 未真跑')
    const claudeBranchIdx = script.indexOf('elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN')
    expect(elseIdx).toBeGreaterThan(claudeBranchIdx)
  })

  it('全脚本恰两处 [AGENT_EXIT] 回放（codex + claude），else 诚实分支不发标记（不误报 agent 失败）', () => {
    const emits = script.match(/printf '\[AGENT_EXIT\]/g) ?? []
    expect(emits).toHaveLength(2)
    expect(script).toContain(`printf '[AGENT_EXIT] codex %s\\n'`) // codex 分支原样（回归）
  })

  it('parseSandboxReport 容忍 claude 标记行（不干扰末行 <output> 握手）', () => {
    const r = parseSandboxReport(
      '[AGENT_EXIT] claude 97\n<output>{"verify_result":"pass","build_sha":"abc","phase_event":"verify-pass"}</output>',
    )
    expect(r.verify_result).toBe('pass')
    expect(r.build_sha).toBe('abc')
  })
})
