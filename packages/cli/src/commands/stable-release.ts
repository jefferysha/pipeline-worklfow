import { PRODUCT_IDENTITY } from '@tenon/kernel'
import type { SetupEnv } from './setup.js'

const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const GIT_OID = /^[0-9a-f]{40}$/
const RELEASE_API = `https://api.github.com/repos/${PRODUCT_IDENTITY.repository}/releases/latest`
const RELEASE_REPOSITORY = `${PRODUCT_IDENTITY.repositoryUrl}.git`

export interface StableReleaseMetadata {
  readonly tag_name: string
  readonly draft: boolean
  readonly prerelease: boolean
  readonly html_url: string
}

export interface StableReleaseTarget {
  readonly version: string
  readonly tag: string
  readonly commit: string
}

export interface StableReleaseHttp {
  getJson(url: string): Promise<unknown>
}

export interface StableReleaseResolver {
  resolve(env: SetupEnv): Promise<StableReleaseTarget>
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseVersion(value: string): readonly [bigint, bigint, bigint] {
  const match = STABLE_VERSION.exec(value)
  if (match === null) throw new Error(`release version '${value}' is not complete stable SemVer`)
  const [, major, minor, patch] = match
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`release version '${value}' is not complete stable SemVer`)
  }
  return [BigInt(major), BigInt(minor), BigInt(patch)]
}

export function stableTagForVersion(version: string): `v${string}` {
  parseVersion(version)
  return `v${version}`
}

export function compareStableVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < a.length; index += 1) {
    const leftPart = a[index] ?? 0n
    const rightPart = b[index] ?? 0n
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1
  }
  return 0
}

export function decodeStableReleaseMetadata(
  value: unknown,
): Pick<StableReleaseTarget, 'version' | 'tag'> {
  const item = record(value)
  if (item === null
    || Object.keys(item).sort().join(',') !== 'draft,html_url,prerelease,tag_name'
    || typeof item.tag_name !== 'string'
    || typeof item.draft !== 'boolean'
    || typeof item.prerelease !== 'boolean'
    || typeof item.html_url !== 'string') {
    throw new Error('stable Release metadata schema is invalid')
  }
  if (item.draft) throw new Error('latest Release is a draft')
  if (item.prerelease) throw new Error('latest Release is a prerelease')
  if (!item.tag_name.startsWith('v')) {
    throw new Error(`release tag '${item.tag_name}' is not complete stable SemVer`)
  }
  const version = item.tag_name.slice(1)
  stableTagForVersion(version)
  const expectedUrl = `${PRODUCT_IDENTITY.repositoryUrl}/releases/tag/${item.tag_name}`
  if (item.html_url !== expectedUrl) {
    throw new Error('latest Release does not belong to the official Tenon repository')
  }
  return { version, tag: item.tag_name }
}

function tagCommit(env: SetupEnv, tag: string): string {
  const directRef = `refs/tags/${tag}`
  const peeledRef = `${directRef}^{}`
  const result = env.runCommand(
    'git',
    ['ls-remote', RELEASE_REPOSITORY, directRef, peeledRef],
    { timeoutMs: 10_000 },
  )
  if (result.code !== 0) {
    throw new Error(`stable Release tag proof failed: ${result.stderr.trim() || `exit ${result.code}`}`)
  }
  const refs = new Map<string, string>()
  for (const line of result.stdout.trim().split('\n')) {
    if (line === '') continue
    const [oid, ref, ...extra] = line.trim().split(/\s+/)
    if (extra.length > 0 || oid === undefined || ref === undefined || !GIT_OID.test(oid)) {
      throw new Error('stable Release tag proof is malformed')
    }
    if (ref !== directRef && ref !== peeledRef) {
      throw new Error('stable Release tag proof contains an unexpected ref')
    }
    if (refs.has(ref)) throw new Error('stable Release tag proof is ambiguous')
    refs.set(ref, oid)
  }
  const commit = refs.get(peeledRef) ?? refs.get(directRef)
  if (commit === undefined) throw new Error('stable Release tag proof is missing')
  return commit
}

/** Resolve an explicitly selected packaged stable version without consulting a mutable branch. */
export function resolveStableTagTarget(env: SetupEnv, version: string): StableReleaseTarget {
  const tag = stableTagForVersion(version)
  return { version, tag, commit: tagCommit(env, tag) }
}

export async function resolveStableReleaseTarget(
  env: SetupEnv,
  http: StableReleaseHttp = REAL_STABLE_RELEASE_HTTP,
): Promise<StableReleaseTarget> {
  const metadata = decodeStableReleaseMetadata(await http.getJson(RELEASE_API))
  return resolveStableTagTarget(env, metadata.version)
}

export const REAL_STABLE_RELEASE_HTTP: StableReleaseHttp = {
  async getJson(url) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'tenon-release-resolver',
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`stable Release request failed: HTTP ${response.status}`)
    const raw = record(await response.json())
    if (raw === null) throw new Error('stable Release response is not an object')
    // GitHub's resource contains many forward-compatible fields. Keep the domain decoder closed by
    // projecting only the four release-identity fields it owns.
    return {
      tag_name: raw.tag_name,
      draft: raw.draft,
      prerelease: raw.prerelease,
      html_url: raw.html_url,
    }
  },
}

export const REAL_STABLE_RELEASE_RESOLVER: StableReleaseResolver = {
  resolve: (env) => resolveStableReleaseTarget(env),
}
