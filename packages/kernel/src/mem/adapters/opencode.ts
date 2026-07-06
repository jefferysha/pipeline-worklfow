/**
 * mem/adapters/opencode —— OpenCode 会话读取器，当前降级 no-op（注入 fs，签名对齐）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/opencode.py。
 *
 * OpenCode 1.2+ 迁到 SQLite 存储；之前的 SQLite 读取器需原生依赖（better-sqlite3），其 prebuilt +
 * node-gyp 兜底链在受限网络/Windows 上炸 install，故回退。这些函数保留（dispatch/phase 切片依赖）
 * 但降级为静默 no-op。"OpenCode reader unavailable" warning 是 CLI 的 presentation concern——core 绝不 print。
 */
import type { DialogueTurn, MemFilter, MemSession, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { searchInDialogue } from '../search.js'

export function opencodeListSessions(_fs: MemFs, _f: MemFilter): MemSession[] {
  return []
}

export function opencodeExtractDialogue(_fs: MemFs, _s: MemSession): DialogueTurn[] {
  return []
}

export function opencodeSearch(kw: string): SearchHit {
  return searchInDialogue([], kw)
}
