/**
 * hooksConfig —— 阶段×hook 开关矩阵存储 + 校验（v5 T5 / 决议#2，工作台 Hook 时序线数据面）。
 *
 * 存储：`<root>/.pipeline/hooks.json`（per-root），形状 `{ version: 1, matrix: { "<hook>.<阶段>": false } }`。
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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

export function hooksConfigPath(root: string): string {
  return join(root, '.pipeline', 'hooks.json')
}

/** 禁用矩阵（只含 false 项）。缺文件/损坏/形状不对 → 空矩阵（缺省全启用，fail-open）。 */
export function readHooksMatrix(root: string): Record<string, false> {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(hooksConfigPath(root), 'utf8'))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const rawMatrix = (parsed as Record<string, unknown>).matrix
  if (typeof rawMatrix !== 'object' || rawMatrix === null || Array.isArray(rawMatrix)) return {}
  const matrix: Record<string, false> = {}
  for (const [key, value] of Object.entries(rawMatrix as Record<string, unknown>)) {
    if (value !== false) continue // 只存禁用项：true/杂值一律不是本矩阵的合法条目
    const dot = key.indexOf('.')
    if (dot <= 0) continue
    const hook = key.slice(0, dot)
    const phase = key.slice(dot + 1)
    // 强制常开 hook 的手改键在读侧就过滤（纵深：sh 侧本来就不读，UI 也不应看到假开关）。
    if (!HOOK_BY_ID.get(hook)?.configurable) continue
    if (!PHASE_RE.test(phase)) continue
    matrix[key] = false
  }
  return matrix
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
  if (!HOOK_BY_ID.get(hook)!.configurable) {
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

/**
 * 真改盘：enabled=false 写入禁用键、enabled=true 删除该键（幂等）。
 * 同目录 tmp+rename 原子写（对齐 workflows.ts::writeWorkflowForApi）；既有文件损坏 →
 * readHooksMatrix 已 fail-open 成空矩阵，等价于重建。
 */
export function writeHookToggle(root: string, toggle: HookToggle): void {
  const matrix = readHooksMatrix(root)
  const key = `${toggle.hook}.${toggle.phase}`
  if (toggle.enabled) {
    delete matrix[key]
  } else {
    matrix[key] = false
  }
  const dir = join(root, '.pipeline')
  mkdirSync(dir, { recursive: true })
  const file = hooksConfigPath(root)
  const tmp = `${file}.tmp.${process.pid}`
  // canonical 契约：null,2 缩进让矩阵一键一行 `"<hook>.<阶段>": false`——sh 侧 grep -F 的唯一判据。
  writeFileSync(tmp, `${JSON.stringify({ version: 1, matrix }, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}
