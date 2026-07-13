/**
 * shellQuote —— 拷贝命令进 shell 的唯一安全拼接通道（codex review 终稿 P2：双引号包裹
 * 挡不住 `"`、反引号、`$()`，容器名此前更是完全未引）。
 *
 * 语义（POSIX 单引号转义）：
 *   · 值仅含安全集 [A-Za-z0-9_@%+=:,./-] 时原样返回——绝大多数路径/容器名/change 名
 *     落在这里，拷出来的命令保持裸串可读；
 *   · 否则整体包单引号，内部单引号以 `'\''`（收引号-转义引号-重开引号）断开重接——
 *     POSIX sh 单引号内零展开语义，空格/双引号/反引号/$() 一律成字面量；
 *   · 空串 → `''`（两个单引号），参数位不塌缩。
 *
 * server 端 server.ts 内联同款（resumeCmd 的 dir/sessionId）——两端拼法必须一致，
 * 改动请两处同步。
 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}
