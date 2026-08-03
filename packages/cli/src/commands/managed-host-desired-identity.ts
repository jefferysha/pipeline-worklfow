interface MarketplaceDesiredIdentity {
  readonly root: string
  readonly source: string
  readonly sourceType: string
  readonly head: string | null
}

type NativeHostDesiredIdentity =
  | {
      readonly version: 1
      readonly kind: 'marketplace-present'
      readonly source: string
      readonly root: string | null
      readonly sourceType: string
      readonly head: string
    }
  | {
      readonly version: 1
      readonly kind: 'marketplace-head'
      readonly marketplace: MarketplaceDesiredIdentity
      readonly head: string
    }
  | {
      readonly version: 1
      readonly kind: 'plugin-version'
      readonly marketplace: MarketplaceDesiredIdentity
      readonly pluginRoot: string | null
      readonly pluginVersion: string
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

const GIT_OID = /^[0-9a-f]{40}$/

function isGitOid(value: unknown): value is string {
  return typeof value === 'string' && GIT_OID.test(value)
}

function decodeMarketplaceIdentity(value: unknown): MarketplaceDesiredIdentity | null {
  if (!isRecord(value) || !hasExactKeys(value, ['head', 'root', 'source', 'sourceType'])) {
    return null
  }
  if (typeof value.root !== 'string'
    || typeof value.source !== 'string'
    || typeof value.sourceType !== 'string'
    || (value.head !== null && !isGitOid(value.head))) {
    return null
  }
  return {
    root: value.root,
    source: value.source,
    sourceType: value.sourceType,
    head: value.head,
  }
}

function decodeDesiredIdentity(text: string): NativeHostDesiredIdentity | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1 || typeof value.kind !== 'string') return null
  if (value.kind === 'marketplace-present') {
    if (!hasExactKeys(value, ['head', 'kind', 'root', 'source', 'sourceType', 'version'])
      || typeof value.source !== 'string'
      || (value.root !== null && typeof value.root !== 'string')
      || typeof value.sourceType !== 'string'
      || typeof value.head !== 'string') {
      return null
    }
    return {
      version: 1,
      kind: value.kind,
      source: value.source,
      root: value.root,
      sourceType: value.sourceType,
      head: value.head,
    }
  }
  if (value.kind === 'marketplace-head') {
    if (!hasExactKeys(value, ['head', 'kind', 'marketplace', 'version'])
      || typeof value.head !== 'string') {
      return null
    }
    const marketplace = decodeMarketplaceIdentity(value.marketplace)
    return marketplace === null ? null : {
      version: 1,
      kind: value.kind,
      marketplace,
      head: value.head,
    }
  }
  if (value.kind === 'plugin-version') {
    if (!hasExactKeys(value, ['kind', 'marketplace', 'pluginRoot', 'pluginVersion', 'version'])
      || (value.pluginRoot !== null && typeof value.pluginRoot !== 'string')
      || typeof value.pluginVersion !== 'string') {
      return null
    }
    const marketplace = decodeMarketplaceIdentity(value.marketplace)
    return marketplace === null ? null : {
      version: 1,
      kind: value.kind,
      marketplace,
      pluginRoot: value.pluginRoot,
      pluginVersion: value.pluginVersion,
    }
  }
  return null
}

function sameMarketplaceIdentity(
  left: MarketplaceDesiredIdentity,
  right: MarketplaceDesiredIdentity,
): boolean {
  return left.root === right.root
    && left.source === right.source
    && left.sourceType === right.sourceType
}

/**
 * Native desired records embed the marketplace HEAD observed while the target was planned. That
 * nested observation may advance after a successful refresh; every actual target and identity
 * field remains exact, and malformed or extended schemas fail closed.
 */
export function equivalentNativeHostDesired(
  persistedSerialized: string,
  currentSerialized: string,
): boolean {
  const persisted = decodeDesiredIdentity(persistedSerialized)
  const current = decodeDesiredIdentity(currentSerialized)
  if (persisted === null || current === null || persisted.kind !== current.kind) return false
  if (current.kind === 'marketplace-present') {
    return persisted.kind === current.kind
      && persisted.source === current.source
      && persisted.root === current.root
      && persisted.sourceType === current.sourceType
      && persisted.head === current.head
  }
  if (current.kind === 'marketplace-head') {
    return persisted.kind === current.kind
      && sameMarketplaceIdentity(persisted.marketplace, current.marketplace)
      && persisted.head === current.head
  }
  return persisted.kind === current.kind
    && sameMarketplaceIdentity(persisted.marketplace, current.marketplace)
    && persisted.pluginRoot === current.pluginRoot
    && persisted.pluginVersion === current.pluginVersion
}
