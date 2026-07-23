/**
 * cli 侧 AFK 就绪探测 probeAfkReadiness —— full-install R1（终端 setup runtime / doctor afk:* 共用探针）。
 *
 * 与 server buildAfkReadiness 对称（同响应形状、同短路、同「永不回凭证值」纪律），差别只在:
 * cli 侧 secrets 已由 deps.readSecretsEnv 读成 env 形状注入（secretsEnv），不在探针里碰文件——
 * 探针是「即将 afk run 的 shell 当刻」权威（P1-X1：终端 doctor/setup 为凭证权威，比 server 快照准）。
 * build_hint 走 kernel 单一真相源常量（防漂移，断言逐字等于 server 同源值）。
 */
import { describe, expect, it } from 'vitest'
import { SANDCASTLE_BUILD_HINT } from '@pipeline-lite/kernel'
import { probeAfkReadiness, type ExecDockerFn } from './afkReadiness.js'

/** docker info 恒成功；image inspect 命中 presentImages → 0，否则 1（同 server 测试 fake 口径）。 */
const dockerOk =
  (presentImages: string[]): ExecDockerFn =>
  async (args) => {
    if (args[0] === 'info') return { stdout: 'ok', stderr: '', exitCode: 0 }
    if (args[0] === 'image' && args[1] === 'inspect') {
      return presentImages.includes(String(args[2]))
        ? { stdout: '[]', stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'no such image', exitCode: 1 }
    }
    throw new Error(`unexpected docker args ${args.join(' ')}`)
  }

describe('probeAfkReadiness —— cli 侧 AFK 就绪探测', () => {
  it('①形状逐字段匹配;镜像在位 present:true;凭证 set+source,永不含值', async () => {
    const r = await probeAfkReadiness({
      image: 'sandcastle:local',
      exec: dockerOk(['sandcastle:local']),
      secretsEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'tok-secret-abc' },
      hostEnv: { CODEX_HOME: '/home/u/.codex' },
    })
    expect(r).toEqual({
      ok: true,
      docker: { available: true },
      image: { configured: 'sandcastle:local', present: true, build_hint: SANDCASTLE_BUILD_HINT },
      credentials: {
        'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: true, source: 'secrets-file' } },
        codex: {
          OPENAI_API_KEY: { set: false },
          CODEX_HOME: { set: true, source: 'host-env' },
        },
      },
    })
    expect(JSON.stringify(r)).not.toContain('tok-secret-abc')
  })

  it('②docker info 失败 → 短路,不再调 image inspect;available:false 且 present:false（降级不抛）', async () => {
    const calls: string[][] = []
    const exec: ExecDockerFn = async (args) => {
      calls.push([...args])
      return { stdout: '', stderr: 'daemon down', exitCode: 1 }
    }
    const r = await probeAfkReadiness({ image: 'x:y', exec, secretsEnv: {}, hostEnv: {} })
    expect(r.docker.available).toBe(false)
    expect(r.image.present).toBe(false)
    expect(calls.filter((c) => c[0] === 'image')).toHaveLength(0)
  })

  it('docker exec 抛错（spawn ENOENT 类）→ 降级 available:false,不上抛', async () => {
    const exec: ExecDockerFn = async () => {
      throw new Error('spawn docker ENOENT')
    }
    const r = await probeAfkReadiness({ image: 'x:y', exec, secretsEnv: {}, hostEnv: {} })
    expect(r.docker.available).toBe(false)
    expect(r.image.present).toBe(false)
  })

  it('⑤build_hint 精确等于 kernel 常量（cli==server 同源,防漂移）', async () => {
    const r = await probeAfkReadiness({ image: 'sandcastle:local', exec: dockerOk([]), secretsEnv: {}, hostEnv: {} })
    expect(r.image.present).toBe(false)
    expect(r.image.build_hint).toBe(SANDCASTLE_BUILD_HINT)
    expect(r.image.build_hint).toBe('bash tools/sandcastle/build.sh')
  })

  it('host env 非空 > secrets 文件（C4 优先级:实际生效者标 host-env）', async () => {
    const r = await probeAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsEnv: { OPENAI_API_KEY: 'sk-file' },
      hostEnv: { OPENAI_API_KEY: 'sk-env' },
    })
    expect(r.credentials.codex.OPENAI_API_KEY).toEqual({ set: true, source: 'host-env' })
  })

  it('空串宿主 env 视同缺席（不吃掉 secrets 值,同 T2 合并语义）', async () => {
    const r = await probeAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsEnv: { OPENAI_API_KEY: 'sk-file' },
      hostEnv: { OPENAI_API_KEY: '' },
    })
    expect(r.credentials.codex.OPENAI_API_KEY).toEqual({ set: true, source: 'secrets-file' })
  })

  it('⑥两 runner 凭证对称:codex 的 OPENAI_API_KEY / CODEX_HOME 与 claude-code 同在清单里真探真值', async () => {
    const r = await probeAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsEnv: { OPENAI_API_KEY: 'sk-file' },
      hostEnv: {},
    })
    // codex 不缺席：两键都在响应里
    expect(r.credentials.codex).toHaveProperty('OPENAI_API_KEY')
    expect(r.credentials.codex).toHaveProperty('CODEX_HOME')
    expect(r.credentials.codex.OPENAI_API_KEY).toEqual({ set: true, source: 'secrets-file' })
    expect(r.credentials.codex.CODEX_HOME).toEqual({ set: false })
    expect(r.credentials['claude-code']).toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
  })

  it('CODEX_HOME 只看宿主 env（决策 C2b:路径不进 secrets store）', async () => {
    const r = await probeAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsEnv: { CODEX_HOME: '/should/be/ignored' },
      hostEnv: {},
    })
    expect(r.credentials.codex.CODEX_HOME).toEqual({ set: false })
  })

  it('Codex-first：默认 ~/.codex/auth.json 可读时，即使 shell 未导出 CODEX_HOME 也判就绪', async () => {
    const opts = {
      image: 'x:y', exec: dockerOk(['x:y']), secretsEnv: {}, hostEnv: {},
      defaultCodexHome: '/users/codex-owner/.codex',
      canReadFile: (path: string) => path === '/users/codex-owner/.codex/auth.json',
    }
    const r = await probeAfkReadiness(opts)
    expect(r.credentials.codex.CODEX_HOME).toEqual({ set: true, source: 'default-home' })
  })
})
