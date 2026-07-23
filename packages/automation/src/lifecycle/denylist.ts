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

/** Shared matcher adapter for kernel ConstraintPolicy evaluation. */
export const matchesPathGlob = (path: string, glob: string): boolean => globToRegExp(glob).test(path)

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
 * 文件清单 × allowlist globs → 未获授权的路径。空白名单刻意等价于“零路径获授权”；L3 调用方
 * 因而不能把缺配置或读取失败解释成全放行。返回顺序与 git diff 的文件序一致。
 */
export const matchAllowlist = (files: readonly string[], globs: readonly string[]): string[] => {
  const allowed = globs.map(globToRegExp)
  return files.filter((file) => !allowed.some((re) => re.test(file)))
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
 *
 * GOAL H · Stage B 后 admission 路径改用 denylistForLoop（按 context.loop_id 精确查，不再前缀猜）；
 * 本前缀版保留供未接 admission 的旧调用面/测试兼容，不删（公共 API）。
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

/** loop 条目最小面（按 id 精确查）：id + denylist。与 kernel LoopEntry 结构兼容。 */
export interface LoopDenylistByIdSource {
  readonly id: string
  readonly denylist?: readonly string[]
}

/**
 * GOAL H · Stage B：按 **loop_id** 精确派生该 loop 的 denylist（admission 路径——ExecutionContext
 * 已定 loop_id，不再前缀猜）。无此 loop / 无 denylist → []（检查跳过）。
 */
export const denylistForLoop = (loops: readonly LoopDenylistByIdSource[], loopId: string): string[] =>
  [...(loops.find((l) => l.id === loopId)?.denylist ?? [])]

export interface LoopPathPolicySource {
  readonly id: string
  readonly allowlist?: readonly string[]
  readonly denylist?: readonly string[]
}

export interface LoopPathPolicy {
  readonly allowlist: readonly string[]
  readonly denylist: readonly string[]
}

/**
 * 从同一份 registry 快照一次派生完整路径策略，避免 allow/deny 分两次读取形成撕裂。未知 loop
 * fail-loud；只有“真实存在且显式为空”的条目才返回空数组。
 */
export function pathPolicyForLoop(loops: readonly LoopPathPolicySource[], loopId: string): LoopPathPolicy {
  const loop = loops.find((candidate) => candidate.id === loopId)
  if (loop === undefined) throw new Error(`loop path policy missing for '${loopId}'`)
  return { allowlist: [...(loop.allowlist ?? [])], denylist: [...(loop.denylist ?? [])] }
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

/** L3 产出越出 allowlist：与 denylist 命中同属需保留现场的路径策略冲突。 */
export class AllowlistViolationError extends Error {
  override readonly name = 'AllowlistViolationError'
  readonly _tag = 'AllowlistViolationError'
  readonly files: readonly string[]
  readonly allowlist: readonly string[]
  readonly preservedWorktreePath: string
  constructor(files: readonly string[], allowlist: readonly string[], preservedWorktreePath: string) {
    const policy = allowlist.length === 0 ? '<empty>' : allowlist.join(', ')
    super(`run touched paths outside L3 allowlist: ${files.join(', ')} (allowlist: ${policy}). Worktree PRESERVED at ${preservedWorktreePath}.`)
    this.files = files
    this.allowlist = allowlist
    this.preservedWorktreePath = preservedWorktreePath
  }
}

/** L3 direct lifecycle 调用缺少白名单：属于装配错误，必须在任何宿主/Docker 副作用前拒绝。 */
export class PathPolicyUnconfiguredError extends Error {
  override readonly name = 'PathPolicyUnconfiguredError'
  readonly _tag = 'PathPolicyUnconfiguredError'
  constructor() {
    super('L3 lifecycle requires an explicit allowlist; refusing an unenforced auto-merge')
  }
}
