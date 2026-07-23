// T4(v6 计划):AFK 就绪三灯探测——docker 可用 / 配置镜像存在 / 凭证已配(per-runner)。
// 契约=proposal 附录 D.1(响应形状逐字段;永不回凭证值,只回 set+source;探测 1 失败短路探测 2)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAfkReadiness } from './afkReadiness.js'
import type { ExecDockerFn } from './dockerImages.js'

let base: string
let secretsPath: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'afkready-'))
  secretsPath = join(base, '.claude', 'pipeline-secrets.json')
  mkdirSync(join(base, '.claude'), { recursive: true })
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const dockerOk =
  (presentImages: string[]): ExecDockerFn =>
  async (args) => {
    if (args[0] === 'info') return { stdout: 'ok', stderr: '', exitCode: 0 }
    if (args[0] === 'image' && args[1] === 'inspect') {
      return presentImages.includes(String(args[2])) ? { stdout: '[]', stderr: '', exitCode: 0 } : { stdout: '', stderr: 'no such image', exitCode: 1 }
    }
    throw new Error(`unexpected docker args ${args.join(' ')}`)
  }

describe('buildAfkReadiness', () => {
  it('①形状逐字段匹配 D.1;镜像存在 → present:true;凭证 set+source 标签,永不含值', async () => {
    writeFileSync(secretsPath, JSON.stringify({ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN: 'tok-secret-abc' } }))
    const r = await buildAfkReadiness({
      image: 'sandcastle:local',
      exec: dockerOk(['sandcastle:local']),
      secretsPath,
      hostEnv: { CODEX_HOME: '/home/u/.codex' },
    })
    expect(r).toEqual({
      ok: true,
      docker: { available: true },
      image: { configured: 'sandcastle:local', present: true, build_hint: 'bash tools/sandcastle/build.sh' },
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

  it('②docker info 失败 → 短路,不再调 image inspect;available:false 且 present:false', async () => {
    const calls: string[][] = []
    const exec: ExecDockerFn = async (args) => {
      calls.push([...args])
      return { stdout: '', stderr: 'daemon down', exitCode: 1 }
    }
    const r = await buildAfkReadiness({ image: 'x:y', exec, secretsPath, hostEnv: {} })
    expect(r.docker.available).toBe(false)
    expect(r.image.present).toBe(false)
    expect(calls.filter((c) => c[0] === 'image')).toHaveLength(0)
  })

  it('④镜像缺失 → build_hint 精确等于 bash tools/sandcastle/build.sh', async () => {
    const r = await buildAfkReadiness({ image: 'sandcastle:local', exec: dockerOk([]), secretsPath, hostEnv: {} })
    expect(r.image.present).toBe(false)
    expect(r.image.build_hint).toBe('bash tools/sandcastle/build.sh')
  })

  it('⑤secrets 文件与宿主 env 同时设置 → source 标 host-env(C4 优先级:实际生效者)', async () => {
    writeFileSync(secretsPath, JSON.stringify({ version: 1, keys: { OPENAI_API_KEY: 'sk-file' } }))
    const r = await buildAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsPath,
      hostEnv: { OPENAI_API_KEY: 'sk-env' },
    })
    expect(r.credentials.codex.OPENAI_API_KEY).toEqual({ set: true, source: 'host-env' })
  })

  it('空串宿主 env 视同缺席(不吃掉 secrets 文件值,同 T2 合并语义)', async () => {
    writeFileSync(secretsPath, JSON.stringify({ version: 1, keys: { OPENAI_API_KEY: 'sk-file' } }))
    const r = await buildAfkReadiness({
      image: 'x:y',
      exec: dockerOk(['x:y']),
      secretsPath,
      hostEnv: { OPENAI_API_KEY: '' },
    })
    expect(r.credentials.codex.OPENAI_API_KEY).toEqual({ set: true, source: 'secrets-file' })
  })

  it('Codex-first：未导出 CODEX_HOME 但默认 ~/.codex/auth.json 可读 → 凭证就绪且不回显路径', async () => {
    const codexHome = join(base, '.codex')
    mkdirSync(codexHome, { recursive: true })
    writeFileSync(join(codexHome, 'auth.json'), '{"tokens":"secret-must-not-leak"}')
    const opts = {
      image: 'sandcastle:local', exec: dockerOk(['sandcastle:local']), secretsPath, hostEnv: {}, defaultCodexHome: codexHome,
    }
    const r = await buildAfkReadiness(opts)
    expect(r.credentials.codex.CODEX_HOME).toEqual({ set: true, source: 'default-home' })
    expect(JSON.stringify(r)).not.toContain(codexHome)
    expect(JSON.stringify(r)).not.toContain('secret-must-not-leak')
  })
})
