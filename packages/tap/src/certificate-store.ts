import { X509Certificate, createPrivateKey, randomBytes } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createCa,
  issueHostCert,
  type KeyCertPair,
} from './certs.js'

export interface CaDirOptions {
  dir?: string
  env?: NodeJS.ProcessEnv
  home?: string
}

export function resolveCaDir(opts: CaDirOptions = {}): string {
  if (opts.dir) return opts.dir
  const env = opts.env ?? process.env
  const override = (env.TENON_TAP_CA_DIR ?? '').trim()
  if (override) return override
  return join(opts.home ?? homedir(), '.pipeline-tap')
}

export interface EnsureCaResult {
  caCertPath: string
  caKeyPath: string
  certPem: string
  keyPem: string
}

const LOCK_WAIT_MS = 10_000
const STEAL_MAX_ATTEMPTS = 5

function tryLoadPair(
  caCertPath: string,
  caKeyPath: string,
): { certPem: string; keyPem: string } | null {
  if (!existsSync(caCertPath) || !existsSync(caKeyPath)) return null
  try {
    const certPem = readFileSync(caCertPath, 'utf8')
    const keyPem = readFileSync(caKeyPath, 'utf8')
    const cert = new X509Certificate(certPem)
    const key = createPrivateKey(keyPem)
    if (!cert.checkPrivateKey(key)) return null
    chmodSync(caKeyPath, 0o600)
    return { certPem, keyPem }
  } catch {
    return null
  }
}

function napSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {
    // Environments without SharedArrayBuffer retry immediately; the outer loop remains bounded.
  }
}

function waitForPair(
  caCertPath: string,
  caKeyPath: string,
  timeoutMs: number,
): { certPem: string; keyPem: string } | null {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const pair = tryLoadPair(caCertPath, caKeyPath)
    if (pair) return pair
    if (Date.now() >= deadline) return null
    napSync(50)
  }
}

function stealLock(lockPath: string): number | null {
  try {
    const state = statSync(lockPath)
    if (Date.now() - state.mtimeMs < LOCK_WAIT_MS) return null
  } catch {
    return null
  }
  const grave = `${lockPath}.stale.${process.pid}.${randomBytes(4).toString('hex')}`
  try {
    renameSync(lockPath, grave)
  } catch {
    return null
  }
  try {
    rmSync(grave)
  } catch {
    // The stale lock has already been detached from the live lock path.
  }
  try {
    return openSync(lockPath, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null
    throw error
  }
}

function writeAtomic(path: string, data: string, mode: number): void {
  const temp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(temp, data, { mode })
  renameSync(temp, path)
  chmodSync(path, mode)
}

/** Cross-process, pair-validating CA publication with a bounded stale-lock recovery loop. */
export function ensureCa(opts: CaDirOptions = {}): EnsureCaResult {
  const caDir = resolveCaDir(opts)
  mkdirSync(caDir, { recursive: true })
  const caCertPath = join(caDir, 'ca.pem')
  const caKeyPath = join(caDir, 'ca-key.pem')
  const lockPath = join(caDir, 'ca.lock')

  const existing = tryLoadPair(caCertPath, caKeyPath)
  if (existing) return { caCertPath, caKeyPath, ...existing }

  let lockFd: number | undefined
  for (let attempt = 0; attempt < STEAL_MAX_ATTEMPTS; attempt++) {
    try {
      lockFd = openSync(lockPath, 'wx')
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const waited = waitForPair(caCertPath, caKeyPath, LOCK_WAIT_MS)
    if (waited) return { caCertPath, caKeyPath, ...waited }
    const stolen = stealLock(lockPath)
    if (stolen !== null) {
      lockFd = stolen
      break
    }
  }
  if (lockFd === undefined) {
    throw new Error(
      `ensureCa: CA 锁 ${lockPath} 经 ${STEAL_MAX_ATTEMPTS} 轮夺取竞争仍未取得且始终无配对 CA 落盘——疑似持续争用或磁盘异常`,
    )
  }

  try {
    const published = tryLoadPair(caCertPath, caKeyPath)
    if (published) return { caCertPath, caKeyPath, ...published }
    const ca = createCa()
    writeAtomic(caCertPath, ca.certPem, 0o644)
    writeAtomic(caKeyPath, ca.keyPem, 0o600)
    chmodSync(caKeyPath, 0o600)
    return { caCertPath, caKeyPath, certPem: ca.certPem, keyPem: ca.keyPem }
  } finally {
    try {
      closeSync(lockFd)
    } catch {
      // The lock descriptor may already be closed by an exceptional platform path.
    }
    try {
      rmSync(lockPath)
    } catch {
      // Another recovery process may already have detached a stale lock.
    }
  }
}

export interface SecureContextOptions {
  key: string
  cert: string
}

export class CertificateAuthority {
  private readonly cache = new Map<string, KeyCertPair>()

  private constructor(private readonly ca: KeyCertPair) {}

  static fromCa(ca: KeyCertPair): CertificateAuthority {
    return new CertificateAuthority(ca)
  }

  static fromDir(opts: CaDirOptions = {}): CertificateAuthority {
    const result = ensureCa(opts)
    return new CertificateAuthority({ certPem: result.certPem, keyPem: result.keyPem })
  }

  caCertPem(): string {
    return this.ca.certPem
  }

  getHostCert(hostname: string): KeyCertPair {
    const cached = this.cache.get(hostname)
    if (cached) return cached
    const pair = issueHostCert(this.ca, hostname)
    this.cache.set(hostname, pair)
    return pair
  }

  secureContextOptions(hostname: string): SecureContextOptions {
    const pair = this.getHostCert(hostname)
    return { key: pair.keyPem, cert: pair.certPem }
  }
}
