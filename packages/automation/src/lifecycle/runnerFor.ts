/**
 * loop runner 派生（v5 T20 双 runner）—— change 名按 change_prefix 归属到 loop，返回该 loop
 * 声明的 runner 字符串（'codex' → 起 codex exec 无头会话；'claude-code' 仅显式兼容）。
 *
 * ★GOAL H · Stage B 后 admission 路径不再用本函数：runner 由 ExecutionContext.runner 权威携带
 * （admission 从 context.loop_id → loop.runner 派生，dockerRunChange 直接用 context.runner）。本
 * 前缀版保留供未接 admission 的旧调用面/测试兼容，不删（公共 API）。
 *
 * 归属口径同 denylist.ts::denylistForChange（change 名以 change_prefix 开头；空/null 前缀不参与）。
 * 差异：denylist 多命中取并集，runner 是单值——多前缀同时命中取**首个命中**（登记表声明序）。
 * 结构化鸭子类型（不 import kernel LoopEntry）：只读 change_prefix + runner，旧登记表/新 schema 前后都可用。
 */

/** loop 登记表条目的最小结构面（鸭子类型）：只读 change_prefix + runner。 */
export interface LoopRunnerSource {
  readonly change_prefix: string | null
  readonly runner?: string
}

/**
 * 按 change_prefix 归属派生一个 change 的生效 runner；无命中 → undefined（无 loop 语境，
 * 调用方的 buildAfkRunCommand 以 Codex-first 缺省接管）。历史自由值（cron/cron-session 等）原样
 * 返回，并由命令边界 fail-loud；本函数只做归属查找，不做口径收窄。
 */
export const runnerForChange = (loops: readonly LoopRunnerSource[], name: string): string | undefined => {
  for (const l of loops) {
    if (!l.change_prefix) continue
    if (!name.startsWith(l.change_prefix)) continue
    return l.runner
  }
  return undefined
}
