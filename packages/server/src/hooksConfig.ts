/**
 * hooksConfig —— 阶段×hook 开关矩阵存储 + 校验（v5 T5 / 决议#2，工作台 Hook 时序线数据面）。
 *
 * 存储：`<root>/.pipeline/hooks.json`（per-root），形状
 * `{ version: 1, prompt_skip_keyword: "no-tenon", matrix: { "<hook>.<阶段>": false } }`。
 *   · 矩阵**只存禁用项**（值恒为 false）：缺文件 / 缺键 = 启用（缺省全启用，fail-open）——
 *     enable 操作是删键而非写 true，保证 sh 侧判定只需要找一种键形。
 *   · **canonical 落盘契约（sh 侧 grep -F 依赖，勿改）**：JSON.stringify(…, null, 2) 输出
 *     一键一行 `"<hook>.<阶段>": false`（冒号后恰一空格）。hooks/*.sh 是 PreToolUse/
 *     UserPromptSubmit 等热路径，禁 spawn node/jq（CONTRACT §5.4），只能
 *     `grep -Fq '"<hook>.<阶段>": false'` 定长匹配——格式在设计时就为 bash 可解析服务。
 *   · 手改格式漂移/损坏 JSON：sh 侧 grep 不中 → fail-open 启用；本模块读到损坏 → 空矩阵，
 *     写时重建。两侧行为都与本配置诞生之前完全一致。
 *
 * 强制常开（决议#2）：gate.sh 交互门与 interactive-skill-gate.sh 安全门不可关——
 *   写端点拒绝（validateHookToggleBody）、读侧过滤手改键（readHooksMatrix）、sh 侧根本不读本配置。
 *   confirm-clear（gate 的解封配对，关了会把交互门锁死到 TTL）与 decision-recorder 本轮
 *   同样不开放开关（sh 侧未接线，开了就是「设置不起效」，违反交付门槛②）。
 */
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withLock } from '@tenon/kernel'

export interface HookMeta {
  id: string
  event: 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse'
  matcher: string
  /** 已验证 release 内由 bootstrap dispatcher 解析的逻辑脚本路径（用于运维展示）。 */
  script: string
  /** false = 强制常开/未开放：写端点拒绝、读侧过滤（人话文案由前端 translations 提供）。 */
  configurable: boolean
}

