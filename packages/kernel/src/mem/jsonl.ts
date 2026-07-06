/**
 * mem/jsonl —— JSONL 逐行解析（纯逻辑，输入是 fs.readText 拿到的整文件文本）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/internal/jsonl.py。
 *
 * 不可阉割：0x7b（`{`）首字节快拒（空行/log preamble/partial write 跳过）；坏 JSON 行跳过。
 * 差异：老仓流式 256KB 分块（多 MB 文件堆有界）；本 TS 版一次性读整文件文本再按行解析
 * （语义等价，注入 fs.readText 已把 I/O 与解析解耦，检索本就全文扫非增量）。
 */
const OPEN_BRACE = 0x7b // '{'

function isJsonlLine(line: string): boolean {
  return line.length > 0 && line.charCodeAt(0) === OPEN_BRACE
}

/** 解析全部可解析行为对象数组（坏行/非 { 行跳过）。 */
export function parseJsonlLines(text: string | undefined): unknown[] {
  const out: unknown[] = []
  if (!text) return out
  for (const line of text.split('\n')) {
    if (!isJsonlLine(line)) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      /* 坏 JSON 行跳过 */
    }
  }
  return out
}

/** 首个可解析对象（老仓 read_jsonl_first：读一行即停）。 */
export function readJsonlFirst(text: string | undefined): unknown | undefined {
  if (!text) return undefined
  for (const line of text.split('\n')) {
    if (!isJsonlLine(line)) continue
    try {
      return JSON.parse(line)
    } catch {
      /* 继续 */
    }
  }
  return undefined
}

/** 首个满足 predicate 的对象，最多扫 maxLines 个已解析对象（老仓 find_in_jsonl）。 */
export function findInJsonl(
  text: string | undefined,
  predicate: (o: unknown) => boolean,
  maxLines = 200,
): unknown | undefined {
  if (!text) return undefined
  let count = 0
  for (const line of text.split('\n')) {
    if (!isJsonlLine(line)) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    count += 1
    if (predicate(obj)) return obj
    if (count >= maxLines) return undefined
  }
  return undefined
}
