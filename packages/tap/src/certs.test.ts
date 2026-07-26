/**
 * certs.test —— 本地 CA 真生成 / 真自签 / 真验证（GOAL C9 + #34e 安全护栏）。
 * 零 mock：真 node:crypto 生成 RSA 密钥、真 ASN.1 DER 构证书、真 X509 解析验证、真 TLS 握手。
 * 安全断言：CA 私钥文件 0600、certs.ts 源零 outbound、私钥不进任何网络调用。
 * 老仓真相源：certs.py（ensure_ca / CertificateAuthority / macos trust 助手）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { X509Certificate, createPublicKey } from 'node:crypto'
import { statSync, readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { readFileSync as rf } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir, platform } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tls from 'node:tls'
import {
  createCa,
  issueHostCert,
  ensureCa,
  CertificateAuthority,
  resolveCaDir,
  tlsMitmSupported,
  buildMacosVerifyCaCommand,
  buildMacosTrustCaCommand,
  macosLoginKeychainPath,
} from './certs.js'

const dirs: string[] = []
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }) })
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'pl-certs-')); dirs.push(d); return d }

describe('certs —— 真 CA 生成与自签验证', () => {
  it('createCa 生成真自签 CA（X509 可解析、自验签通过、CA basicConstraints 真为 CA）', () => {
    const ca = createCa()
    const cert = new X509Certificate(ca.certPem)
    expect(cert.subject).toContain('pipeline-tap CA')
    // 真自验签：CA 公钥验 CA 证书签名
    expect(cert.verify(createPublicKey(ca.certPem))).toBe(true)
    expect(cert.ca).toBe(true)
    // 私钥 PEM 真可用（PKCS#8）
    expect(ca.keyPem).toContain('PRIVATE KEY')
  })

  it('issueHostCert 生成真 host 证书（CA 真签发、SAN 真含 host、被 CA verify 通过）', () => {
    const ca = createCa()
    const host = issueHostCert(ca, 'api.anthropic.com')
    const hostCert = new X509Certificate(host.certPem)
    const caCert = new X509Certificate(ca.certPem)
    expect(hostCert.subject).toContain('api.anthropic.com')
    expect(hostCert.subjectAltName).toContain('api.anthropic.com')
    // 真链验：host 证书由 CA 公钥验签通过
    expect(hostCert.verify(caCert.publicKey)).toBe(true)
    expect(hostCert.checkIssued(caCert)).toBe(true)
    // host 证书不是 CA
    expect(hostCert.ca).toBe(false)
  })

  it('issueHostCert 支持 IP host（iPAddress SAN）', () => {
    const ca = createCa()
    const host = issueHostCert(ca, '127.0.0.1')
    const cert = new X509Certificate(host.certPem)
    expect(cert.subjectAltName).toContain('127.0.0.1')
  })
})

describe('certs —— 持久化 + 安全护栏（#34e：私钥不外发）', () => {
  it('ensureCa 落盘 ca.pem + ca-key.pem，私钥文件 mode 0600', () => {
    const dir = tmp()
    const res = ensureCa({ dir })
    expect(existsSync(res.caCertPath)).toBe(true)
    expect(existsSync(res.caKeyPath)).toBe(true)
    // 关键安全断言：私钥文件权限 0600（仅属主可读写）
    const mode = statSync(res.caKeyPath).mode & 0o777
    expect(mode).toBe(0o600)
    // 落盘的证书真可解析
    expect(new X509Certificate(readFileSync(res.caCertPath)).ca).toBe(true)
  })

  it('ensureCa 幂等：二次调用复用同一 CA（证书字节不变）', () => {
    const dir = tmp()
    const first = ensureCa({ dir })
    const firstBytes = readFileSync(first.caCertPath)
    const second = ensureCa({ dir })
    expect(readFileSync(second.caCertPath).equals(firstBytes)).toBe(true)
  })

  it('CertificateAuthority.fromDir 装载已落盘 CA，getHostCert 缓存（同 host 同字节）', () => {
    const dir = tmp()
    ensureCa({ dir })
    const authority = CertificateAuthority.fromDir({ dir })
    const a = authority.getHostCert('example.com')
    const b = authority.getHostCert('example.com')
    expect(a.certPem).toBe(b.certPem) // 缓存命中：同一字节
    // 装载后签发的 host 证书仍被落盘 CA 验签通过
    const caCert = new X509Certificate(readFileSync(join(dir, 'ca.pem')))
    expect(new X509Certificate(a.certPem).verify(caCert.publicKey)).toBe(true)
    // secureContext 选项含 key + cert
    const opts = authority.secureContextOptions('example.com')
    expect(opts.key).toContain('PRIVATE KEY')
    expect(opts.cert).toContain('CERTIFICATE')
  })

  it('resolveCaDir：TENON_TAP_CA_DIR 覆盖优先，否则 ~/.pipeline-tap', () => {
    expect(resolveCaDir({ env: { TENON_TAP_CA_DIR: '/x/ca' } })).toBe('/x/ca')
    expect(resolveCaDir({ env: {}, home: '/home/u' })).toBe('/home/u/.pipeline-tap')
  })

  it('安全护栏：certs.ts 源码零 outbound 网络 import（私钥绝不回传）', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = rf(join(here, 'certs.ts'), 'utf8')
    // 禁止任何出网原语：http/https 客户端、net/dgram、fetch
    expect(/from ['"]node:https['"]/.test(src)).toBe(false)
    expect(/from ['"]node:http['"]/.test(src)).toBe(false)
    expect(/from ['"]node:net['"]/.test(src)).toBe(false)
    expect(/from ['"]node:dgram['"]/.test(src)).toBe(false)
    expect(/\bfetch\s*\(/.test(src)).toBe(false)
    // 私钥变量绝不作为 body/data 出现在任何 request/post/send 调用里（源级）
    expect(/\.(write|end|send|post|request)\([^)]*(keyPem|privateKey)/.test(src)).toBe(false)
  })
})

describe('certs —— B4：host 私钥全 host 复用（不逐 host generateKeyPairSync 阻塞事件循环）', () => {
  it('多 host getHostCert 复用同一把 host 私钥；每张证书公钥仍与该私钥配对、仍被 CA 验签', () => {
    const ca = createCa()
    const authority = CertificateAuthority.fromCa(ca)
    const a = authority.getHostCert('api.anthropic.com')
    const b = authority.getHostCert('generativelanguage.googleapis.com')
    // 不同 host → 不同证书（subject/SAN 不同）
    expect(a.certPem).not.toBe(b.certPem)
    // 但复用同一把 host 私钥（mitmproxy 手法：keypair 只生成一次缓存）
    expect(a.keyPem).toBe(b.keyPem)
    // 关键：共享 key 后 cert 公钥仍与该私钥配对（TLS 握手前提，别因复用而 cert/key 解耦）
    const keyPub = createPublicKey(a.keyPem).export({ type: 'spki', format: 'pem' })
    expect(new X509Certificate(a.certPem).publicKey.export({ type: 'spki', format: 'pem' })).toBe(keyPub)
    expect(new X509Certificate(b.certPem).publicKey.export({ type: 'spki', format: 'pem' })).toBe(keyPub)
    // 仍被 CA 验签通过
    const caCert = new X509Certificate(ca.certPem)
    expect(new X509Certificate(a.certPem).verify(caCert.publicKey)).toBe(true)
    expect(new X509Certificate(b.certPem).verify(caCert.publicKey)).toBe(true)
  })
})

describe('certs —— B5：CA 首次生成跨进程锁 + cert/key 配对保证', () => {
  it('落盘 CA 对不配对（cert 与 key 来自不同代，模拟并发交错恶果）→ ensureCa 不复用、重生成配对的对', () => {
    const dir = tmp()
    mkdirSync(dir, { recursive: true })
    const g1 = createCa()
    const g2 = createCa()
    // 模拟两并发进程 rename 交错：ca.pem 来自 g1，ca-key.pem 来自 g2 —— 不配对
    writeFileSync(join(dir, 'ca.pem'), g1.certPem)
    writeFileSync(join(dir, 'ca-key.pem'), g2.keyPem)
    const res = ensureCa({ dir })
    // 老代码会把这对不配对的当"完好"原样返回；修后必须返回配对的对
    const certPub = new X509Certificate(res.certPem).publicKey.export({ type: 'spki', format: 'pem' })
    const keyPub = createPublicKey(res.keyPem).export({ type: 'spki', format: 'pem' })
    expect(certPub).toBe(keyPub)
  })

  it('首次生成后释放锁（不泄漏 ca.lock）且返回配对对', () => {
    const dir = tmp()
    const res = ensureCa({ dir })
    expect(existsSync(res.caCertPath)).toBe(true)
    expect(existsSync(join(dir, 'ca.lock'))).toBe(false) // 锁已释放
    const certPub = new X509Certificate(res.certPem).publicKey.export({ type: 'spki', format: 'pem' })
    const keyPub = createPublicKey(res.keyPem).export({ type: 'spki', format: 'pem' })
    expect(certPub).toBe(keyPub)
  })

  it('另一进程持锁并写入配对 CA 期间，本次 ensureCa 等待并采用那一对（不各自生成不配对对）', async () => {
    const dir = tmp()
    mkdirSync(dir, { recursive: true })
    const p = createCa() // 预生成一对配对 CA，交给"另一进程"写
    // 真子进程（纯 JS）：O_EXCL 抢 ca.lock → stdout 报 LOCKED → 150ms 后写入配对的 p → 释放锁
    const childCode = [
      "const fs=require('fs'),{join}=require('path');",
      'const dir=process.env.DIR;',
      "const fd=fs.openSync(join(dir,'ca.lock'),'wx');",
      "process.stdout.write('LOCKED\\n');",
      'setTimeout(()=>{',
      "  fs.writeFileSync(join(dir,'ca.pem'),process.env.CERT);",
      "  fs.writeFileSync(join(dir,'ca-key.pem'),process.env.KEY);",
      '  try{fs.closeSync(fd)}catch{};',
      "  try{fs.rmSync(join(dir,'ca.lock'))}catch{};",
      '  process.exit(0);',
      '},150);',
    ].join('')
    const child = spawn(process.execPath, ['-e', childCode], {
      env: { ...process.env, DIR: dir, CERT: p.certPem, KEY: p.keyPem },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    // 等子进程真正抢到锁再调 ensureCa（否则父可能先抢锁自生成，测不到竞态）
    await new Promise<void>((resolve, reject) => {
      let out = ''
      child.stdout!.on('data', (d) => { out += String(d); if (out.includes('LOCKED')) resolve() })
      child.on('error', reject)
      child.on('exit', (code) => { if (!out.includes('LOCKED')) reject(new Error('子进程未抢到锁, exit ' + code)) })
    })
    // 此刻子进程持锁未写完；父 ensureCa 抢不到锁 → 同步等待子进程落配对对再读回
    const res = ensureCa({ dir })
    await new Promise<void>((r) => { child.on('exit', () => r()); if (child.exitCode !== null) r() })
    // 采用了子进程写的那一对（没自己另生成不配对对）
    expect(res.certPem).toBe(p.certPem)
    expect(res.keyPem).toBe(p.keyPem)
    const certPub = new X509Certificate(res.certPem).publicKey.export({ type: 'spki', format: 'pem' })
    const keyPub = createPublicKey(res.keyPem).export({ type: 'spki', format: 'pem' })
    expect(certPub).toBe(keyPub)
  })
})

describe('certs —— 真 TLS 握手验证（本地 CA 签发链，honest-skip 门控）', () => {
  const supported = tlsMitmSupported()
  if (!supported) {
    // eslint-disable-next-line no-console
    console.warn('[honest-skip] certs TLS 握手：环境不支持 node:crypto 证书生成或 tls 握手 —— 不伪绿')
  }

  it.skipIf(!supported)('server 用本地 CA 签发的 host 证书，client 信任该 CA → 握手 authorized', async () => {
    const ca = createCa()
    const host = issueHostCert(ca, 'localhost')
    const authorized = await new Promise<boolean>((resolve, reject) => {
      const srv = tls.createServer({ key: host.keyPem, cert: host.certPem }, (sock) => { sock.end('OK') })
      srv.listen(0, '127.0.0.1', () => {
        const port = (srv.address() as { port: number }).port
        const cli = tls.connect({ port, host: '127.0.0.1', servername: 'localhost', ca: [ca.certPem] }, () => {
          const ok = cli.authorized
          cli.destroy(); srv.close(); resolve(ok)
        })
        cli.on('error', (e) => { srv.close(); reject(e) })
      })
      srv.on('error', reject)
    })
    expect(authorized).toBe(true)
  })
})

describe('certs —— macOS 信任助手（只构命令不改钥匙串）', () => {
  it('buildMacosVerifyCaCommand 是非改动的 verify-cert 命令', () => {
    const cmd = buildMacosVerifyCaCommand('/x/ca.pem', '/k/login.keychain-db')
    expect(cmd[0]).toBe('security')
    expect(cmd).toContain('verify-cert')
    expect(cmd).toContain('/x/ca.pem')
    // 明确不含任何写钥匙串的动作
    expect(cmd).not.toContain('add-trusted-cert')
  })
  it('buildMacosTrustCaCommand 走 login keychain 不用 sudo/System', () => {
    const cmd = buildMacosTrustCaCommand('/x/ca.pem')
    expect(cmd).toContain('add-trusted-cert')
    expect(cmd.join(' ')).not.toContain('sudo')
    expect(cmd.join(' ')).toContain('login.keychain-db')
    expect(cmd.join(' ')).not.toContain('/Library/Keychains/System.keychain')
  })
  it('macosLoginKeychainPath 指向用户 login keychain', () => {
    const p = macosLoginKeychainPath('/home/u')
    expect(p).toBe('/home/u/Library/Keychains/login.keychain-db')
    // 平台无关的纯路径构造（不依赖真 macOS）
    void platform
  })
})