/** 时机归类逐条核实自 hooks/hooks.json 的稳定 hook-id ABI（测试钉住，不得凭名字猜）。 */
export const HOOK_METAS: readonly HookMeta[] = [
  { id: 'session-start', event: 'SessionStart', matcher: '*', script: 'hooks/session-start.sh', configurable: true },
  { id: 'breadcrumb', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/breadcrumb.sh', configurable: true },
  { id: 'router', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/router.sh', configurable: true },
  { id: 'gate', event: 'PreToolUse', matcher: '*', script: 'hooks/gate.sh', configurable: false },
  { id: 'confirm-clear', event: 'PostToolUse', matcher: 'AskUserQuestion|request_user_input', script: 'hooks/confirm-clear.sh', configurable: false },
  { id: 'decision-recorder', event: 'PostToolUse', matcher: 'AskUserQuestion|request_user_input', script: 'hooks/decision-recorder.sh', configurable: false },
  { id: 'skill-tracker', event: 'PostToolUse', matcher: '*', script: 'hooks/skill-tracker.sh', configurable: true },
  { id: 'interactive-skill-gate', event: 'PostToolUse', matcher: '*', script: 'hooks/interactive-skill-gate.sh', configurable: false },
]

const HOOK_BY_ID: ReadonlyMap<string, HookMeta> = new Map(HOOK_METAS.map((h) => [h.id, h]))
const CONFIGURABLE_IDS: readonly string[] = HOOK_METAS.filter((h) => h.configurable).map((h) => h.id)

/** 阶段名字符集：同 workflow step id / change 名的既有白名单（自定义 step id 放行，拒 . / 空白等）。 */
const PHASE_RE = /^[a-zA-Z0-9_-]+$/
const PROMPT_SKIP_KEYWORD_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/
const HOOKS_CONFIG_MAX_BYTES = 4096

export const DEFAULT_PROMPT_SKIP_KEYWORD = 'no-tenon'

export interface HooksRuntimeConfig {
  promptSkipKeyword: string
  matrix: Record<string, false>
}

/** O_NOFOLLOW + fstat + fixed-size read：项目可控文件不能借 symlink/FIFO/无限增长阻塞 server。 */
function readBoundedHooksConfig(root: string): string | null {
  let fd: number | undefined
  try {
    fd = openSync(hooksConfigPath(root), constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > HOOKS_CONFIG_MAX_BYTES) return null
    const buffer = Buffer.alloc(HOOKS_CONFIG_MAX_BYTES + 1)
    const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, 0)
    if (bytesRead > HOOKS_CONFIG_MAX_BYTES) return null
    return buffer.toString('utf8', 0, bytesRead)
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Bash 与 server 共用的窄 header 契约：只解释前三个 canonical 字段，不复制 JSON/matrix codec。
 * 后续重复 keyword 一律拒绝；matrix 是否可解析不影响合法 keyword。
 */
function readPromptSkipKeywordHeader(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim())
  if (lines[0] !== '{' || lines[1] !== '"version": 1,') return DEFAULT_PROMPT_SKIP_KEYWORD
  const prefix = '"prompt_skip_keyword": '
  const line = lines[2]
  if (line === undefined || !line.startsWith(prefix) || !line.endsWith(',')) {
    return DEFAULT_PROMPT_SKIP_KEYWORD
  }
  const encoded = line.slice(prefix.length, -1)
  let keyword: string
  if (encoded === '""') {
    keyword = ''
  } else if (
    encoded.length >= 2
    && encoded.startsWith('"')
    && encoded.endsWith('"')
    && PROMPT_SKIP_KEYWORD_RE.test(encoded.slice(1, -1))
  ) {
    keyword = encoded.slice(1, -1)
  } else {
    return DEFAULT_PROMPT_SKIP_KEYWORD
  }
  if (lines.slice(3).some((candidate) => candidate.startsWith(prefix))) {
    return DEFAULT_PROMPT_SKIP_KEYWORD
  }
  return keyword
}

function hasDuplicateMatrixKey(text: string, key: string): boolean {
  const encoded = JSON.stringify(key)
  let count = 0
  let from = 0
  for (;;) {
    const index = text.indexOf(encoded, from)
    if (index < 0) return count > 1
    const remainder = text.slice(index + encoded.length)
    if (/^\s*:/.test(remainder)) count += 1
    from = index + encoded.length
  }
}

export function hooksConfigPath(root: string): string {
  return join(root, '.pipeline', 'hooks.json')
}

/** 完整运行时配置。keyword 只认与 Bash 一致的 canonical 文本；matrix 保持既有逐项 fail-open。 */
export function readHooksConfig(root: string): HooksRuntimeConfig {
  const text = readBoundedHooksConfig(root)
  if (text === null) {
    return { promptSkipKeyword: DEFAULT_PROMPT_SKIP_KEYWORD, matrix: {} }
  }
  const promptSkipKeyword = readPromptSkipKeywordHeader(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { promptSkipKeyword, matrix: {} }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { promptSkipKeyword, matrix: {} }
  }
  const record = parsed as Record<string, unknown>
  const rawMatrix = record.matrix
  const matrix: Record<string, false> = {}
  if (typeof rawMatrix === 'object' && rawMatrix !== null && !Array.isArray(rawMatrix)) {
    for (const [key, value] of Object.entries(rawMatrix as Record<string, unknown>)) {
      if (value !== false) continue // 只存禁用项：true/杂值一律不是本矩阵的合法条目
      if (hasDuplicateMatrixKey(text, key)) return { promptSkipKeyword, matrix: {} }
      const dot = key.indexOf('.')
      if (dot <= 0) continue
      const hook = key.slice(0, dot)
      const phase = key.slice(dot + 1)
      // 强制常开 hook 的手改键在读侧就过滤（纵深：sh 侧本来就不读，UI 也不应看到假开关）。
      if (!HOOK_BY_ID.get(hook)?.configurable) continue
      if (!PHASE_RE.test(phase)) continue
      matrix[key] = false
    }
  }
  return { promptSkipKeyword, matrix }
}

/** 禁用矩阵（只含 false 项）。缺文件/损坏/形状不对 → 空矩阵（缺省全启用，fail-open）。 */
export function readHooksMatrix(root: string): Record<string, false> {
  return readHooksConfig(root).matrix
}

export interface HookToggle {
  hook: string
  phase: string
  enabled: boolean
}

export type HookToggleValidation =
  | { ok: true; value: HookToggle }
  | { ok: false; error: string }

/** POST /api/hooks 请求体校验（fail-loud；root 的信任锚由路由层做，与兄弟端点同模式）。 */
export function validateHookToggleBody(body: unknown): HookToggleValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体须为 JSON 对象' }
  }
  const { hook, phase, enabled } = body as Record<string, unknown>
  if (typeof hook !== 'string' || !HOOK_BY_ID.has(hook)) {
    return { ok: false, error: `未知 hook（可配置项：${CONFIGURABLE_IDS.join(' / ')}）` }
  }
  const hookMeta = HOOK_BY_ID.get(hook)
  if (hookMeta === undefined) {
    return { ok: false, error: `未知 hook（可配置项：${CONFIGURABLE_IDS.join(' / ')}）` }
  }
  if (!hookMeta.configurable) {
    return { ok: false, error: `hook '${hook}' 强制常开，不可通过配置关闭（决议#2 安全门/交互门纪律）` }
  }
  if (typeof phase !== 'string' || !PHASE_RE.test(phase)) {
    return { ok: false, error: '非法阶段名（仅允许 a-z A-Z 0-9 - _）' }
  }
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'enabled 须为布尔值' }
  }
  return { ok: true, value: { hook, phase, enabled } }
}

