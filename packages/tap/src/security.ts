/**
 * security —— tap 安全护栏（GOAL A7 / BACKLOG #34e，收编前置硬要求）。
 *
 * 老仓真相源: skills/pipeline/scripts/tap/capture_state.py（录制开关标志位）。
 *
 * 三条硬护栏（每条都有 security.test 真实断言）:
 *   ① 默认 OFF —— 缺 flag 文件 = **不抓**。这是对老仓 capture_state.py:36「缺文件=默认开」
 *      的**故意收紧**：tap 是 MITM，未经用户显式开启绝不录任何流量（GOAL A7「tap 默认 OFF」）。
 *   ② 状态可见 —— tapStatus() 汇报「是否正在拦截 / 拦截了哪些端口」，供 doctor 明示
 *      "tap 正在拦截流量"（GOAL A7「敏感能力 doctor 明示」）。
 *   ③ 本地不外发 —— outbound 恒为 'local-only' 声明。物理证据由 trace-store 源零网络 import
 *      保证（security.test 源码级扫描），本模块只读写本地 flag 文件，绝无回传。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveStateDir, resolveTapDir, type TapDirOptions } from './paths.js'

const FLAG_NAME = 'capture.enabled'
const TTL_MS = 1000
const cache = new Map<string, { val: boolean; ts: number }>()

/** 录制开关标志路径（本地文件）。capture_state.py:24 flag_path。 */
export function flagPath(opts: TapDirOptions = {}): string {
  return join(resolveStateDir(opts), FLAG_NAME)
}

/**
 * 是否已显式开启捕获。**默认 false（缺文件=OFF）**——#34e 硬护栏。
 * capture_state.py:28 is_capture_enabled（语义反转：老仓缺文件=True，本仓=False）。
 */
export function isCaptureEnabled(opts: TapDirOptions = {}): boolean {
  const p = flagPath(opts)
  const now = Date.now()
  const hit = cache.get(p)
  if (hit && now - hit.ts < TTL_MS) return hit.val
  let val = false // 默认 OFF
  try {
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8').trim().toLowerCase()
      val = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
    }
  } catch {
    val = false
  }
  cache.set(p, { val, ts: now })
  return val
}

/** 显式开/关捕获（原子写 flag 文件）。capture_state.py:48 set_capture_enabled。 */
export function setCaptureEnabled(enabled: boolean, opts: TapDirOptions = {}): void {
  const p = flagPath(opts)
  mkdirSync(resolveStateDir(opts), { recursive: true })
  const tmp = p + '.tmp'
  writeFileSync(tmp, enabled ? '1' : '0', 'utf8')
  renameSync(tmp, p)
  cache.set(p, { val: enabled, ts: Date.now() })
}

/** 清缓存（测试隔离；生产不需）。 */
export function resetCaptureCache(): void { cache.clear() }

// ── 拦截状态登记（doctor 明示「正在拦截」）──
export interface InterceptEntry { kind: 'reverse' | 'forward'; port: number; client?: string; target?: string }
const intercepts: InterceptEntry[] = []

/** proxy listen 时登记，返回注销函数（close 时调用）。 */
export function registerIntercept(entry: InterceptEntry): () => void {
  intercepts.push(entry)
  return () => {
    const i = intercepts.indexOf(entry)
    if (i >= 0) intercepts.splice(i, 1)
  }
}

export function activeIntercepts(): InterceptEntry[] { return intercepts.slice() }

export interface TapStatus {
  captureEnabled: boolean
  intercepting: boolean
  interceptCount: number
  intercepts: InterceptEntry[]
  storeDir: string
  outbound: 'local-only'
  message: string
}

/** doctor 可消费的 tap 状态面（GOAL A7「敏感能力 doctor 明示」）。 */
export function tapStatus(opts: TapDirOptions = {}): TapStatus {
  const active = activeIntercepts()
  const captureEnabled = isCaptureEnabled(opts)
  const intercepting = active.length > 0
  const ports = active.map((e) => e.port).join(', ')
  const message = intercepting
    ? `tap 正在拦截流量：${active.length} 个端口 [${ports}]（capture=${captureEnabled ? 'ON' : 'OFF'}，数据仅落本地）`
    : `tap 未拦截（默认 OFF；capture=${captureEnabled ? 'ON' : 'OFF'}）`
  return {
    captureEnabled,
    intercepting,
    interceptCount: active.length,
    intercepts: active,
    storeDir: resolveTapDir(opts),
    outbound: 'local-only',
    message,
  }
}
