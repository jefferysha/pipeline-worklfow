import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { materializeSkillSnapshot } from '../skills/snapshot-store.js'
import type { SkillSnapshotProvenance } from '../skills/types.js'
import {
  AFK_RUN_SCRIPT_SHA256, StructuredOutputError, buildAfkRunCommand, parseCodexJsonlUsage,
  parseSandboxReport, runPipeline,
} from './runner.js'

describe('parseCodexJsonlUsage · H6 provider-structured metering', () => {
  it('official thread.started + turn.completed usage → exact provider fact; total=input+output', () => {
    const jsonl = [
      JSON.stringify({ type: 'thread.started', thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'turn.completed', usage: {
        input_tokens: 24_763, cached_input_tokens: 24_448, output_tokens: 122, reasoning_output_tokens: 40,
      } }),
    ].join('\n')
    expect(parseCodexJsonlUsage(jsonl)).toEqual({
      provider: 'openai-codex', request_id: '0199a213-81c0-7800-8aa1-bbab2a035a53',
      tokens: { input: 24_763, cached_input: 24_448, output: 122, reasoning: 40, total: 24_885 },
    })
  })

  it('missing completion → undefined（不得伪造 tokens=0）', () => {
    expect(parseCodexJsonlUsage('{"type":"turn.started"}\n')).toBeUndefined()
  })

  it('malformed JSONL / negative-fractional-overflow tokens / duplicate completion → fail-loud', () => {
    expect(() => parseCodexJsonlUsage('{bad')).toThrow(/JSONL/)
    for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseCodexJsonlUsage(JSON.stringify({
        type: 'turn.completed', usage: {
          input_tokens: bad, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0,
        },
      }))).toThrow(/token/i)
    }
    const completed = JSON.stringify({ type: 'turn.completed', usage: {
      input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0,
    } })
    expect(() => parseCodexJsonlUsage(`${completed}\n${completed}`)).toThrow(/multiple/i)
  })

  it('cached input cannot exceed input and reasoning cannot exceed output', () => {
    expect(() => parseCodexJsonlUsage(JSON.stringify({ type: 'turn.completed', usage: {
      input_tokens: 2, cached_input_tokens: 3, output_tokens: 1, reasoning_output_tokens: 0,
    } }))).toThrow(/cached/i)
    expect(() => parseCodexJsonlUsage(JSON.stringify({ type: 'turn.completed', usage: {
      input_tokens: 2, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 2,
    } }))).toThrow(/reasoning/i)
  })
})

