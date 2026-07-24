/**
 * Transition's only hook-facing tail is changeDir/.breadcrumb.  A review marker is intentionally
 * absent from this module: it is written after output/check by `pipeline review request`, not on
 * entry to a review phase.  That separation prevents an entry-time self-lock and makes canonical
 * review receipts the single transition authority.
 *
 * best-effort 语义：写失败不在此处吞掉，原样把 error 交回调用方——WARN 走 stderr 还是走 CLI
 * 的 io.err，是 adapter 的责任，不是这层决策逻辑的责任。
 */
import type { BreadcrumbWriter } from './markers.js'
import type { Phase } from '../types.js'

/**
 * 判别联合而非 `{error?: unknown}`：JS 允许 `throw undefined/null/0/''` 这类 falsy 值，
 * truthy 判断（`if (outcome.error)`）会把这些真实失败误判成成功、静默吞掉 WARN——违反
 * 「任何写失败仅 WARN、转换仍成功」的既有语义（G1 REFACTOR 第三轮 codex review 抓到）。
 * `ok` 是显式判别字段，调用方必须用 `if (!outcome.ok)`，不受 error 值本身是否 falsy 影响。
 */
export type TailWriteOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown }

export interface BreadcrumbTailArgs {
  changeDir: string
  name: string
  to: Phase
}

export async function applyBreadcrumbTail(
  port: BreadcrumbWriter | undefined,
  args: BreadcrumbTailArgs,
): Promise<TailWriteOutcome> {
  if (!port) return { ok: true }
  try {
    await port.write(args.changeDir, `pipeline:${args.name} phase=${args.to}\n`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
