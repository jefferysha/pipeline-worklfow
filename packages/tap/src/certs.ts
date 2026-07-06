/**
 * certs —— 本地 CA 生成 + 逐 host 证书签发（forward/MITM TLS 终结用；node:crypto 真生成真自签）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/certs.py
 *   _default_ca_dir:35 · _CA_VALIDITY_DAYS:42 · _HOST_VALIDITY_DAYS:44 · ensure_ca:51
 *   · macos_login_keychain_path:126 · build_macos_verify_ca_command:131 · build_macos_trust_ca_command:149
 *   · is_macos_ca_trusted:165 · trust_macos_ca:176 · CertificateAuthority:197 · get_host_cert_pem:207
 *   · make_ssl_context:270。
 *
 * 结构改进（GOAL「tap 零第三方」）：老仓依赖第三方 `cryptography` 包构 X.509；本仓改**纯 node:crypto**
 *   —— RSA 密钥 generateKeyPairSync + 手写 ASN.1 DER 构 TBSCertificate + crypto.sign 自签 + X509Certificate
 *   真解析真验签，零第三方运行时依赖。行为对齐：CA basicConstraints=CA、host SAN、SERVER_AUTH extKeyUsage。
 *
 * 安全护栏（#34e，本项硬守）：
 *   ① CA 私钥**只本地生成**——密钥对在本进程 generateKeyPairSync，从不请求外部签发。
 *   ② CA 私钥**不外发**——本模块零 outbound 网络 import（无 node:http/https/net/dgram、无 fetch；
 *      certs.test 源码级扫描守此不变量）；私钥只 writeFileSync 落**本地**文件。
 *   ③ 私钥文件权限 **0600**（仅属主可读写）——ensureCa 落盘即 chmod 0600（certs.py:118 同款收紧）。
 *   ④ 信任 CA 是敏感动作：本模块只**构建**命令 + **非改动**地探测信任态（isMacosCaTrusted 用
 *      `security verify-cert`），绝不自动写钥匙串；实际信任由上层显式发起。
 */
import { X509Certificate, createPublicKey, createPrivateKey, createHash, generateKeyPairSync, randomBytes, sign as cryptoSign, type KeyObject } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// certs.py:42/44 —— CA 5 年、host 1 年
const CA_VALIDITY_DAYS = 5 * 365
const HOST_VALIDITY_DAYS = 365
const DAY_MS = 86_400_000

// ── 极简 ASN.1 DER 编码器 ──────────────────────────────────────────────────────
function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  let v = n
  while (v > 0) {
    bytes.unshift(v & 0xff)
    v = Math.floor(v / 256)
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content])
}
const seq = (parts: Buffer[]): Buffer => tlv(0x30, Buffer.concat(parts))
const set = (content: Buffer): Buffer => tlv(0x31, content)
const nullDer = Buffer.from([0x05, 0x00])
const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, 'utf8'))
const boolDer = (b: boolean): Buffer => tlv(0x01, Buffer.from([b ? 0xff : 0x00]))
const octet = (b: Buffer): Buffer => tlv(0x04, b)
const bitString = (b: Buffer): Buffer => tlv(0x03, Buffer.concat([Buffer.from([0]), b]))
const ctxExplicit = (n: number, content: Buffer): Buffer => tlv(0xa0 | n, content)
const ctxImplicit = (n: number, content: Buffer): Buffer => tlv(0x80 | n, content)

