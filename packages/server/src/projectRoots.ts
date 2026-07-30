import { resolve } from 'node:path'

/** Normalize and de-duplicate registered project roots while preserving registry order. */
export function dedupeRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    if (!root) continue
    const normalized = resolve(root)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
