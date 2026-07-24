/**
 * automationJson —— per-root AFK 执行参数文件 `<root>/.pipeline/automation.json`（T21 数据面）。
 *
 * 对齐 hooks.json 先例（server/hooksConfig.ts）：canonical JSON（写侧 null,2 缩进，写侧在
 * server/automationConfig.ts）；缺文件 / 损坏 JSON / 形状不对 → 空配置 fail-open，消费方回落
 * DEFAULT_CONFIG——行为与本文件诞生之前完全一致。非法字段**单独丢弃**（不拖垮整文件），
 * 值域与 UI/server 同一口径：enabled/default_opt_in 布尔、max_parallel 1-8、max_retries 0-3、
 * image 合法 docker 引用字符集（缺省 = 用内置 sandcastle:local）。
 *
 * 【决策登记】enabled 是项目级 AFK 总开关，缺省 false；level 不进此文件：
 *   · enabled 与 default_opt_in 构成自动挂队的两层显式授权，不能由“构造 SDK”隐式伪造；
 *   · level 已有 loop 级 autonomy_level（毕业制升降档走 /api/loops/level 裁决），再落一份
 *     就是双源打架。读侧对手塞进文件的这两个键一律忽略（见 readAutomationJson）。
 *
 * 消费点：sdk.ts::createAutomation 装配（优先级 显式 deps.config > automation.json > DEFAULT）
 * + cli/commands/afk.ts 的 dockerRunChange image 同源。server 读写端点（GET/POST
 * /api/automation）持零依赖镜像 server/automationConfig.ts（server 对 automation 包零运行时
 * 依赖的既有纪律，同 AUTOMATION_STATES 字面量对位先例），两侧值域必须保持一致。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** fs 注入面（单测注入 fake，不碰真盘）；缺省真 node fs。 */
export interface AutomationJsonFs {
  readFileSync(path: string, encoding: 'utf8'): string
}

/** 文件里读出的有效字段（缺省字段 = 消费方吃 DEFAULT_CONFIG / 内置镜像）。 */
export interface AutomationJsonConfig {
  readonly enabled?: boolean
  readonly maxParallel?: number
  readonly maxRetries?: number
  readonly defaultOptIn?: boolean
  /** 沙箱镜像引用；缺省 = 内置 sandcastle:local。 */
  readonly image?: string
}

/** 值域常量（UI 滑杆 / server 校验 / 本读模块三方同一口径）。 */
export const AUTOMATION_JSON_LIMITS = {
  maxParallel: { min: 1, max: 8 },
  maxRetries: { min: 0, max: 3 },
  imageMaxLen: 200,
} as const

/** docker 镜像引用字符集（registry 域名/端口/路径/tag/digest；拒空白与控制字符）。 */
export const AUTOMATION_IMAGE_RE = /^[a-zA-Z0-9._/:@-]+$/

export function automationJsonPath(root: string): string {
  return join(root, '.pipeline', 'automation.json')
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** image 合法性（trim 后）：非空 + 字符集 + 长度上限。server 写校验共用同一判据。 */
export function isValidImageRef(v: string): boolean {
  return v.length > 0 && v.length <= AUTOMATION_JSON_LIMITS.imageMaxLen && AUTOMATION_IMAGE_RE.test(v)
}

/**
 * 读 `<root>/.pipeline/automation.json`。缺文件/损坏/非对象 → {}（fail-open 全默认）；
 * 非法字段单独丢弃；level 手塞仍忽略（见模块头【决策登记】）。
 */
export function readAutomationJson(root: string, fs: AutomationJsonFs = { readFileSync }): AutomationJsonConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(automationJsonPath(root), 'utf8'))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const raw = parsed as Record<string, unknown>
  const cfg: { enabled?: boolean; maxParallel?: number; maxRetries?: number; defaultOptIn?: boolean; image?: string } = {}
  const { maxParallel: mp, maxRetries: mr } = AUTOMATION_JSON_LIMITS
  if (typeof raw.enabled === 'boolean') cfg.enabled = raw.enabled
  if (intIn(raw.max_parallel, mp.min, mp.max)) cfg.maxParallel = raw.max_parallel
  if (intIn(raw.max_retries, mr.min, mr.max)) cfg.maxRetries = raw.max_retries
  if (typeof raw.default_opt_in === 'boolean') cfg.defaultOptIn = raw.default_opt_in
  if (typeof raw.image === 'string') {
    const image = raw.image.trim()
    if (isValidImageRef(image)) cfg.image = image
  }
  return cfg
}
