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
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/**
 * 全 host 复用**同一把** host 私钥（B4，mitmproxy 手法）。generateKeyPairSync('rsa',2048) 每次
 * ~50-100ms **同步阻塞事件循环**——多 SNI 逐 host 现签会串行卡死所有隧道。host 私钥只是 MITM 叶子
 * 密钥（非信任锚，签发它的 CA 才是），全 host 共用一把安全且对齐 mitmproxy；只证书 subject/SAN 逐 host
 * 不同。keypair 惰性生成一次进程内缓存，后续 issueHostCert 零 keygen。
 */
let sharedHostKey: { privateKey: KeyObject; spkiDer: Buffer; keyPem: string } | null = null
function getSharedHostKey(): { privateKey: KeyObject; spkiDer: Buffer; keyPem: string } {
  if (sharedHostKey) return sharedHostKey
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  sharedHostKey = {
    privateKey,
    spkiDer: publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  }
  return sharedHostKey
}

/** 用 CA 签发一张 host 证书（SAN 含 hostname，SERVER_AUTH extKeyUsage）。certs.py:207 get_host_cert_pem。 */
export function issueHostCert(ca: KeyCertPair, hostname: string, opts: { validityDays?: number } = {}): KeyCertPair {
  const caKey = createPublicKey(ca.certPem) // 仅取 CA 公钥算 AKI
  const caSpki = caKey.export({ type: 'spki', format: 'der' }) as Buffer
  const caSigningKey = loadPrivateKey(ca.keyPem)
  const caCertDer = new X509Certificate(ca.certPem).raw
  const issuer = extractSubjectDn(caCertDer)

  const hostKey = getSharedHostKey() // B4：复用同一把 host 私钥（不再逐 host 现签阻塞事件循环）
  const spki = hostKey.spkiDer
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
    keyPem: hostKey.keyPem,
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

const LOCK_WAIT_MS = 10_000
/** 夺锁竞争的有界重试轮数（codex review P1）：每轮 = openSync(wx) + waitForPair + 原子 stealLock。 */
const STEAL_MAX_ATTEMPTS = 5

/**
 * 读回落盘 CA 并**校验配对**（cert 公钥须与私钥匹配）。返回 null 表示缺文件/损坏/**不配对**——
 * 后者是 B5 的核心防线：老 ensureCa 只各自校验 cert 可解析 + key 可加载，两并发进程的 cert 与 key
 * 交错落盘（ca.pem 来自 A 代、ca-key.pem 来自 B 代）时会当成"完好"原样复用 → MITM 全线 TLS 失败。
 */
function tryLoadPair(caCertPath: string, caKeyPath: string): { certPem: string; keyPem: string } | null {
  if (!existsSync(caCertPath) || !existsSync(caKeyPath)) return null
  try {
    const certPem = readFileSync(caCertPath, 'utf8')
    const keyPem = readFileSync(caKeyPath, 'utf8')
    const cert = new X509Certificate(certPem)
    const key = loadPrivateKey(keyPem)
    if (!cert.checkPrivateKey(key)) return null // 配对校验：cert 公钥 ↔ 私钥
    chmodSync(caKeyPath, 0o600) // 二次收紧（防外部放宽）
    return { certPem, keyPem }
  } catch {
    return null
  }
}

/** 有界同步等待另一进程落出配对的 CA（持锁进程正在写）。 */
function waitForPair(caCertPath: string, caKeyPath: string, timeoutMs: number): { certPem: string; keyPem: string } | null {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const pair = tryLoadPair(caCertPath, caKeyPath)
    if (pair) return pair
    if (Date.now() >= deadline) return null
    napSync(50)
  }
}

/** 同步小睡 ms 毫秒（Atomics.wait 阻塞本线程，不 peg CPU）；SAB 不可用则退化为立即返回（忙等）。 */
function napSync(ms: number): void {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* 忙等兜底 */ }
}

/**
 * 夺取疑似陈旧锁（持有者疑似崩溃：等待超时仍无配对 CA）。两道原子护栏（codex review P1 深化）:
 *   ① **mtime 复检陈旧**:若锁其实很新（别的进程刚夺到并新建,mtime 在 LOCK_WAIT_MS 内）→ 不夺、返 null,
 *      回调用方等它写配对对。消除旧实现"rmSync 无条件抹掉别人刚建的新锁"的洞（CA 生成 <1s,活持有者
 *      的锁创建时间必在 LOCK_WAIT_MS 内;超 LOCK_WAIT_MS 才真陈旧）。
 *   ② **原子 rename 夺取**:把陈锁 rename 到唯一坟墓名——rename 原子,只一个进程能移走该 inode,其余
 *      ENOENT→null,绝不像"先 rmSync 再 openSync"那样先删后建给第三者可乘之机。移走后独占创建新锁。
 * 输了任一步 → 返 null,调用方回去重等/重抢赢家的配对对（绝不各自生成不配对的 CA 对）。
 */
