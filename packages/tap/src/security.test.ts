/**
 * security.test —— 安全护栏（GOAL A7 / BACKLOG #34e，收编前置硬要求）：
 *   ① tap 默认 OFF（缺 flag = 不抓）——这是对老仓「缺文件=默认开」的**故意收紧**；
 *   ② tapStatus() 让 doctor 明示「正在拦截」；
 *   ③ 捕获数据只落本地、绝不外发——代码级证据：trace-store / record 源零 outbound 网络 import。
 * 真 fs 读写 flag，真源码扫描。零 mock。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  activeIntercepts, flagPath, isCaptureEnabled, registerIntercept, resetCaptureCache, setCaptureEnabled, tapStatus,
} from './security.js'
import { rmDir, tempTapDir } from './test-support.js'

const dirs: string[] = []
afterEach(async () => { resetCaptureCache(); while (dirs.length) await rmDir(dirs.pop()!) })
async function dir(): Promise<string> { const d = await tempTapDir(); dirs.push(d); return d }

describe('默认 OFF —— 不启动不抓（#34e 硬要求）', () => {
  it('缺 flag 文件 → isCaptureEnabled 为 false（对老仓「缺文件默认开」的收紧）', async () => {
    const d = await dir()
    resetCaptureCache()
    expect(isCaptureEnabled({ dir: d })).toBe(false)
  })
  it('tapStatus 默认 captureEnabled=false、intercepting=false、outbound=local-only', async () => {
    const d = await dir()
    resetCaptureCache()
    const s = tapStatus({ dir: d })
    expect(s.captureEnabled).toBe(false)
    expect(s.intercepting).toBe(false)
    expect(s.interceptCount).toBe(0)
    expect(s.outbound).toBe('local-only')
  })
})

describe('setCaptureEnabled —— 真落 flag，显式开', () => {
  it('set(true) 后 isCaptureEnabled=true，flag 文件真落在本地目录', async () => {
    const d = await dir()
    setCaptureEnabled(true, { dir: d })
    expect(isCaptureEnabled({ dir: d })).toBe(true)
    expect(flagPath({ dir: d }).startsWith(d)).toBe(true)
    expect(readFileSync(flagPath({ dir: d }), 'utf8').trim()).toBe('1')
  })
  it('set(false) 后又 OFF', async () => {
    const d = await dir()
    setCaptureEnabled(true, { dir: d })
    setCaptureEnabled(false, { dir: d })
    expect(isCaptureEnabled({ dir: d })).toBe(false)
  })
})

describe('tapStatus intercept 登记 —— doctor 明示「正在拦截」', () => {
  it('登记一个 intercept → intercepting=true + message 含「正在拦截」+ 端口', async () => {
    const d = await dir()
    const un = registerIntercept({ kind: 'reverse', port: 9999, client: 'claude', target: 'https://api.anthropic.com' })
    try {
      const s = tapStatus({ dir: d })
      expect(s.intercepting).toBe(true)
      expect(s.interceptCount).toBe(1)
      expect(s.intercepts[0]!.port).toBe(9999)
      expect(s.message).toContain('正在拦截')
      expect(activeIntercepts().some((e) => e.port === 9999)).toBe(true)
    } finally {
      un()
    }
    // 注销后回到未拦截
    expect(activeIntercepts().some((e) => e.port === 9999)).toBe(false)
    expect(tapStatus({ dir: d }).intercepting).toBe(false)
  })
})

describe('捕获数据不外发 —— 代码级证据（源零 outbound 网络 import）', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const NET_IMPORT = /from\s+['"]node:(https?|net|tls|dgram|dns|http2)['"]|require\(['"]node:(https?|net|tls|dgram|dns|http2)['"]\)|\bfetch\s*\(/
  for (const mod of ['trace-store.ts', 'record.ts', 'paths.ts', 'security.ts']) {
    it(`${mod} 源码不含任何 outbound 网络 import / fetch`, () => {
      const src = readFileSync(join(here, mod), 'utf8')
      expect(NET_IMPORT.test(src)).toBe(false)
    })
  }
  it('trace-store 仅依赖 node:fs / node:path（落盘专用）', () => {
    const src = readFileSync(join(here, 'trace-store.ts'), 'utf8')
    const imports = [...src.matchAll(/from\s+['"](node:[^'"]+)['"]/g)].map((m) => m[1])
    for (const imp of imports) {
      expect(['node:fs', 'node:path', 'node:crypto']).toContain(imp)
    }
  })
})
