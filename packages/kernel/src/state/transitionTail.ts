/**
 * default 轨转换成功后的收尾副作用决策（G1 REFACTOR）：changeDir/.breadcrumb（总写）+ 进 review
 * 相位时 <root>/.pipeline-pending-review（reviewPhases 单一真相源）。此前 CLI 与 server 各自
 * 维护一份「何时写」的判断（同样的 if 逻辑抄了两遍），现在收敛成这两个唯一决策点——CLI 与
 * server 都调用它们，不再各自决定。custom 轨不收尾（已披露的 scope cut，调用方不应对 custom
 * outcome 调用本函数）。
 *
 * 故意拆成两个独立函数而非一个绑在一起的 tail：CLI 的既有副作用顺序是
 * breadcrumb → history → review-marker（history 写入延迟/中断时，先落 breadcrumb 能缩短
 * hook 热路径读到的"当前相位缓存"过期窗口——breadcrumb.sh 每轮都读它）。若把两者捆成一次
 * 调用，调用方就无法在中间插入 history，会被迫悄悄改变这个顺序（G1 REFACTOR 第二轮 codex
 * review 抓到的真实回归，不是测试盲区）。
 *
 * best-effort 语义：写失败不在此处吞掉，原样把 error 交回调用方——WARN 走 stderr 还是走 CLI
 * 的 io.err，是 adapter 的责任，不是这层决策逻辑的责任。
 */
import type { BreadcrumbWriter, ReviewMarkerWriter } from './markers.js'
import { reviewHint } from './markers.js'
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

export interface ReviewMarkerTailArgs {
  root: string
  name: string
  to: Phase
  reviewPhases: readonly Phase[]
}

export async function applyReviewMarkerTail(
  port: ReviewMarkerWriter | undefined,
  args: ReviewMarkerTailArgs,
): Promise<TailWriteOutcome> {
  if (!port || !args.reviewPhases.includes(args.to)) return { ok: true }
  try {
    await port.write(args.root, `${args.to}\n${reviewHint(args.to)}\n${args.name}\n`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