/** 结构化握手解析（老仓 scheduler/runChange.ts:447-545）。 */
describe('parseSandboxReport', () => {
  it('解析合法 <output>{...}</output>', () => {
    const r = parseSandboxReport('noise\n<output>{"verify_result":"pass","build_sha":"abc","phase_event":"verify-pass"}</output>')
    expect(r).toEqual({ verify_result: 'pass', build_sha: 'abc', branch: undefined, phase_event: 'verify-pass' })
  })

  it('H6：握手携带经 provider JSONL 解析的 usage fact', () => {
    const r = parseSandboxReport('<output>{"verify_result":"pass","provider_usage":{"provider":"openai-codex","request_id":"thread-1","tokens":{"input":10,"cached_input":3,"output":4,"reasoning":2,"total":14}}}</output>')
    expect(r.provider_usage).toEqual({
      provider: 'openai-codex', request_id: 'thread-1',
      tokens: { input: 10, cached_input: 3, output: 4, reasoning: 2, total: 14 },
    })
  })

  it('H6：握手内伪造/矛盾 provider usage → fail-loud，不静默丢弃或按 0 结算', () => {
    for (const usage of [
      { provider: 'sandbox-self-report', tokens: { input: 1, cached_input: 0, output: 1, reasoning: 0, total: 2 } },
      { provider: 'openai-codex', tokens: { input: 1, cached_input: 0, output: 1, reasoning: 0, total: 99 } },
      { provider: 'openai-codex', tokens: { input: -1, cached_input: 0, output: 1, reasoning: 0, total: 0 } },
    ]) {
      expect(() => parseSandboxReport(`<output>${JSON.stringify({ verify_result: 'pass', provider_usage: usage })}</output>`))
        .toThrow(StructuredOutputError)
    }
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

  it('H10 r6：结构化握手保留闭集 execution_mode，未知值不进入可信报告', () => {
    expect(parseSandboxReport(
      '<output>{"verify_result":"pass","execution_mode":"agent/codex"}</output>',
    ).execution_mode).toBe('agent/codex')
    expect(parseSandboxReport(
      '<output>{"verify_result":"pass","execution_mode":"pretend-agent"}</output>',
    ).execution_mode).toBeUndefined()
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
  it('缺省 → Codex-first；claude-code 只有显式选择才走兼容路径', () => {
    expect(buildAfkRunCommand('x').endsWith('PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run x')).toBe(true)
    expect(buildAfkRunCommand('x', 'claude-code').endsWith('PIPELINE_AFK=1 pipeline-afk-run x')).toBe(true)
    expect(buildAfkRunCommand('x', 'claude-code')).not.toContain('PIPELINE_RUNNER')
    expect(buildAfkRunCommand('x', 'claude-code')).not.toBe(buildAfkRunCommand('x'))
  })

  it('codex → 注入 PIPELINE_RUNNER=codex（沙箱内 pipeline-afk-run 据此起 codex exec 无头会话）', () => {
    expect(buildAfkRunCommand('x', 'codex').endsWith('PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run x')).toBe(true)
  })

  it('未知 runner fail-loud，绝不隐式降级到 Claude 缺省路径', () => {
    expect(() => buildAfkRunCommand('x', 'cron')).toThrow(/runner.*cron.*claude-code.*codex/i)
    expect(() => buildAfkRunCommand('x', 'codxe')).toThrow(/runner.*codxe.*claude-code.*codex/i)
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
  const dockerfilePath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'Dockerfile')
  const buildScriptPath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'build.sh')

  it('AFK_RUN_SCRIPT_SHA256 与仓库 tools/sandcastle/pipeline-afk-run.sh 现内容逐字一致（改脚本必须同步 bump 常量）', () => {
    const actual = createHash('sha256').update(readFileSync(scriptPath)).digest('hex')
    expect(AFK_RUN_SCRIPT_SHA256).toBe(actual)
  })

  it('H14 Codex-first：生产 prompt 点名 change 任务文件、要求真实编辑且禁止 agent 自行 commit', () => {
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).toContain('First read AGENTS.md and openspec/changes/$1/REAL_AGENT_TASK.md')
    expect(script).toContain('You must edit the business tree to complete that task; do not only describe or inspect')
    expect(script).toContain('Do not run pipeline transitions and do not commit')
  })

  it('custom workflow step prompt：入口解码 host 冻结的 base64url 指令并同时注入 Codex/Claude，固定安全约束仍位于其后', () => {
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).toContain('PIPELINE_WORKFLOW_STEP_PROMPT_B64')
    expect(script).toContain("Buffer.from(raw, 'base64url').toString('utf8')")
    expect(script.match(/\$\{step_prompt_suffix\}/g)).toHaveLength(2)
    expect(script.indexOf('${step_prompt_suffix}')).toBeLessThan(script.indexOf('Do not run pipeline transitions and do not commit'))
  })

  it('H2：入口在 Codex/Claude 两条 prompt 中注入 durable attempt context 与 stagnation 提示', () => {
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).toContain('PIPELINE_ATTEMPT_CONTEXT_B64')
    expect(script.match(/\$\{attempt_context_prompt_suffix\}/g)).toHaveLength(2)
    expect(script).toContain('Repeated failure stagnation')
    expect(script.indexOf('${attempt_context_prompt_suffix}')).toBeLessThan(script.indexOf('Do not run pipeline transitions and do not commit'))
  })

  it('H14 Codex-first：容器认证只走 CODEX_HOME，不在 /tmp workspace 父目录制造 .codex 冲突', () => {
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).not.toContain('ln -sfn "$CODEX_HOME" "$HOME/.codex"')
    expect(script).toContain('--ephemeral --ignore-user-config --ignore-rules')
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

  it('H10 r6：调用方传 host CLI digest 后，运行守卫同时核 AFK 脚本、CLI dist 与镜像 attestation', () => {
    const cliDigest = 'd'.repeat(64)
    const cmd = buildAfkRunCommand('x', 'codex', { cliDistSha256: cliDigest })
    expect(cmd).toContain('/usr/local/bin/pipeline-afk-run')
    expect(cmd).toContain(AFK_RUN_SCRIPT_SHA256)
    expect(cmd).toContain('/opt/pipeline/packages/cli/dist/pipeline.mjs')
    expect(cmd).toContain(cliDigest)
    expect(cmd).toContain('/opt/pipeline/image-attestation.env')
    expect(cmd).toContain('pipeline_afk_run_sha256=')
    expect(cmd).toContain('pipeline_cli_dist_sha256=')
    expect(cmd).toContain('exit 95')
    expect(cmd.indexOf('/opt/pipeline/packages/cli/dist/pipeline.mjs'))
      .toBeLessThan(cmd.lastIndexOf('pipeline-afk-run x'))
  })

  it('H10 r6：镜像在两份 COPY 完成后写入 AFK+CLI 实际 sha attestation，测试 fallback build arg 默认关闭', () => {
    const dockerfile = readFileSync(dockerfilePath, 'utf8')
    const attestation = dockerfile.indexOf('/opt/pipeline/image-attestation.env')
    expect(attestation).toBeGreaterThan(dockerfile.indexOf('COPY packages/cli/dist/pipeline.mjs'))
    expect(attestation).toBeGreaterThan(dockerfile.indexOf('COPY tools/sandcastle/pipeline-afk-run.sh'))
    expect(dockerfile).toContain('pipeline_afk_run_sha256=')
    expect(dockerfile).toContain('pipeline_cli_dist_sha256=')
    expect(dockerfile).toContain('ARG PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=0')
    expect(dockerfile).toContain('ENV PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=${PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK}')
  })

  it('H10 r6：build.sh 仅 test variant 显式开 fallback，并对账仓库/镜像 AFK+CLI 两份真实 sha', () => {
    const build = readFileSync(buildScriptPath, 'utf8')
    expect(build).toContain('PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=0')
    expect(build).toContain('PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=1')
    expect(build).toContain('REPO_CLI_SHA=')
    expect(build).toContain('IMAGE_CLI_SHA=')
    expect(build).toContain('/opt/pipeline/image-attestation.env')
    expect(build).toContain('pipeline_cli_dist_sha256=')
  })
})

describe('pipeline-afk-run.sh 真实入口 · skill bundle fail-closed exit 94', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const scriptPath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh')

  it('H10 r5：直接校验调用方已复制/封存的容器私有目录，Codex env 与 prompt 始终指向同一路径', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-private-bundle-'))
    try {
      const skillDir = join(root, 'source', 'demo-skill')
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, 'SKILL.md'), '# trusted demo\n', 'utf8')
      const published = await materializeSkillSnapshot(
        [{ skillId: 'demo-skill', contentDir: skillDir }],
        { projectRoot: root },
      )

      const binDir = join(root, 'bin')
      const sentinelDir = join(root, 'sentinel')
      await mkdir(binDir)
      await mkdir(sentinelDir)
      for (const [name, target] of [
        ['node', process.execPath], ['grep', '/usr/bin/grep'], ['cat', '/bin/cat'],
        ['rm', '/bin/rm'], ['mkdir', '/bin/mkdir'], ['ln', '/bin/ln'], ['sh', '/bin/sh'],
      ] as const) await symlink(target, join(binDir, name))

      const writeExecutable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await writeExecutable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await writeExecutable('git', `#!/bin/sh
case "\${1:-}" in
  config|add|commit) exit 0 ;;
  status|diff) exit 0 ;;
  rev-parse)
    if [ -f "\${SENTINEL_DIR}/agent-committed" ]; then printf '%s\\n' '${'3'.repeat(40)}';
    else printf '%s\\n' '${'1'.repeat(40)}'; fi
    exit 0 ;;
  *) exit 91 ;;
esac
`)
      await writeExecutable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await writeExecutable('codex', `#!/bin/sh
printf '%s\\n' "\${PIPELINE_SKILL_BUNDLE_DIR:-}" > "\${SENTINEL_DIR}/bundle-dir"
printf '%s\\n' "$*" > "\${SENTINEL_DIR}/prompt"
cat "\${PIPELINE_SKILL_BUNDLE_DIR}/skills/demo-skill/SKILL.md" > "\${SENTINEL_DIR}/skill-read"
printf 'committed\\n' > "\${SENTINEL_DIR}/agent-committed"
`)
      await writeExecutable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  [ "$#" -gt 0 ] || exit 92
  shift
  exec "$@"
fi
exit 93
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 8_000,
          env: {
            PATH: binDir,
            PIPELINE_RUNNER: 'codex',
            PIPELINE_SKILL_BUNDLE_DIR: published.casDir,
            PIPELINE_SKILL_BUNDLE_SHA256: published.digest,
            SENTINEL_DIR: sentinelDir,
            OPENAI_API_KEY: 'test-only-key',
          },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).toBe(0)
      expect(await readFile(join(sentinelDir, 'skill-read'), 'utf8')).toBe('# trusted demo\n')
      const privateDir = (await readFile(join(sentinelDir, 'bundle-dir'), 'utf8')).trim()
      expect(privateDir).toBe(published.casDir)
      const prompt = await readFile(join(sentinelDir, 'prompt'), 'utf8')
      expect(prompt).toContain(`${published.casDir}/manifest.json`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('H10 r5：入口源码不再从 bind source 二次复制，也不创建随机 bundle 路径', () => {
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).not.toContain('PIPELINE_SKILL_BUNDLE_SOURCE_DIR')
    expect(script).not.toContain('PIPELINE_SKILL_BUNDLE_PRIVATE_DIR')
    expect(script).not.toContain('copyBundleTree')
    expect(script).not.toContain('.pipeline-skill-bundle-')
  })

  it('H10 r4 回归：无 bundle 环境 → 不创建/注入私有路径，Codex prompt 保持无 skill bundle 后缀', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-no-bundle-'))
    try {
      const binDir = join(root, 'bin')
      const sentinelDir = join(root, 'sentinel')
      await mkdir(binDir)
      await mkdir(sentinelDir)
      const writeExecutable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await writeExecutable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await writeExecutable('git', `#!/bin/sh
case "\${1:-}" in
  config|add|commit) exit 0 ;;
  status|diff) exit 0 ;;
  rev-parse)
    if [ -f "\${SENTINEL_DIR}/agent-committed" ]; then printf '%s\\n' '${'4'.repeat(40)}';
    else printf '%s\\n' '${'2'.repeat(40)}'; fi
    exit 0 ;;
  *) exit 91 ;;
esac
`)
      await writeExecutable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await writeExecutable('codex', `#!/bin/sh
printf '%s\\n' "\${PIPELINE_SKILL_BUNDLE_DIR-unset}" > "\${SENTINEL_DIR}/bundle-dir"
printf '%s\\n' "$*" > "\${SENTINEL_DIR}/prompt"
printf 'committed\\n' > "\${SENTINEL_DIR}/agent-committed"
`)
      await writeExecutable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  [ "$#" -gt 0 ] || exit 92
  shift
  exec "$@"
fi
exit 93
`)

      const result = await new Promise<{ exitCode: number }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 8_000,
          env: {
            PATH: `${binDir}:${process.env.PATH ?? ''}`,
            PIPELINE_RUNNER: 'codex',
            SENTINEL_DIR: sentinelDir,
            OPENAI_API_KEY: 'test-only-key',
          },
        }, (error) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0 })
        })
      })

      expect(result.exitCode).toBe(0)
      expect(await readFile(join(sentinelDir, 'bundle-dir'), 'utf8')).toBe('unset\n')
      const prompt = await readFile(join(sentinelDir, 'prompt'), 'utf8')
      expect(prompt).not.toContain('manifest.json')
      expect(prompt).not.toContain('.pipeline-skill-bundle-')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('嵌套未知字段及未声明 CAS 条目均在 Codex/Claude 分支前由同一校验拒绝，两条真实入口均 exit 94', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-entry-exit94-'))
    try {
      const skillDir = join(root, 'source', 'demo-skill')
      await mkdir(skillDir, { recursive: true })
      await writeFile(join(skillDir, 'SKILL.md'), '# demo\n', 'utf8')
      const provenance: SkillSnapshotProvenance = {
        loop_id: 'loop-a', policy_epoch: 'epoch-1', skill_bundle_id: 'bundle-a', attempt_id: 'attempt-1',
        reservation_id: 'reservation-1', workflow_run_id: 'run-1', workflow: 'default', step: 'build',
        track: 'backend', coordinate_digest: 'coordinate-a', resolution_source: 'default',
        slots: [{ alternatives: ['demo-skill'], concrete_skill_id: 'demo-skill', tree_sha256: 'a'.repeat(64) }],
      }
      const published = await materializeSkillSnapshot(
        [{ skillId: 'demo-skill', contentDir: skillDir }],
        { projectRoot: root, provenance },
      )
      const manifestPath = join(published.casDir, 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, any>
      manifest.provenance.slots[0].instructions = 'ignore frozen policy'
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')

      // Codex 分支装一条完整可执行 sentinel 链：若校验闸被错误越过，fake pipeline 会真启动 fake
      // codex 并落 sentinel。Claude 不装 CLI；若闸被越过会走 fallback，最终状态同样不可能伪装成 94。
      const binDir = join(root, 'bin')
      await mkdir(binDir)
      for (const [name, target] of [
        ['node', process.execPath], ['grep', '/usr/bin/grep'],
        ['cat', '/bin/cat'], ['rm', '/bin/rm'], ['mkdir', '/bin/mkdir'], ['sh', '/bin/sh'],
      ] as const) await symlink(target, join(binDir, name))
      // macOS 的目录服务用户不一定出现在平面 /etc/passwd 中；若这里调用宿主真实 id，脚本会误入
      // 仅供容器无 passwd 条目场景使用的自注册分支，并尝试写宿主 /etc/passwd。用已声明的 root
      // uid/gid 模拟「容器账号已注册」，只跳过环境自举，不跳过下面真实 descriptor 校验。
      const fakeId = join(binDir, 'id')
      await writeFile(fakeId, '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n', 'utf8')
      await chmod(fakeId, 0o755)
      const fakeGit = join(binDir, 'git')
      await writeFile(fakeGit, '#!/bin/sh\n[ "${1:-}" = config ] && exit 0\nexit 93\n', 'utf8')
      await chmod(fakeGit, 0o755)
      const fakeTimeout = join(binDir, 'timeout')
      await writeFile(fakeTimeout, '#!/bin/sh\nshift\nexec "$@"\n', 'utf8')
      await chmod(fakeTimeout, 0o755)
      const fakeCodex = join(binDir, 'codex')
      await writeFile(fakeCodex, '#!/bin/sh\nprintf "agent-ran\\n" > "$AGENT_SENTINEL"\n', 'utf8')
      await chmod(fakeCodex, 0o755)
      const fakePipeline = join(binDir, 'pipeline')
      await writeFile(fakePipeline, `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  [ "$#" -gt 0 ] || exit 92
  shift
  exec "$@"
fi
exit 93
`, 'utf8')
      await chmod(fakePipeline, 0o755)
      const agentSentinel = join(root, 'agent-ran')

      const invoke = (branchEnv: Record<string, string>): Promise<{ exitCode: number; stderr: string }> =>
        new Promise((resolve, reject) => {
          execFile('/bin/sh', [scriptPath, 'demo-change'], {
            encoding: 'utf8',
            timeout: 5_000,
            env: {
              PATH: binDir,
              PIPELINE_SKILL_BUNDLE_DIR: published.casDir,
              PIPELINE_SKILL_BUNDLE_SHA256: published.digest,
              AGENT_SENTINEL: agentSentinel,
              ...branchEnv,
            },
          }, (error, _stdout, stderr) => {
            if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
            resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stderr })
          })
        })

      const results = [
        await invoke({ PIPELINE_RUNNER: 'codex' }),
        await invoke({ CLAUDE_CODE_OAUTH_TOKEN: 'present-for-branch-selection' }),
      ]
      expect(results.map((result) => result.exitCode)).toEqual([94, 94])
      for (const result of results) expect(result.stderr).toContain('字段闭集非法')
      await expect(readFile(agentSentinel, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

      delete manifest.provenance.slots[0].instructions
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')
      await writeFile(join(published.casDir, 'instructions.md'), 'undeclared root entry', 'utf8')
      await writeFile(join(published.casDir, 'skills', 'undeclared.txt'), 'undeclared skills entry', 'utf8')
      const undeclaredResults = [await invoke({ PIPELINE_RUNNER: 'codex' })]
      expect(undeclaredResults.map((result) => result.exitCode)).toEqual([94])
      for (const result of undeclaredResults) expect(result.stderr).toContain('未声明条目')
      await expect(readFile(agentSentinel, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)
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

describe('pipeline-afk-run.sh · H10 r6 生产 agent 诚实门（真实 shell）', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const scriptPath = join(here, '..', '..', '..', '..', 'tools', 'sandcastle', 'pipeline-afk-run.sh')

  it('默认关闭 fallback：claude-code CLI/认证均缺失时非零退出，不 commit、不产 pass 握手', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-r6-no-agent-'))
    try {
      const binDir = join(root, 'bin')
      const gitCalls = join(root, 'git-calls')
      await mkdir(binDir)
      await symlink('/bin/mkdir', join(binDir, 'mkdir'))
      await symlink('/usr/bin/grep', join(binDir, 'grep'))
      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await executable('pipeline', '#!/bin/sh\n[ "${1:-}" = get ] && { printf "build\\n"; exit 0; }\nexit 91\n')
      await executable('git', `#!/bin/sh
printf '%s\n' "$*" >> "$GIT_CALLS"
case "\${1:-}" in
  config|add|commit) exit 0 ;;
  rev-parse) printf '%s\n' '${'a'.repeat(40)}'; exit 0 ;;
  *) exit 92 ;;
esac
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5_000,
          env: { PATH: binDir, GIT_CALLS: gitCalls },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('agent')
      expect(result.stdout).not.toContain('"verify_result":"pass"')
      expect(await readFile(gitCalls, 'utf8')).not.toMatch(/^commit(?: |$)/m)
      await expect(readFile(join(root, '.sandcastle-build', 'demo-change.done'), 'utf8'))
        .rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('显式测试 env 才允许 fallback：真实落 commit，stderr 与握手都标明 deterministic-test-fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-r6-test-fallback-'))
    try {
      const binDir = join(root, 'bin')
      const gitCalls = join(root, 'git-calls')
      await mkdir(binDir)
      await symlink('/bin/mkdir', join(binDir, 'mkdir'))
      await symlink('/usr/bin/grep', join(binDir, 'grep'))
      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await executable('pipeline', '#!/bin/sh\n[ "${1:-}" = get ] && { printf "build\\n"; exit 0; }\nexit 91\n')
      await executable('git', `#!/bin/sh
printf '%s\n' "$*" >> "$GIT_CALLS"
case "\${1:-}" in
  config|add) exit 0 ;;
  commit) exit 0 ;;
  rev-parse)
    if grep -q '^commit' "$GIT_CALLS" 2>/dev/null; then printf '%s\n' '${'c'.repeat(40)}';
    else printf '%s\n' '${'b'.repeat(40)}'; fi
    exit 0 ;;
  *) exit 92 ;;
esac
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5_000,
          env: {
            PATH: binDir,
            GIT_CALLS: gitCalls,
            PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK: '1',
          },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toContain('TEST-ONLY')
      const report = parseSandboxReport(result.stdout)
      expect(report.execution_mode).toBe('deterministic-test-fallback')
      expect(report.verify_result).toBe('pass')
      expect(await readFile(gitCalls, 'utf8')).toMatch(/^commit(?: |$)/m)
      expect(await readFile(join(root, '.sandcastle-build', 'demo-change.done'), 'utf8'))
        .toContain('afk build for demo-change')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('H5 Codex-first：受 policy 管控的 deterministic fallback 也先写私有 workspace，再经 typed gate 投影', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-policy-fallback-'))
    const binDir = await mkdtemp(join(tmpdir(), 'afk-policy-fallback-bin-'))
    const gatedPaths = join(root, 'gated-paths')
    const runGit = (args: string[]): Promise<string> => new Promise((resolve, reject) => {
      execFile('/usr/bin/git', args, { cwd: root, encoding: 'utf8' },
        (error, stdout) => error ? reject(error) : resolve(stdout))
    })
    try {
      await runGit(['init', '-q'])
      await runGit(['config', 'user.email', 'test@pipeline.local'])
      await runGit(['config', 'user.name', 'test'])
      await writeFile(join(root, 'seed.txt'), 'seed\n', 'utf8')
      await runGit(['add', 'seed.txt'])
      await runGit(['commit', '-q', '-m', 'seed'])

      const pipeline = join(binDir, 'pipeline')
      await writeFile(pipeline, `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\\n'; exit 0; fi
if [ "\${1:-}" = internal-constraint-gate ]; then tr '\\0' '\\n' <"$3" >"$GATED_PATHS"; exit 0; fi
exit 91
`, 'utf8')
      await chmod(pipeline, 0o755)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 20_000,
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ''}`,
            GATED_PATHS: gatedPaths,
            PIPELINE_AUTOMATION_POLICY_B64: 'e30',
            PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK: '1',
          },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode, result.stderr).toBe(0)
      expect(await readFile(gatedPaths, 'utf8')).toBe('.sandcastle-build/demo-change.done\n')
      expect(await readFile(join(root, '.sandcastle-build', 'demo-change.done'), 'utf8'))
        .toContain('afk build for demo-change')
      expect(await runGit(['show', 'HEAD:.sandcastle-build/demo-change.done']))
        .toContain('afk build for demo-change')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('Codex CLI 存在但无 OPENAI_API_KEY/CODEX_HOME auth 时 fail-loud，agent 0 次、commit 0 次', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-r6-codex-no-auth-'))
    try {
      const binDir = join(root, 'bin')
      const gitCalls = join(root, 'git-calls')
      const agentSentinel = join(root, 'agent-ran')
      await mkdir(binDir)
      for (const [name, target] of [['mkdir', '/bin/mkdir'], ['grep', '/usr/bin/grep'], ['sh', '/bin/sh']] as const) {
        await symlink(target, join(binDir, name))
      }
      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await executable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await executable('codex', '#!/bin/sh\nprintf "ran\\n" > "$AGENT_SENTINEL"\n')
      await executable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  shift
  exec "$@"
fi
exit 91
`)
      await executable('git', `#!/bin/sh
printf '%s\n' "$*" >> "$GIT_CALLS"
case "\${1:-}" in
  config|add|commit) exit 0 ;;
  rev-parse) printf '%s\n' '${'c'.repeat(40)}'; exit 0 ;;
  *) exit 92 ;;
