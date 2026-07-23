/**
 * TrackPredicate（2026-07-17 P0）——track 条件的统一判定原语。
 *
 * 为什么存在：guard 层（flow/guard.ts 相位出口规则的 when= 条件）与 transition 层
 * （flow/transition-table.ts 事件前置校验的 pm 豁免）此前各写一套 track 判定——显式白名单
 * `['backend','frontend']` vs `!== 'pm'`——对 chat/未知 track 给出相反答案（advisory 豁免、
 * enforcement 拒绝）。两个消费点现在对同一 predicate 实例做同一求值，两层物理上同判。
 *
 * import 纪律：本模块零 import（纯类型 + 纯函数），flow/ 侧按具体文件路径
 * （`../workflow/predicates.js`）引入、不经任何 index barrel——workflow/
 * transition-application.ts 已 import flow/index.js，经 barrel 引回来会成环。
 * 内部消费者按具体文件路径引入、不经 barrel（避免上述成环）；P5（2026-07-17）已从根
 * kernel/src/index.ts 对外具名导出 matchesTrackPredicate/TrackPredicate 供 CLI artifact register
 * 消费 custom requiredWhen——本模块零 import、该 barrel 导出 cycle-safe。
 */
export type TrackPredicate =
  | { readonly kind: 'track-in'; readonly values: readonly string[] }
  | { readonly kind: 'track-not-in'; readonly values: readonly string[] }

/** track-in：track ∈ values 才命中；track-not-in：track ∉ values 才命中。 */
export function matchesTrackPredicate(predicate: TrackPredicate, track: string): boolean {
  const listed = predicate.values.includes(track)
  return predicate.kind === 'track-in' ? listed : !listed
}

/**
 * 「非 pm 轨都适用」的共享实例：transition 层（spec-complete 的 plan、verify-pass 的双
 * review）与 guard 层（design.md / plan / 双 review / pr_url 出口规则）引用同一个对象，
 * 任意 track 的豁免判定同源——chat 与未知 track 在两层都不豁免，只有 pm 豁免。
 */
export const NON_PM: TrackPredicate = { kind: 'track-not-in', values: ['pm'] }
