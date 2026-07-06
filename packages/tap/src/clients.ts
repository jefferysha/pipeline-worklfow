/**
 * clients —— 多 runtime client 配置映射 + target 检测（reverse/forward 模式路由）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/clients.py
 *   ClientConfig:18 · reverse_base_url:35 · reverse_env_map:38 · reverse_strip_path_prefix:45
 *   · PROVIDER_RECORDED_PATHS:54 · FORWARD_PROXY_ENV_KEYS:60 · FORWARD_CA_ENV_KEYS:64
 *   · forward_env_map:69 · CLIENT_CONFIGS:81 · _detect_anthropic_target:169 · _detect_codex_target:182
 *   · detect_target:193 · recorded_paths:207 · _BEDROCK_HOST_RE:227 · is_aws_native_bedrock_url:236
 *   · is_claude_bedrock_enabled:254 · requires_forward_for_url:263。
 *
 * 覆盖平台：claude/codex（reverse）· gemini/opencode/mimo/pi/hermes/qoder/agy（forward）
 *   · kimi/kimi-code/openclaw/codebuddy（reverse 补充）。任务要求的 codex/kimi/openclaw/codebuddy/gemini
 *   均含在内。provider 驱动录制路径与重组（anthropic|openai|gemini）。
 *
 * 结构改进：老仓 detect_target 直读 os.environ / Path.home()；本仓改为可注入 {env, home} 的纯查询
 *   （hermetic 测试可喂临时配置文件），生产默认走 process.env / os.homedir()。
 *
 * 安全护栏（#34e）：本模块纯配置/查询逻辑，零 outbound 网络 import——只读 env + 本地配置文件。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ClientConfig {
  cmd: string
  label: string
  baseUrlEnv: string
  defaultTarget: string
  provider: 'anthropic' | 'openai' | 'gemini'
  baseUrlSuffix: string
  extraBaseUrlEnvs: readonly string[]
  nestingEnvKeys: readonly string[]
  baseUrlConfigKey: string | null
  stripPathPrefix: string
  stripPathPrefixUnlessTargetContains: readonly string[]
  defaultProxyMode: 'reverse' | 'forward'
  forwardBaseUrlEnvs: readonly string[]
  forwardAllowedPathPrefixes: readonly string[]
}

function cfg(partial: Partial<ClientConfig> & Pick<ClientConfig, 'cmd' | 'label' | 'baseUrlEnv' | 'defaultTarget'>): ClientConfig {
  return {
    provider: 'anthropic',
    baseUrlSuffix: '',
    extraBaseUrlEnvs: [],
    nestingEnvKeys: [],
    baseUrlConfigKey: null,
    stripPathPrefix: '',
    stripPathPrefixUnlessTargetContains: [],
    defaultProxyMode: 'reverse',
    forwardBaseUrlEnvs: [],
    forwardAllowedPathPrefixes: [],
    ...partial,
  }
}

/** reverse 本地上游 base url。clients.py:35 reverse_base_url。 */
export function reverseBaseUrl(c: ClientConfig, port: number): string {
  return `http://127.0.0.1:${port}${c.baseUrlSuffix}`
}

/** reverse 模式注入的 env 映射（主 env + extra 全指同一本地 url）。clients.py:38 reverse_env_map。 */
export function reverseEnvMap(c: ClientConfig, port: number): Record<string, string> {
  const url = reverseBaseUrl(c, port)
  const map: Record<string, string> = { [c.baseUrlEnv]: url }
  for (const key of c.extraBaseUrlEnvs) map[key] = url
  return map
}

/** reverse 模式该剥的路径前缀（除非 target 命中白名单）。clients.py:45 reverse_strip_path_prefix。 */
export function reverseStripPathPrefix(c: ClientConfig, target: string): string {
  if (!c.stripPathPrefix) return ''
  if (c.stripPathPrefixUnlessTargetContains.some((marker) => target.includes(marker))) return ''
  return c.stripPathPrefix
}

// provider → 该录 trace 的请求路径（其余路径透明转发不录）。clients.py:54。
export const PROVIDER_RECORDED_PATHS: Record<string, readonly string[]> = {
  anthropic: ['/v1/messages'],
  openai: ['/v1/chat/completions', '/v1/responses', '/chat/completions', '/responses'],
  gemini: [],
}

