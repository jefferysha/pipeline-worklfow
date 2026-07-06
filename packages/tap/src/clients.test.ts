/**
 * clients.test —— 多 runtime client 配置映射真断言（GOAL C9）。
 * 零 mock：真配置表 + 真 env/home 注入解析（detect_target 读真临时配置文件）。
 * 老仓真相源：clients.py（CLIENT_CONFIGS / detect_target / reverse_env_map / forward_env_map / bedrock 路由）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CLIENT_CONFIGS,
  PROVIDER_RECORDED_PATHS,
  FORWARD_PROXY_ENV_KEYS,
  FORWARD_CA_ENV_KEYS,
  reverseBaseUrl,
  reverseEnvMap,
  reverseStripPathPrefix,
  forwardEnvMap,
  detectTarget,
  recordedPaths,
  isAwsNativeBedrockUrl,
  isClaudeBedrockEnabled,
  requiresForwardForUrl,
} from './clients.js'

const dirs: string[] = []
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }) })
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'pl-clients-')); dirs.push(d); return d }

describe('clients —— 多 runtime 配置覆盖面', () => {
  it('任务要求的 5 个 runtime 全部登记：codex/kimi/openclaw/codebuddy/gemini', () => {
    for (const name of ['codex', 'kimi', 'openclaw', 'codebuddy', 'gemini']) {
      expect(CLIENT_CONFIGS[name], `缺 runtime ${name}`).toBeDefined()
    }
  })

  it('claude/codex reverse 模式；gemini/opencode/pi 等 forward 模式', () => {
    expect(CLIENT_CONFIGS.claude!.defaultProxyMode).toBe('reverse')
    expect(CLIENT_CONFIGS.codex!.defaultProxyMode).toBe('reverse')
    expect(CLIENT_CONFIGS.gemini!.defaultProxyMode).toBe('forward')
    expect(CLIENT_CONFIGS.opencode!.defaultProxyMode).toBe('forward')
  })

  it('每个 config 的 provider 都在 PROVIDER_RECORDED_PATHS 有映射', () => {
    for (const [name, cfg] of Object.entries(CLIENT_CONFIGS)) {
      expect(PROVIDER_RECORDED_PATHS[cfg.provider], `provider ${cfg.provider} (${name}) 无录制路径`).toBeDefined()
    }
  })
})

describe('clients —— reverse env 映射', () => {
  it('codex：base_url_suffix=/v1 + OPENAI_BASE_URL 指本地端口', () => {
    const cfg = CLIENT_CONFIGS.codex!
    expect(reverseBaseUrl(cfg, 8770)).toBe('http://127.0.0.1:8770/v1')
    expect(reverseEnvMap(cfg, 8770)).toEqual({ OPENAI_BASE_URL: 'http://127.0.0.1:8770/v1' })
  })

  it('openclaw：主 env + extra_base_url_envs 全指同一本地 url', () => {
    const map = reverseEnvMap(CLIENT_CONFIGS.openclaw!, 8771)
    const url = 'http://127.0.0.1:8771/v1'
    expect(map.OPENAI_BASE_URL).toBe(url)
    expect(map.ANTHROPIC_BASE_URL).toBe(url)
    expect(map.GOOGLE_GEMINI_BASE_URL).toBe(url)
    expect(map.OPENROUTER_BASE_URL).toBe(url)
    expect(map.CUSTOM_BASE_URL).toBe(url)
  })

  it('kimi / codebuddy：各自 base_url_env', () => {
    expect(reverseEnvMap(CLIENT_CONFIGS.kimi!, 9001)).toEqual({ KIMI_BASE_URL: 'http://127.0.0.1:9001' })
    expect(reverseEnvMap(CLIENT_CONFIGS.codebuddy!, 9002)).toEqual({ CODEBUDDY_BASE_URL: 'http://127.0.0.1:9002' })
  })

  it('reverseStripPathPrefix：codex 除非 target 指向 api.openai.com 才剥 /v1', () => {
    const cfg = CLIENT_CONFIGS.codex!
    expect(reverseStripPathPrefix(cfg, 'https://proxy.internal')).toBe('/v1')
    expect(reverseStripPathPrefix(cfg, 'https://api.openai.com')).toBe('')
    expect(reverseStripPathPrefix(CLIENT_CONFIGS.kimi!, 'https://x')).toBe('') // 无 strip 配置
  })
})

describe('clients —— forward env 映射（proxy + CA 注入）', () => {
  it('forwardEnvMap：全部代理 env 指本地 proxy + NO_PROXY 排除本地 + CA 路径注入', () => {
    const env = forwardEnvMap(8899, '/tmp/ca.pem')
    for (const key of FORWARD_PROXY_ENV_KEYS) expect(env[key]).toBe('http://127.0.0.1:8899')
    expect(env.NO_PROXY).toContain('127.0.0.1')
    expect(env.no_proxy).toContain('localhost')
    for (const key of FORWARD_CA_ENV_KEYS) expect(env[key]).toBe('/tmp/ca.pem')
  })

  it('CA env 覆盖 node/requests/openssl 系（NODE_EXTRA_CA_CERTS 等）', () => {
    expect(FORWARD_CA_ENV_KEYS).toContain('NODE_EXTRA_CA_CERTS')
    expect(FORWARD_CA_ENV_KEYS).toContain('SSL_CERT_FILE')
    expect(FORWARD_CA_ENV_KEYS).toContain('REQUESTS_CA_BUNDLE')
  })
})

describe('clients —— detect_target（env → 配置文件 → 默认）', () => {
  it('env 覆盖优先（去尾斜杠）', () => {
    expect(detectTarget('kimi', { env: { KIMI_BASE_URL: 'https://custom.kimi/' } })).toBe('https://custom.kimi')
  })

  it('claude：无 env 时读 ~/.claude/settings.json 的 env.ANTHROPIC_BASE_URL', () => {
    const home = tmp()
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://claude.proxy/' } }))
    expect(detectTarget('claude', { env: {}, home })).toBe('https://claude.proxy')
  })

  it('claude：无 env 无配置 → 默认 api.anthropic.com', () => {
    expect(detectTarget('claude', { env: {}, home: tmp() })).toBe('https://api.anthropic.com')
  })

  it('codex：ChatGPT 登录态（有 tokens 无 API key）→ chatgpt backend', () => {
    const home = tmp()
    mkdirSync(join(home, '.codex'), { recursive: true })
    writeFileSync(join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { access: 'x' } }))
    expect(detectTarget('codex', { env: {}, home })).toBe('https://chatgpt.com/backend-api/codex')
  })

  it('codex：有 API key → 默认 api.openai.com', () => {
    const home = tmp()
    mkdirSync(join(home, '.codex'), { recursive: true })
    writeFileSync(join(home, '.codex', 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-x', tokens: { access: 'y' } }))
    expect(detectTarget('codex', { env: {}, home })).toBe('https://api.openai.com')
  })

  it('recordedPaths：anthropic → /v1/messages；openai → chat/responses', () => {
    expect(recordedPaths('claude')).toContain('/v1/messages')
    expect(recordedPaths('codex')).toContain('/v1/chat/completions')
    expect(recordedPaths('codex')).toContain('/v1/responses')
  })
})

describe('clients —— AWS 原生 Bedrock 强制 forward（SigV4 不可改写）', () => {
  it('is_aws_native_bedrock_url：真 bedrock 端点判真，普通 host 判假', () => {
    expect(isAwsNativeBedrockUrl('https://bedrock-runtime.us-east-1.amazonaws.com/model/x/converse')).toBe(true)
    expect(isAwsNativeBedrockUrl('https://bedrock-runtime-fips.us-west-2.amazonaws.com/y')).toBe(true)
    expect(isAwsNativeBedrockUrl('https://bedrock-mantle.us-east-1.api.aws/z')).toBe(true)
    expect(isAwsNativeBedrockUrl('https://api.anthropic.com/v1/messages')).toBe(false)
    expect(isAwsNativeBedrockUrl('not a url')).toBe(false)
  })
  it('requiresForwardForUrl：原生 bedrock → 强制 forward', () => {
    expect(requiresForwardForUrl('https://bedrock-runtime.eu-central-1.amazonaws.com/m')).toBe(true)
    expect(requiresForwardForUrl('https://api.openai.com/v1')).toBe(false)
  })
  it('isClaudeBedrockEnabled：CLAUDE_CODE_USE_BEDROCK 真值判真', () => {
    expect(isClaudeBedrockEnabled({ CLAUDE_CODE_USE_BEDROCK: '1' })).toBe(true)
    expect(isClaudeBedrockEnabled({ CLAUDE_CODE_USE_BEDROCK: 'true' })).toBe(true)
    expect(isClaudeBedrockEnabled({ CLAUDE_CODE_USE_BEDROCK: '0' })).toBe(false)
    expect(isClaudeBedrockEnabled({})).toBe(false)
  })
})
