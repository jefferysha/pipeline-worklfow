/**
 * lite 历史侧文件 —— <changeDir>/.pipeline-history.jsonl，一行一个 JSON（CONTRACT §1）。
 * 老内核把 base64 历史区塞进 YAML 的存储变形，在 lite 以 JSONL 侧文件修复（GOAL.md 动机 4）。
 * writer 本身 fail-loud；best-effort（失败仅 WARN）语义由 CLI 调用方兜。
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryEntry, HistoryWriter } from '../types.js'

export const HISTORY_FILE = '.pipeline-history.jsonl'

export function createHistoryWriter(): HistoryWriter {
  return {
    async append(changeDir: string, entry: HistoryEntry): Promise<void> {
      await appendFile(join(changeDir, HISTORY_FILE), `${JSON.stringify(entry)}\n`, 'utf8')
    },
  }
}