export interface PromptRoutingBypass {
  promptSkipKeyword: string
}

export type PromptRoutingBypassValidation =
  | { ok: true; value: PromptRoutingBypass }
  | { ok: false; error: string }

export function validatePromptRoutingBypassBody(body: unknown): PromptRoutingBypassValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体须为 JSON 对象' }
  }
  const keyword = (body as Record<string, unknown>).prompt_skip_keyword
  if (typeof keyword !== 'string' || (keyword !== '' && !PROMPT_SKIP_KEYWORD_RE.test(keyword))) {
    return { ok: false, error: 'prompt_skip_keyword 须为空或 1-32 字符 ASCII token（字母/数字开头，可含 - _）' }
  }
  return { ok: true, value: { promptSkipKeyword: keyword } }
}

let tempSequence = 0

async function writeHooksConfig(root: string, config: HooksRuntimeConfig): Promise<void> {
  const dir = join(root, '.pipeline')
  await mkdir(dir, { recursive: true })
  const file = hooksConfigPath(root)
  tempSequence += 1
  const tmp = `${file}.tmp.${process.pid}.${tempSequence}`
  try {
    await writeFile(tmp, `${JSON.stringify({
      version: 1,
      prompt_skip_keyword: config.promptSkipKeyword,
      matrix: config.matrix,
    }, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

async function withHooksConfigLock(root: string, operation: () => Promise<void>): Promise<void> {
  const dir = join(root, '.pipeline')
  await mkdir(dir, { recursive: true })
  await withLock(dir, operation)
}

/**
 * 真改盘：enabled=false 写入禁用键、enabled=true 删除该键（幂等）。
 * 同目录 tmp+rename 原子写（对齐 workflows.ts::writeWorkflowForApi）；既有文件损坏 →
 * readHooksMatrix 已 fail-open 成空矩阵，等价于重建。
 */
export async function writeHookToggle(root: string, toggle: HookToggle): Promise<void> {
  await withHooksConfigLock(root, async () => {
    const config = readHooksConfig(root)
    const key = `${toggle.hook}.${toggle.phase}`
    if (toggle.enabled) {
      delete config.matrix[key]
    } else {
      config.matrix[key] = false
    }
    // canonical 契约：null,2 缩进让矩阵一键一行 `"<hook>.<阶段>": false`——sh 侧 grep -F 的唯一判据。
    await writeHooksConfig(root, config)
  })
}

export async function writePromptRoutingBypass(root: string, value: PromptRoutingBypass): Promise<void> {
  await withHooksConfigLock(root, async () => {
    const config = readHooksConfig(root)
    config.promptSkipKeyword = value.promptSkipKeyword
    await writeHooksConfig(root, config)
  })
}