function derInt(unsigned: Buffer): Buffer {
  let b = Buffer.from(unsigned)
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  b = b.subarray(i)
  if (b.length === 0) b = Buffer.from([0])
  if (b[0]! & 0x80) b = Buffer.concat([Buffer.from([0]), b])
  return tlv(0x02, b)
}
function derIntNum(n: number): Buffer {
  const bytes: number[] = []
  let v = n
  if (v === 0) bytes.push(0)
  while (v > 0) {
    bytes.unshift(v & 0xff)
    v = Math.floor(v / 256)
  }
  return derInt(Buffer.from(bytes))
}
function encodeOid(oid: string): Buffer {
  const parts = oid.split('.').map(Number)
  const bytes: number[] = [40 * parts[0]! + parts[1]!]
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i]!
    const stack = [v & 0x7f]
    v = Math.floor(v / 128)
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80)
      v = Math.floor(v / 128)
    }
    bytes.push(...stack)
  }
  return tlv(0x06, Buffer.from(bytes))
}
function utcTime(d: Date): Buffer {
  const p = (n: number): string => String(n).padStart(2, '0')
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  return tlv(0x17, Buffer.from(s, 'ascii'))
}

const OID = {
  sha256Rsa: '1.2.840.113549.1.1.11',
  cn: '2.5.4.3',
  o: '2.5.4.10',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  san: '2.5.29.17',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  subjectKeyId: '2.5.29.14',
  authorityKeyId: '2.5.29.35',
}

type DnAttr = [oid: string, value: string]
function name(attrs: DnAttr[]): Buffer {
  return seq(attrs.map(([oid, val]) => set(seq([encodeOid(oid), utf8(val)]))))
}
function algId(oid: string, params: Buffer = nullDer): Buffer {
  return seq([encodeOid(oid), params])
}
function extension(oid: string, critical: boolean, valueDer: Buffer): Buffer {
  const parts = [encodeOid(oid)]
  if (critical) parts.push(boolDer(true))
  parts.push(octet(valueDer))
  return seq(parts)
}

// ── 极简 DER 读取（从落盘 CA 证书抽取 subject DN + 从 SPKI 抽公钥位）──────────────
interface Tlv { tag: number; start: number; contentStart: number; contentEnd: number; totalEnd: number }
function readTlv(buf: Buffer, offset: number): Tlv {
  const tag = buf[offset]!
  let p = offset + 1
  let len = buf[p]!
  p += 1
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++]!
  }
  return { tag, start: offset, contentStart: p, contentEnd: p + len, totalEnd: p + len }
}

/** 从 SPKI DER 抽 subjectPublicKey 的原始位（去 unused-bits 字节），供 SubjectKeyIdentifier 计算。 */
function spkiPublicKeyBits(spkiDer: Buffer): Buffer {
  const outer = readTlv(spkiDer, 0)
  const alg = readTlv(spkiDer, outer.contentStart)
  const bits = readTlv(spkiDer, alg.totalEnd)
  return spkiDer.subarray(bits.contentStart + 1, bits.contentEnd)
}
function subjectKeyIdentifier(spkiDer: Buffer): Buffer {
  return createHash('sha1').update(spkiPublicKeyBits(spkiDer)).digest()
}

/** 从证书 DER 抽 subject Name 的完整 DER 切片（作签发 host 证书时的 issuer）。 */
function extractSubjectDn(certDer: Buffer): Buffer {
  const cert = readTlv(certDer, 0)
  const tbs = readTlv(certDer, cert.contentStart)
  let p = tbs.contentStart
  const first = readTlv(certDer, p)
  if (first.tag === 0xa0) p = first.totalEnd // 跳过 [0] version（v3）
  p = readTlv(certDer, p).totalEnd // serial
  p = readTlv(certDer, p).totalEnd // sigAlg
  p = readTlv(certDer, p).totalEnd // issuer
  p = readTlv(certDer, p).totalEnd // validity
  const subject = readTlv(certDer, p)
  return certDer.subarray(subject.start, subject.totalEnd)
}

