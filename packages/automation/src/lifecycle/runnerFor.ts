/**
 * loop runner 派生（v5 T20 双 runner）—— change 名按 change_prefix 归属到 loop，返回该 loop
 * 声明的 runner 字符串，供 dockerRunChange.ts::resolveRunner → lifecycle cfg.runner →
 * buildAfkRunCommand 分派（仅 'codex' 改起 codex exec 无头会话，其余一律缺省 Claude 路径）。
 *
 * 归属口径同 denylist.ts::denylistForChange（change 名以 change_prefix 开头；空/null 前缀不参与）。
 * 差异：denylist 多命中取并集，runner 是单值——多前缀同时命中取**首个命中**（登记表声明序），
 * 不猜"更长前缀更特异"之类的隐式优先级。结构化鸭子类型（不 import kernel LoopEntry）：只读
 * change_prefix + runner，旧登记表/新 schema 前后都可用。
 */

/** loop 登记表条目的最小结构面（鸭子类型）：只读 change_prefix + runner。 */
export interface LoopRunnerSource {
  readonly change_prefix: string | null
  readonly runner?: string
}

/**
 * 按 change_prefix 归属派生一个 change 的生效 runner；无命中 → undefined（无 loop 语境，
 * 调用方走缺省 Claude 路径）。历史自由值（cron/cron-session 等）原样返回——是否触发 codex
 * 分派由 buildAfkRunCommand 判定，本函数不做口径收窄。
 */
export const runnerForChange = (loops: readonly LoopRunnerSource[], name: string): string | undefined => {
  for (const l of loops) {
    if (!l.change_prefix) continue
    if (!name.startsWith(l.change_prefix)) continue
    return l.runner
  }
  return undefined
}
