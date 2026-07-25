import { createHash } from 'node:crypto'

/** Infrastructure adapter for deterministic SHA-256 used by synchronous kernel boundaries. */
export function sha256Hex(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}
