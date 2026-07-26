import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const STATE_SCOPE_NAMESPACE = 'tenon:machine-state-scope:v1\0'

/** Canonical lexical Tenon state root used by every singleton identity consumer. */
export function canonicalMachineStateRoot(stateRoot: string): string {
  return resolve(stateRoot)
}

/**
 * Opaque stable identity for the machine-state domain served by one Dashboard singleton.
 *
 * This is an identity comparison value, not an authentication secret. The namespace prevents the
 * digest from being confused with a generic path hash while the version prefix leaves room for a
 * future canonicalization migration.
 */
export function machineStateScopeId(stateRoot: string): string {
  const digest = createHash('sha256')
    .update(STATE_SCOPE_NAMESPACE)
    .update(canonicalMachineStateRoot(stateRoot))
    .digest('hex')
  return `sha256-v1-${digest}`
}