esac
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5_000,
          env: { PATH: binDir, GIT_CALLS: gitCalls, AGENT_SENTINEL: agentSentinel, PIPELINE_RUNNER: 'codex' },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('codex 凭证')
      expect(result.stdout).not.toContain('"verify_result":"pass"')
      await expect(readFile(agentSentinel, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(gitCalls, 'utf8')).not.toMatch(/^commit(?: |$)/m)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('Codex 真改树：只提交 agent 产物，握手为 agent/codex，绝不补 deterministic .done', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-r6-codex-agent-'))
    const binDir = await mkdtemp(join(tmpdir(), 'afk-r6-codex-agent-bin-'))
    const run = (file: string, args: string[]): Promise<void> => new Promise((resolve, reject) => {
      execFile(file, args, { cwd: root }, (error) => error ? reject(error) : resolve())
    })
    try {
      await run('/usr/bin/git', ['init', '-q'])
      await run('/usr/bin/git', ['config', 'user.email', 'test@pipeline.local'])
      await run('/usr/bin/git', ['config', 'user.name', 'test'])
      await writeFile(join(root, 'seed.txt'), 'seed\n', 'utf8')
      await run('/usr/bin/git', ['add', 'seed.txt'])
      await run('/usr/bin/git', ['commit', '-q', '-m', 'seed'])

      for (const [name, target] of [
        ['git', '/usr/bin/git'], ['mkdir', '/bin/mkdir'], ['grep', '/usr/bin/grep'], ['sh', '/bin/sh'],
      ] as const) await symlink(target, join(binDir, name))
      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await executable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await executable('codex', `#!/bin/sh
printf 'real codex output\n' > agent-output.txt
printf '%s\n' '{"type":"thread.started","thread_id":"fake-thread"}' '{"type":"turn.completed","usage":{"input_tokens":12,"cached_input_tokens":3,"output_tokens":4,"reasoning_output_tokens":1}}'
`)
      await executable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\n'; exit 0; fi
if [ "\${1:-}" = internal-codex-jsonl ]; then
  [ "\${2:-}" = usage ] && printf '%s\n' '{"provider":"openai-codex","request_id":"fake-thread","tokens":{"input":12,"cached_input":3,"output":4,"reasoning":1,"total":16}}'
  exit 0
fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  shift
  exec "$@"
fi
exit 91
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 20_000,
          env: { PATH: binDir, PIPELINE_RUNNER: 'codex', OPENAI_API_KEY: 'test-key' },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).toBe(0)
      const report = parseSandboxReport(result.stdout)
      expect(report.execution_mode).toBe('agent/codex')
      expect(report.verify_result).toBe('pass')
      expect(report.provider_usage?.tokens.total).toBe(16)
      expect(await readFile(join(root, 'agent-output.txt'), 'utf8')).toBe('real codex output\n')
      await expect(readFile(join(root, '.sandcastle-build', 'demo-change.done'), 'utf8'))
        .rejects.toMatchObject({ code: 'ENOENT' })
      const committed = await new Promise<string>((resolve, reject) => {
        execFile('/usr/bin/git', ['show', 'HEAD:agent-output.txt'], { cwd: root, encoding: 'utf8' },
          (error, stdout) => error ? reject(error) : resolve(stdout))
      })
      expect(committed).toBe('real codex output\n')
      const committedPaths = await new Promise<string[]>((resolve, reject) => {
        execFile('/usr/bin/git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' },
          (error, stdout) => error ? reject(error) : resolve(stdout.trim().split('\n')))
      })
      expect(committedPaths).toContain('agent-output.txt')
      expect(committedPaths).not.toContain('.sandcastle-build.agent.log')
      expect(committedPaths).not.toContain('.sandcastle-build.agent.jsonl')
      expect(committedPaths).not.toContain('.sandcastle-tap/capture.enabled')
      expect(await readFile(join(root, '.sandcastle-build.agent.log'), 'utf8')).toContain('agent exit=0')
      expect(await readFile(join(root, '.sandcastle-tap', 'capture.enabled'), 'utf8')).toBe('1')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  })

  it('H5 Codex-first：policy gate 拒绝时真实 worktree 零业务写；放行后才应用并提交私有 workspace patch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-h5-policy-'))
    const binDir = await mkdtemp(join(tmpdir(), 'afk-h5-policy-bin-'))
    const runGit = (args: string[]): Promise<string> => new Promise((resolve, reject) => {
      execFile('/usr/bin/git', args, { cwd: root, encoding: 'utf8' },
        (error, stdout) => error ? reject(error) : resolve(stdout))
    })
    try {
      await runGit(['init', '-q'])
      await runGit(['config', 'user.email', 'test@pipeline.local'])
      await runGit(['config', 'user.name', 'test'])
      await writeFile(join(root, 'seed.txt'), 'seed\n', 'utf8')
      await runGit(['add', 'seed.txt'])
      await runGit(['commit', '-q', '-m', 'seed'])
      const before = (await runGit(['rev-parse', 'HEAD'])).trim()

      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('codex', `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = -C ]; then cd "$2"; shift 2; else shift; fi
done
printf 'policy governed\n' > agent-output.txt
printf '%s\n' '{"type":"thread.started","thread_id":"fake-policy-thread"}' '{"type":"turn.completed","usage":{"input_tokens":6,"cached_input_tokens":0,"output_tokens":2,"reasoning_output_tokens":0}}'
`)
      await executable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\n'; exit 0; fi
if [ "\${1:-}" = internal-constraint-gate ]; then [ "\${GATE_MODE:-}" = allow ] && exit 0; exit 2; fi
if [ "\${1:-}" = internal-codex-jsonl ]; then
  [ "\${2:-}" = usage ] && printf '%s\n' '{"provider":"openai-codex","request_id":"fake-policy-thread","tokens":{"input":6,"cached_input":0,"output":2,"reasoning":0,"total":8}}'
  exit 0
fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  shift
  exec "$@"
fi
exit 91
`)
      await executable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      const baseEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PIPELINE_RUNNER: 'codex', OPENAI_API_KEY: 'test-key',
        PIPELINE_AUTOMATION_POLICY_B64: 'e30',
      }
      const invoke = (mode: string) => new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...baseEnv, GATE_MODE: mode },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      const denied = await invoke('deny')
      expect(denied.exitCode).not.toBe(0)
      expect(denied.stderr).toContain('真实 worktree 未应用业务 patch')
      await expect(readFile(join(root, 'agent-output.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect((await runGit(['rev-parse', 'HEAD'])).trim()).toBe(before)

      const allowed = await invoke('allow')
      expect(allowed.exitCode).toBe(0)
      expect(await readFile(join(root, 'agent-output.txt'), 'utf8')).toBe('policy governed\n')
      expect((await runGit(['rev-parse', 'HEAD'])).trim()).not.toBe(before)
      const script = readFileSync(scriptPath, 'utf8')
      expect(script).toContain('codex exec --json -C "$2" --sandbox workspace-write --ephemeral')
      expect(script).not.toContain('codex exec -C "$2" --dangerously-bypass-approvals-and-sandbox')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('Codex exit 0 但 Git 无任何推进时仍 fail-loud，不把空跑输出为 pass', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-r6-codex-noop-'))
    const binDir = await mkdtemp(join(tmpdir(), 'afk-r6-codex-noop-bin-'))
    const run = (args: string[]): Promise<string> => new Promise((resolve, reject) => {
      execFile('/usr/bin/git', args, { cwd: root, encoding: 'utf8' },
        (error, stdout) => error ? reject(error) : resolve(stdout))
    })
    try {
      await run(['init', '-q'])
      await run(['config', 'user.email', 'test@pipeline.local'])
      await run(['config', 'user.name', 'test'])
      await writeFile(join(root, 'seed.txt'), 'seed\n', 'utf8')
      await run(['add', 'seed.txt'])
      await run(['commit', '-q', '-m', 'seed'])
      const before = (await run(['rev-parse', 'HEAD'])).trim()

      for (const [name, target] of [
        ['git', '/usr/bin/git'], ['mkdir', '/bin/mkdir'], ['grep', '/usr/bin/grep'], ['sh', '/bin/sh'],
      ] as const) await symlink(target, join(binDir, name))
      const executable = async (name: string, body: string): Promise<void> => {
        const path = join(binDir, name)
        await writeFile(path, body, 'utf8')
        await chmod(path, 0o755)
      }
      await executable('id', '#!/bin/sh\ncase "${1:-}" in -u|-g) printf "0\\n" ;; *) exit 2 ;; esac\n')
      await executable('timeout', '#!/bin/sh\nshift\nexec "$@"\n')
      await executable('codex', '#!/bin/sh\nexit 0\n')
      await executable('pipeline', `#!/bin/sh
if [ "\${1:-}" = get ]; then printf 'build\n'; exit 0; fi
if [ "\${1:-}" = tap ]; then
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done
  shift
  exec "$@"
fi
exit 91
`)

      const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', [scriptPath, 'demo-change'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5_000,
          env: { PATH: binDir, PIPELINE_RUNNER: 'codex', OPENAI_API_KEY: 'test-key' },
        }, (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== 'number') return reject(error)
          resolve({ exitCode: error ? (error as unknown as { code: number }).code : 0, stdout, stderr })
        })
      })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('Git')
      expect(result.stdout).not.toContain('"verify_result":"pass"')
      expect((await run(['rev-parse', 'HEAD'])).trim()).toBe(before)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(binDir, { recursive: true, force: true })
    }
  }, 30_000)
})
