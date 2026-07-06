/**
 * boundedTail 64KiB 滚动尾部（BACKLOG #29c，DESIGN §7-item9）—— 移植老仓 runner/boundedTail.ts:36-72。
 *
 * 流式 provider 累积 stdout 只为回读尾部（错误末尾 / agent 最终结果），全量保留没必要——一旦
 * 累积串越过 V8 ~512MB 上限，`chunks.join()` 抛 RangeError 拖死整批编排。滚动尾部把内存钉死在
 * maxChars 内，且保证 structured-output tag（末尾 emit）落在 64KiB 内。
 */

/** 默认滚动尾部字符上限：64KiB（远高于任何完成信号/握手 payload，远低于 V8 max string）。 */
export const MAX_TAIL_CHARS = 64 * 1024

/**
 * 定长滚动尾部（按总字符数有界）。push 追加；joined 长度将超 maxChars 时从头逐出最旧项。
 * 单项长于 maxChars → 截成自身尾部（一次 push 不溢出）。toString join 后长度恒 ≤ maxChars。
 */
export class BoundedTail {
  private readonly items: string[] = []
  private totalChars = 0
  private readonly maxChars: number
  private readonly separator: string

  constructor(maxChars: number = MAX_TAIL_CHARS, separator = '') {
    this.maxChars = maxChars
    this.separator = separator
  }

  push(item: string): void {
    const bounded = item.length > this.maxChars ? item.slice(item.length - this.maxChars) : item
    this.totalChars += bounded.length + (this.items.length > 0 ? this.separator.length : 0)
    this.items.push(bounded)
    while (this.totalChars > this.maxChars && this.items.length > 1) {
      const dropped = this.items.shift()!
      this.totalChars -= dropped.length + this.separator.length
    }
  }

  toString(): string {
    return this.items.join(this.separator)
  }
}