function stealLock(lockPath: string): number | null {
  try {
    const st = statSync(lockPath)
    if (Date.now() - st.mtimeMs < LOCK_WAIT_MS) return null // 新锁,不夺
  } catch {
    return null // 锁已消失 → 回调用方重抢 openSync(wx)
  }
  const grave = `${lockPath}.stale.${process.pid}.${randomBytes(4).toString('hex')}`
  try {
    renameSync(lockPath, grave) // 原子移走陈锁(输者 ENOENT)
  } catch {
    return null
  }
  try { rmSync(grave) } catch { /* ignore */ }
  try {
    return openSync(lockPath, 'wx') // 独占创建新锁;极罕见移走后被抢建 → EEXIST→null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null
    throw err
  }
}

/**
 * 确保 CA 落盘存在（ca.pem + ca-key.pem，私钥 0600）；幂等复用。certs.py:51 ensure_ca。
 *
 * B5 跨进程锁：CA 首次生成用 **O_EXCL 独占锁文件（ca.lock）** 串行化"生成+落盘"。两个并发
 * `tap start --ca` 曾各自 createCa（不同 keypair）写同一 .tmp，rename 交错 → ca.pem 与 ca-key.pem
 * 可能来自不同代 → 不配对 → MITM 全线 TLS 失败。现在：抢到锁的进程独家生成并落盘；抢不到的同步
 * 等它写出**配对的**对再读回（waitForPair），绝不各自生成。叠加 tryLoadPair 的配对校验 + writeAtomic
 * 的唯一 .tmp 名，确保读到的 pem 对永远配对。
 */
export function ensureCa(opts: CaDirOptions = {}): EnsureCaResult {
  const caDir = resolveCaDir(opts)
  mkdirSync(caDir, { recursive: true })
  const caCertPath = join(caDir, 'ca.pem')
  const caKeyPath = join(caDir, 'ca-key.pem')
  const lockPath = join(caDir, 'ca.lock')

  // 幂等快路径：已落盘且配对 → 复用（绝大多数调用走这里，零锁开销）。
  const fast = tryLoadPair(caCertPath, caKeyPath)
  if (fast) return { caCertPath, caKeyPath, ...fast }

  // 抢锁：O_EXCL 原子独占创建 ca.lock。抢到 → 本进程负责生成；EEXIST → 别的进程在写，等它落配对对再读回。
  // 夺锁竞争(codex review P1)：等超时判陈旧后夺锁,若竞争输了(stealLock 返 null,别的进程先夺到)不再各自
  // 生成,回到循环顶部重抢/重等赢家的配对对。有界 STEAL_MAX_ATTEMPTS 轮防病态无限。
  let lockFd: number | undefined
  for (let attempt = 0; attempt < STEAL_MAX_ATTEMPTS; attempt++) {
    try {
      lockFd = openSync(lockPath, 'wx') // 抢到锁 → 本进程负责生成
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    const waited = waitForPair(caCertPath, caKeyPath, LOCK_WAIT_MS)
    if (waited) return { caCertPath, caKeyPath, ...waited } // 采用持锁进程写的配对对（不自己另生成）
    const stolen = stealLock(lockPath) // 超时 → 判定陈旧锁 → 原子夺锁
    if (stolen !== null) { lockFd = stolen; break } // 夺锁成功,本进程独家生成
    // stolen===null：夺锁竞争输了,别的进程正持新锁生成 → 下一轮回顶部 openSync(wx) EEXIST → 再 waitForPair
  }
  if (lockFd === undefined) {
    throw new Error(`ensureCa: CA 锁 ${lockPath} 经 ${STEAL_MAX_ATTEMPTS} 轮夺取竞争仍未取得且始终无配对 CA 落盘——疑似持续争用或磁盘异常`)
  }
  try {
    // 二次检查：拿到/夺到锁后别的进程可能刚写完配对对。
    const again = tryLoadPair(caCertPath, caKeyPath)
    if (again) return { caCertPath, caKeyPath, ...again }
    const ca = createCa()
    // 证书公开，普通权限；私钥 0600（仅属主可读写）——本地不外发硬护栏。
    writeAtomic(caCertPath, ca.certPem, 0o644)
    writeAtomic(caKeyPath, ca.keyPem, 0o600)
    chmodSync(caKeyPath, 0o600)
    return { caCertPath, caKeyPath, certPem: ca.certPem, keyPem: ca.keyPem }
  } finally {
    // 只有本进程持锁时才走到这里（waited 分支已 return）；释放锁。
    try { closeSync(lockFd) } catch { /* ignore */ }
    try { rmSync(lockPath) } catch { /* ignore */ }
  }
}

function writeAtomic(path: string, data: string, mode: number): void {
  // 唯一 .tmp 名（pid+随机）：即便极端双持锁场景两写手并存，也不互相 clobber 同一 .tmp（B5 加固）。
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
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