// ── SAN 构造 ───────────────────────────────────────────────────────────────────
/** 纯字符串 IP 判定（不引 node:net——保 certs.ts socket-free 安全不变量）。 */
function ipKind(host: string): 0 | 4 | 6 {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host.split('.').every((n) => Number(n) <= 255)) return 4
  if (host.includes(':') && /^[0-9a-fA-F:]+$/.test(host)) return 6
  return 0
}
function ipToBytes(host: string): Buffer | null {
  const kind = ipKind(host)
  if (kind === 4) {
    const parts = host.split('.').map(Number)
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) return Buffer.from(parts)
  }
  if (kind === 6) {
    // 展开 IPv6 为 16 字节
    const [head, tail] = host.split('::')
    const h = head ? head.split(':') : []
    const t = tail ? tail.split(':') : []
    const missing = 8 - (h.length + t.length)
    const groups = missing >= 0 ? [...h, ...Array(missing).fill('0'), ...t] : host.split(':')
    if (groups.length === 8) {
      const bytes = Buffer.alloc(16)
      groups.forEach((g, i) => bytes.writeUInt16BE(parseInt(g || '0', 16) & 0xffff, i * 2))
      return bytes
    }
  }
  return null
}
function sanExtension(hostname: string): Buffer {
  const ip = ipToBytes(hostname)
  const generalName = ip ? tlv(0x87, ip) : tlv(0x82, Buffer.from(hostname, 'ascii')) // iPAddress[7] / dNSName[2]
  return extension(OID.san, false, seq([generalName]))
}

// ── 证书构建 ───────────────────────────────────────────────────────────────────
interface BuildCertParams {
  subject: Buffer
  issuer: Buffer
  subjectSpkiDer: Buffer
  serial: Buffer
  notBefore: Date
  notAfter: Date
  extensions: Buffer[]
  signingKey: KeyObject
}
function buildCertificate(p: BuildCertParams): Buffer {
  const tbs = seq([
    ctxExplicit(0, derIntNum(2)), // version v3
    derInt(p.serial),
    algId(OID.sha256Rsa),
    p.issuer,
    seq([utcTime(p.notBefore), utcTime(p.notAfter)]),
    p.subject,
    p.subjectSpkiDer, // 直接嵌入 node 导出的 SPKI DER
    ctxExplicit(3, seq(p.extensions)),
  ])
  const signature = cryptoSign('sha256', tbs, p.signingKey)
  return seq([tbs, algId(OID.sha256Rsa), bitString(signature)])
}

