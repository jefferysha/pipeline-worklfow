/**
 * loop denylist 真实生效（v5 决议 #12 / T4）—— run 结算时把本次 run 的 git diff --name-only
 * 文件清单对 loop 声明的 denylist 路径 glob 匹配：任一命中 = 违规 → 抛 DenylistViolationError
 * （classify 归 conflict，**保留 worktree 现场**，绝不自动重试/merge）。
 *
 * glob 语义（测试钉死，deliberately 窄——不引第三方 glob 包，对齐 kernel「窄解析器」文化）：
 *   · `*`  匹配单段内任意字符（不跨 `/`）
 *   · `**` 跨段匹配；`**\/` 前缀允许零段（`**\/x` 命中根级 x 与深层 a/b/x）
 *   · `?`  匹配单个非 `/` 字符
 *   · 其余字符字面量（正则特殊字符全转义）
 *
 * loop 语境派生：change 名以 loop 的 change_prefix 开头 = 归属该 loop（同 kernel loops/drift.ts
 * 的 change-prefix 归属口径）。无 loop 语境（无前缀命中）→ denylist 为空 → lifecycle 跳过检查。
 * 结构化鸭子类型（不 import kernel LoopEntry）：T3 给 schema 加 denylist 字段前后都可用——
 * 旧登记表无该字段读作 []，不产生跨波次硬依赖。
 */

/** 单条违规明细（file 命中了 glob）。 */
export interface DenylistViolation {
  readonly file: string
  readonly glob: string
}

/** glob → 锚定全串的 RegExp（语义见文件头；无缓存——denylist 条数是个位数量级）。 */
const globToRegExp = (glob: string): RegExp => {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]!
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**`：跨段；`**/` 允许零段（否则 `**/x` 匹配不到根级 x）
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        re += '[^/]*'
        i += 1
      }
    } else if (c === '?') {
      re += '[^/]'
      i += 1
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  return new RegExp(`^${re}$`)
}

/** 文件清单 × denylist globs → 违规明细（每个文件只报首个命中的 glob）。 */
export const matchDenylist = (files: readonly string[], globs: readonly string[]): DenylistViolation[] => {
  if (globs.length === 0) return []
  const res = globs.map((g) => ({ glob: g, re: globToRegExp(g) }))
  const out: DenylistViolation[] = []
  for (const file of files) {
    const hit = res.find((r) => r.re.test(file))
    if (hit) out.push({ file, glob: hit.glob })
  }
  return out
}

/**
 * loop 登记表条目的最小结构面（鸭子类型）：只读 change_prefix + denylist。
 * 与 kernel LoopEntry 结构兼容（T3 加 denylist 字段后 LoopEntry 自然满足本接口）。
 */
export interface LoopDenylistSource {
  readonly change_prefix: string | null
  readonly denylist?: readonly string[]
}

/**
 * 按 change_prefix 归属派生一个 change 的生效 denylist（多 loop 命中 → 去重合并）。
 * 空前缀 / null 前缀的 loop 不参与归属；无命中 → []（= 无 loop 语境，检查跳过）。
 */
export const denylistForChange = (loops: readonly LoopDenylistSource[], name: string): string[] => {
  const out: string[] = []
  for (const l of loops) {
    if (!l.change_prefix) continue
    if (!name.startsWith(l.change_prefix)) continue
    for (const g of l.denylist ?? []) {
      if (!out.includes(g)) out.push(g)
    }
  }
  return out
}

/**
 * denylist 违规（决议 #12）：判 conflict、保留现场（PRESERVE_ERROR_TAGS + classify 已收录本 tag）。
 * preservedWorktreePath 字段名对齐 SyncError（classify::preservedPathOf 直读该结构化字段）。
 */
export class DenylistViolationError extends Error {
  override readonly name = 'DenylistViolationError'
  readonly _tag = 'DenylistViolationError'
  readonly violations: readonly DenylistViolation[]
  readonly preservedWorktreePath: string
  constructor(violations: readonly DenylistViolation[], preservedWorktreePath: string) {
    const detail = violations.map((v) => `${v.file} (denylist: ${v.glob})`).join(', ')
    super(`run touched denylisted paths: ${detail}. Worktree PRESERVED at ${preservedWorktreePath}.`)
    this.violations = violations
    this.preservedWorktreePath = preservedWorktreePath
  }
}
