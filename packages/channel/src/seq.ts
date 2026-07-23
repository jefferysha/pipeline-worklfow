/**
 * seq —— .seq 侧车解析 + jsonl 尾 last-seq 恢复（纯逻辑）。
 * 老仓真相源：skills/pipeline/scripts/channel/seq.py（parse_sidecar:27 / _last_seq_in_lines:52
 *   / read_last_jsonl_seq:67）。fs 面（原子写侧车 + reconcile）在 store.ts。
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · jsonl 是 SOT，.seq 侧车纯粹是缓存，可随时重建。
 *   · parse_sidecar 严格 ^[0-9]+$（拒 +/-/0x/前导尾随空白/小数），仅容忍单个尾随换行。
 *   · read_last_jsonl_seq：有非空行却找不到 seq → 抛错（宁崩不猜，猜会导致重复 seq）。
 *   · reconcile 永远以 jsonl 尾为真相（侧车滞后前修 / 超前回退，绝不留 seq 空洞）。
 */

const SIDECAR_RE = /^[0-9]+$/

/**
 * .seq 侧车字面 → 有限 ≥0 整数，否则 undefined（seq.py:27）。
 * 不 strip——前导/尾随空白本身即非法（侧车是机器写的纯整数）；仅容忍单个尾随换行。
 */
export function parseSidecar(text: string): number | undefined {
  const t = text.replace(/\n$/, '')
  if (!SIDECAR_RE.test(t)) return undefined
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) return undefined
  return n
}

/** 从后往前找第一个有 seq:int 的 JSON 行（seq.py:52）。 */
export function lastSeqInLines(lines: string[]): number | undefined {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const s = (lines[i] ?? '').trim()
    if (!s) continue
    let obj: unknown
    try {
      obj = JSON.parse(s)
    } catch {
      continue
    }
    if (obj !== null && typeof obj === 'object') {
      const seq = (obj as { seq?: unknown }).seq
      if (typeof seq === 'number' && Number.isInteger(seq)) return seq
    }
  }
  return undefined
}

/**
 * events.jsonl 全文 → last seq；空 → 0；有非空行却找不到 seq → 抛错（宁崩不猜，seq.py:67）。
 * （老仓 tail 4KB 优先纯属大文件性能优化；本 TS 版一次性传全文，语义等价。）
 */
export function readLastJsonlSeqFromText(text: string): number {
  if (text.length === 0) return 0
  const lines = text.split('\n')
  const found = lastSeqInLines(lines)
  if (found !== undefined) return found
  if (lines.some((ln) => ln.trim().length > 0)) {
    throw new Error('无法恢复 last seq（有非空行但无可解析的 seq）——宁崩不猜（猜会导致重复 seq）')
  }
  return 0
}

/** next = last + 1（seq 永远由 append 内部分配）。 */
export function nextSeq(lastSeq: number): number {
  return lastSeq + 1
}
