/**
 * 时间显示工具：ISO8601 → 紧凑绝对时间（MM-DD HH:mm）。
 * 刻意不做"N 分钟前"相对时间——那需要注入 now（业务码禁散落 new Date()，同仓库纪律），
 * 且收件箱/看板由 SSE 驱动刷新，相对时间不刷新会说谎；短绝对时间确定、可测、够扫读。
 */
export function shortTime(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[1]}-${m[2]} ${m[3]}:${m[4]}`
}