// forward 模式注入的代理 env（指向本地 forward proxy）。clients.py:60。
export const FORWARD_PROXY_ENV_KEYS: readonly string[] = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy',
]
// forward 模式注入的 CA env（让 node/python-requests/openssl 系 CLI 免钥匙串信任本地 CA）。clients.py:64。
export const FORWARD_CA_ENV_KEYS: readonly string[] = [
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'CODEX_CA_CERTIFICATE', 'REQUESTS_CA_BUNDLE',
]

/** forward 模式注入：代理指向本地 proxy + CA 路径。clients.py:69 forward_env_map。 */
export function forwardEnvMap(port: number, caCertPath: string): Record<string, string> {
  const proxyUrl = `http://127.0.0.1:${port}`
  const env: Record<string, string> = {}
  for (const key of FORWARD_PROXY_ENV_KEYS) env[key] = proxyUrl
  env.NO_PROXY = 'localhost,127.0.0.1'
  env.no_proxy = 'localhost,127.0.0.1'
  const ca = String(caCertPath)
  for (const key of FORWARD_CA_ENV_KEYS) env[key] = ca
  return env
}

/** 全 runtime 配置表。clients.py:81 CLIENT_CONFIGS。 */
export const CLIENT_CONFIGS: Record<string, ClientConfig> = {
  claude: cfg({
    cmd: 'claude', label: 'Claude Code', baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultTarget: 'https://api.anthropic.com', provider: 'anthropic',
    extraBaseUrlEnvs: ['ANTHROPIC_BEDROCK_BASE_URL'], nestingEnvKeys: ['CLAUDECODE', 'CLAUDE_CODE_SSE_PORT'],
  }),
  codex: cfg({
    cmd: 'codex', label: 'Codex CLI', baseUrlEnv: 'OPENAI_BASE_URL',
    defaultTarget: 'https://api.openai.com', provider: 'openai',
    baseUrlSuffix: '/v1', baseUrlConfigKey: 'openai_base_url',
    stripPathPrefix: '/v1', stripPathPrefixUnlessTargetContains: ['api.openai.com'],
  }),
  // ── forward / MITM 模式（不支持 base-url override）──
  gemini: cfg({
    cmd: 'gemini', label: 'Gemini CLI', baseUrlEnv: 'GOOGLE_GEMINI_BASE_URL',
    defaultTarget: 'https://generativelanguage.googleapis.com', provider: 'gemini',
    extraBaseUrlEnvs: ['GOOGLE_VERTEX_BASE_URL'], defaultProxyMode: 'forward',
  }),
  opencode: cfg({
    cmd: 'opencode', label: 'OpenCode', baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultTarget: 'https://api.anthropic.com', provider: 'anthropic', defaultProxyMode: 'forward',
  }),
  mimo: cfg({
    cmd: 'mimo', label: 'MiMo Code', baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultTarget: 'https://api.anthropic.com', provider: 'anthropic', defaultProxyMode: 'forward',
  }),
  pi: cfg({
    cmd: 'pi', label: 'Pi', baseUrlEnv: 'OPENAI_BASE_URL', baseUrlSuffix: '/v1',
    defaultTarget: 'https://api.openai.com', provider: 'openai', defaultProxyMode: 'forward',
  }),
  hermes: cfg({
    cmd: 'hermes', label: 'Hermes Agent', baseUrlEnv: 'OPENAI_BASE_URL', baseUrlSuffix: '/v1',
    defaultTarget: 'https://api.openai.com', provider: 'openai', defaultProxyMode: 'forward',
  }),
  qoder: cfg({
    cmd: 'qodercli', label: 'Qoder CLI', baseUrlEnv: 'QODER_BASE_URL',
    defaultTarget: 'https://api2.qoder.sh', provider: 'openai', defaultProxyMode: 'forward',
  }),
  agy: cfg({
    cmd: 'agy', label: 'Antigravity CLI', baseUrlEnv: 'CLOUD_CODE_URL',
    defaultTarget: 'https://daily-cloudcode-pa.googleapis.com', provider: 'gemini', defaultProxyMode: 'forward',
    forwardBaseUrlEnvs: ['CLOUD_CODE_URL'], forwardAllowedPathPrefixes: ['/v1internal'],
  }),
  // ── reverse 补充 ──
  kimi: cfg({
    cmd: 'kimi', label: 'Kimi Code CLI', baseUrlEnv: 'KIMI_BASE_URL',
    defaultTarget: 'https://api.kimi.com/coding/v1', provider: 'openai',
  }),
  'kimi-code': cfg({
    cmd: 'kimi', label: 'Kimi Code CLI', baseUrlEnv: 'KIMI_CODE_BASE_URL',
    defaultTarget: 'https://api.kimi.com/coding/v1', provider: 'openai',
  }),
  openclaw: cfg({
    cmd: 'openclaw', label: 'OpenClaw', baseUrlEnv: 'OPENAI_BASE_URL', baseUrlSuffix: '/v1',
    defaultTarget: 'https://api.openai.com', provider: 'openai',
    extraBaseUrlEnvs: ['ANTHROPIC_BASE_URL', 'GOOGLE_GEMINI_BASE_URL', 'OPENROUTER_BASE_URL', 'CUSTOM_BASE_URL'],
  }),
  codebuddy: cfg({
    cmd: 'codebuddy', label: 'CodeBuddy', baseUrlEnv: 'CODEBUDDY_BASE_URL',
    defaultTarget: 'https://copilot.tencent.com/v2', provider: 'openai',
  }),
}

