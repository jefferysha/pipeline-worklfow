/**
 * 窄 YAML 子集的字符串可表示域——serialize 引号策略「拒绝面」的唯一事实源（R2 阻断 2）。
 * serialize.emitString 与 validate 的字符串规则共用本谓词：validate 放行 ⇒ serialize 必写得出，
 * writer 合同（write 成功过的文件同 context load 永不失败）由此闭合，两处拒绝面不再各自漂移。
 *
 * 拒绝面从 serialize.ts emitString 的引号选择逻辑反推，一字不多：
 * - 含 \n / \r：值按行 tokenize，物理写不出（parse 侧也永远读不出——按行切分再剥 \r）；
 * - 含 \t：窄子集的显式排除项——引号包裹后其实读得回，但 YAML 对 tab 的位置限制多、与缩进
 *   肉眼难分，emitString 从首版就拒绝；本谓词如实镜像该政策，不重新裁量；
 * - 同时含单双引号：本子集无转义语义（起始引号后第一个同款引号即闭合），两种引号都包不住。
 * 其余形态全部可表示，刻意不拒：BARE_RE 闭集直接裸写；前后导空白、'#'、逗号、歧义标量形
 * （true/123/~/*）走引号包裹，parse 的引号读取保真（流式列表里含逗号的项由 serialize 降级
 * 块式列表兜住）。
 *
 * 另拒未配对 UTF-16 surrogate（U+D800–DFFF 不成对）：本身不是引号策略问题，而是物理落盘问题
 * ——atomicWriteFile 以 UTF-8 写盘，Node 会把孤立 surrogate 替换成 U+FFFD，读回值变了 → 同
 * context load 时引用不存在（codex R1 R3 阻断 2 探针实证）。它无法经 UTF-8 往返，判为不可表示。
 * U+2028/U+2029 不在拒绝面：它们能经引号包裹写出、也能读回（parser 的值捕获已放宽到 [\s\S]*）。
 *
 * @returns null = 可表示；否则返回可直接拼进错误信息的人话原因。
 */
// 未配对 surrogate：高位后不跟低位，或低位前不接高位。
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

export function stringUnrepresentableReason(s: string): string | null {
  if (/[\n\r\t]/.test(s)) return '含换行/回车/tab，窄 YAML 序列化子集写不出'
  if (s.includes("'") && s.includes('"')) return '同时含单双引号，超出窄序列化子集（无转义语义，两种引号都包不住）'
  if (LONE_SURROGATE_RE.test(s)) return '含未配对 UTF-16 surrogate，UTF-8 落盘会被替换成 U+FFFD，无法往返'
  return null
}
