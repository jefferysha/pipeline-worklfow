/**
 * automationConfig —— AFK 执行参数存储 + 校验（T21，工作台「AFK 执行」卡数据面）。
 *
 * 存储：`<root>/.pipeline/automation.json`（per-root，对齐 hooks.json 先例）：
 *   `{ version: 1, enabled: bool, max_parallel: 1-8, max_retries: 0-3, default_opt_in: bool, image?: string }`
 *   · canonical 落盘（JSON.stringify null,2 + 尾换行、同目录 tmp+rename 原子写）；
 *   · image 空串（= 用内置 sandcastle:local）不落字段；
 *   · 缺文件 / 损坏 / 单字段越界 → 逐字段回落默认（fail-open，行为与本配置诞生前一致）。
 *
 * enabled 是项目级总开关，缺省 false；与 default_opt_in 共同构成自动挂队双层授权。
 * level 仍由 loop 级 autonomy_level 治理，不在此文件重复持久化。
 *
 * 值域与读取逻辑直接消费 automation 包的公共配置契约，避免 server 镜像一份协议。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUTOMATION_JSON_LIMITS,
  isValidImageRef,
  readAutomationJson,
} from '@pipeline-lite/automation'

/** AFK 执行参数（HTTP 信封形状 = 落盘形状，snake_case）。image 空串 = 用内置 sandcastle:local。 */
export interface AutomationSettings {
  enabled?: boolean
  max_parallel: number
  max_retries: number
  default_opt_in: boolean
  image: string
}

/** 默认值（= automation 包 DEFAULT_CONFIG 的对应子集；image 空串 = 内置镜像）。 */
export const AUTOMATION_DEFAULTS: AutomationSettings = {
  enabled: false,
  max_parallel: 4,
  max_retries: 1,
  default_opt_in: false,
  image: '',
}

export function automationConfigPath(root: string): string {
  return join(root, '.pipeline', 'automation.json')
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

const validImage = (v: string): boolean => v === '' || isValidImageRef(v)

/** 生效参数（默认已填齐，UI 滑杆直接吃）。缺文件/损坏/字段越界 → 逐字段回落默认（fail-open）。 */
export function readAutomationSettings(root: string): AutomationSettings {
  const config = readAutomationJson(root, { readFileSync })
  return {
    enabled: config.enabled ?? AUTOMATION_DEFAULTS.enabled,
    max_parallel: config.maxParallel ?? AUTOMATION_DEFAULTS.max_parallel,
    max_retries: config.maxRetries ?? AUTOMATION_DEFAULTS.max_retries,
    default_opt_in: config.defaultOptIn ?? AUTOMATION_DEFAULTS.default_opt_in,
    image: config.image ?? AUTOMATION_DEFAULTS.image,
  }
}

export type AutomationSettingsValidation =
  | { ok: true; value: AutomationSettings }
  | { ok: false; error: string }

/** POST /api/automation 请求体校验（fail-loud 400；root 信任锚由路由层做，同兄弟端点）。 */
export function validateAutomationSettingsBody(body: unknown): AutomationSettingsValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体须为 JSON 对象' }
  }
  const { enabled, max_parallel, max_retries, default_opt_in, image } = body as Record<string, unknown>
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return { ok: false, error: 'enabled 须为布尔值' }
  }
  if (!intIn(max_parallel, AUTOMATION_JSON_LIMITS.maxParallel.min, AUTOMATION_JSON_LIMITS.maxParallel.max)) {
    return { ok: false, error: `max_parallel 须为 ${AUTOMATION_JSON_LIMITS.maxParallel.min}-${AUTOMATION_JSON_LIMITS.maxParallel.max} 的整数` }
  }
  if (!intIn(max_retries, AUTOMATION_JSON_LIMITS.maxRetries.min, AUTOMATION_JSON_LIMITS.maxRetries.max)) {
    return { ok: false, error: `max_retries 须为 ${AUTOMATION_JSON_LIMITS.maxRetries.min}-${AUTOMATION_JSON_LIMITS.maxRetries.max} 的整数` }
  }
  if (typeof default_opt_in !== 'boolean') {
    return { ok: false, error: 'default_opt_in 须为布尔值' }
  }
  if (typeof image !== 'string') {
    return { ok: false, error: 'image 须为字符串（空串 = 用内置镜像 sandcastle:local）' }
  }
  const trimmed = image.trim()
  if (!validImage(trimmed)) {
    return { ok: false, error: `image 非法（仅允许 a-z A-Z 0-9 . _ / : @ -，长度 ≤ ${AUTOMATION_JSON_LIMITS.imageMaxLen}）` }
  }
  return {
    ok: true,
    value: { enabled: enabled === true, max_parallel, max_retries, default_opt_in, image: trimmed },
  }
}

/**
 * 真改盘：canonical JSON + 同目录 tmp+rename 原子写（对齐 hooksConfig.ts::writeHookToggle）。
 * image 空串不落字段（缺省 = 内置镜像，automation 包读侧同语义）；既有文件损坏 → 直接重建。
 */
export function writeAutomationSettings(root: string, settings: AutomationSettings): void {
  const payload: Record<string, unknown> = {
    version: 1,
    enabled: settings.enabled === true,
    max_parallel: settings.max_parallel,
    max_retries: settings.max_retries,
    default_opt_in: settings.default_opt_in,
  }
  if (settings.image !== '') payload.image = settings.image
  const dir = join(root, '.pipeline')
  mkdirSync(dir, { recursive: true })
  const file = automationConfigPath(root)
  const tmp = `${file}.tmp.${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}