// ── target 检测（可注入 env/home）─────────────────────────────────────────────
export interface DetectOptions {
  env?: NodeJS.ProcessEnv
  home?: string
}

function readJson(path: string): Record<string, unknown> {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function detectAnthropicTarget(c: ClientConfig, env: NodeJS.ProcessEnv, home: string): string {
  const fromEnv = (env.ANTHROPIC_BASE_URL ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  for (const name of ['settings.json', 'settings.local.json']) {
    const data = readJson(join(home, '.claude', name))
    const envBlock = typeof data.env === 'object' && data.env !== null ? (data.env as Record<string, unknown>) : {}
    const val = String(envBlock.ANTHROPIC_BASE_URL ?? '').trim()
    if (val) return val.replace(/\/+$/, '')
  }
  return c.defaultTarget
}

function detectCodexTarget(c: ClientConfig, env: NodeJS.ProcessEnv, home: string): string {
  const fromEnv = (env.OPENAI_BASE_URL ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const auth = readJson(join(home, '.codex', 'auth.json'))
  // ChatGPT 登录态（有 tokens、无显式 API key）→ ChatGPT backend
  if (auth.tokens && !auth.OPENAI_API_KEY) return 'https://chatgpt.com/backend-api/codex'
  return c.defaultTarget
}

/** 检测某 CLI 的真实上游 target（env → 配置 → 默认）。clients.py:193 detect_target。 */
export function detectTarget(client: string, opts: DetectOptions = {}): string {
  const c = CLIENT_CONFIGS[client]
  if (!c) throw new Error(`未知 client: ${client}`)
  const env = opts.env ?? process.env
  const home = opts.home ?? homedir()
  if (client === 'claude') return detectAnthropicTarget(c, env, home)
  if (client === 'codex') return detectCodexTarget(c, env, home)
  if (c.baseUrlEnv) {
    const fromEnv = (env[c.baseUrlEnv] ?? '').trim()
    if (fromEnv) return fromEnv.replace(/\/+$/, '')
  }
  return c.defaultTarget
}

/** provider 对应的录制路径。clients.py:207 recorded_paths。 */
export function recordedPaths(client: string): readonly string[] {
  const c = CLIENT_CONFIGS[client]
  if (!c) return []
  return PROVIDER_RECORDED_PATHS[c.provider] ?? []
}

// ── AWS 原生 Bedrock 检测 + forward 路由（SigV4 签名不可被 reverse 改写）─────────
// clients.py:227 _BEDROCK_HOST_RE 忠实移植。
const BEDROCK_HOST_RE =
  /(^|\.)((bedrock-runtime|bedrock-runtime-fips)\.[a-z0-9-]+\.(amazonaws\.com|amazonaws\.com\.cn|vpce\.amazonaws\.com)|bedrock-mantle\.[a-z0-9-]+\.(api\.aws|amazonaws\.com|amazonaws\.com\.cn))$/

/** url 是否指向真 AWS Bedrock 端点（SigV4 签名）。clients.py:236 is_aws_native_bedrock_url。 */
export function isAwsNativeBedrockUrl(url: string): boolean {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  return BEDROCK_HOST_RE.test(host)
}

function isTruthyEnvValue(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/** Claude Code 是否配置走 AWS Bedrock（CLAUDE_CODE_USE_BEDROCK）。clients.py:254。 */
export function isClaudeBedrockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env.CLAUDE_CODE_USE_BEDROCK ?? '')
}

/** url 是否必须走 forward（透明）模式：原生 Bedrock 端点。clients.py:263 requires_forward_for_url。 */
export function requiresForwardForUrl(url: string): boolean {
  return isAwsNativeBedrockUrl(url)
}