function toPem(der: Buffer, label: string): string {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${label}-----\n${b64.endsWith('\n') ? b64 : b64 + '\n'}-----END ${label}-----\n`
}
function randomSerial(): Buffer {
  const b = randomBytes(16)
  b[0] = b[0]! & 0x7f // 保持正数
  return b
}

export interface KeyCertPair {
  certPem: string
  keyPem: string
}
export interface CreateCaOptions {
  commonName?: string
  organization?: string
  validityDays?: number
}

/** 生成本地自签 CA（RSA-2048，node:crypto 真生成真自签）。certs.py:70-123。 */
export function createCa(opts: CreateCaOptions = {}): KeyCertPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const caName = name([
    [OID.cn, opts.commonName ?? 'pipeline-tap CA'],
    [OID.o, opts.organization ?? 'pipeline-tap'],
  ])
  const now = new Date()
  const der = buildCertificate({
    subject: caName,
    issuer: caName,
    subjectSpkiDer: spki,
    serial: randomSerial(),
    notBefore: new Date(now.getTime() - 60_000),
    notAfter: new Date(now.getTime() + (opts.validityDays ?? CA_VALIDITY_DAYS) * DAY_MS),
    extensions: [
      extension(OID.basicConstraints, true, seq([boolDer(true)])), // CA:TRUE
      extension(OID.keyUsage, true, bitString(Buffer.from([0x06]))), // keyCertSign + cRLSign
      extension(OID.subjectKeyId, false, octet(subjectKeyIdentifier(spki))),
    ],
    signingKey: privateKey,
  })
  return {
    certPem: toPem(der, 'CERTIFICATE'),
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  }
}

/** 用 CA 签发一张 host 证书（SAN 含 hostname，SERVER_AUTH extKeyUsage）。certs.py:207 get_host_cert_pem。 */
export function issueHostCert(ca: KeyCertPair, hostname: string, opts: { validityDays?: number } = {}): KeyCertPair {
  const caKey = createPublicKey(ca.certPem) // 仅取 CA 公钥算 AKI
  const caSpki = caKey.export({ type: 'spki', format: 'der' }) as Buffer
  const caSigningKey = loadPrivateKey(ca.keyPem)
  const caCertDer = new X509Certificate(ca.certPem).raw
  const issuer = extractSubjectDn(caCertDer)

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const now = new Date()
  const der = buildCertificate({
    subject: name([[OID.cn, hostname]]),
    issuer,
    subjectSpkiDer: spki,
    serial: randomSerial(),
    notBefore: new Date(now.getTime() - 60_000),
    notAfter: new Date(now.getTime() + (opts.validityDays ?? HOST_VALIDITY_DAYS) * DAY_MS),
    extensions: [
      sanExtension(hostname),
      extension(OID.extKeyUsage, false, seq([encodeOid(OID.serverAuth)])),
      extension(OID.subjectKeyId, false, octet(subjectKeyIdentifier(spki))),
      extension(OID.authorityKeyId, false, seq([ctxImplicit(0, subjectKeyIdentifier(caSpki))])),
    ],
    signingKey: caSigningKey,
  })
  return {
    certPem: toPem(der, 'CERTIFICATE'),
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  }
}

function loadPrivateKey(keyPem: string): KeyObject {
  // 经 crypto 加载为 KeyObject（供 crypto.sign）。
  return createPrivateKey(keyPem)
}

// ── CA 目录解析 + 持久化 ────────────────────────────────────────────────────────
export interface CaDirOptions {
  dir?: string
  env?: NodeJS.ProcessEnv
  home?: string
}

/** CA 落盘目录：PIPELINE_TAP_CA_DIR 覆盖，否则 ~/.pipeline-tap。certs.py:35 _default_ca_dir。 */
export function resolveCaDir(opts: CaDirOptions = {}): string {
  if (opts.dir) return opts.dir
  const env = opts.env ?? process.env
  const override = (env.PIPELINE_TAP_CA_DIR ?? '').trim()
  if (override) return override
  const home = opts.home ?? homedir()
  return join(home, '.pipeline-tap')
}

export interface EnsureCaResult {
  caCertPath: string
  caKeyPath: string
  certPem: string
  keyPem: string
}

/** 确保 CA 落盘存在（ca.pem + ca-key.pem，私钥 0600）；幂等复用。certs.py:51 ensure_ca。 */
export function ensureCa(opts: CaDirOptions = {}): EnsureCaResult {
  const caDir = resolveCaDir(opts)
  mkdirSync(caDir, { recursive: true })
  const caCertPath = join(caDir, 'ca.pem')
  const caKeyPath = join(caDir, 'ca-key.pem')

  if (existsSync(caCertPath) && existsSync(caKeyPath)) {
    try {
      const certPem = readFileSync(caCertPath, 'utf8')
      const keyPem = readFileSync(caKeyPath, 'utf8')
      new X509Certificate(certPem) // 可解析校验
      loadPrivateKey(keyPem)
      chmodSync(caKeyPath, 0o600) // 二次收紧（防外部放宽）
      return { caCertPath, caKeyPath, certPem, keyPem }
    } catch {
      /* 落盘 CA 损坏 → 重新生成 */
    }
  }

  const ca = createCa()
  // 证书公开，普通权限；私钥 0600（仅属主可读写）——本地不外发硬护栏。
  writeAtomic(caCertPath, ca.certPem, 0o644)
  writeAtomic(caKeyPath, ca.keyPem, 0o600)
  chmodSync(caKeyPath, 0o600)
  return { caCertPath, caKeyPath, certPem: ca.certPem, keyPem: ca.keyPem }
}

function writeAtomic(path: string, data: string, mode: number): void {
  const tmp = path + '.tmp'
  writeFileSync(tmp, data, { mode })
  renameSync(tmp, path)
  chmodSync(path, mode)
}

// ── CertificateAuthority：进程内逐 host 签发 + 缓存 ─────────────────────────────
export interface SecureContextOptions {
  key: string
  cert: string
}

export class CertificateAuthority {
  private readonly ca: KeyCertPair
  private readonly cache = new Map<string, KeyCertPair>()

  private constructor(ca: KeyCertPair) {
    this.ca = ca
  }

  /** 从内存中的 createCa() 结果构造。 */
  static fromCa(ca: KeyCertPair): CertificateAuthority {
    return new CertificateAuthority(ca)
  }

  /** 从落盘目录装载（缺则 ensureCa 生成）。certs.py:197 CertificateAuthority.__init__。 */
  static fromDir(opts: CaDirOptions = {}): CertificateAuthority {
    const res = ensureCa(opts)
    return new CertificateAuthority({ certPem: res.certPem, keyPem: res.keyPem })
  }

  /** 返回本地 CA 证书 PEM（可供上层写入信任链；不含私钥）。 */
  caCertPem(): string {
    return this.ca.certPem
  }

  /** 逐 host 证书（进程内缓存）。certs.py:207 get_host_cert_pem。 */
  getHostCert(hostname: string): KeyCertPair {
    const hit = this.cache.get(hostname)
    if (hit) return hit
    const pair = issueHostCert(this.ca, hostname)
    this.cache.set(hostname, pair)
    return pair
  }

  /** tls.createSecureContext 所需 { key, cert }。certs.py:270 make_ssl_context。 */
  secureContextOptions(hostname: string): SecureContextOptions {
    const pair = this.getHostCert(hostname)
    return { key: pair.keyPem, cert: pair.certPem }
  }
}

/** 能否做真 TLS MITM（环境能否生成有效本地 CA 链）——honest-skip 门控用（同步）。 */
export function tlsMitmSupported(): boolean {
  try {
    const ca = createCa({ validityDays: 1 })
    const host = issueHostCert(ca, 'probe.local', { validityDays: 1 })
    const caCert = new X509Certificate(ca.certPem)
    const hostCert = new X509Certificate(host.certPem)
    return caCert.ca === true && hostCert.verify(caCert.publicKey)
  } catch {
    return false
  }
}

// ── macOS 信任助手（只构命令 + 非改动探测；绝不自动改钥匙串）────────────────────
/** 当前用户 login keychain 路径。certs.py:126。 */
export function macosLoginKeychainPath(home?: string): string {
  return join(home ?? homedir(), 'Library', 'Keychains', 'login.keychain-db')
}

/** 非改动地校验 CA 是否已被信任（不写钥匙串）。certs.py:131 build_macos_verify_ca_command。 */
export function buildMacosVerifyCaCommand(caCertPath: string, keychainPath?: string): string[] {
  const keychain = keychainPath ?? macosLoginKeychainPath()
  return ['security', 'verify-cert', '-c', caCertPath, '-p', 'ssl', '-l', '-L', '-q', '-k', keychain]
}

/** 在用户 login keychain 信任 CA 的无 sudo 命令（不用 System keychain）。certs.py:149。 */
export function buildMacosTrustCaCommand(caCertPath: string, keychainPath?: string): string[] {
  const keychain = keychainPath ?? macosLoginKeychainPath()
  return ['security', 'add-trusted-cert', '-r', 'trustRoot', '-p', 'ssl', '-k', keychain, caCertPath]
}

/** macOS 是否已信任该 CA（非改动 verify-cert）。certs.py:165 is_macos_ca_trusted。 */
export function isMacosCaTrusted(caCertPath: string, keychainPath?: string): boolean {
  const cmd = buildMacosVerifyCaCommand(caCertPath, keychainPath)
  const res = spawnSync(cmd[0]!, cmd.slice(1), { encoding: 'utf8' })
  return res.status === 0
}
